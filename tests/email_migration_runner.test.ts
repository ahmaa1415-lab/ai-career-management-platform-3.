/**
 * Comprehensive Synthetic Test Suite: Atomic Email Migration & Concurrency-Hardened Runner
 *
 * Verifies:
 * 1. Successful atomic migration from pre-migration schema.
 * 2. Exact backfill of 1,059 unlinked legacy emails (all remain user_id = NULL).
 * 3. Exact attribution of application-linked emails to verified users.
 * 4. Index creation (idx_emails_user_id, idx_emails_user_category).
 * 5. Foreign key integrity check (0 violations).
 * 6. Idempotency: Re-running applied migration returns ALREADY_APPLIED without errors.
 * 7. Inconsistent state detection: Column exists without tracker record (INCONSISTENT_STATE).
 * 8. Schema drift detection: Tracker record exists without column (SCHEMA_DRIFT).
 * 9. Atomic rollback on failure: Transaction aborts and leaves schema and tables pristine.
 * 10. Concurrency race protection: Concurrent runner waiting on EXCLUSIVE lock unblocks
 *     and safely returns ALREADY_APPLIED.
 * 11. Nested transaction prevention: Caller with active transaction rejected safely.
 * 12. Failed first execution followed by clean, successful retry.
 * 13. Rollback procedure: Restores exact pre-migration schema preserving all records.
 *
 * SAFETY: Runs strictly in isolated temporary databases. Never touches data/career_app.db.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { runEmailUserIdMigration, EMAIL_USER_ID_MIGRATION_ID } from '../lib/migrations';

const testDir = path.join(process.cwd(), 'data', 'test_email_migration_audit');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

function createPreMigrationDb(filePath: string): Database.Database {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE emails (
      id TEXT PRIMARY KEY,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_draft INTEGER DEFAULT 1,
      is_sent INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      provider_message_id TEXT,
      delivery_status TEXT DEFAULT 'draft',
      delivery_provider TEXT
    );
  `);

  return db;
}

function assertCheck(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
}

// -----------------------------------------------------------------------------
// WORKER THREAD ENTRYPOINT FOR CONCURRENCY TESTS
// -----------------------------------------------------------------------------
if (!isMainThread) {
  const { dbPath, delayMs } = workerData;
  if (delayMs) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');

  const result = runEmailUserIdMigration(db);
  db.close();
  parentPort?.postMessage(result);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// MAIN TEST SUITE
// -----------------------------------------------------------------------------
async function runAllMigrationTests() {
  console.log('========================================================================');
  console.log('   ATOMIC EMAIL MIGRATION & RUNNER TEST SUITE (SYNTHETIC)               ');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: SUCCESSFUL MIGRATION WITH 1,059 LEGACY RECORDS + APPLICATION EMAILS
  // ---------------------------------------------------------------------------
  console.log('>>> [SUITE 1] Successful Atomic Migration with 1,059 Legacy Records...');
  const dbPath1 = path.join(testDir, 'test_suite_1.db');
  const db1 = createPreMigrationDb(dbPath1);

  // Seed users and applications
  db1.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_alice', 'alice@example.com', 'Alice')").run();
  db1.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_bob', 'bob@example.com', 'Bob')").run();
  db1.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app_alice_01', 'user_alice', 'job_1', 'Prepared')").run();
  db1.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app_alice_02', 'user_alice', 'job_2', 'Submitted')").run();
  db1.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app_bob_01', 'user_bob', 'job_3', 'Prepared')").run();

  // Seed 1,059 synthetic unlinked legacy email records (application_id = NULL)
  const insertLegacy = db1.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, delivery_status)
    VALUES (?, null, 'Opportunity', 'system@legacy.corp', 'candidate@example.com', 'Legacy Opportunity', 'Body', 1, 0, 'draft')
  `);

  db1.transaction(() => {
    for (let i = 1; i <= 1059; i++) {
      insertLegacy.run(`legacy_email_${String(i).padStart(4, '0')}`);
    }
  })();

  // Seed 3 application-linked emails
  db1.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, delivery_status)
    VALUES ('email_alice_linked_01', 'app_alice_01', 'Interview', 'recruiter@tech.com', 'alice@example.com', 'Interview Alice', 'Body', 0, 0, 'draft')
  `).run();
  db1.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, delivery_status)
    VALUES ('email_alice_linked_02', 'app_alice_02', 'Confirmation', 'jobs@tech.com', 'alice@example.com', 'Confirmation Alice', 'Body', 0, 0, 'draft')
  `).run();
  db1.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, delivery_status)
    VALUES ('email_bob_linked_01', 'app_bob_01', 'Assessment', 'hr@fintech.com', 'bob@example.com', 'Assessment Bob', 'Body', 0, 0, 'draft')
  `).run();

  const totalBefore = (db1.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  assertCheck('Total pre-migration emails is exactly 1,062 (1,059 legacy + 3 linked)', totalBefore === 1062);

  // Execute migration runner
  const res1 = runEmailUserIdMigration(db1);
  assertCheck("Migration returns status 'SUCCESS'", res1.status === 'SUCCESS');
  assertCheck('Migration duration is non-negative number', typeof res1.durationMs === 'number' && res1.durationMs >= 0);
  assertCheck('Checksum is recorded', typeof res1.checksum === 'string' && res1.checksum.length > 0);

  // Verify post-migration state
  const totalAfter = (db1.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  assertCheck('Total post-migration emails remains exactly 1,062 (zero rows dropped)', totalAfter === 1062);

  const aliceEmail1 = db1.prepare('SELECT * FROM emails WHERE id = ?').get('email_alice_linked_01') as any;
  const aliceEmail2 = db1.prepare('SELECT * FROM emails WHERE id = ?').get('email_alice_linked_02') as any;
  const bobEmail1 = db1.prepare('SELECT * FROM emails WHERE id = ?').get('email_bob_linked_01') as any;

  assertCheck("Alice email 1 is accurately backfilled with 'user_alice'", aliceEmail1.user_id === 'user_alice');
  assertCheck("Alice email 2 is accurately backfilled with 'user_alice'", aliceEmail2.user_id === 'user_alice');
  assertCheck("Bob email 1 is accurately backfilled with 'user_bob'", bobEmail1.user_id === 'user_bob');

  const unlinkedCount = (db1.prepare('SELECT COUNT(*) as c FROM emails WHERE user_id IS NULL').get() as any).c;
  assertCheck('All 1,059 legacy unlinked records remain user_id = NULL (fail-closed)', unlinkedCount === 1059);

  const fkViolations = db1.prepare('PRAGMA foreign_key_check(emails)').all();
  assertCheck('PRAGMA foreign_key_check returns 0 violations', fkViolations.length === 0);

  const indexes = (db1.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='emails'").all() as any[]).map(i => i.name);
  assertCheck("Covering index 'idx_emails_user_id' exists", indexes.includes('idx_emails_user_id'));
  assertCheck("Covering index 'idx_emails_user_category' exists", indexes.includes('idx_emails_user_category'));

  // ---------------------------------------------------------------------------
  // SUITE 2: SAFE RE-EXECUTION (IDEMPOTENCY)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 2] Safe Re-Execution (Idempotency Guard)...');
  const res2 = runEmailUserIdMigration(db1);
  assertCheck("Re-executing migration returns status 'ALREADY_APPLIED'", res2.status === 'ALREADY_APPLIED');
  assertCheck('Re-execution did not alter schema or duplicate columns', res2.details.hasUserIdColumn === true && res2.details.isRecordedInTracker === true);

  const totalAfterRerun = (db1.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  assertCheck('Total records unchanged after re-execution', totalAfterRerun === 1062);

  db1.close();

  // ---------------------------------------------------------------------------
  // SUITE 3: INCONSISTENT STATE DETECTION (Column Exists Without Migration Record)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 3] Inconsistent State Detection (Unrecorded Column)...');
  const dbPath3 = path.join(testDir, 'test_suite_3.db');
  const db3 = createPreMigrationDb(dbPath3);

  // Manually add user_id column without recording in schema_migrations
  db3.exec('ALTER TABLE emails ADD COLUMN user_id TEXT REFERENCES users(id);');

  const res3 = runEmailUserIdMigration(db3);
  assertCheck("Unrecorded column returns status 'INCONSISTENT_STATE'", res3.status === 'INCONSISTENT_STATE');
  assertCheck("Error message contains 'INCONSISTENT_STATE'", (res3.error || '').includes('INCONSISTENT_STATE'));
  assertCheck('Migration runner fails closed and aborts', res3.details.hasUserIdColumn === true && res3.details.isRecordedInTracker === false);

  db3.close();

  // ---------------------------------------------------------------------------
  // SUITE 4: SCHEMA DRIFT DETECTION (Migration Record Exists Without Column)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 4] Schema Drift Detection (Record Exists Without Column)...');
  const dbPath4 = path.join(testDir, 'test_suite_4.db');
  const db4 = createPreMigrationDb(dbPath4);

  // Manually insert migration record without adding column
  db4.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INTEGER DEFAULT 0,
      checksum TEXT
    );
    INSERT INTO schema_migrations (id, execution_time_ms, checksum) VALUES ('add_user_id_to_emails', 10, 'fake_checksum');
  `);

  const res4 = runEmailUserIdMigration(db4);
  assertCheck("Missing column with record returns status 'SCHEMA_DRIFT'", res4.status === 'SCHEMA_DRIFT');
  assertCheck("Error message contains 'SCHEMA_DRIFT'", (res4.error || '').includes('SCHEMA_DRIFT'));
  assertCheck('Migration runner fails closed without executing corrupted DDL', res4.details.hasUserIdColumn === false && res4.details.isRecordedInTracker === true);

  db4.close();

  // ---------------------------------------------------------------------------
  // SUITE 5: ATOMIC TRANSACTION ROLLBACK ON MIGRATION FAILURE
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 5] Atomic Transaction Rollback on Failure...');
  const dbPath5 = path.join(testDir, 'test_suite_5.db');
  const db5 = createPreMigrationDb(dbPath5);

  // Seed initial records
  db5.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_alice', 'alice@example.com', 'Alice')").run();
  db5.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
    VALUES ('email_test_01', null, 'Opportunity', 'hr@test.com', 'alice@example.com', 'Test', 'Body', 1, 0)
  `).run();

  // Create a conflicting object that triggers an error during index creation
  db5.exec("CREATE TABLE idx_emails_user_id (dummy TEXT);");

  const res5 = runEmailUserIdMigration(db5);
  assertCheck("Conflicting schema triggers migration status 'FAILED'", res5.status === 'FAILED');

  // Verify that failure rolled back the ADD COLUMN user_id completely
  const colsAfterFailed = (db5.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
  assertCheck("Column 'user_id' was completely rolled back by SQLite DDL transaction", !colsAfterFailed.includes('user_id'));

  const hasTrackerTable = (db5.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get() as any);
  const trackerRecord = hasTrackerTable ? db5.prepare("SELECT * FROM schema_migrations WHERE id = 'add_user_id_to_emails'").get() : undefined;
  assertCheck('Failed migration was NOT recorded in schema_migrations', trackerRecord === undefined);

  const emailCountAfterRollback = (db5.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  assertCheck('Initial data preserved completely after failed migration', emailCountAfterRollback === 1);

  db5.close();

  // ---------------------------------------------------------------------------
  // SUITE 6: CONCURRENT RUNNERS (EXCLUSIVE LOCKING & RACING RESOLUTION)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 6] Concurrency Race Resolution (Two Concurrent Runners)...');
  const dbPath6 = path.join(testDir, 'test_suite_6.db');
  const db6Init = createPreMigrationDb(dbPath6);
  db6Init.prepare("INSERT INTO users (id, email, full_name) VALUES ('u1', 'u1@test.com', 'U1')").run();
  db6Init.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app1', 'u1', 'j1', 'Applied')").run();
  db6Init.prepare("INSERT INTO emails (id, application_id, category, sender, recipient, subject, body) VALUES ('e1', 'app1', 'Cat', 's@t.com', 'r@t.com', 'Sub', 'Body')").run();
  db6Init.close();

  // Run Worker 1 and Worker 2 concurrently against the same SQLite database
  const runWorker = (delayMs: number): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { dbPath: dbPath6, delayMs }
      });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  };

  // Launch both concurrently: Worker 1 immediately, Worker 2 with slight delay (5ms)
  const [worker1Result, worker2Result] = await Promise.all([
    runWorker(0),
    runWorker(15)
  ]);

  const outcomes = [worker1Result.status, worker2Result.status];
  assertCheck("One worker succeeds with 'SUCCESS'", outcomes.includes('SUCCESS'));
  assertCheck("The concurrent worker unblocks and returns 'ALREADY_APPLIED'", outcomes.includes('ALREADY_APPLIED'));

  // Verify final database state
  const db6Check = new Database(dbPath6);
  const db6Cols = (db6Check.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
  assertCheck("Final schema in concurrent test contains 'user_id'", db6Cols.includes('user_id'));
  const db6MigCount = (db6Check.prepare("SELECT COUNT(*) as c FROM schema_migrations WHERE id = 'add_user_id_to_emails'").get() as any).c;
  assertCheck("Migration recorded exactly once in schema_migrations", db6MigCount === 1);
  db6Check.close();

  // ---------------------------------------------------------------------------
  // SUITE 7: NESTED TRANSACTION PREVENTION (Caller Transaction Guard)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 7] Active Caller Transaction Guard (Prevent Nested Transactions)...');
  const dbPath7 = path.join(testDir, 'test_suite_7.db');
  const db7 = createPreMigrationDb(dbPath7);

  // Caller opens a transaction before invoking migration
  db7.exec('BEGIN TRANSACTION;');
  assertCheck('Caller transaction is active on connection', db7.inTransaction === true);

  const res7 = runEmailUserIdMigration(db7);
  assertCheck("Active caller transaction safely rejected with status 'FAILED'", res7.status === 'FAILED');
  assertCheck("Error message mentions active transaction", (res7.error || '').includes('already active'));

  // Cleanly rollback caller transaction
  db7.exec('ROLLBACK;');
  db7.close();

  // ---------------------------------------------------------------------------
  // SUITE 8: FAILED FIRST EXECUTION FOLLOWED BY SUCCESSFUL RETRY
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 8] Failed First Execution Followed by Clean Retry...');
  const dbPath8 = path.join(testDir, 'test_suite_8.db');
  const db8 = createPreMigrationDb(dbPath8);

  db8.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_retry', 'retry@example.com', 'Retry User')").run();
  db8.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app_retry', 'user_retry', 'job_r', 'Applied')").run();
  db8.prepare("INSERT INTO emails (id, application_id, category, sender, recipient, subject, body) VALUES ('e_retry', 'app_retry', 'Notice', 'a@b.com', 'retry@example.com', 'Notice', 'Body')").run();

  // Inject temporary blocker
  db8.exec("CREATE TABLE idx_emails_user_id (blocker TEXT);");

  // Attempt 1: Should fail and rollback completely
  const attempt1 = runEmailUserIdMigration(db8);
  assertCheck("Attempt 1 fails with status 'FAILED'", attempt1.status === 'FAILED');
  assertCheck("emails table has NO user_id column after rollback", !(db8.prepare('PRAGMA table_info(emails)').all() as any[]).some(c => c.name === 'user_id'));
  assertCheck("Connection is NOT in transaction after failure", db8.inTransaction === false);

  // Resolve blocker
  db8.exec("DROP TABLE idx_emails_user_id;");

  // Attempt 2: Clean retry on the exact same database
  const attempt2 = runEmailUserIdMigration(db8);
  assertCheck("Retry succeeds with status 'SUCCESS'", attempt2.status === 'SUCCESS');
  assertCheck("user_id column exists after retry", (db8.prepare('PRAGMA table_info(emails)').all() as any[]).some(c => c.name === 'user_id'));

  const backfilledEmail = db8.prepare("SELECT * FROM emails WHERE id = 'e_retry'").get() as any;
  assertCheck("Retry backfilled email accurately with 'user_retry'", backfilledEmail.user_id === 'user_retry');

  // Attempt 3: Immediate third execution returns ALREADY_APPLIED
  const attempt3 = runEmailUserIdMigration(db8);
  assertCheck("Subsequent attempt returns 'ALREADY_APPLIED'", attempt3.status === 'ALREADY_APPLIED');

  db8.close();

  // ---------------------------------------------------------------------------
  // SUITE 9: ROLLBACK RESTORATION INTEGRITY (Zero Data Loss)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [SUITE 9] Rollback Procedure & Data Integrity...');
  const dbPath9 = path.join(testDir, 'test_suite_9.db');
  const db9 = createPreMigrationDb(dbPath9);

  // Seed user, application, email
  db9.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_alice', 'alice@example.com', 'Alice')").run();
  db9.prepare("INSERT INTO applications (id, user_id, job_id, status) VALUES ('app_1', 'user_alice', 'job_1', 'Ready')").run();
  db9.prepare(`
    INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
    VALUES ('email_preserve_01', 'app_1', 'Opportunity', 'hr@a.com', 'alice@example.com', 'Preserve Test', 'Important Body', 1, 0)
  `).run();

  // Run migration
  runEmailUserIdMigration(db9);
  assertCheck('Migration applied prior to rollback test', (db9.prepare('PRAGMA table_info(emails)').all() as any[]).some(c => c.name === 'user_id'));

  // Execute rollback script from add_user_id_to_emails.sql (lines 92-95)
  db9.exec(`
    DROP INDEX IF EXISTS idx_emails_user_category;
    DROP INDEX IF EXISTS idx_emails_user_id;
    ALTER TABLE emails DROP COLUMN user_id;
  `);

  const colsPostRollback = (db9.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
  assertCheck("Column 'user_id' successfully dropped during rollback", !colsPostRollback.includes('user_id'));

  const preservedEmail = db9.prepare('SELECT * FROM emails WHERE id = ?').get('email_preserve_01') as any;
  assertCheck('Email record preserved after rollback', preservedEmail && preservedEmail.id === 'email_preserve_01');
  assertCheck('Original body intact after rollback', preservedEmail.body === 'Important Body');
  assertCheck('Original application_id intact after rollback', preservedEmail.application_id === 'app_1');

  db9.close();

  // Cleanup synthetic test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('\n✓ Cleaned up all synthetic test databases.');
  } catch (e: any) {
    console.warn('Note: Could not immediately clean test directory:', e.message);
  }

  console.log('\n========================================================================');
  console.log('>>> ALL SYNTHETIC ATOMIC MIGRATION & RUNNER SCENARIOS PASSED <<<');
  console.log('========================================================================\n');
}

runAllMigrationTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
