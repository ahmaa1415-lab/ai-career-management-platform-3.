import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type MigrationOutcomeStatus =
  | 'SUCCESS'
  | 'ALREADY_APPLIED'
  | 'INCONSISTENT_STATE'
  | 'SCHEMA_DRIFT'
  | 'FAILED';

export interface MigrationResult {
  status: MigrationOutcomeStatus;
  migrationId: string;
  appliedAt?: string;
  durationMs?: number;
  checksum?: string;
  error?: string;
  details: {
    hasUserIdColumn: boolean;
    isRecordedInTracker: boolean;
    totalEmailsBefore?: number;
    totalEmailsAfter?: number;
    backfilledCount?: number;
    unlinkedCount?: number;
  };
}

export const EMAIL_USER_ID_MIGRATION_ID = 'add_user_id_to_emails';

/**
 * Initializes the schema_migrations tracking table if it does not already exist.
 */
export function ensureMigrationTrackingTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INTEGER DEFAULT 0,
      checksum TEXT
    );
  `);
}

/**
 * Safe, idempotent, and concurrency-hardened migration runner for 'add_user_id_to_emails'.
 *
 * Enforces:
 * 1. Checks that no caller transaction is active to prevent nested transaction errors.
 * 2. Acquires an EXCLUSIVE transaction lock BEFORE inspecting table and migration state,
 *    eliminating race conditions between concurrent runners.
 * 3. A second concurrent runner waiting on the lock unblocks, detects the applied migration,
 *    and safely returns ALREADY_APPLIED without attempting duplicate DDL.
 * 4. Rejects schema drift and inconsistent states (fail-closed).
 * 5. Executes migration inside the atomic EXCLUSIVE transaction.
 * 6. Guarantees complete rollback on any failure, allowing clean retries.
 */
export function runEmailUserIdMigration(db: Database.Database): MigrationResult {
  // Ensure foreign keys are enabled
  db.pragma('foreign_keys = ON');

  // Guard against nested transactions if the caller already opened a transaction
  if (db.inTransaction) {
    return {
      status: 'FAILED',
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      error: 'Cannot execute migration: a transaction is already active on the provided database connection.',
      details: {
        hasUserIdColumn: false,
        isRecordedInTracker: false
      }
    };
  }

  const startTime = Date.now();
  let preCount = 0;

  // Resolve migration SQL file for checksum calculation
  const migrationFilePath = path.join(process.cwd(), 'migrations', 'add_user_id_to_emails.sql');
  let checksum = 'embedded_fallback';

  if (fs.existsSync(migrationFilePath)) {
    const migrationSql = fs.readFileSync(migrationFilePath, 'utf-8');
    checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');
  }

  try {
    // Acquire EXCLUSIVE lock immediately to serialize all concurrent runners
    db.exec('BEGIN EXCLUSIVE TRANSACTION;');

    // Step 1: Ensure tracking table exists inside the exclusive transaction
    ensureMigrationTrackingTable(db);

    // Step 2: Inspect existing table columns and recorded migration state INSIDE the exclusive lock
    const emailCols = (db.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
    const hasUserId = emailCols.includes('user_id');

    const recorded = db.prepare('SELECT * FROM schema_migrations WHERE id = ?').get(EMAIL_USER_ID_MIGRATION_ID) as any;
    const isRecorded = Boolean(recorded);

    // Step 3: State validation under exclusive lock
    if (hasUserId && isRecorded) {
      // Safe no-op: commit empty transaction and return ALREADY_APPLIED
      db.exec('COMMIT;');
      return {
        status: 'ALREADY_APPLIED',
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        appliedAt: recorded.applied_at,
        checksum: recorded.checksum,
        durationMs: recorded.execution_time_ms,
        details: {
          hasUserIdColumn: true,
          isRecordedInTracker: true
        }
      };
    }

    if (hasUserId && !isRecorded) {
      db.exec('COMMIT;');
      const errorMsg = `INCONSISTENT_STATE: Column 'user_id' already exists in 'emails' table, but migration '${EMAIL_USER_ID_MIGRATION_ID}' is NOT recorded in schema_migrations. Aborting migration to prevent data overwrite.`;
      return {
        status: 'INCONSISTENT_STATE',
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        error: errorMsg,
        details: {
          hasUserIdColumn: true,
          isRecordedInTracker: false
        }
      };
    }

    if (!hasUserId && isRecorded) {
      db.exec('COMMIT;');
      const errorMsg = `SCHEMA_DRIFT: Migration '${EMAIL_USER_ID_MIGRATION_ID}' is recorded in schema_migrations, but column 'user_id' is missing from 'emails' table. Aborting migration due to schema drift.`;
      return {
        status: 'SCHEMA_DRIFT',
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        error: errorMsg,
        details: {
          hasUserIdColumn: false,
          isRecordedInTracker: true
        }
      };
    }

    // Step 4: Execute migration atomically under the active EXCLUSIVE lock
    preCount = (db.prepare('SELECT COUNT(*) as c FROM emails').get() as any)?.c || 0;

    // Step 4.1: Add user_id column with foreign key reference
    db.exec('ALTER TABLE emails ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;');

    // Step 4.2: Deterministic backfill based strictly on trusted application ownership
    db.exec(`
      UPDATE emails
      SET user_id = (
        SELECT a.user_id
        FROM applications a
        JOIN users u ON u.id = a.user_id
        WHERE a.id = emails.application_id
      )
      WHERE emails.application_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM applications a
          JOIN users u ON u.id = a.user_id
          WHERE a.id = emails.application_id
        );
    `);

    // Step 4.3: Create covering indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_user_category ON emails(user_id, category);');

    // Step 4.4: Validate foreign key integrity
    const fkViolations = db.prepare('PRAGMA foreign_key_check(emails)').all();
    if (fkViolations.length > 0) {
      throw new Error(`Foreign key integrity check failed after migration: ${JSON.stringify(fkViolations)}`);
    }

    const durationMs = Date.now() - startTime;

    // Step 4.5: Record migration in tracking table
    db.prepare(`
      INSERT INTO schema_migrations (id, applied_at, execution_time_ms, checksum)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?)
    `).run(EMAIL_USER_ID_MIGRATION_ID, durationMs, checksum);

    // Commit all changes atomically
    db.exec('COMMIT;');

    const postCount = (db.prepare('SELECT COUNT(*) as c FROM emails').get() as any)?.c || 0;
    const backfilledCount = (db.prepare('SELECT COUNT(*) as c FROM emails WHERE user_id IS NOT NULL').get() as any)?.c || 0;
    const unlinkedCount = (db.prepare('SELECT COUNT(*) as c FROM emails WHERE user_id IS NULL').get() as any)?.c || 0;

    return {
      status: 'SUCCESS',
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      appliedAt: new Date().toISOString(),
      durationMs,
      checksum,
      details: {
        hasUserIdColumn: true,
        isRecordedInTracker: true,
        totalEmailsBefore: preCount,
        totalEmailsAfter: postCount,
        backfilledCount,
        unlinkedCount
      }
    };
  } catch (err: any) {
    if (db.inTransaction) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr: any) {
        console.error('Critical rollback failure:', rollbackErr.message);
      }
    }

    return {
      status: 'FAILED',
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      error: err.message,
      details: {
        hasUserIdColumn: false,
        isRecordedInTracker: false,
        totalEmailsBefore: preCount
      }
    };
  }
}
