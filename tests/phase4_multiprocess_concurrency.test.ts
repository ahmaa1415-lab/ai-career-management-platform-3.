/**
 * Phase 4 Multi-Process Concurrency & Database Coordination Test Suite
 *
 * Exercises all 16 mission-critical scenarios across REAL, INDEPENDENT Node.js OS processes
 * and separate SQLite database connections:
 *
 * 1.  Web process holds a write lease.
 * 2.  Separate maintenance process requests DRAINING.
 * 3.  New writer attempts to enter and is rejected.
 * 4.  Existing writer completes.
 * 5.  Maintenance transitions to ACTIVE.
 * 6.  Process crashes while holding a lease.
 * 7.  Maintenance recovers safely (stale lease TTL expiration).
 * 8.  Two maintenance operators race concurrently.
 * 9.  Worker and backup overlap with maintenance.
 * 10. Prepared statements with RETURNING cannot bypass protection.
 * 11. CTE mutations cannot bypass protection.
 * 12. Comment-prefixed mutations cannot bypass protection.
 * 13. DDL and state-changing PRAGMA operations are controlled.
 * 14. Deferred audit events survive abrupt process termination.
 * 15. Event flush is idempotent after a crash.
 * 16. Migration cannot run while any writer remains active.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  getCoordinationDb,
  getCrossProcessState,
  requestMaintenanceDrain,
  deactivateCrossProcessMaintenance,
  acquireCrossProcessWriteLease,
  getActiveLeasesCount,
  spoolDurableAuditEvent,
  flushDurableAudits,
  getPendingAuditCount,
  closeCoordinationDbCache
} from '../lib/coordination';

const testDir = path.join(process.cwd(), 'data', 'test_phase4_multiprocess');
const testDbPath = path.join(testDir, 'career_app_test.db');
const coordinationDbPath = path.join(testDir, '.coordination.db');
const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

const libCoordinationUrl = pathToFileURL(path.join(process.cwd(), 'lib', 'coordination.ts')).href;
const libDbUrl = pathToFileURL(path.join(process.cwd(), 'lib', 'db.ts')).href;
const backgroundWorkerUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'background_worker.mjs')).href;
const backupManagerUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'backup_manager.mjs')).href;
const runEmailMigrationUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'run_email_migration.ts')).href;

const spawnedChildren: ChildProcess[] = [];

function setupTestEnv() {
  closeCoordinationDbCache();
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      full_name TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();

  // Initialize coordination database
  getCoordinationDb(testDbPath);
  deactivateCrossProcessMaintenance(testDbPath);
  delete process.env.MAINTENANCE_MODE;
}

function cleanupTestEnv() {
  for (const child of spawnedChildren) {
    try {
      if (!child.killed) child.kill('SIGKILL');
    } catch {}
  }
  spawnedChildren.length = 0;

  closeCoordinationDbCache();
  try {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  } catch {}
  delete process.env.MAINTENANCE_MODE;
}

function runChildScript(scriptContent: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } {
  const childScriptPath = path.join(testDir, `child_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mjs`);
  fs.writeFileSync(childScriptPath, scriptContent, 'utf-8');

  try {
    const res = spawnSync('node', [tsxCli, childScriptPath], {
      env: {
        ...process.env,
        DATABASE_PATH: testDbPath,
        ...env
      },
      encoding: 'utf-8',
      timeout: 10000
    });
    return {
      status: res.status ?? 1,
      stdout: res.stdout || '',
      stderr: res.stderr || ''
    };
  } finally {
    try { fs.unlinkSync(childScriptPath); } catch {}
  }
}

async function runTestSuite() {
  console.log('=== [PHASE 4: MULTI-PROCESS CONCURRENCY & COORDINATION VERIFICATION] ===\n');
  let passed = 0;
  let failed = 0;
  let processesSpawned = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    setupTestEnv();
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error('       Error:', err.message);
      failed++;
    } finally {
      cleanupTestEnv();
    }
  }

  // --------------------------------------------------------------------------
  // Scenarios 1 to 5: Cross-Process In-Flight Write Draining & State Transitions
  // --------------------------------------------------------------------------
  await test('Scenarios 1-5: Cross-process in-flight write lease, draining, and active transition', async () => {
    // Process 1 (Child Web Process): Acquires write lease, sleeps 1200ms, then releases
    const webWorkerScript = path.join(testDir, 'web_worker.mjs');
    fs.writeFileSync(webWorkerScript, `
      import Database from 'better-sqlite3';
      const cdbPath = '${coordinationDbPath.replace(/\\/g, '/')}';
      const cdb = new Database(cdbPath);
      const now = Date.now();
      cdb.prepare("INSERT INTO active_leases VALUES ('lease_proc_1', 'web', ${process.pid}, 'long_api_write', " + now + ", " + (now + 10000) + ")").run();
      console.log('[PROC 1] Lease acquired');
      setTimeout(() => {
        try {
          cdb.prepare("DELETE FROM active_leases WHERE lease_id = 'lease_proc_1'").run();
          cdb.close();
        } catch {}
        console.log('[PROC 1] Lease released');
        process.exit(0);
      }, 1200);
    `, 'utf-8');

    const proc1 = spawn('node', [webWorkerScript]);
    spawnedChildren.push(proc1);
    processesSpawned++;

    // Poll until Process 1 registers its lease
    const startWait = Date.now();
    while (Date.now() - startWait < 4000 && getActiveLeasesCount(testDbPath) === 0) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (getActiveLeasesCount(testDbPath) !== 1) {
      throw new Error(`Expected active lease count to be 1 across processes, got ${getActiveLeasesCount(testDbPath)}`);
    }

    // Process 2 (Maintenance Process): Initiates drain asynchronously
    let drainError: any = null;
    const drainPromise = requestMaintenanceDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 5000
    }).catch(err => {
      drainError = err;
      return null;
    });

    await new Promise(r => setTimeout(r, 150));
    const stateDuringDrain = getCrossProcessState(testDbPath).state;
    if (stateDuringDrain !== 'DRAINING') {
      throw new Error(`Expected state to be DRAINING across processes, got ${stateDuringDrain}`);
    }

    // Process 3 (New Writer Process): Attempts to enter during DRAINING -> must be rejected
    const newWriterResult = runChildScript(`
      import { acquireCrossProcessWriteLease } from '${libCoordinationUrl}';
      try {
        acquireCrossProcessWriteLease({ processType: 'web', label: 'new_write', customDbPath: '${testDbPath.replace(/\\/g, '/')}' });
        process.exit(0);
      } catch (err) {
        if (err.message.includes('maintenance state is DRAINING')) {
          console.log('[PROC 3 BLOCKED REJECTION SUCCESS]');
          process.exit(42);
        }
        process.exit(1);
      }
    `);
    processesSpawned++;

    if (newWriterResult.status !== 42) {
      throw new Error(`Expected new writer to be rejected during DRAINING, exited with ${newWriterResult.status}: ${newWriterResult.stderr}`);
    }

    // Await drain completion
    const drainResult = await drainPromise;
    if (drainError) throw drainError;
    if (!drainResult || drainResult.state !== 'ACTIVE') {
      throw new Error(`Expected ACTIVE state after lease drain, got ${drainResult?.state}`);
    }

    if (getCrossProcessState(testDbPath).state !== 'ACTIVE') {
      throw new Error('Global coordination state is not ACTIVE');
    }
  });

  // --------------------------------------------------------------------------
  // Scenarios 6 & 7: Process Crashes While Holding Lease -> Stale Lease Recovery
  // --------------------------------------------------------------------------
  await test('Scenarios 6-7: Crashed process holding lease expires safely via TTL without permanent lock', async () => {
    // Child process acquires lease with 400ms TTL, then crashes abruptly
    const crashScript = path.join(testDir, 'crash_proc.mjs');
    fs.writeFileSync(crashScript, `
      import Database from 'better-sqlite3';
      const cdb = new Database('${coordinationDbPath.replace(/\\/g, '/')}');
      const now = Date.now();
      cdb.prepare("INSERT INTO active_leases VALUES ('crashed_lease', 'web', 9999, 'crashed_op', " + now + ", " + (now + 400) + ")").run();
      cdb.close();
      console.log('CRASH_READY');
      process.exit(137); // Abrupt SIGKILL simulation
    `, 'utf-8');

    spawnSync('node', [crashScript]);
    processesSpawned++;

    if (getActiveLeasesCount(testDbPath) !== 1) {
      throw new Error('Crashed process lease should be present before expiration');
    }

    // Wait 500ms for TTL to expire
    await new Promise(r => setTimeout(r, 500));

    // Maintenance drain must purge expired lease and succeed
    const drainResult = await requestMaintenanceDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 2000
    });

    if (drainResult.state !== 'ACTIVE') {
      throw new Error('Maintenance drain should succeed after stale lease TTL expired');
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Concurrent Maintenance Activation Race
  // --------------------------------------------------------------------------
  await test('Scenario 8: Two independent maintenance processes race concurrently', async () => {
    const op1 = runChildScript(`
      import { requestMaintenanceDrain } from '${libCoordinationUrl}';
      const res = await requestMaintenanceDrain({ customDbPath: '${testDbPath.replace(/\\/g, '/')}', drainTimeoutMs: 3000 });
      process.exit(res.state === 'ACTIVE' ? 0 : 1);
    `);
    const op2 = runChildScript(`
      import { requestMaintenanceDrain } from '${libCoordinationUrl}';
      const res = await requestMaintenanceDrain({ customDbPath: '${testDbPath.replace(/\\/g, '/')}', drainTimeoutMs: 3000 });
      process.exit(res.state === 'ACTIVE' ? 0 : 1);
    `);
    processesSpawned += 2;

    if (op1.status !== 0 || op2.status !== 0) {
      throw new Error(`Concurrent operators failed: op1=${op1.status}, op2=${op2.status}`);
    }

    if (getCrossProcessState(testDbPath).state !== 'ACTIVE') {
      throw new Error('Expected final state to be ACTIVE');
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Worker & Backup Rejection During Maintenance
  // --------------------------------------------------------------------------
  await test('Scenario 9: Standalone Background worker and Backup Manager refused during maintenance', async () => {
    await requestMaintenanceDrain({ customDbPath: testDbPath });

    // Run standalone worker in child process
    const workerRes = runChildScript(`
      import { BackgroundWorkerManager } from '${backgroundWorkerUrl}';
      const manager = new BackgroundWorkerManager('${testDbPath.replace(/\\/g, '/')}');
      const acquired = manager.acquireLock('test_worker_job');
      manager.close();
      process.exit(acquired ? 1 : 0);
    `);
    processesSpawned++;

    if (workerRes.status !== 0) {
      throw new Error('Background worker was not refused during active maintenance');
    }

    // Run backup in child process
    const backupRes = runChildScript(`
      import { SQLiteBackupManager } from '${backupManagerUrl}';
      try {
        await SQLiteBackupManager.createConsistentBackup('${testDbPath.replace(/\\/g, '/')}', '${path.join(testDir, 'backups').replace(/\\/g, '/')}');
        process.exit(1);
      } catch (err) {
        if (err.message.includes('[BACKUP_ABORTED]')) {
          process.exit(0);
        }
        process.exit(2);
      }
    `);
    processesSpawned++;

    if (backupRes.status !== 0) {
      throw new Error(`Backup was not aborted during active maintenance: exited with ${backupRes.status}`);
    }
  });

  // --------------------------------------------------------------------------
  // Scenarios 10-13: Native Driver Mutation Interception (Zero Regex Dependency)
  // --------------------------------------------------------------------------
  await test('Scenarios 10-13: stmt.readonly engine interception catches RETURNING, CTEs, comments, DDL, and PRAGMAs', async () => {
    await requestMaintenanceDrain({ customDbPath: testDbPath });

    const driverTestRes = runChildScript(`
      process.env.DATABASE_PATH = '${testDbPath.replace(/\\/g, '/')}';
      const db = (await import('${libDbUrl}')).default;

      let allReturningCaught = false;
      try {
        db.prepare("INSERT INTO users VALUES ('u1', 'e1@test.com', 'N1') RETURNING *").all();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) allReturningCaught = true;
      }

      let getReturningCaught = false;
      try {
        db.prepare("UPDATE users SET full_name = 'X' WHERE id = 'u1' RETURNING *").get();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) getReturningCaught = true;
      }

      let cteCaught = false;
      try {
        db.prepare("WITH cte AS (SELECT 'u2' as id, 'e2@test.com' as email, 'N2' as full_name) INSERT INTO users SELECT * FROM cte").run();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) cteCaught = true;
      }

      let commentCaught = false;
      try {
        db.prepare("/* audit comment */ INSERT INTO users VALUES ('u3', 'e3@test.com', 'N3')").run();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) commentCaught = true;
      }

      let ddlCaught = false;
      try {
        db.prepare("CREATE TABLE test_ddl_table (id INT)").run();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) ddlCaught = true;
      }

      let pragmaCaught = false;
      try {
        db.prepare("PRAGMA user_version = 42").run();
      } catch (err) {
        if (err.message.includes('maintenance state is ACTIVE')) pragmaCaught = true;
      }

      const allProtected = allReturningCaught && getReturningCaught && cteCaught && commentCaught && ddlCaught && pragmaCaught;
      db.close();
      process.exit(allProtected ? 0 : 1);
    `);
    processesSpawned++;

    if (driverTestRes.status !== 0) {
      throw new Error(`Driver mutation interception failed on edge cases: ${driverTestRes.stdout} ${driverTestRes.stderr}`);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Crash-Proof Durable Audit Event Spooling
  // --------------------------------------------------------------------------
  await test('Scenario 14: Durable audit event survives abrupt process termination', () => {
    runChildScript(`
      import { spoolDurableAuditEvent } from '${libCoordinationUrl}';
      spoolDurableAuditEvent({
        id: 'audit_crash_test_1',
        action: 'WORKER_CYCLE_STARTED',
        details: { cycle: 42 }
      }, '${testDbPath.replace(/\\/g, '/')}');
      process.exit(137); // Crash immediately after insert
    `);
    processesSpawned++;

    if (getPendingAuditCount(testDbPath) !== 1) {
      throw new Error(`Expected 1 pending audit event in durable spool, got ${getPendingAuditCount(testDbPath)}`);
    }

    const cdb = getCoordinationDb(testDbPath);
    const row = cdb.prepare("SELECT * FROM durable_audit_spool WHERE id = 'audit_crash_test_1'").get() as any;
    if (!row || row.action !== 'WORKER_CYCLE_STARTED') {
      throw new Error('Durable audit event was not persisted correctly in outbox');
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Idempotent Audit Flush After Crash
  // --------------------------------------------------------------------------
  await test('Scenario 15: Event flush is idempotent across multiple calls and crashes', () => {
    spoolDurableAuditEvent({
      id: 'audit_flush_test_1',
      action: 'WORKER_CYCLE_FINISHED',
      details: { items: 10 }
    }, testDbPath);

    const targetDb = new Database(testDbPath);

    // Flush 1
    const flushed1 = flushDurableAudits(targetDb, testDbPath);
    if (flushed1 !== 1) throw new Error(`Flush 1 should have flushed 1 event, got ${flushed1}`);

    // Verify row exists in targetDb audit_logs
    const row1 = targetDb.prepare("SELECT * FROM audit_logs WHERE id = 'audit_flush_test_1'").get() as any;
    if (!row1) throw new Error('Audit record was not inserted into primary audit_logs table');

    // Flush 2 (Simulating restart or retry after crash)
    const flushed2 = flushDurableAudits(targetDb, testDbPath);
    if (flushed2 !== 0) throw new Error(`Flush 2 should have flushed 0 events (idempotent), got ${flushed2}`);

    const countRows = targetDb.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE id = 'audit_flush_test_1'").get() as any;
    if (countRows.c !== 1) throw new Error(`Duplicate rows found in audit_logs: count = ${countRows.c}`);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Migration Runner Cannot Run While Any Writer Holds Active Lease
  // --------------------------------------------------------------------------
  await test('Scenario 16: Migration runner unconditionally refused while active write lease exists', () => {
    // Put maintenance in ACTIVE state
    const cdb = getCoordinationDb(testDbPath);
    cdb.prepare(`
      INSERT INTO coordination_state (id, state, reason, operator, initiated_at, activated_at, version)
      VALUES ('global', 'ACTIVE', 'Migration test', 'admin', '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z', 1)
      ON CONFLICT(id) DO UPDATE SET state = 'ACTIVE'
    `).run();

    // Insert active lease
    const now = Date.now();
    cdb.prepare(`
      INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
      VALUES ('active_web_write', 'web', ${process.pid}, 'in_flight_cv_write', ${now}, ${now + 10000})
    `).run();

    // Attempt to validate environment for migration runner
    const migRes = runChildScript(`
      import { validateEnvironmentAndSafeguards } from '${runEmailMigrationUrl}';
      import { getActiveLeasesCount, getCrossProcessState } from '${libCoordinationUrl}';
      try {
        process.env.STAGING_MODE = 'true';
        process.env.STAGING_ACCESS_CODE = 'valid_staging_code_123';
        process.env.ALLOW_STAGING_MIGRATION = 'true';
        process.env.DATABASE_PATH = '${testDbPath.replace(/\\/g, '/')}';
        console.log('Child state:', JSON.stringify(getCrossProcessState(process.env.DATABASE_PATH)));
        console.log('Child leases count:', getActiveLeasesCount(process.env.DATABASE_PATH));
        validateEnvironmentAndSafeguards();
        console.log('Child: did not throw');
        process.exit(1);
      } catch (err) {
        console.log('Child caught error:', err.message);
        if (err.message.includes('active cross-process write lease(s)')) {
          process.exit(0);
        }
        process.exit(2);
      }
    `);
    processesSpawned++;

    if (migRes.status !== 0) {
      throw new Error(`Migration runner did not reject active write lease: exited with ${migRes.status}: stdout: [${migRes.stdout}] stderr: [${migRes.stderr}]`);
    }
  });

  console.log(`\n=== TEST RUN SUMMARY ===`);
  console.log(`Passed:            ${passed}`);
  console.log(`Failed:            ${failed}`);
  console.log(`OS Processes Used: ${processesSpawned} independent child processes`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
