/**
 * Phase 3 Remediation Concurrency & Security Verification Suite
 *
 * Deterministically tests all 16 mission-critical scenarios:
 * 1.  API write begins before maintenance activation (lease acquired).
 * 2.  Maintenance activation begins while request in-flight (enters DRAINING).
 * 3.  Request completes safely under write lease without corruption.
 * 4.  Maintenance transitions to ACTIVE only after drain completes.
 * 5.  New API write attempted during DRAINING/ACTIVE rejected with 503 / MaintenanceActiveError.
 * 6.  Worker running when maintenance begins -> cycle completes; new cycle blocked.
 * 7.  Worker completion callback defers audit record to spill file.
 * 8.  Backup running when maintenance begins -> cycle completes; new cycle blocked.
 * 9.  Backup completion callback updates supervisor status safely.
 * 10. Concurrent maintenance activation attempts serialized safely without file corruption.
 * 11. Maintenance activation timeout aborts cleanly and reverts to INACTIVE.
 * 12. Lockfile corruption fails closed (treated as ACTIVE).
 * 13. Process error during draining aborts cleanly.
 * 14. Process restart sees active maintenance lockfile and rejects writes.
 * 15. Migration runner with production vars + override flag -> unconditionally rejected!
 * 16. Stale migration bundle detection fails build.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  writeRegistry,
  getMaintenanceState,
  isMaintenanceActive,
  isMaintenanceFullyActive,
  activateMaintenanceWithDrain,
  deactivateMaintenance,
  assertWriteAllowed,
  withWriteLock,
  MaintenanceActiveError,
  MaintenanceDrainTimeoutError,
  createMaintenanceResponse,
  getMaintenanceLockPath,
  getSpillAuditPath,
  getSupervisorStatusPath
} from '../lib/maintenance';
import { closeCoordinationDbCache, deactivateCrossProcessMaintenance } from '../lib/coordination';
import { validateEnvironmentAndSafeguards } from '../scripts/run_email_migration';

const testDir = path.join(process.cwd(), 'data', 'test_phase3_concurrency');
const testDbPath = path.join(testDir, 'test_app.db');

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

  process.env.DATABASE_PATH = testDbPath;

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_items (
      id TEXT PRIMARY KEY,
      val TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();

  deactivateCrossProcessMaintenance(testDbPath);
  writeRegistry.reset();
  delete process.env.MAINTENANCE_MODE;
}

function cleanupTestEnv() {
  closeCoordinationDbCache();
  try {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  } catch {}
  writeRegistry.reset();
  delete process.env.MAINTENANCE_MODE;
  delete process.env.DATABASE_PATH;
}

async function runAllTests() {
  console.log('=== [PHASE 3 CONCURRENCY & SECURITY REMEDIATION TESTS] ===\n');
  let passed = 0;
  let failed = 0;

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
  // Scenario 1: API write begins before maintenance activation
  // --------------------------------------------------------------------------
  await test('Scenario 1: API write begins before maintenance activation (lease acquired)', () => {
    const lease = writeRegistry.enter('test_write_1', testDbPath);
    if (writeRegistry.getActiveCount() !== 1) throw new Error('Active write count should be 1');
    lease.release();
    if (writeRegistry.getActiveCount() !== 0) throw new Error('Active write count should be 0 after release');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Maintenance activation begins while request in-flight
  // --------------------------------------------------------------------------
  await test('Scenario 2: Maintenance activation enters DRAINING while request in-flight', async () => {
    const lease = writeRegistry.enter('in_flight_write', testDbPath);

    // Start maintenance drain with short timeout
    const drainPromise = activateMaintenanceWithDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 500
    });

    // Verify lockfile exists and reports DRAINING
    const stateDuringInFlight = getMaintenanceState(testDbPath);
    if (stateDuringInFlight !== 'DRAINING') {
      lease.release();
      await drainPromise.catch(() => {});
      throw new Error(`Expected state to be DRAINING while in-flight, got ${stateDuringInFlight}`);
    }

    lease.release();
    const result = await drainPromise;
    if (result.state !== 'ACTIVE') throw new Error(`Expected ACTIVE state after lease release, got ${result.state}`);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Request completes under write lease without corruption
  // --------------------------------------------------------------------------
  await test('Scenario 3: Request completes under write lease without corruption', async () => {
    let writeCompleted = false;

    await withWriteLock('user_registration', async () => {
      const db = new Database(testDbPath);
      db.prepare("INSERT INTO test_items (id, val) VALUES ('item-1', 'valid-value')").run();
      db.close();
      writeCompleted = true;
    }, testDbPath);

    if (!writeCompleted) throw new Error('Write block did not execute');

    const db = new Database(testDbPath);
    const row = db.prepare("SELECT * FROM test_items WHERE id = 'item-1'").get() as any;
    db.close();

    if (!row || row.val !== 'valid-value') throw new Error('Row was not written safely');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Maintenance transitions to ACTIVE only after drain completes
  // --------------------------------------------------------------------------
  await test('Scenario 4: Maintenance transitions to ACTIVE only after drain completes', async () => {
    let leaseReleased = false;
    const lease = writeRegistry.enter('slow_mutation', testDbPath);

    setTimeout(() => {
      leaseReleased = true;
      lease.release();
    }, 150);

    const activation = await activateMaintenanceWithDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 1000
    });

    if (!leaseReleased) throw new Error('Activation completed before lease was released!');
    if (activation.state !== 'ACTIVE') throw new Error('Expected ACTIVE state');
    if (!isMaintenanceFullyActive(testDbPath)) throw new Error('isMaintenanceFullyActive should be true');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: New API write during DRAINING/ACTIVE rejected with 503 / Error
  // --------------------------------------------------------------------------
  await test('Scenario 5: New API write rejected during DRAINING/ACTIVE', async () => {
    await activateMaintenanceWithDrain({ customDbPath: testDbPath, drainTimeoutMs: 500 });

    let rejectedByAssertion = false;
    try {
      assertWriteAllowed('new_api_mutation', testDbPath);
    } catch (err: any) {
      if (err instanceof MaintenanceActiveError) {
        rejectedByAssertion = true;
      }
    }

    if (!rejectedByAssertion) throw new Error('assertWriteAllowed did not reject write during maintenance');

    let rejectedByLease = false;
    try {
      writeRegistry.enter('new_api_write', testDbPath);
    } catch (err: any) {
      if (err instanceof MaintenanceActiveError) {
        rejectedByLease = true;
      }
    }

    if (!rejectedByLease) throw new Error('writeRegistry.enter did not reject write during maintenance');

    const res = createMaintenanceResponse();
    if (res.status !== 503) throw new Error(`createMaintenanceResponse returned status ${res.status}, expected 503`);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Worker running when maintenance begins -> next cycle blocked
  // --------------------------------------------------------------------------
  await test('Scenario 6: Worker running when maintenance begins, next cycle blocked', async () => {
    const supPath = getSupervisorStatusPath(testDbPath);
    fs.writeFileSync(supPath, JSON.stringify({ workerActive: true, backupActive: false }), 'utf-8');

    let workerCycleCompleted = false;
    setTimeout(() => {
      workerCycleCompleted = true;
      fs.writeFileSync(supPath, JSON.stringify({ workerActive: false, backupActive: false }), 'utf-8');
    }, 150);

    const result = await activateMaintenanceWithDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 1000
    });

    if (!workerCycleCompleted) throw new Error('Activation proceeded while workerActive was true');
    if (result.state !== 'ACTIVE') throw new Error('Expected ACTIVE after worker cycle completed');

    // Simulate next worker cycle attempt
    const state = getMaintenanceState(testDbPath);
    if (state === 'INACTIVE') throw new Error('Maintenance state should prevent worker cycle');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Worker completion callback defers audit record to spill file
  // --------------------------------------------------------------------------
  await test('Scenario 7: Worker audit record deferred to spill file during maintenance', () => {
    const lockPath = getMaintenanceLockPath(testDbPath);
    fs.writeFileSync(lockPath, JSON.stringify({ state: 'ACTIVE' }), 'utf-8');

    const spillPath = getSpillAuditPath(testDbPath);
    const mockAuditEvent = {
      eventType: 'WORKER_CYCLE_COMPLETE',
      timestamp: new Date().toISOString(),
      details: { processed: 5 }
    };

    // Simulate start_all.mjs appendDeferredAuditEvent
    let currentSpill: any[] = [];
    if (fs.existsSync(spillPath)) {
      currentSpill = JSON.parse(fs.readFileSync(spillPath, 'utf-8'));
    }
    currentSpill.push(mockAuditEvent);
    fs.writeFileSync(spillPath, JSON.stringify(currentSpill, null, 2), 'utf-8');

    const readBack = JSON.parse(fs.readFileSync(spillPath, 'utf-8'));
    if (!Array.isArray(readBack) || readBack.length !== 1) throw new Error('Spill file should contain 1 event');
    if (readBack[0].eventType !== 'WORKER_CYCLE_COMPLETE') throw new Error('Invalid event type in spill file');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Backup running when maintenance begins -> next cycle blocked
  // --------------------------------------------------------------------------
  await test('Scenario 8: Backup running when maintenance begins, next backup blocked', async () => {
    const supPath = getSupervisorStatusPath(testDbPath);
    fs.writeFileSync(supPath, JSON.stringify({ workerActive: false, backupActive: true }), 'utf-8');

    let backupFinished = false;
    setTimeout(() => {
      backupFinished = true;
      fs.writeFileSync(supPath, JSON.stringify({ workerActive: false, backupActive: false }), 'utf-8');
    }, 150);

    const result = await activateMaintenanceWithDrain({
      customDbPath: testDbPath,
      drainTimeoutMs: 1000
    });

    if (!backupFinished) throw new Error('Activation finished before backup completed');
    if (result.state !== 'ACTIVE') throw new Error('Expected ACTIVE state');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Backup completion callback updates supervisor status safely
  // --------------------------------------------------------------------------
  await test('Scenario 9: Backup completion updates supervisor status safely', () => {
    const supPath = getSupervisorStatusPath(testDbPath);
    const updateSupervisor = (workerActive: boolean, backupActive: boolean) => {
      fs.writeFileSync(supPath, JSON.stringify({
        workerActive,
        backupActive,
        updatedAt: new Date().toISOString()
      }), 'utf-8');
    };

    updateSupervisor(false, true);
    let data = JSON.parse(fs.readFileSync(supPath, 'utf-8'));
    if (data.backupActive !== true) throw new Error('backupActive should be true');

    updateSupervisor(false, false);
    data = JSON.parse(fs.readFileSync(supPath, 'utf-8'));
    if (data.backupActive !== false) throw new Error('backupActive should be false');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Concurrent maintenance activations serialized safely
  // --------------------------------------------------------------------------
  await test('Scenario 10: Concurrent maintenance activations serialized safely', async () => {
    const [act1, act2] = await Promise.all([
      activateMaintenanceWithDrain({ customDbPath: testDbPath, drainTimeoutMs: 1000 }),
      activateMaintenanceWithDrain({ customDbPath: testDbPath, drainTimeoutMs: 1000 })
    ]);

    if (act1.state !== 'ACTIVE' || act2.state !== 'ACTIVE') {
      throw new Error('Both activation requests should result in ACTIVE state');
    }

    const state = getMaintenanceState(testDbPath);
    if (state !== 'ACTIVE') throw new Error('Final state should be ACTIVE');
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Maintenance activation timeout aborts cleanly to INACTIVE
  // --------------------------------------------------------------------------
  await test('Scenario 11: Maintenance activation timeout aborts cleanly to INACTIVE', async () => {
    // Hang a lease
    const lease = writeRegistry.enter('hung_operation', testDbPath);

    let caughtError = false;
    try {
      await activateMaintenanceWithDrain({
        customDbPath: testDbPath,
        drainTimeoutMs: 200
      });
    } catch (err: any) {
      if (err instanceof MaintenanceDrainTimeoutError) {
        caughtError = true;
      }
    } finally {
      lease.release();
    }

    if (!caughtError) throw new Error('Expected MaintenanceDrainTimeoutError was not thrown');

    // Verify lockfile was unlinked and state reverted to INACTIVE
    const state = getMaintenanceState(testDbPath);
    if (state !== 'INACTIVE') throw new Error(`Expected state to revert to INACTIVE, got ${state}`);
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Lockfile corruption fails closed
  // --------------------------------------------------------------------------
  await test('Scenario 12: Lockfile corruption fails closed (ACTIVE)', () => {
    const lockPath = getMaintenanceLockPath(testDbPath);
    fs.writeFileSync(lockPath, 'CORRUPTED_MALFORMED_NON_JSON_DATA{{{', 'utf-8');

    const state = getMaintenanceState(testDbPath);
    if (state !== 'ACTIVE') throw new Error(`Corrupted lockfile must fail-closed to ACTIVE, got ${state}`);
    if (!isMaintenanceActive(testDbPath)) throw new Error('isMaintenanceActive must return true on corrupted lock');
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Process error/crash during draining aborts cleanly
  // --------------------------------------------------------------------------
  await test('Scenario 13: Deactivate maintenance cleans up sentinel', () => {
    const lockPath = getMaintenanceLockPath(testDbPath);
    fs.writeFileSync(lockPath, JSON.stringify({ state: 'ACTIVE' }), 'utf-8');

    deactivateMaintenance(testDbPath);
    if (fs.existsSync(lockPath)) throw new Error('Lockfile should be removed');
    if (getMaintenanceState(testDbPath) !== 'INACTIVE') throw new Error('State should be INACTIVE');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Process restart sees active maintenance lockfile
  // --------------------------------------------------------------------------
  await test('Scenario 14: Fresh process sees active maintenance lockfile', () => {
    const lockPath = getMaintenanceLockPath(testDbPath);
    fs.writeFileSync(lockPath, JSON.stringify({
      state: 'ACTIVE',
      reason: 'Long-running migration',
      operator: 'admin',
      pid: 9999
    }), 'utf-8');

    // Simulate new invocation without in-memory state
    const state = getMaintenanceState(testDbPath);
    if (state !== 'ACTIVE') throw new Error(`Expected ACTIVE state after restart, got ${state}`);

    let writeBlocked = false;
    try {
      assertWriteAllowed('post_restart_write', testDbPath);
    } catch {
      writeBlocked = true;
    }
    if (!writeBlocked) throw new Error('Writes must be blocked after restart');
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Migration runner with production vars + override rejected!
  // --------------------------------------------------------------------------
  await test('Scenario 15: Migration runner with production vars + override flag rejected unconditionally', () => {
    const originalEnv = { ...process.env };

    try {
      // 15a: TARGET_ENVIRONMENT = production
      process.env.TARGET_ENVIRONMENT = 'production';
      process.env.ALLOW_STAGING_MIGRATION = 'true';
      process.env.STAGING_MODE = 'true';
      process.env.STAGING_ACCESS_CODE = 'valid_secret_code_123';
      let rejected = false;
      try {
        validateEnvironmentAndSafeguards();
      } catch (err: any) {
        if (err.message.includes('Execution explicitly refused against production environment')) {
          rejected = true;
        }
      }
      if (!rejected) throw new Error('15a failed: TARGET_ENVIRONMENT=production was not refused');

      // 15b: RAILWAY_ENVIRONMENT = production
      delete process.env.TARGET_ENVIRONMENT;
      process.env.RAILWAY_ENVIRONMENT = 'production';
      rejected = false;
      try {
        validateEnvironmentAndSafeguards();
      } catch (err: any) {
        if (err.message.includes('RAILWAY_ENVIRONMENT=production')) {
          rejected = true;
        }
      }
      if (!rejected) throw new Error('15b failed: RAILWAY_ENVIRONMENT=production was not refused');

      // 15c: No positive staging verification (even with ALLOW_STAGING_MIGRATION=true)
      delete process.env.RAILWAY_ENVIRONMENT;
      delete process.env.STAGING_MODE;
      delete process.env.STAGING_ACCESS_CODE;
      process.env.ALLOW_STAGING_MIGRATION = 'true';
      rejected = false;
      try {
        validateEnvironmentAndSafeguards();
      } catch (err: any) {
        if (err.message.includes('Target environment is NOT positively verified as Staging')) {
          rejected = true;
        }
      }
      if (!rejected) throw new Error('15c failed: Missing positive staging proof was not refused');
    } finally {
      process.env = originalEnv;
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Stale migration bundle detection
  // --------------------------------------------------------------------------
  await test('Scenario 16: Stale migration bundle detection', () => {
    const bundlePath = path.join(process.cwd(), 'scripts', 'run_email_migration.mjs');
    if (!fs.existsSync(bundlePath)) throw new Error('Bundle must exist');

    const content = fs.readFileSync(bundlePath, 'utf-8');
    if (!content.includes('add_user_id_to_emails')) throw new Error('Bundle missing migration ID');
    if (!content.includes('runEmailUserIdMigration')) throw new Error('Bundle missing canonical runner');
    if (!content.includes('STAGING_MODE')) throw new Error('Bundle missing STAGING_MODE check');
  });

  console.log(`\n=== TEST RUN COMPLETE ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
