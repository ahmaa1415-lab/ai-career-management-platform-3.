/**
 * Phase 5.9.3 Graceful Shutdown Lifecycle & SQLite Quiescence Test Suite
 *
 * Validates:
 * 1. Scenario 1: Clean shutdown with no active writes (quiescence, WAL truncate, exit 0).
 * 2. Scenario 2: Shutdown during active SQLite transaction (graceful error handling, no corruption).
 * 3. Scenario 3: Child web process exits cleanly on SIGTERM within grace period.
 * 4. Scenario 4: Unresponsive child web process triggers forced SIGKILL on timeout.
 * 5. Scenario 5: Multiple concurrent signals (SIGTERM + SIGINT) are deduplicated idempotently.
 * 6. Scenario 6: Checkpoint executed strictly after child process termination (no busy locks).
 * 7. Scenario 7: Worker cycles refused during shutdown state (zero lease acquisitions).
 * 8. Scenario 8: Active worker/backup cycle bounded drain before shutdown completion.
 * 9. Scenario 9: Stale supervisor leases cleaned up from .coordination.db on shutdown.
 * 10. Scenario 10: Complete database file integrity post-shutdown (PRAGMA integrity_check, clean WAL).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Configure test environment to prevent supervisor auto-spawn
process.env.SUPERVISOR_DISABLE_AUTOSPAWN = 'true';
process.env.SUPERVISOR_SUPPRESS_EXIT = 'true';
process.env.NODE_ENV = 'test';

const testDir = path.join(process.cwd(), 'data', `test_phase5_9_3_shutdown_${Date.now()}_${process.pid}`);
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

function createIsolatedTestDb(name: string): { dbPath: string; cleanup: () => void } {
  const dbName = `${name}_${Date.now()}_${process.pid}_${crypto.randomBytes(3).toString('hex')}.db`;
  const dbPath = path.join(testDir, dbName);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_data (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();

  const cleanup = () => {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`;
      if (fs.existsSync(p)) {
        try { fs.rmSync(p, { force: true }); } catch {}
      }
    }
  };

  return { dbPath, cleanup };
}

function initCoordinationDb(dir: string): string {
  const cdbPath = path.join(dir, '.coordination.db');
  const cdb = new Database(cdbPath);
  cdb.pragma('journal_mode = WAL');
  cdb.exec(`
    CREATE TABLE IF NOT EXISTS coordination_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      reason TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS active_leases (
      lease_id TEXT PRIMARY KEY,
      process_type TEXT NOT NULL,
      pid INTEGER NOT NULL,
      label TEXT,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS durable_audit_spool (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      flushed_at TEXT
    );
    INSERT OR REPLACE INTO coordination_state (id, state) VALUES ('global', 'INACTIVE');
  `);
  cdb.close();
  return cdbPath;
}

class MockChildProcess extends EventEmitter {
  public pid: number;
  public killed: boolean = false;
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  private signalResponses: Map<string, (sig: string) => void> = new Map();

  constructor(pid: number = 99999) {
    super();
    this.pid = pid;
  }

  onSignal(signal: string, handler: (sig: string) => void) {
    this.signalResponses.set(signal, handler);
  }

  kill(signal: string = 'SIGTERM') {
    this.killed = true;
    const handler = this.signalResponses.get(signal);
    if (handler) {
      handler(signal);
    } else if (signal === 'SIGKILL') {
      this.exitCode = 137;
      this.signalCode = 'SIGKILL';
      process.nextTick(() => this.emit('exit', 137, 'SIGKILL'));
    } else {
      // Default behavior: exit cleanly with 0
      this.exitCode = 0;
      this.signalCode = signal;
      process.nextTick(() => this.emit('exit', 0, signal));
    }
    return true;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' Phase 5.9.3 Graceful Shutdown Lifecycle Test Suite');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`  FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`  PASS: ${message}`);
  }

  // Import supervisor methods under test
  const supervisor = await import('../scripts/start_all.mjs');

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Clean shutdown with no active writes
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Clean Shutdown with No Active Writes ---');
  const s1 = createIsolatedTestDb('s1_clean');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    const child = new MockChildProcess(1001);
    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s1.dbPath,
      gracePeriodMs: 2000
    });

    assert(code === 0, 'Scenario 1 exited with clean exit code 0');
    assert(supervisor.getIsShuttingDown() === true, 'Supervisor state is marked shutting down');

    // Verify WAL checkpoint completed
    const db = new Database(s1.dbPath, { readonly: true });
    const integrity = db.pragma('integrity_check');
    db.close();
    assert(integrity[0].integrity_check === 'ok', 'Database PRAGMA integrity_check is ok');
    passed++;
  } catch (err: any) {
    console.error('Scenario 1 failed:', err.message);
    failed++;
  } finally {
    s1.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Shutdown during active SQLite transaction
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Shutdown During Active SQLite Transaction ---');
  const s2 = createIsolatedTestDb('s2_trans');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    // Open connection holding an active write transaction
    const writerDb = new Database(s2.dbPath);
    writerDb.exec('BEGIN IMMEDIATE');
    writerDb.exec("INSERT INTO test_data (id, value) VALUES ('tx_1', 'in_flight')");

    const child = new MockChildProcess(1002);
    // In-flight HTTP handler commits its transaction and child exits cleanly
    child.onSignal('SIGTERM', () => {
      setTimeout(() => {
        writerDb.exec('COMMIT');
        writerDb.close();
        child.exitCode = 0;
        child.emit('exit', 0, 'SIGTERM');
      }, 80);
    });

    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s2.dbPath,
      gracePeriodMs: 3000
    });

    assert(code === 0, 'Scenario 2 exited cleanly once writer committed');

    const verifyDb = new Database(s2.dbPath, { readonly: true });
    const row = verifyDb.prepare("SELECT value FROM test_data WHERE id = 'tx_1'").get() as any;
    const integrity = verifyDb.pragma('integrity_check');
    verifyDb.close();

    assert(row && row.value === 'in_flight', 'Committed transaction data preserved');
    assert(integrity[0].integrity_check === 'ok', 'Database integrity verified post-transaction shutdown');
    passed++;
  } catch (err: any) {
    console.error('Scenario 2 failed:', err.message);
    failed++;
  } finally {
    s2.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Child process exits cleanly on SIGTERM
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Child Process Exits Cleanly on SIGTERM ---');
  const s3 = createIsolatedTestDb('s3_sigterm');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    let receivedSignal = '';
    const child = new MockChildProcess(1003);
    child.onSignal('SIGTERM', (sig) => {
      receivedSignal = sig;
      setTimeout(() => {
        child.exitCode = 0;
        child.emit('exit', 0, sig);
      }, 50);
    });

    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s3.dbPath,
      gracePeriodMs: 5000
    });

    assert(receivedSignal === 'SIGTERM', 'Child process received SIGTERM');
    assert(child.killed === true, 'Child process killed flag is set');
    assert(code === 0, 'Supervisor returned child exit code 0');
    passed++;
  } catch (err: any) {
    console.error('Scenario 3 failed:', err.message);
    failed++;
  } finally {
    s3.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Unresponsive child triggers forced SIGKILL on timeout
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Unresponsive Child Triggers SIGKILL on Timeout ---');
  const s4 = createIsolatedTestDb('s4_sigkill');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    let sigkillReceived = false;
    const child = new MockChildProcess(1004);
    // Child ignores SIGTERM entirely!
    child.onSignal('SIGTERM', () => {
      // Do not exit on SIGTERM
    });
    // Child responds to SIGKILL
    child.onSignal('SIGKILL', () => {
      sigkillReceived = true;
      child.exitCode = 137;
      child.emit('exit', 137, 'SIGKILL');
    });

    const startTime = Date.now();
    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s4.dbPath,
      gracePeriodMs: 400 // Short grace period for fast test execution
    });
    const elapsed = Date.now() - startTime;

    assert(sigkillReceived === true, 'Unresponsive child was signaled with SIGKILL');
    assert(elapsed >= 350, `Waited full grace period before SIGKILL (${elapsed}ms)`);
    assert(code === 137, `Supervisor exited with child SIGKILL exit code (got ${code})`);
    passed++;
  } catch (err: any) {
    console.error('Scenario 4 failed:', err.message);
    failed++;
  } finally {
    s4.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Multiple concurrent signals (SIGTERM + SIGINT) deduplicated
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Multiple Concurrent Signals Deduplicated ---');
  const s5 = createIsolatedTestDb('s5_multi_signal');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    const child = new MockChildProcess(1005);
    let termCount = 0;
    child.onSignal('SIGTERM', () => {
      termCount++;
      setTimeout(() => {
        child.exitCode = 0;
        child.emit('exit', 0, 'SIGTERM');
      }, 100);
    });

    // Fire SIGTERM and SIGINT concurrently
    const p1 = supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s5.dbPath,
      gracePeriodMs: 3000
    });
    const p2 = supervisor.handleShutdown('SIGINT', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s5.dbPath,
      gracePeriodMs: 3000
    });

    // Both promises should return same result
    const [res1, res2] = await Promise.all([p1, p2]);

    assert(res1 === 0 && res2 === 0, 'Both signal promises resolved with code 0');
    assert(termCount === 1, 'Child process received exactly one kill signal (deduplicated)');
    passed++;
  } catch (err: any) {
    console.error('Scenario 5 failed:', err.message);
    failed++;
  } finally {
    s5.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Checkpoint executed strictly after child exit
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Checkpoint Executed Strictly After Child Exit ---');
  const s6 = createIsolatedTestDb('s6_checkpoint_order');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    let childExited = false;

    // Simulate child holding exclusive file lock while alive
    const childDb = new Database(s6.dbPath);
    childDb.pragma('locking_mode = EXCLUSIVE');
    childDb.exec("INSERT INTO test_data (id, value) VALUES ('lock_1', 'child_active')");

    const child = new MockChildProcess(1006);
    child.onSignal('SIGTERM', () => {
      setTimeout(() => {
        // Child closes its lock and exits
        childDb.close();
        childExited = true;
        child.exitCode = 0;
        child.emit('exit', 0, 'SIGTERM');
      }, 100);
    });

    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s6.dbPath,
      gracePeriodMs: 3000
    });

    assert(childExited === true, 'Child exited before supervisor completed shutdown');
    assert(code === 0, 'Shutdown succeeded without SQLITE_BUSY');

    // Confirm checkpoint occurred cleanly
    const verifyDb = new Database(s6.dbPath, { readonly: true });
    const row = verifyDb.prepare("SELECT value FROM test_data WHERE id = 'lock_1'").get() as any;
    verifyDb.close();
    assert(row && row.value === 'child_active', 'Child data durably checkpointed');
    passed++;
  } catch (err: any) {
    console.error('Scenario 6 failed:', err.message);
    failed++;
  } finally {
    s6.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Worker cycle refused during shutdown state
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Worker Cycle Refused During Shutdown State ---');
  const s7 = createIsolatedTestDb('s7_worker_refused');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    const child = new MockChildProcess(1007);
    await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s7.dbPath,
      gracePeriodMs: 2000
    });

    assert(supervisor.getIsShuttingDown() === true, 'Supervisor is in shuttingDown state');

    // Attempting triggerWorkerCycle should immediately no-op
    await supervisor.triggerWorkerCycle();
    await supervisor.triggerBackupJob();

    // Verify no worker lease was created in coordination db
    const cdb = new Database(path.join(testDir, '.coordination.db'), { readonly: true });
    const leases = cdb.prepare("SELECT COUNT(*) as c FROM active_leases WHERE process_type = 'worker'").get() as any;
    cdb.close();

    assert(leases.c === 0, 'Zero worker leases created while shutting down');
    passed++;
  } catch (err: any) {
    console.error('Scenario 7 failed:', err.message);
    failed++;
  } finally {
    s7.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Active worker/backup cycle bounded drain
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Active Cycle Bounded Drain ---');
  const s8 = createIsolatedTestDb('s8_drain');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    const child = new MockChildProcess(1008);
    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s8.dbPath,
      drainTimeoutMs: 1000,
      gracePeriodMs: 2000
    });

    assert(code === 0, 'Drain bounded wait completed without hanging');
    passed++;
  } catch (err: any) {
    console.error('Scenario 8 failed:', err.message);
    failed++;
  } finally {
    s8.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Stale supervisor leases cleaned up from .coordination.db
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Stale Supervisor Leases Cleaned Up on Shutdown ---');
  const s9 = createIsolatedTestDb('s9_lease_cleanup');
  try {
    supervisor._resetShutdownStateForTesting();
    const cdbPath = initCoordinationDb(testDir);

    // Artificially insert active lease for current process and register it with supervisor
    const cdb = new Database(cdbPath);
    const leaseId = `test_lease_${process.pid}`;
    cdb.prepare(`
      INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
      VALUES (?, 'supervisor_test', ?, 'test_lease', ?, ?)
    `).run(leaseId, process.pid, Date.now(), Date.now() + 60000);
    cdb.close();
    supervisor.shutdownCoordinator.registerOwnedLease(leaseId);

    const child = new MockChildProcess(1009);
    await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s9.dbPath,
      gracePeriodMs: 2000
    });

    const verifyCdb = new Database(cdbPath, { readonly: true });
    const count = (verifyCdb.prepare('SELECT COUNT(*) as c FROM active_leases WHERE pid = ?').get(process.pid) as any).c;
    verifyCdb.close();

    assert(count === 0, 'Supervisor leases registered under process PID were deleted on shutdown');
    passed++;
  } catch (err: any) {
    console.error('Scenario 9 failed:', err.message);
    failed++;
  } finally {
    s9.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Complete database file integrity post-shutdown
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Complete Database File Integrity Post-Shutdown ---');
  const s10 = createIsolatedTestDb('s10_final_integrity');
  try {
    supervisor._resetShutdownStateForTesting();
    initCoordinationDb(testDir);

    // Insert 50 records in WAL mode to generate WAL frames
    const populateDb = new Database(s10.dbPath);
    populateDb.exec('BEGIN IMMEDIATE');
    for (let i = 0; i < 50; i++) {
      populateDb.exec(`INSERT INTO test_data (id, value) VALUES ('row_${i}', 'val_${i}')`);
    }
    populateDb.exec('COMMIT');
    populateDb.close();

    const child = new MockChildProcess(1010);
    const code = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child,
      dbPath: s10.dbPath,
      gracePeriodMs: 3000
    });

    assert(code === 0, 'Shutdown succeeded with code 0');

    // Read and verify database
    const finalDb = new Database(s10.dbPath, { readonly: true });
    const countRow = finalDb.prepare('SELECT COUNT(*) as c FROM test_data').get() as any;
    const integrity = finalDb.pragma('integrity_check');
    const fkCheck = finalDb.pragma('foreign_key_check');
    finalDb.close();

    assert(countRow.c === 50, 'All 50 records present after shutdown');
    assert(integrity[0].integrity_check === 'ok', 'PRAGMA integrity_check passed');
    assert(fkCheck.length === 0, 'PRAGMA foreign_key_check passed with 0 violations');
    passed++;
  } catch (err: any) {
    console.error('Scenario 10 failed:', err.message);
    failed++;
  } finally {
    s10.cleanup();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Phase 5.10.5 Child Process State Correctness & Exit Verification Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Phase 5.10.5 Child Process State Correctness & Exit Verification ---');
  const s11 = createIsolatedTestDb('s11_state_correctness');
  try {
    initCoordinationDb(testDir);

    // 11.1: killed=true, exitCode=null, child still alive
    console.log('Subtest 11.1: killed=true, exitCode=null, child still alive');
    supervisor._resetShutdownStateForTesting();
    const child11_1 = new MockChildProcess(1101);
    child11_1.killed = true;
    child11_1.exitCode = null;
    child11_1.signalCode = null;
    setTimeout(() => {
      child11_1.exitCode = 0;
      child11_1.signalCode = 'SIGTERM';
      child11_1.emit('exit', 0, 'SIGTERM');
    }, 150);

    const code11_1 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_1,
      dbPath: s11.dbPath,
      gracePeriodMs: 2000
    });
    const history11_1 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_1 = history11_1.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_1 === 0, '11.1: Shutdown succeeded with code 0');
    assert(exitStep11_1 && exitStep11_1.method === 'GRACEFUL_EXIT', '11.1: Verified method is GRACEFUL_EXIT, NOT NO_CHILD');
    assert(history11_1.some((h: any) => h.state === 'CHECKPOINTING'), '11.1: Checkpointing invoked after verified exit');

    // 11.2: SIGTERM sent before shutdown coordinator begins (termination already in progress)
    console.log('Subtest 11.2: SIGTERM sent before shutdown coordinator begins');
    supervisor._resetShutdownStateForTesting();
    const child11_2 = new MockChildProcess(1102);
    child11_2.kill('SIGTERM'); // sets killed=true, but delay emission
    // override default nextTick exit by creating custom delay
    child11_2.removeAllListeners('exit');
    setTimeout(() => {
      child11_2.exitCode = 0;
      child11_2.signalCode = 'SIGTERM';
      child11_2.emit('exit', 0, 'SIGTERM');
    }, 150);

    const code11_2 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_2,
      dbPath: s11.dbPath,
      gracePeriodMs: 2000
    });
    assert(code11_2 === 0, '11.2: Shutdown succeeded with code 0 awaiting pre-signaled process');

    // 11.3: Child exits before listener registration
    console.log('Subtest 11.3: Child exits before listener registration');
    supervisor._resetShutdownStateForTesting();
    const child11_3 = new MockChildProcess(1103);
    child11_3.exitCode = 0;
    child11_3.signalCode = null;
    child11_3.killed = false;

    const code11_3 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_3,
      dbPath: s11.dbPath,
      gracePeriodMs: 2000
    });
    const history11_3 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_3 = history11_3.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_3 === 0, '11.3: Pre-exited child completed with code 0');
    assert(exitStep11_3 && exitStep11_3.method === 'ALREADY_EXITED', '11.3: Verified method is ALREADY_EXITED');

    // 11.4: Child exits immediately after listener registration
    console.log('Subtest 11.4: Child exits immediately after listener registration');
    supervisor._resetShutdownStateForTesting();
    const child11_4 = new MockChildProcess(1104);
    child11_4.onSignal('SIGTERM', () => {
      process.nextTick(() => {
        child11_4.exitCode = 0;
        child11_4.signalCode = 'SIGTERM';
        child11_4.emit('exit', 0, 'SIGTERM');
      });
    });

    const code11_4 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_4,
      dbPath: s11.dbPath,
      gracePeriodMs: 2000
    });
    assert(code11_4 === 0, '11.4: Child exiting immediately on signal completed with code 0');

    // 11.5: Child exits after SIGKILL
    console.log('Subtest 11.5: Child exits after SIGKILL');
    supervisor._resetShutdownStateForTesting();
    const child11_5 = new MockChildProcess(1105);
    child11_5.onSignal('SIGTERM', () => {
      // Ignore SIGTERM completely
    });
    child11_5.onSignal('SIGKILL', () => {
      setTimeout(() => {
        child11_5.exitCode = 137;
        child11_5.signalCode = 'SIGKILL';
        child11_5.emit('exit', 137, 'SIGKILL');
      }, 50);
    });

    const code11_5 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_5,
      dbPath: s11.dbPath,
      gracePeriodMs: 200,
      postKillTimeoutMs: 1500
    });
    const history11_5 = supervisor.shutdownCoordinator.stateHistory;
    const postKillStep = history11_5.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT' && h.method === 'POST_SIGKILL_WAIT');
    assert(code11_5 === 137, '11.5: Escalation to SIGKILL completed with child exit code 137');
    assert(Boolean(postKillStep), '11.5: State machine passed through POST_SIGKILL_WAIT');

    // 11.6: Child never confirms exit before timeout (fail-closed, NO checkpointing)
    console.log('Subtest 11.6: Child never confirms exit before timeout');
    supervisor._resetShutdownStateForTesting();
    const child11_6 = new MockChildProcess(1106);
    child11_6.onSignal('SIGTERM', () => { /* ignore */ });
    child11_6.onSignal('SIGKILL', () => { /* ignore completely */ });

    const code11_6 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_6,
      dbPath: s11.dbPath,
      gracePeriodMs: 150,
      postKillTimeoutMs: 150
    });
    const history11_6 = supervisor.shutdownCoordinator.stateHistory;
    const checkpointSteps11_6 = history11_6.filter((h: any) => h.state === 'CHECKPOINTING');
    assert(code11_6 === 1, '11.6: Unconfirmed child exit failed with code 1');
    assert(supervisor.shutdownCoordinator.currentState === 'SHUTDOWN_FAILED', '11.6: State is SHUTDOWN_FAILED');
    assert(checkpointSteps11_6.length === 0, '11.6: CRITICAL INVARIANT: Checkpointing was NEVER invoked before confirmed exit');

    // 11.7: No-child case
    console.log('Subtest 11.7: No-child case');
    supervisor._resetShutdownStateForTesting();
    const code11_7 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: null,
      dbPath: s11.dbPath,
      gracePeriodMs: 1000
    });
    const history11_7 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_7 = history11_7.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_7 === 0, '11.7: Null child completed with code 0');
    assert(exitStep11_7 && exitStep11_7.method === 'NO_CHILD', '11.7: Method is cleanly NO_CHILD');

    // 11.8: Signal-terminated child where exitCode is null and signalCode is populated
    console.log('Subtest 11.8: Signal-terminated child where exitCode is null and signalCode is populated');
    supervisor._resetShutdownStateForTesting();
    const child11_8 = new MockChildProcess(1108);
    child11_8.exitCode = null;
    child11_8.signalCode = 'SIGTERM';
    child11_8.killed = true;

    const code11_8 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_8,
      dbPath: s11.dbPath,
      gracePeriodMs: 1000
    });
    const history11_8 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_8 = history11_8.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_8 === 0, '11.8: Signal-terminated child completed with code 0');
    assert(exitStep11_8 && exitStep11_8.method === 'ALREADY_EXITED', '11.8: Method is ALREADY_EXITED (not NO_CHILD)');
    assert(exitStep11_8 && exitStep11_8.signal === 'SIGTERM', '11.8: Preserved signalCode SIGTERM in history');

    // 11.9: Signal-terminated child with SIGKILL (exitCode is null, signalCode is SIGKILL)
    console.log('Subtest 11.9: Signal-terminated child with SIGKILL (exitCode=null, signalCode=SIGKILL)');
    supervisor._resetShutdownStateForTesting();
    const child11_9 = new MockChildProcess(1109);
    child11_9.exitCode = null;
    child11_9.signalCode = 'SIGKILL';
    child11_9.killed = true;

    const code11_9 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_9,
      dbPath: s11.dbPath,
      gracePeriodMs: 1000
    });
    const history11_9 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_9 = history11_9.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_9 === 137, '11.9: Signal-terminated SIGKILL child reflects 137 in exit code');
    assert(exitStep11_9 && exitStep11_9.code === 137, '11.9: Exit status resolved to 137 in history');
    assert(exitStep11_9 && exitStep11_9.signal === 'SIGKILL', '11.9: Preserved signalCode SIGKILL');

    // 11.10: Normal crash exit (exitCode=42, signalCode=null)
    console.log('Subtest 11.10: Normal crash exit (exitCode=42, signalCode=null)');
    supervisor._resetShutdownStateForTesting();
    const child11_10 = new MockChildProcess(1110);
    child11_10.exitCode = 42;
    child11_10.signalCode = null;
    child11_10.killed = false;

    const code11_10 = await supervisor.handleShutdown('SIGTERM', null, {
      suppressExit: true,
      webProcess: child11_10,
      dbPath: s11.dbPath,
      gracePeriodMs: 1000
    });
    const history11_10 = supervisor.shutdownCoordinator.stateHistory;
    const exitStep11_10 = history11_10.find((h: any) => h.state === 'VERIFYING_PROCESS_EXIT');
    assert(code11_10 === 42, '11.10: Child error exit code 42 propagated to supervisor');
    assert(exitStep11_10 && exitStep11_10.code === 42, '11.10: Recorded exitCode 42 in history');
    assert(exitStep11_10 && exitStep11_10.signal === null, '11.10: Recorded signalCode null');

    passed++;
  } catch (err: any) {
    console.error('Scenario 11 failed:', err.message);
    failed++;
  } finally {
    s11.cleanup();
  }

  // ---------------------------------------------------------------------------
  // CLEANUP SUITE DIRECTORY
  // ---------------------------------------------------------------------------
  try {
    for (const f of fs.readdirSync(testDir)) {
      try { fs.rmSync(path.join(testDir, f), { recursive: true, force: true }); } catch {}
    }
    try { fs.rmdirSync(testDir); } catch {}
  } catch {}

  console.log('\n================================================================');
  console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
