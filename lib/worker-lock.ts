import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const workerId = `worker_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;

export class BackgroundWorkerManager {
  private db: InstanceType<typeof Database>;

  constructor(customDbPath?: string) {
    this.db = new Database(customDbPath || dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initLeaseTable();
  }

  private initLeaseTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worker_leases (
        job_name TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL
      );
    `);
  }

  public acquireLock(jobName: string, leaseDurationMs = 300000): boolean {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    const tryAcquire = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM worker_leases WHERE job_name = ?').get(jobName) as any;

      if (existing) {
        const existingExpires = new Date(existing.expires_at).getTime();
        if (existingExpires > now.getTime() && existing.locked_by !== workerId) {
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
      `).run(jobName, workerId, now.toISOString(), expiresAt.toISOString());

      return true;
    });

    try {
      return tryAcquire();
    } catch (err) {
      console.error(`[WORKER_LOCK] Failed to acquire lock for ${jobName}:`, err);
      return false;
    }
  }

  public releaseLock(jobName: string) {
    try {
      this.db.prepare('DELETE FROM worker_leases WHERE job_name = ? AND locked_by = ?').run(jobName, workerId);
    } catch (err) {
      console.error(`[WORKER_LOCK] Failed to release lock for ${jobName}:`, err);
    }
  }

  public close() {
    this.db.close();
  }
}
