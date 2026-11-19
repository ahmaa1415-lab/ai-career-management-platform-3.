#!/usr/bin/env node
/**
 * Phase 4: Administrative Maintenance Mode Control CLI
 *
 * Coordinates cross-process write quiescence via .coordination.db:
 * - INACTIVE: Normal operations across all processes.
 * - DRAINING: New write leases rejected across all processes.
 *             Awaits active leases across Next.js, worker, and backup to drain safely.
 * - ACTIVE:   Zero active write leases remain across all processes.
 *
 * Usage:
 *   node scripts/maintenance_control.mjs --status
 *   node scripts/maintenance_control.mjs --enable [--reason "..."] [--timeout 15000]
 *   node scripts/maintenance_control.mjs --disable
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const dbDir = path.dirname(dbPath);
const coordinationDbPath = path.join(dbDir, '.coordination.db');
const lockPath = path.join(dbDir, '.maintenance_lock');
const supervisorPath = path.join(dbDir, '.supervisor_status.json');

function getCoordinationDb(customDir) {
  const targetDir = customDir || dbDir;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const cdbPath = path.join(targetDir, '.coordination.db');
  const cdb = new Database(cdbPath, { timeout: 10000 });
  cdb.pragma('journal_mode = WAL');
  cdb.pragma('busy_timeout = 10000');

  cdb.exec(`
    CREATE TABLE IF NOT EXISTS coordination_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      reason TEXT,
      operator TEXT,
      initiated_at TEXT,
      activated_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS active_leases (
      lease_id TEXT PRIMARY KEY,
      process_type TEXT NOT NULL,
      pid INTEGER NOT NULL,
      label TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS durable_audit_spool (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      flushed_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );
  `);

  return cdb;
}

export function getStatus(customDbPath) {
  const targetDir = customDbPath ? path.dirname(customDbPath) : dbDir;
  const targetSupPath = path.join(targetDir, '.supervisor_status.json');
  const cdb = getCoordinationDb(targetDir);

  const isEnvActive = process.env.MAINTENANCE_MODE === 'true';
  let state = 'INACTIVE';
  let details = null;

  try {
    const row = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get();
    if (row) {
      state = row.state;
      details = row;
    }
  } catch {}

  if (isEnvActive) {
    state = 'ACTIVE';
  }

  // Purge expired leases
  const now = Date.now();
  try {
    cdb.prepare('DELETE FROM active_leases WHERE expires_at <= ?').run(now);
  } catch {}

  const activeLeases = cdb.prepare('SELECT * FROM active_leases WHERE expires_at > ?').all(now);

  let supervisor = null;
  if (fs.existsSync(targetSupPath)) {
    try {
      supervisor = JSON.parse(fs.readFileSync(targetSupPath, 'utf-8'));
    } catch {}
  }

  let pendingAudits = 0;
  try {
    const pendingRow = cdb.prepare("SELECT COUNT(*) as c FROM durable_audit_spool WHERE status = 'PENDING'").get();
    pendingAudits = pendingRow?.c || 0;
  } catch {}

  cdb.close();

  return {
    state,
    isQuiescent: state === 'ACTIVE' && activeLeases.length === 0,
    activeLeaseCount: activeLeases.length,
    activeLeases,
    supervisor,
    pendingAudits,
    details
  };
}

export async function enableMaintenanceWithDrain(options = {}) {
  const targetDir = options.customDbPath ? path.dirname(options.customDbPath) : dbDir;
  const timeoutMs = options.timeoutMs || 15000;
  const reason = options.reason || 'Scheduled database schema migration';
  const operator = options.operator || process.env.USER || process.env.USERNAME || 'railway_operator';
  const targetLockPath = path.join(targetDir, '.maintenance_lock');
  const targetSupPath = path.join(targetDir, '.supervisor_status.json');

  const cdb = getCoordinationDb(targetDir);

  // 1. Atomically set state to DRAINING
  const setDraining = cdb.transaction(() => {
    const existing = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get();
    if (existing && existing.state === 'ACTIVE') {
      return { alreadyActive: true };
    }

    const now = new Date().toISOString();
    cdb.prepare(`
      INSERT INTO coordination_state (id, state, reason, operator, initiated_at, version)
      VALUES ('global', 'DRAINING', ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        state = 'DRAINING',
        reason = excluded.reason,
        operator = excluded.operator,
        initiated_at = excluded.initiated_at,
        activated_at = NULL,
        version = coordination_state.version + 1
    `).run(reason, operator, now);

    return { alreadyActive: false };
  });

  const drainResult = setDraining();
  if (drainResult.alreadyActive) {
    console.log('[MAINTENANCE] Mode is already ACTIVE.');
    cdb.close();
    return { status: 'ALREADY_ACTIVE', state: 'ACTIVE' };
  }

  // Write fallback lockfile
  try {
    fs.writeFileSync(targetLockPath, JSON.stringify({ state: 'DRAINING', reason, operator, initiatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch {}

  console.log('[MAINTENANCE] Write barrier engaged: state is now DRAINING across all processes.');

  // 2. Poll active leases and supervisor status
  const start = Date.now();
  let drained = false;

  while (Date.now() - start < timeoutMs) {
    const now = Date.now();
    try {
      cdb.prepare('DELETE FROM active_leases WHERE expires_at <= ?').run(now);
    } catch {}

    const countRow = cdb.prepare('SELECT COUNT(*) as c FROM active_leases WHERE expires_at > ?').get(now);
    const leaseCount = countRow?.c || 0;

    let supervisorIdle = true;
    if (fs.existsSync(targetSupPath)) {
      try {
        const sup = JSON.parse(fs.readFileSync(targetSupPath, 'utf-8'));
        if (sup.workerActive || sup.backupActive) {
          supervisorIdle = false;
        }
      } catch {}
    }

    if (leaseCount === 0 && supervisorIdle) {
      drained = true;
      break;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  if (!drained) {
    // Abort and restore INACTIVE
    cdb.prepare(`
      UPDATE coordination_state
      SET state = 'INACTIVE', version = version + 1
      WHERE id = 'global'
    `).run();
    try { if (fs.existsSync(targetLockPath)) fs.unlinkSync(targetLockPath); } catch {}

    const remaining = cdb.prepare('SELECT * FROM active_leases WHERE expires_at > ?').all(Date.now());
    cdb.close();

    const err = new Error(`Drain timeout exceeded (${timeoutMs}ms). Active operations remaining: ${JSON.stringify(remaining)}`);
    err.code = 'MAINTENANCE_DRAIN_TIMEOUT';
    throw err;
  }

  // 3. Atomically promote to ACTIVE
  const now = new Date().toISOString();
  cdb.prepare(`
    UPDATE coordination_state
    SET state = 'ACTIVE', activated_at = ?, version = version + 1
    WHERE id = 'global'
  `).run(now);

  try {
    fs.writeFileSync(targetLockPath, JSON.stringify({ state: 'ACTIVE', reason, operator, activatedAt: now }, null, 2), 'utf-8');
  } catch {}

  console.log('[MAINTENANCE] Quiescence confirmed across all processes: state is now ACTIVE.');
  cdb.close();

  return {
    status: 'ENABLED',
    state: 'ACTIVE',
    details: { state: 'ACTIVE', reason, operator, activatedAt: now }
  };
}

export function disableMaintenance(customDbPath) {
  const targetDir = customDbPath ? path.dirname(customDbPath) : dbDir;
  const targetLockPath = path.join(targetDir, '.maintenance_lock');
  const cdb = getCoordinationDb(targetDir);

  cdb.prepare(`
    INSERT INTO coordination_state (id, state, reason, operator, version)
    VALUES ('global', 'INACTIVE', 'Maintenance completed', 'system', 1)
    ON CONFLICT(id) DO UPDATE SET
      state = 'INACTIVE',
      activated_at = NULL,
      version = coordination_state.version + 1
  `).run();

  cdb.close();

  if (fs.existsSync(targetLockPath)) {
    try { fs.unlinkSync(targetLockPath); } catch {}
  }

  console.log('[MAINTENANCE] Mode successfully DISABLED across all processes (state is INACTIVE).');

  if (process.env.MAINTENANCE_MODE === 'true') {
    console.warn('[WARNING] MAINTENANCE_MODE environment variable is still set to "true". Deactivate it to fully resume operations.');
  }
}

// CLI Execution Entrypoint
const isDirectCli = process.argv[1]?.endsWith('maintenance_control.mjs');
if (isDirectCli) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Usage: node scripts/maintenance_control.mjs [COMMAND]

Commands:
  --status                     Print current cross-process maintenance mode state and active leases
  --enable [--reason "..."]    Atomically drain writes across all processes and activate maintenance mode
  --disable                    Remove maintenance lock and resume normal operations
`);
    process.exit(0);
  }

  (async () => {
    try {
      switch (command) {
        case '--status':
          console.log(JSON.stringify(getStatus(), null, 2));
          break;
        case '--enable': {
          const reasonIndex = args.indexOf('--reason');
          const reason = reasonIndex !== -1 && args[reasonIndex + 1] ? args[reasonIndex + 1] : 'Administrative database maintenance';
          const timeoutIndex = args.indexOf('--timeout');
          const timeoutMs = timeoutIndex !== -1 && args[timeoutIndex + 1] ? parseInt(args[timeoutIndex + 1], 10) : 15000;
          const result = await enableMaintenanceWithDrain({ reason, timeoutMs });
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case '--disable':
          disableMaintenance();
          break;
        default:
          console.error(`Unknown argument: ${command}`);
          process.exit(1);
      }
    } catch (err) {
      console.error('[MAINTENANCE CONTROL ERROR]:', err.message);
      process.exit(1);
    }
  })();
}
