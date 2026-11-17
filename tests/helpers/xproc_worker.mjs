/**
 * Helper Worker Process for Cross-Process Concurrency Testing
 * Invoked by tests as a separate OS process to verify cross-process lock coordination,
 * lease renewal, fencing token enforcement, and crash recovery.
 * Coordinates via the shared SQLite database and the `file_coordination_leases` table.
 */
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const action = process.argv[2];
const targetFile = process.argv[3];
const holderTag = process.argv[4] || `worker_pid_${process.pid}`;
const extraArg = process.argv[5]; // durationMs, pauseMs, or extensionMs
const tokenArg = process.argv[6]; // leaseToken

if (!action || !targetFile) {
  console.error('Usage: node xproc_worker.mjs <action> <targetFile> [holderTag] [extraArg] [tokenArg]');
  process.exit(1);
}

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const canonical = path.resolve(targetFile);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

function initTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_coordination_leases (
      file_path TEXT NOT NULL,
      lease_type TEXT NOT NULL,
      locked_by TEXT NOT NULL,
      lease_token TEXT,
      locked_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      PRIMARY KEY (file_path, locked_by)
    );
    CREATE INDEX IF NOT EXISTS idx_file_coordination_lookup ON file_coordination_leases(file_path, lease_type, expires_at);
  `);
  try {
    db.exec('ALTER TABLE file_coordination_leases ADD COLUMN lease_token TEXT;');
  } catch {}
}

initTable();

const now = new Date();
const nowIso = now.toISOString();

function acquireDeletion(durationMs = 30000, leaseToken = null) {
  const token = leaseToken || tokenArg || `tok_del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT * FROM file_coordination_leases
      WHERE file_path = ? AND expires_at > ?
    `).all(canonical, new Date().toISOString());

    if (existing && existing.length > 0) {
      const otherHolders = existing.filter(e => e.locked_by !== holderTag);
      if (otherHolders.length > 0) {
        return false;
      }
    }

    db.prepare(`
      DELETE FROM file_coordination_leases
      WHERE file_path = ? AND expires_at <= ?
    `).run(canonical, new Date().toISOString());

    db.prepare(`
      INSERT INTO file_coordination_leases (file_path, lease_type, locked_by, lease_token, locked_at, expires_at)
      VALUES (?, 'deletion', ?, ?, ?, ?)
      ON CONFLICT(file_path, locked_by) DO UPDATE SET
        lease_type = 'deletion',
        lease_token = excluded.lease_token,
        locked_at = excluded.locked_at,
        expires_at = excluded.expires_at
    `).run(canonical, holderTag, token, new Date().toISOString(), expiresAt);

    return true;
  })();
}

function acquireReference(durationMs = 30000, leaseToken = null) {
  const token = leaseToken || tokenArg || `tok_ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  return db.transaction(() => {
    const activeDeletion = db.prepare(`
      SELECT * FROM file_coordination_leases
      WHERE file_path = ? AND lease_type = 'deletion' AND expires_at > ?
    `).get(canonical, new Date().toISOString());

    if (activeDeletion) {
      return false;
    }

    db.prepare(`
      DELETE FROM file_coordination_leases
      WHERE file_path = ? AND expires_at <= ?
    `).run(canonical, new Date().toISOString());

    db.prepare(`
      INSERT INTO file_coordination_leases (file_path, lease_type, locked_by, lease_token, locked_at, expires_at)
      VALUES (?, 'reference', ?, ?, ?, ?)
      ON CONFLICT(file_path, locked_by) DO UPDATE SET
        lease_type = 'reference',
        lease_token = excluded.lease_token,
        locked_at = excluded.locked_at,
        expires_at = excluded.expires_at
    `).run(canonical, holderTag, token, new Date().toISOString(), expiresAt);

    return true;
  })();
}

function renewReference(extensionMs = 30000, expectedToken = null) {
  const token = expectedToken || tokenArg;
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + extensionMs).toISOString();

  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT * FROM file_coordination_leases
      WHERE file_path = ? AND locked_by = ?
    `).get(canonical, holderTag);

    if (!existing) return false;
    if (token && existing.lease_token && existing.lease_token !== token) return false;

    const existingExpiry = new Date(existing.expires_at).getTime();
    if (existingExpiry <= now.getTime()) {
      return false; // Expired lease cannot be renewed
    }

    if (existing.lease_type !== 'reference') return false;

    db.prepare(`
      UPDATE file_coordination_leases
      SET expires_at = ?, locked_at = ?
      WHERE file_path = ? AND locked_by = ?
    `).run(newExpiresAt, now.toISOString(), canonical, holderTag);

    return true;
  })();
}

function release(leaseToken = null) {
  const token = leaseToken || tokenArg;
  if (token) {
    db.prepare(`
      DELETE FROM file_coordination_leases
      WHERE file_path = ? AND locked_by = ? AND (lease_token = ? OR lease_token IS NULL)
    `).run(canonical, holderTag, token);
  } else {
    db.prepare('DELETE FROM file_coordination_leases WHERE file_path = ? AND locked_by = ?').run(canonical, holderTag);
  }
}

if (action === 'check' || action === 'check_ref') {
  const activeDeletion = db.prepare(`
    SELECT * FROM file_coordination_leases
    WHERE file_path = ? AND lease_type = 'deletion' AND expires_at > ?
  `).get(canonical, nowIso);

  db.close();
  if (activeDeletion) {
    console.log(`[XPROC-WORKER] File is undergoing deletion by ${activeDeletion.locked_by}`);
    process.exit(42);
  } else {
    console.log('[XPROC-WORKER] File is free to reference');
    process.exit(0);
  }
} else if (action === 'check_del') {
  const activeDeletion = db.prepare(`
    SELECT * FROM file_coordination_leases
    WHERE file_path = ? AND lease_type = 'deletion' AND expires_at > ?
  `).get(canonical, nowIso);

  db.close();
  if (activeDeletion) {
    console.log(`[XPROC-WORKER] Deletion lease is active by ${activeDeletion.locked_by}`);
    process.exit(42);
  } else {
    console.log('[XPROC-WORKER] No deletion lease active');
    process.exit(0);
  }
} else if (action === 'acquire' || action === 'acquire_del') {
  const duration = extraArg ? parseInt(extraArg, 10) : 30000;
  const acquired = acquireDeletion(duration);
  db.close();
  if (acquired) {
    console.log(`[XPROC-WORKER] Deletion lease successfully acquired by ${holderTag}`);
    process.exit(10);
  } else {
    console.log('[XPROC-WORKER] Failed to acquire deletion lease (conflict)');
    process.exit(11);
  }
} else if (action === 'acquire_ref') {
  const duration = extraArg ? parseInt(extraArg, 10) : 30000;
  const acquired = acquireReference(duration);
  db.close();
  if (acquired) {
    console.log(`[XPROC-WORKER] Reference lease successfully acquired by ${holderTag}`);
    process.exit(10);
  } else {
    console.log('[XPROC-WORKER] Failed to acquire reference lease (deletion in progress)');
    process.exit(11);
  }
} else if (action === 'renew_ref') {
  const extension = extraArg ? parseInt(extraArg, 10) : 30000;
  const renewed = renewReference(extension, tokenArg);
  db.close();
  if (renewed) {
    console.log(`[XPROC-WORKER] Reference lease renewed by ${holderTag}`);
    process.exit(10);
  } else {
    console.log(`[XPROC-WORKER] Failed to renew reference lease`);
    process.exit(11);
  }
} else if (action === 'release' || action === 'release_del' || action === 'release_ref') {
  release();
  db.close();
  console.log('[XPROC-WORKER] Lease released');
  process.exit(0);
} else if (action === 'hold_ref_and_pause') {
  const pauseMs = extraArg ? parseInt(extraArg, 10) : 1000;
  const acquired = acquireReference(pauseMs + 10000);
  if (!acquired) {
    db.close();
    console.log('[XPROC-WORKER] Failed to acquire reference lease');
    process.exit(11);
  }
  console.log(`[XPROC-WORKER] Holding reference lease for ${pauseMs}ms...`);
  setTimeout(() => {
    release();
    db.close();
    console.log('[XPROC-WORKER] Paused duration completed and lease released');
    process.exit(0);
  }, pauseMs);
} else if (action === 'hold_del_and_pause') {
  const pauseMs = extraArg ? parseInt(extraArg, 10) : 1000;
  const acquired = acquireDeletion(pauseMs + 10000);
  if (!acquired) {
    db.close();
    console.log('[XPROC-WORKER] Failed to acquire deletion lease');
    process.exit(11);
  }
  console.log(`[XPROC-WORKER] Holding deletion lease for ${pauseMs}ms...`);
  setTimeout(() => {
    release();
    db.close();
    console.log('[XPROC-WORKER] Paused duration completed and lease released');
    process.exit(0);
  }, pauseMs);
} else if (action === 'hold_ref_with_heartbeat') {
  // Acquires with short TTL (e.g. 500ms) and renews every intervalMs for totalMs
  const intervalMs = extraArg ? parseInt(extraArg, 10) : 200;
  const totalMs = tokenArg ? parseInt(tokenArg, 10) : 1500;
  const leaseToken = `tok_hb_${Date.now()}`;

  const acquired = acquireReference(intervalMs + 300, leaseToken);
  if (!acquired) {
    db.close();
    console.log('[XPROC-WORKER] Failed initial acquisition in heartbeat');
    process.exit(11);
  }

  const startTime = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - startTime >= totalMs) {
      clearInterval(timer);
      release(leaseToken);
      db.close();
      console.log('[XPROC-WORKER] Heartbeat hold completed and lease cleanly released');
      process.exit(0);
    }

    const renewed = renewReference(intervalMs + 300, leaseToken);
    if (!renewed) {
      clearInterval(timer);
      db.close();
      console.log('[XPROC-WORKER] Heartbeat renewal tick failed');
      process.exit(12);
    }
  }, intervalMs);
} else if (action === 'crash_holding_ref') {
  const durationMs = extraArg ? parseInt(extraArg, 10) : 30000;
  acquireReference(durationMs);
  db.close();
  console.log(`[XPROC-WORKER] Process terminating abruptly while holding reference lease`);
  process.exit(99);
} else if (action === 'crash_holding_del') {
  const durationMs = extraArg ? parseInt(extraArg, 10) : 30000;
  acquireDeletion(durationMs);
  db.close();
  console.log(`[XPROC-WORKER] Process terminating abruptly while holding deletion lease`);
  process.exit(99);
} else if (action === 'write_file_and_crash') {
  const durationMs = extraArg ? parseInt(extraArg, 10) : 1000;
  acquireReference(durationMs);
  fs.writeFileSync(canonical, 'orphaned physical file bytes from crashed worker');
  db.close();
  console.log('[XPROC-WORKER] File written to disk, terminating abruptly before DB insert');
  process.exit(99);
} else {
  db.close();
  console.error(`[XPROC-WORKER] Unknown action: ${action}`);
  process.exit(1);
}
