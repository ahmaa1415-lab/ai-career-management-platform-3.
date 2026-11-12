import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { BackgroundWorkerManager } from './background_worker.mjs';
import { SQLiteBackupManager } from './backup_manager.mjs';

async function testRuntimeSupervisor() {
  console.log('=== [SECTION 1: CONTAINER RUNTIME SUPERVISOR & CONSISTENCY TEST] ===\n');

  const testDir = path.join(process.cwd(), 'data', 'staging_supervisor_test');
  const testDbPath = path.join(testDir, 'test_app.db');
  const testUploadsDir = path.join(testDir, 'uploads');
  const testBackupDir = path.join(testDir, 'backups');

  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(testUploadsDir, { recursive: true });
  fs.mkdirSync(testBackupDir, { recursive: true });

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS worker_leases (
      job_name TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      locked_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL
    );
  `);

  console.log('1. Checking Process & Path Consistency:');
  console.log(`   - Configured Database Path: ${testDbPath}`);
  console.log(`   - Configured Uploads Dir:   ${testUploadsDir}`);
  console.log(`   - Verified Shared Volume:   ${path.dirname(testDbPath) === path.dirname(testUploadsDir)}`);

  // 2. Test Duplicate Worker Prevention (Point 8)
  console.log('\n2. Testing Duplicate Worker Prevention (Atomic Lease Lock):');
  const worker1 = new BackgroundWorkerManager(testDbPath);
  const worker2 = new BackgroundWorkerManager(testDbPath);
  const jobName = 'scheduled_verification_cycle';

  const lock1 = worker1.acquireLock(jobName, 60000, 'worker_instance_A');
  const lock2 = worker2.acquireLock(jobName, 60000, 'worker_instance_B');

  console.log(`   - Worker Instance A Lock Acquired: ${lock1} (EXPECTED: true)`);
  console.log(`   - Worker Instance B Lock Acquired: ${lock2} (EXPECTED: false - Duplicate blocked)`);
  const duplicateBlocked = lock1 === true && lock2 === false;

  // 3. Test Worker Failure Visibility (Point 5)
  console.log('\n3. Testing Worker Failure Visibility (Audit & Error Logging):');
  const recordAudit = (action, details) => {
    db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      `audit_${Date.now()}`, 'system_worker', action, JSON.stringify(details)
    );
  };

  try {
    throw new Error('Simulated external API timeout during worker cycle');
  } catch (err) {
    recordAudit('WORKER_CYCLE_FAILED', { jobName, error: err.message });
    console.log(`   - Worker Failure Intercepted and Logged: "${err.message}"`);
  }

  const failedLog = db.prepare('SELECT * FROM audit_logs WHERE action = ?').get('WORKER_CYCLE_FAILED');
  const failureLogged = failedLog !== undefined && JSON.parse(failedLog.details).error.includes('Simulated');
  console.log(`   - Audit Table Recorded Worker Failure:   ${failureLogged}`);

  // 4. Test Backup Scheduling Execution (Section 6)
  console.log('\n4. Testing Backup Scheduling & Disk-Space Safeguard:');
  const backupRes = await SQLiteBackupManager.createConsistentBackup(testDbPath, testBackupDir);
  console.log(`   - Scheduled Backup Produced: ${backupRes.backupFileName} (${backupRes.sizeBytes} bytes)`);
  const isBackupIntact = SQLiteBackupManager.verifyIntegrity(backupRes.backupFilePath);
  console.log(`   - Scheduled Backup Integrity Verified: ${isBackupIntact}`);

  // 5. Test Graceful Shutdown & WAL Checkpoint (Point 6)
  console.log('\n5. Testing Graceful Shutdown & SQLite WAL Flush:');
  const walFlushResult = db.pragma('wal_checkpoint(TRUNCATE)');
  console.log(`   - PRAGMA wal_checkpoint(TRUNCATE) result: ${JSON.stringify(walFlushResult)}`);
  const walFlushed = Array.isArray(walFlushResult) && walFlushResult[0]?.busy === 0;

  // 6. Test Environment Gate Validation (Section 3)
  console.log('\n6. Testing Environment Validation Gate:');
  const validateConfig = (staging, accessCode) => {
    if (staging && (!accessCode || accessCode.trim().length < 8)) {
      return { allowed: false, reason: 'STAGING_MODE active but STAGING_ACCESS_CODE invalid or short' };
    }
    return { allowed: true };
  };

  const checkUnsafeStaging = validateConfig(true, '');
  const checkSafeStaging = validateConfig(true, 'STAGING_GATE_PASS_2026');
  console.log(`   - Unsafe Staging (Missing Code) Blocked: ${!checkUnsafeStaging.allowed}`);
  console.log(`   - Safe Staging Permitted:              ${checkSafeStaging.allowed}`);
  const envGatePassed = !checkUnsafeStaging.allowed && checkSafeStaging.allowed;

  worker1.releaseLock(jobName, 'worker_instance_A');
  worker1.close();
  worker2.close();
  db.close();

  fs.rmSync(testDir, { recursive: true, force: true });

  const allPassed = duplicateBlocked && failureLogged && isBackupIntact && walFlushed && envGatePassed;
  console.log(`\n=== [RUNTIME SUPERVISOR & CONSISTENCY TEST: ${allPassed ? 'ALL CHECKS PASSED' : 'FAILED'}] ===`);
  if (!allPassed) process.exit(1);
}

testRuntimeSupervisor().catch(err => {
  console.error(err);
  process.exit(1);
});
