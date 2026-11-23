import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const workerId = `worker_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;

export class BackgroundWorkerManager {
  constructor(customDbPath) {
    this.customDbPath = customDbPath;
    this._db = null;
    this._tableInitialized = false;
  }

  get db() {
    if (!this._db) {
      this._db = new Database(this.customDbPath || dbPath);
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('busy_timeout = 5000');
    }
    return this._db;
  }

  initLeaseTable() {
    if (this._tableInitialized) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worker_leases (
        job_name TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL
      );
    `);
    this._tableInitialized = true;
  }

  acquireLock(jobName, leaseDurationMs = 300000, overrideWorkerId = null) {
    const activeWorkerId = overrideWorkerId || workerId;
    const targetDbPath = this.customDbPath || dbPath;
    const dbDir = path.dirname(targetDbPath);
    const coordinationDbPath = path.join(dbDir, '.coordination.db');

    // 1. Cross-process coordination safeguard: check .coordination.db and .maintenance_lock BEFORE opening target db
    try {
      if (process.env.MAINTENANCE_MODE === 'true') {
        console.log(`[WORKER_LOCK] Maintenance mode active. Refusing lock acquisition for "${jobName}".`);
        return false;
      }

      if (fs.existsSync(coordinationDbPath)) {
        const cdb = new Database(coordinationDbPath, { timeout: 3000 });
        const row = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
        cdb.close();
        if (row && (row.state === 'DRAINING' || row.state === 'ACTIVE')) {
          console.log(`[WORKER_LOCK] Cross-process maintenance state is ${row.state}. Refusing lock for "${jobName}".`);
          return false;
        }
      }

      const lockPath = path.join(dbDir, '.maintenance_lock');
      if (fs.existsSync(lockPath)) {
        console.log(`[WORKER_LOCK] Maintenance lockfile present. Refusing lock acquisition for "${jobName}".`);
        return false;
      }
    } catch (err) {
      console.error('[WORKER_LOCK] Failed to inspect maintenance state. Failing closed:', err.message);
      return false;
    }

    // 2. Safe to initialize lease table and acquire lock on target db
    this.initLeaseTable();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    const tryAcquire = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM worker_leases WHERE job_name = ?').get(jobName);

      if (existing) {
        const existingExpires = new Date(existing.expires_at).getTime();
        if (existingExpires > now.getTime() && existing.locked_by !== activeWorkerId) {
          // Lock is held by another active worker instance
          return false;
        }
      }

      this.db.prepare(`
        INSERT INTO worker_leases (job_name, locked_by, locked_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(job_name) DO UPDATE SET
          locked_by = excluded.locked_by,
          locked_at = excluded.locked_at,
          expires_at = excluded.expires_at
      `).run(jobName, activeWorkerId, now.toISOString(), expiresAt.toISOString());

      return true;
    });

    try {
      const acquired = tryAcquire();
      if (acquired && fs.existsSync(coordinationDbPath)) {
        try {
          const cdb = new Database(coordinationDbPath, { timeout: 3000 });
          cdb.prepare("DELETE FROM active_leases WHERE process_type = 'worker' AND label = ?").run(jobName);
          cdb.prepare(`
            INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
            VALUES (?, 'worker', ?, ?, ?, ?)
            ON CONFLICT(lease_id) DO UPDATE SET expires_at = excluded.expires_at
          `).run(`worker_${activeWorkerId}_${jobName}`, process.pid, jobName, now.getTime(), expiresAt.getTime());
          cdb.close();
        } catch {}
      }
      return acquired;
    } catch (err) {
      console.error(`[WORKER_LOCK] Failed to acquire lock for ${jobName}:`, err);
      return false;
    }
  }

  releaseLock(jobName, overrideWorkerId = null) {
    const activeWorkerId = overrideWorkerId || workerId;
    const targetDbPath = this.customDbPath || dbPath;
    const dbDir = path.dirname(targetDbPath);
    const coordinationDbPath = path.join(dbDir, '.coordination.db');

    if (this._db) {
      try {
        this.db.prepare('DELETE FROM worker_leases WHERE job_name = ? AND locked_by = ?').run(jobName, activeWorkerId);
      } catch (err) {
        console.error(`[WORKER_LOCK] Failed to release lock for ${jobName}:`, err);
      }
    }

    if (fs.existsSync(coordinationDbPath)) {
      try {
        const cdb = new Database(coordinationDbPath, { timeout: 3000 });
        cdb.prepare('DELETE FROM active_leases WHERE lease_id = ?').run(`worker_${activeWorkerId}_${jobName}`);
        cdb.close();
      } catch {}
    }
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

// Standalone runner
if (process.argv[1]?.endsWith('background_worker.mjs')) {
  console.log(`[WORKER ${workerId}] Starting standalone background worker process...`);
  const manager = new BackgroundWorkerManager();
  const jobName = 'job_remediation_cycle';

  if (!manager.acquireLock(jobName, 60000)) {
    console.log(`[WORKER ${workerId}] Job "${jobName}" is currently locked by another active instance. Exiting gracefully.`);
    process.exit(0);
  }

  console.log(`[WORKER ${workerId}] Acquired distributed lease for "${jobName}". Running job...`);
  // Simulate task or call verification job
  setTimeout(() => {
    manager.releaseLock(jobName);
    console.log(`[WORKER ${workerId}] Job completed and lease released.`);
    manager.close();
    process.exit(0);
  }, 1000);
}
