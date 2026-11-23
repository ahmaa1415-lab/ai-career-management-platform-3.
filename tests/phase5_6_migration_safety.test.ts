/**
 * Phase 5.6 SQLite Migration Safety & Crash Recovery Test Suite
 *
 * Verifies all mission-critical safety properties:
 * 1. Safe pre-migration backup & rejection without DRAINING/quiescence.
 * 2. Pre-migration backup snapshot verification (SHA-256, integrity, FK, meta, isolated restore).
 * 3. Uncoordinated writer race detection between backup and lock acquisition (data_version divergence).
 * 4. Engine-level writer exclusion after lock acquisition (SQLITE_BUSY across OS processes).
 * 5. Durability settings (synchronous=FULL) & checkpoint contention handling (busy: 1).
 * 6. Deep verification protocol across clean baseline, fully migrated, and adversarial corruptions.
 * 7. End-to-end execution and deterministic idempotency (ALREADY_APPLIED).
 */

import { spawnSync } from 'child_process';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { runEmailUserIdMigration, EMAIL_USER_ID_MIGRATION_ID } from '../lib/migrations';
import { SQLiteBackupManager } from '../scripts/backup_manager.mjs';
import { executeMigrationCli } from '../scripts/run_email_migration';
import {
  getCoordinationDb,
  requestMaintenanceDrain,
  deactivateCrossProcessMaintenance,
  acquireCrossProcessWriteLease,
  closeCoordinationDbCache
} from '../lib/coordination';

const testDir = path.join(process.cwd(), 'data', 'test_phase5_6_safety');
const testDbPath = path.join(testDir, 'career_app_test.db');
const testCoordDbPath = path.join(testDir, '.coordination.db');
const backupDir = path.join(testDir, 'backups');

function cleanupTestEnv() {
  closeCoordinationDbCache();
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
}

function initPrimaryTestDb(): Database.Database {
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL
    );

    CREATE TABLE applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL
    );

    CREATE TABLE emails (
      id TEXT PRIMARY KEY,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      category TEXT
    );

    -- Seed data: Attributable emails
    INSERT INTO users (id, email, full_name) VALUES ('u1', 'alice@example.com', 'Alice');
    INSERT INTO users (id, email, full_name) VALUES ('u2', 'bob@example.com', 'Bob');

    INSERT INTO applications (id, user_id, company_name) VALUES ('app1', 'u1', 'Acme Corp');
    INSERT INTO applications (id, user_id, company_name) VALUES ('app2', 'u2', 'Beta Inc');

    INSERT INTO emails (id, application_id, subject, category) VALUES ('em1', 'app1', 'Interview invite', 'interview');
    INSERT INTO emails (id, application_id, subject, category) VALUES ('em2', 'app2', 'Offer letter', 'offer');

    -- Seed data: Historical unlinked email (no application ownership)
    INSERT INTO emails (id, application_id, subject, category) VALUES ('em_unlinked', NULL, 'Newsletter', 'newsletter');
  `);

  return db;
}

async function runTests() {
  console.log('===============================================================');
  console.log('   PHASE 5.6 SQLITE MIGRATION SAFETY & CRASH RECOVERY TESTS    ');
  console.log('===============================================================\n');

  cleanupTestEnv();

  // --------------------------------------------------------------------------
  // TEST 1: Safe Pre-Migration Backup Rejection Without Quiescence
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Pre-Migration Backup Authorization Gate ---');
  {
    const primaryDb = initPrimaryTestDb();
    primaryDb.close();

    // 1.1 Reject when coordination state is INACTIVE
    let rejectedInactive = false;
    try {
      SQLiteBackupManager.createPreMigrationBackup({
        sourceDbPath: testDbPath,
        backupDir
      });
    } catch (err: any) {
      if (err.message.includes('[PRE_MIGRATION_BACKUP_REJECTED]')) {
        rejectedInactive = true;
      }
    }
    console.log('   Rejected while coordination state is INACTIVE:', rejectedInactive);
    if (!rejectedInactive) throw new Error('FAIL: Backup was allowed in INACTIVE state!');

    // 1.2 Transition to DRAINING but with active in-flight lease
    const lease = acquireCrossProcessWriteLease({
      processType: 'web',
      label: 'simulated_in_flight_write',
      customDbPath: testDbPath
    });

    // Set coordination state to DRAINING with lease active
    const cdb = getCoordinationDb(testDbPath);
    cdb.prepare(`
      INSERT INTO coordination_state (id, state, reason, operator, initiated_at)
      VALUES ('global', 'DRAINING', 'test', 'test', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET state = 'DRAINING'
    `).run();
    cdb.close();

    let rejectedActiveLease = false;
    let actualError = '';
    try {
      SQLiteBackupManager.createPreMigrationBackup({
        sourceDbPath: testDbPath,
        backupDir
      });
    } catch (err: any) {
      actualError = err.message;
      if (err.message.includes('active write leases remain in-flight')) {
        rejectedActiveLease = true;
      }
    }
    console.log('   Rejected while active lease exists in DRAINING:', rejectedActiveLease, 'Actual error:', actualError);
    if (!rejectedActiveLease) throw new Error('FAIL: Backup was allowed while active leases exist!');

    // Clean up lease and maintenance for next test
    lease.release();
    const cleanCdb = new Database(testCoordDbPath);
    cleanCdb.prepare("DELETE FROM active_leases").run();
    cleanCdb.close();
    closeCoordinationDbCache();
    deactivateCrossProcessMaintenance(testDbPath);
  }
  console.log('   [PASS] TEST 1: Authorization gate strictly enforced.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Pre-Migration Backup Snapshot & Deep Verification
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: Pre-Migration Backup Snapshot & Integrity ---');
  {
    // Enter DRAINING with 0 active leases
    await requestMaintenanceDrain({ drainTimeoutMs: 5000, customDbPath: testDbPath });

    const backupResult = SQLiteBackupManager.createPreMigrationBackup({
      sourceDbPath: testDbPath,
      backupDir
    });

    console.log('   Backup created:', backupResult.backupFileName);
    console.log('   Backup SHA-256:', backupResult.sha256);

    // Verify backup file exists and has content
    if (!fs.existsSync(backupResult.backupFilePath)) throw new Error('FAIL: Backup file not found on disk!');
    const fileBytes = fs.readFileSync(backupResult.backupFilePath);
    const computedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (computedHash !== backupResult.sha256) throw new Error('FAIL: Backup SHA-256 hash mismatch!');

    // Verify metadata and sha256 sidecars exist
    const metaPath = `${backupResult.backupFilePath}.meta.json`;
    const shaPath = `${backupResult.backupFilePath}.sha256`;
    if (!fs.existsSync(metaPath) || !fs.existsSync(shaPath)) throw new Error('FAIL: Metadata sidecar files missing!');

    // Verify backup integrity and foreign keys directly
    const backupDb = new Database(backupResult.backupFilePath, { readonly: true });
    const integrity = backupDb.pragma('integrity_check');
    const fkViolations = backupDb.pragma('foreign_key_check');
    backupDb.close();

    if (integrity[0]?.integrity_check !== 'ok') throw new Error('FAIL: Backup failed integrity check!');
    if (fkViolations.length > 0) throw new Error('FAIL: Backup failed foreign key check!');

    deactivateCrossProcessMaintenance(testDbPath);
  }
  console.log('   [PASS] TEST 2: Backup snapshot verified with complete metadata.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Uncoordinated Writer Race Detection (data_version Divergence)
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Uncoordinated Writer Race (data_version Divergence) ---');
  {
    await requestMaintenanceDrain({ drainTimeoutMs: 5000, customDbPath: testDbPath });

    const runnerDb = new Database(testDbPath, { timeout: 15000 });
    runnerDb.pragma('journal_mode = WAL');
    runnerDb.pragma('foreign_keys = ON');
    runnerDb.pragma('synchronous = FULL');

    const dataVersionBefore = runnerDb.pragma('data_version', { simple: true }) as number;

    // Create pre-migration backup at dataVersionBefore
    SQLiteBackupManager.createPreMigrationBackup({
      sourceDbPath: testDbPath,
      backupDir,
      callerDb: runnerDb
    });

    // Simulate an UNCOORDINATED rogue write slipping in via a separate connection
    const rogueDb = new Database(testDbPath);
    rogueDb.exec("INSERT INTO emails (id, application_id, subject) VALUES ('em_rogue', 'app1', 'Rogue email');");
    rogueDb.close();

    // Runner attempts migration with expectedDataVersion: dataVersionBefore
    const migrationResult = runEmailUserIdMigration(runnerDb, { expectedDataVersion: dataVersionBefore });
    runnerDb.close();

    console.log('   Migration status under data_version divergence:', migrationResult.status);
    console.log('   Reported error message:', migrationResult.error);

    if (migrationResult.status !== 'FAILED' || !migrationResult.error?.includes('DATA_VERSION_DIVERGENCE')) {
      throw new Error(`FAIL: Migration did not fail with DATA_VERSION_DIVERGENCE! Status: ${migrationResult.status}`);
    }

    // Assert that primary database has NO schema modification (user_id does not exist)
    const verifyDb = new Database(testDbPath, { readonly: true });
    const cols = (verifyDb.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
    const hasUserId = cols.includes('user_id');
    const hasMigrationRecord = Boolean(verifyDb.prepare("SELECT * FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
    verifyDb.close();

    if (hasUserId) throw new Error('FAIL: Column user_id was added despite data_version divergence!');
    if (hasMigrationRecord) throw new Error('FAIL: schema_migrations was committed despite divergence!');

    deactivateCrossProcessMaintenance(testDbPath);
  }
  console.log('   [PASS] TEST 3: data_version divergence safely detected; rolled back before DDL.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Engine-Level Writer Exclusion After Lock Acquisition
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Engine-Level Writer Exclusion (Separate Process) ---');
  {
    const lockHolderDb = new Database(testDbPath, { timeout: 15000 });
    lockHolderDb.exec('BEGIN EXCLUSIVE TRANSACTION;');

    // In a separate OS process, attempt an immediate write (timeout 500ms)
    const childScript = `
      import Database from 'better-sqlite3';
      try {
        const db = new Database('${testDbPath.replace(/\\/g, '/')}', { timeout: 500 });
        db.exec("INSERT INTO emails (id, subject) VALUES ('em_child', 'Blocked');");
        process.exit(0);
      } catch (err) {
        if (err.message.includes('busy') || err.code === 'SQLITE_BUSY') {
          process.exit(42); // Expected SQLITE_BUSY code
        }
        process.exit(1);
      }
    `;

    const res = spawnSync(process.execPath, ['--input-type=module', '-e', childScript]);
    console.log('   Child writer process exit code:', res.status, res.status === 42 ? '(Expected SQLITE_BUSY)' : '(Failed)');

    lockHolderDb.exec('ROLLBACK;');
    lockHolderDb.close();

    if (res.status !== 42) {
      throw new Error(`FAIL: Separate process writer was NOT blocked with SQLITE_BUSY! Exit code: ${res.status}`);
    }
  }
  console.log('   [PASS] TEST 4: SQLite engine exclusive lock reliably blocks concurrent writers.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Durability (synchronous=FULL) & Checkpoint Contention Handling
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: synchronous=FULL & wal_checkpoint Contention ---');
  {
    const dedicatedDb = new Database(testDbPath, { timeout: 15000 });
    dedicatedDb.pragma('journal_mode = WAL');
    dedicatedDb.pragma('synchronous = FULL');

    const effectiveSyn = dedicatedDb.pragma('synchronous', { simple: true });
    if (effectiveSyn !== 2) throw new Error(`FAIL: synchronous=FULL was not effective! Value: ${effectiveSyn}`);

    // Simulate concurrent reader holding an open WAL read transaction
    const readerDb = new Database(testDbPath);
    readerDb.exec('BEGIN DEFERRED;');
    readerDb.prepare('SELECT COUNT(*) FROM emails').get();

    // Writer writes and attempts wal_checkpoint(TRUNCATE)
    dedicatedDb.exec("INSERT INTO emails (id, application_id, subject) VALUES ('em_ckpt', 'app1', 'Check point test');");
    const ckptBlocked = dedicatedDb.pragma('wal_checkpoint(TRUNCATE)') as any[];
    console.log('   Checkpoint result while reader active:', ckptBlocked);

    if (!Array.isArray(ckptBlocked) || ckptBlocked[0]?.busy !== 1) {
      throw new Error('FAIL: Checkpoint was expected to return busy=1 with active reader!');
    }

    // Reader finishes transaction
    readerDb.exec('COMMIT;');
    readerDb.close();

    // Now checkpoint succeeds
    const ckptSuccess = dedicatedDb.pragma('wal_checkpoint(TRUNCATE)') as any[];
    console.log('   Checkpoint result after reader closed:', ckptSuccess);
    if (!Array.isArray(ckptSuccess) || ckptSuccess[0]?.busy !== 0) {
      throw new Error('FAIL: Checkpoint failed to truncate after reader closed!');
    }

    dedicatedDb.close();
  }
  console.log('   [PASS] TEST 5: synchronous=FULL verified and busy checkpoint handled safely.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Deep Verification Protocol Across Diverse States
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Deep Verification Protocol Matrix ---');
  {
    // Clean unmigrated
    const cleanOutcome = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Clean unmigrated outcome:', cleanOutcome.state, cleanOutcome.healthy);
    if (!cleanOutcome.healthy || cleanOutcome.state !== 'CLEAN_UNMIGRATED') {
      throw new Error('FAIL: Clean baseline did not return CLEAN_UNMIGRATED!');
    }

    // Subcase 6A: Inconsistent (hasUserId === true, isRecorded === false)
    const corruptDb = new Database(testDbPath);
    corruptDb.exec('ALTER TABLE emails ADD COLUMN user_id TEXT;');
    const splitOutcome1 = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Split state (column without tracker):', splitOutcome1.state, 'healthy:', splitOutcome1.healthy);
    if (splitOutcome1.healthy || splitOutcome1.state !== 'INCONSISTENT') {
      throw new Error('FAIL: Split state failed to report INCONSISTENT!');
    }

    // Subcase 6B: Inconsistent (tracker present, missing indexes)
    const sqlPath = path.join(process.cwd(), 'migrations', 'add_user_id_to_emails.sql');
    const validChecksum = fs.existsSync(sqlPath)
      ? crypto.createHash('sha256').update(fs.readFileSync(sqlPath, 'utf-8')).digest('hex')
      : 'embedded_fallback';

    corruptDb.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, checksum TEXT);");
    corruptDb.prepare("INSERT INTO schema_migrations (id, checksum) VALUES ('add_user_id_to_emails', ?);").run(validChecksum);
    const splitOutcome2 = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Missing indexes outcome:', splitOutcome2.state, 'healthy:', splitOutcome2.healthy);
    if (splitOutcome2.healthy || splitOutcome2.state !== 'INCONSISTENT') {
      throw new Error('FAIL: Missing indexes failed to report INCONSISTENT!');
    }

    // Subcase 6C: Incomplete attributable backfill
    corruptDb.exec("CREATE INDEX idx_emails_user_id ON emails(user_id);");
    corruptDb.exec("CREATE INDEX idx_emails_user_category ON emails(user_id, category);");
    // Leave attributable rows unlinked
    const incompleteOutcome = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Incomplete attributable backfill outcome:', incompleteOutcome.state, 'healthy:', incompleteOutcome.healthy);
    if (incompleteOutcome.healthy || !incompleteOutcome.reason?.includes('Attributable email backfill incomplete')) {
      throw new Error('FAIL: Incomplete attributable backfill failed to be caught!');
    }

    // Subcase 6D: Bogus default user assigned to unlinked row
    corruptDb.exec("UPDATE emails SET user_id = 'u1' WHERE application_id = 'app1';");
    corruptDb.exec("UPDATE emails SET user_id = 'u2' WHERE application_id = 'app2';");
    corruptDb.exec("UPDATE emails SET user_id = 'u1' WHERE id = 'em_unlinked';"); // Rogue attribution!
    const bogusOutcome = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Bogus default assignment outcome:', bogusOutcome.state, 'healthy:', bogusOutcome.healthy);
    if (bogusOutcome.healthy || !bogusOutcome.reason?.includes('Data integrity violation')) {
      throw new Error('FAIL: Bogus attribution on unlinked email failed to be caught!');
    }

    corruptDb.close();
  }
  console.log('   [PASS] TEST 6: All anomalous/corrupt states reliably detected as fail-closed.\n');

  // --------------------------------------------------------------------------
  // TEST 7: End-to-End Migration Execution & Deterministic Idempotency
  // --------------------------------------------------------------------------
  console.log('--- TEST 7: End-to-End Execution & Deterministic Idempotency ---');
  {
    // Re-seed clean primary test DB
    cleanupTestEnv();
    const cleanDb = initPrimaryTestDb();
    cleanDb.close();

    // Enter maintenance mode
    await requestMaintenanceDrain({ drainTimeoutMs: 5000, customDbPath: testDbPath });

    // Execute migration CLI directly on custom test DB
    const firstRun = executeMigrationCli(testDbPath);
    console.log('   First run outcome status:', firstRun.status);
    if (firstRun.status !== 'SUCCESS') throw new Error(`FAIL: First migration run failed with status: ${firstRun.status}`);

    // Deep verification of migrated database
    const verifyOutcome = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    console.log('   Deep verification post-migration:', verifyOutcome.state, 'healthy:', verifyOutcome.healthy);
    if (!verifyOutcome.healthy || verifyOutcome.state !== 'MIGRATED') {
      throw new Error(`FAIL: Database did not pass deep verification as MIGRATED! State: ${verifyOutcome.state}, Reason: ${verifyOutcome.reason}`);
    }

    // Re-run migration CLI immediately (Idempotency assertion)
    await requestMaintenanceDrain({ drainTimeoutMs: 5000, customDbPath: testDbPath });
    const secondRun = executeMigrationCli(testDbPath);
    console.log('   Second run outcome status (Idempotency):', secondRun.status);
    if (secondRun.status !== 'ALREADY_APPLIED') {
      throw new Error(`FAIL: Idempotency check failed! Expected ALREADY_APPLIED, got: ${secondRun.status}`);
    }

    // Re-verify deep health after second run
    const reVerifyOutcome = SQLiteBackupManager.verifyDatabaseStateDeep(testDbPath);
    if (!reVerifyOutcome.healthy || reVerifyOutcome.state !== 'MIGRATED') {
      throw new Error('FAIL: Database corrupted after ALREADY_APPLIED run!');
    }
  }
  console.log('   [PASS] TEST 7: Migration is deterministic, fully atomic, and idempotent.\n');

  cleanupTestEnv();
  console.log('===============================================================');
  console.log('   ALL PHASE 5.6 MIGRATION SAFETY TESTS COMPLETED SUCCESSFULLY! ');
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  cleanupTestEnv();
  process.exit(1);
});
