import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const workerId = `worker_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;

export class BackgroundWorkerManager {
  constructor(customDbPath) {
    this.db = new Database(customDbPath || dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initLeaseTable();
  }

  initLeaseTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worker_leases (
        job_name TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL
      );
    `);
  }

  acquireLock(jobName, leaseDurationMs = 300000, overrideWorkerId = null) {
    const activeWorkerId = overrideWorkerId || workerId;
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
      return tryAcquire();
    } catch (err) {
      console.error(`[WORKER_LOCK] Failed to acquire lock for ${jobName}:`, err);
      return false;
    }
  }

  releaseLock(jobName, overrideWorkerId = null) {
    const activeWorkerId = overrideWorkerId || workerId;
    try {
      this.db.prepare('DELETE FROM worker_leases WHERE job_name = ? AND locked_by = ?').run(jobName, activeWorkerId);
    } catch (err) {
      console.error(`[WORKER_LOCK] Failed to release lock for ${jobName}:`, err);
    }
  }

  close() {
    this.db.close();
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
