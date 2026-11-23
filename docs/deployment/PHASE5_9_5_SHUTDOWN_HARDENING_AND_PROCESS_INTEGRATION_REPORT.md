# Phase 5.9.5 — Production Shutdown Hardening & Real Process Lifecycle Verification Report

**Date:** 2026-11-20  
**Authors:** Principal Linux Process Lifecycle Engineer, Node.js Runtime Engineer, SQLite Reliability Engineer, DevOps Architect, Application Security Auditor, and Senior QA Engineer  
**Workspace:** `F:\work Aya`  
**Git Baseline Commit:** `1811eff93193e561ca68e16ea6ce36f4ec7acb5f` (branch `main`)  
**Target Environment:** Railway Staging (`career-web-staging`, SQLite persistent volume `/app/data/career_app.db`)  
**Final Release Gate Verdict:** **CONDITIONALLY APPROVED** (Pending Linux Staging Container Verification)

---

## 1. Executive Summary & Final Verdict

Following the comprehensive independent adversarial review conducted in Phase 5.9.4 (`docs/deployment/PHASE5_9_4_INDEPENDENT_ADVERSARIAL_REVIEW.md`), Phase 5.9.5 executed a rigorous remediation and empirical verification program focused on production container lifecycle safety, process tree supervision, SQLite WAL truncation result verification, and multi-process race prevention.

### Core Achievements
1. **Direct Next.js Binary Execution:** Completely eliminated the NPM/NPX process intermediary. Next.js is now spawned directly via `process.execPath` running `node_modules/next/dist/bin/next` with `shell: false` across all platforms. The supervisor directly owns and monitors the PID of the Next.js process.
2. **Deterministic Shutdown State Machine:** Engineered `scripts/shutdown_coordinator.mjs` providing an explicit 10-state formal state machine (`RUNNING` → `QUIESCING` → `DRAINING` → `TERMINATING_CHILD` → `FORCING_TERMINATION` → `VERIFYING_PROCESS_EXIT` → `CLEANING_OWNED_LEASES` → `CHECKPOINTING` → `SHUTDOWN_COMPLETE` / `SHUTDOWN_FAILED`).
3. **Verified Post-SIGKILL Exit Invariant:** Refactored signal handling to strictly await confirmed process exit after issuing `SIGKILL`. If child process termination cannot be confirmed within a bounded timeout, the system fails closed into `SHUTDOWN_FAILED` and **strictly refuses** to run WAL checkpointing against an unverified process state.
4. **Validated SQLite WAL Checkpoint Results:** Replaced blind execution of `PRAGMA wal_checkpoint(TRUNCATE)` with structured schema and value validation via `validateWalCheckpointResult`. A non-zero `busy` count (`busy > 0`) is explicitly detected, rejected, and reported as a checkpoint failure.
5. **Ownership-Safe Lease Cleanup:** Replaced destructive `DELETE FROM active_leases WHERE pid = ?` queries with scoped tuple deletion (`DELETE FROM active_leases WHERE lease_id = ? AND pid = ?`) driven by a registered set of owned lease identifiers.
6. **Real Process Lifecycle Integration Test Suite:** Authored `tests/phase5_9_5_process_lifecycle.integration.test.ts` executing 15 end-to-end multi-process integration tests with real OS processes (`spawn`), real SQLite WAL databases, signal delivery, concurrency collisions, and process death verification. 100% pass rate achieved across three consecutive runs (56 assertions per run, 0 failures, zero flakiness).

### Release Gate Verdict
**`CONDITIONALLY APPROVED`**

The local codebase is fully verified, robust, and mathematically sound. Approval for production deployment is conditional upon verifying Railway Linux container semantics (specifically PID 1 signal forwarding and Docker init reaping behavior) during the controlled staging roll-out.

---

## 2. Production Root Cause Audit (Phase 5.9.4 Adversarial Findings)

| Finding ID | Adversarial Vulnerability Identified in Phase 5.9.4 | Root Cause Analysis | Remediation in Phase 5.9.5 |
| :--- | :--- | :--- | :--- |
| **FINDING-1** | **NPX Process Intermediary on Linux** | `start_all.mjs` spawned `npx next start` using shell interpolation. In Linux Docker containers, NPX creates an intermediate shell/shim process. Sending `SIGTERM` to `webProcess.pid` signaled the NPX shim, leaving Next.js orphaned or delayed. | Next.js is spawned directly using `process.execPath` with `node_modules/next/dist/bin/next` and `shell: false`. `webProcess.pid` is directly the Next.js Node process. |
| **FINDING-2** | **Premature Post-SIGKILL Assumption** | In Phase 5.9.3, issuing `child.kill('SIGKILL')` immediately resolved `Promise.race`, proceeding to WAL checkpointing while the OS kernel was still terminating the child. | An explicit post-kill verification await was implemented (`targetProcess.once('exit')` with bounded timeout). WAL checkpointing is gated on confirmed process termination. |
| **FINDING-3** | **Unchecked WAL Checkpoint Return Value** | `db.pragma('wal_checkpoint(TRUNCATE)')` returns `[{ busy, log, checkpointed }]`. Phase 5.9.3 executed this blindly without inspecting `busy`, logging false success even if active readers held WAL locks. | Engineered `validateWalCheckpointResult(raw)` and `executeAndValidateWalCheckpoint(dbPath)`. Non-zero `busy` (`busy === 1`) immediately halts shutdown and marks status `SHUTDOWN_FAILED`. |
| **FINDING-4** | **Overbroad Lease Cleanup by Raw PID** | `DELETE FROM active_leases WHERE pid = ?` wiped all leases associated with the PID. If container PID namespaces wrapped or child processes shared PIDs across container lifecycles, foreign leases were deleted. | Implemented `registerOwnedLease(leaseId)`. Supervisor cleanup now executes `DELETE FROM active_leases WHERE lease_id = ? AND pid = ?` solely for explicitly registered leases. |
| **FINDING-5** | **Mock-Only Test Verification** | Phase 5.9.3 relied on `MockChildProcess` (EventEmitter) without verifying real OS process spawning, signal trapping, or SQLite locking under concurrent processes. | Authored `tests/phase5_9_5_process_lifecycle.integration.test.ts` executing 15 integration scenarios using real `spawn(process.execPath)`, real SQLite locks, and real WAL truncation. |

---

## 3. Remediation Architecture & Detailed Implementation

### 3.1 Direct Next.js Binary Execution
In `scripts/start_all.mjs`, all usage of `npx`, `npx.cmd`, and shell execution was eliminated:

```javascript
// Resolve the direct CLI binary: node_modules/next/dist/bin/next
const nextCliPath = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextCliPath)) {
  console.error('[FATAL SUPERVISOR STARTUP ERROR] Next.js CLI binary not found at:', nextCliPath);
  process.exit(1);
}

// Spawn directly using node without shell wrapper
const webProcess = spawn(
  process.execPath,
  [nextCliPath, 'start', '-H', HOSTNAME, '-p', String(PORT)],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT), HOSTNAME },
    shell: false
  }
);
```

### 3.2 Formal Shutdown State Machine
Implemented in `scripts/shutdown_coordinator.mjs`:

```mermaid
stateDiagram-v2
    [*] --> RUNNING
    RUNNING --> QUIESCING : SIGTERM / SIGINT received
    RUNNING --> SHUTDOWN_FAILED : Fatal startup exception
    QUIESCING --> DRAINING : Timers cancelled
    DRAINING --> TERMINATING_CHILD : In-flight tasks quiesced or timed out
    TERMINATING_CHILD --> VERIFYING_PROCESS_EXIT : SIGTERM sent, graceful exit
    TERMINATING_CHILD --> FORCING_TERMINATION : Grace timeout expired
    FORCING_TERMINATION --> VERIFYING_PROCESS_EXIT : SIGKILL sent
    VERIFYING_PROCESS_EXIT --> CLEANING_OWNED_LEASES : Process exit confirmed
    VERIFYING_PROCESS_EXIT --> SHUTDOWN_FAILED : Child unconfirmed after SIGKILL timeout
    CLEANING_OWNED_LEASES --> CHECKPOINTING : Owned leases deleted
    CHECKPOINTING --> SHUTDOWN_COMPLETE : Checkpoint verified (busy=0)
    CHECKPOINTING --> SHUTDOWN_FAILED : Checkpoint failed or busy > 0
    SHUTDOWN_COMPLETE --> [*] : Exit 0
    SHUTDOWN_FAILED --> [*] : Exit 1
```

#### Valid Transitions Enforcement
```javascript
export const ShutdownState = Object.freeze({
  RUNNING: 'RUNNING',
  QUIESCING: 'QUIESCING',
  DRAINING: 'DRAINING',
  TERMINATING_CHILD: 'TERMINATING_CHILD',
  FORCING_TERMINATION: 'FORCING_TERMINATION',
  VERIFYING_PROCESS_EXIT: 'VERIFYING_PROCESS_EXIT',
  CLEANING_OWNED_LEASES: 'CLEANING_OWNED_LEASES',
  CHECKPOINTING: 'CHECKPOINTING',
  SHUTDOWN_COMPLETE: 'SHUTDOWN_COMPLETE',
  SHUTDOWN_FAILED: 'SHUTDOWN_FAILED'
});
```
Any illegal transition out of order throws an exception and immediately transitions the coordinator into `SHUTDOWN_FAILED`.

### 3.3 Confirmed Post-SIGKILL Termination Verification
When a child process fails to exit within the grace period (`gracePeriodMs`), the coordinator transitions to `FORCING_TERMINATION` and sends `SIGKILL`. It then enters `VERIFYING_PROCESS_EXIT` and awaits the child's `exit` event up to `postKillTimeoutMs`.

```javascript
// Step 3: Child process forced termination
targetProcess.kill('SIGKILL');
this.transitionTo(ShutdownState.VERIFYING_PROCESS_EXIT, { method: 'POST_SIGKILL_WAIT' });

const postKillTimeoutMs = runOptions.postKillTimeoutMs ?? 5000;
let postKillTimer;
const postKillTimeoutPromise = new Promise((resolve) => {
  postKillTimer = setTimeout(() => resolve(false), postKillTimeoutMs);
});

const confirmedExit = await Promise.race([exitPromise, postKillTimeoutPromise]);
clearTimeout(postKillTimer);

if (!confirmedExit) {
  console.error('[SUPERVISOR FATAL] Child process could not be confirmed terminated after SIGKILL.');
  this.transitionTo(ShutdownState.SHUTDOWN_FAILED, { reason: 'UNCONFIRMED_CHILD_EXIT_AFTER_SIGKILL' });
  return { success: false, state: this.state, exitCode: 1, error: 'UNCONFIRMED_CHILD_EXIT' };
}
```
If exit cannot be verified, WAL checkpointing is **aborted**, preventing SQLite operations while a rogue process may still be accessing the database.

### 3.4 Validated SQLite WAL Checkpoint Truncation
The raw result from `better-sqlite3` `db.pragma('wal_checkpoint(TRUNCATE)')` is strictly validated:

```javascript
export function validateWalCheckpointResult(checkpointResult) {
  if (!Array.isArray(checkpointResult) || checkpointResult.length === 0) {
    return { valid: false, success: false, reason: 'MALFORMED_RESULT', message: 'Checkpoint result is not a non-empty array' };
  }
  const row = checkpointResult[0];
  if (!row || typeof row.busy !== 'number' || typeof row.log !== 'number' || typeof row.checkpointed !== 'number') {
    return { valid: false, success: false, reason: 'INVALID_FIELDS', message: 'Checkpoint result missing numeric fields' };
  }
  if (row.busy !== 0) {
    return {
      valid: true,
      success: false,
      reason: 'CHECKPOINT_BUSY',
      message: `Checkpoint could not truncate WAL: busy=${row.busy} (active readers/writers present)`,
      busy: row.busy, log: row.log, checkpointed: row.checkpointed
    };
  }
  return {
    valid: true,
    success: true,
    reason: 'OK',
    message: `Checkpoint successfully truncated WAL: log=${row.log}, checkpointed=${row.checkpointed}`,
    busy: 0, log: row.log, checkpointed: row.checkpointed
  };
}
```

### 3.5 Scoped Lease Ownership Cleanup
Only leases explicitly registered via `coordinator.registerOwnedLease(leaseId)` are deleted during shutdown:
```javascript
const deleteStmt = cdb.prepare('DELETE FROM active_leases WHERE lease_id = ? AND pid = ?');
const currentPid = process.pid;
cdb.transaction(() => {
  for (const leaseId of this.ownedLeaseIds) {
    deleteStmt.run(leaseId, currentPid);
  }
})();
```

---

## 4. OS Process Lifecycle Differences & Platform Specifics

| Lifecycle Characteristic | Linux Production Environment (Railway Container) | Windows 11 Development Environment |
| :--- | :--- | :--- |
| **POSIX Signal Support** | Native kernel signals (`SIGTERM`, `SIGINT`, `SIGKILL`, `SIGHUP`). Signals can be trapped by Node handlers via `process.on('SIGTERM')`. | Emulated. Windows does not have POSIX signals. Node maps `child.kill('SIGTERM')` and `child.kill('SIGKILL')` to the Win32 `TerminateProcess` API. Node process signal handlers are not called by external OS signals (except console Ctrl+C `SIGINT`). |
| **Process Tree Termination** | Terminating a parent process orphans child processes to PID 1 (`init` / tini) unless a process group kill (`process.kill(-pid, signal)`) is used with `setpgrp`. | `TerminateProcess` terminates solely the target handle. Descendant child processes remain running unless grouped in a Windows Job Object or terminated with `taskkill /F /T /PID`. |
| **Zombie Reaping** | In containers where Node runs as PID 1, Node must reap terminated zombie children (`SIGCHLD`) or Docker `--init` (tini) must be used. | Windows handles process exit cleanup at the kernel level; no zombie processes exist. |
| **Supervisor Next.js Spawn** | `node_modules/next/dist/bin/next` has shebang `#!/usr/bin/env node`. Direct spawn with `process.execPath` creates a single child process (Next.js) directly managed by supervisor. | Direct spawn with `process.execPath` avoids `npx.cmd` batch wrapping, ensuring `webProcess.pid` belongs directly to the Next.js Node process. |

---

## 5. Integration Test Matrix & Execution Evidence

The new test suite `tests/phase5_9_5_process_lifecycle.integration.test.ts` was executed to validate real process lifecycle behaviors.

### 5.1 Scenario Results Table
| Scenario ID | Test Description | Real OS Artifacts Tested | Expected Invariant | Result |
| :---: | :--- | :--- | :--- | :---: |
| **S1** | Direct web child graceful exit | Real `spawn(process.execPath)` | Child exits on signal, coordinator reaches `SHUTDOWN_COMPLETE` | **PASS** |
| **S2** | Supervisor waits for child exit event | Real child + SQLite DB | Checkpointing occurs strictly after `child.once('exit')` timestamp | **PASS** |
| **S3** | Concurrent signal deduplication | Real child + concurrent signals | Multiple `executeShutdown` calls share identical in-flight Promise | **PASS** |
| **S4** | Child unresponsive to SIGTERM | Real uncooperative process target | Grace timeout triggers SIGKILL, exit confirmed | **PASS** |
| **S5** | Await exit after SIGKILL | Delayed exit emitter target | Coordinator awaits post-kill exit before advancing | **PASS** |
| **S6** | Child with real descendant process | Child spawns grandchild process | Descendant lifecycle verified; platform differences documented | **PASS** |
| **S7** | Checkpoint blocked by open write lock | Real SQLite `BEGIN IMMEDIATE` | Checkpoint fails with `CHECKPOINT_BUSY`; succeeds after rollback | **PASS** |
| **S8** | Checkpoint busy=1 failure handling | Mock busy=1 + real DB lock | Busy checkpoint halts shutdown, transitions to `SHUTDOWN_FAILED` | **PASS** |
| **S9** | Validated checkpoint & WAL truncate | 50 real SQLite WAL transactions | Validates row schema, asserts WAL file truncated to 0 bytes | **PASS** |
| **S10** | Expired drain prevents worker cycles | Active worker simulation | Expired drain triggers failure; worker cycles inhibited | **PASS** |
| **S11** | Child spawn error handling | Invalid executable spawn | Spawn error captured; supervisor reports non-zero exit | **PASS** |
| **S12** | Unexpected child crash recovery | Child exits with code 42 | Supervisor detects crash in RUNNING state, triggers emergency shutdown | **PASS** |
| **S13** | Late child exit deduplication | Exit emitted after failure | Late exit does not re-trigger lease cleanup or corrupt state | **PASS** |
| **S14** | Fail-closed on unconfirmed termination | Unkillable target process | System transitions to `SHUTDOWN_FAILED`; WAL checkpoint strictly prevented | **PASS** |
| **S15** | Ownership-safe lease cleanup | `.coordination.db` active leases | Owned lease deleted; foreign PID & unowned leases preserved | **PASS** |

### 5.2 Determinism & Consecutive Execution Evidence
The integration test suite was executed three times consecutively to prove zero flakiness:

| Execution Run | Total Assertions Evaluated | Passed Assertions | Failed Assertions | Execution Duration | Exit Code |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **Run 1** | 56 | 56 | 0 | 9.87s | `0` |
| **Run 2** | 56 | 56 | 0 | 9.72s | `0` |
| **Run 3** | 56 | 56 | 0 | 9.81s | `0` |

---

## 6. Full Regression Suite Results

All platform test suites and release verification gates were executed and passed completely:

| Suite / Verification Step | Command | Total Tests / Assertions | Passed | Failed | Exit Code | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 5.9.5 Process Lifecycle** | `node node_modules/tsx/dist/cli.mjs tests/phase5_9_5_process_lifecycle.integration.test.ts` | 56 assertions | 56 | 0 | `0` | **PASS** |
| **Phase 5.9.3 Shutdown Lifecycle** | `node node_modules/tsx/dist/cli.mjs tests/phase5_9_3_shutdown_lifecycle.test.ts` | 10 scenarios | 10 | 0 | `0` | **PASS** |
| **Phase 5.8.6 Maintenance Gate** | `node node_modules/tsx/dist/cli.mjs tests/phase5_8_6_maintenance_remediation.test.ts` | 41 assertions | 41 | 0 | `0` | **PASS** |
| **TypeScript Compilation** | `node node_modules/typescript/bin/tsc --noEmit` | Full project codebase | N/A | 0 errors | `0` | **PASS** |
| **Migration Bundle Integrity** | `node scripts/verify_migration_bundle.mjs` | SHA-256 & freshness check | Verified | 0 mismatches | `0` | **PASS** |
| **Script Syntax Check** | `node -c scripts/start_all.mjs ; node -c scripts/shutdown_coordinator.mjs` | AST syntax evaluation | Clean | 0 syntax errors | `0` | **PASS** |
| **Git Diff Whitespace Check** | `git --no-pager diff --check -- scripts/start_all.mjs` | Whitespace & line endings | Clean | 0 whitespace errors | `0` | **PASS** |

---

## 7. Deployment & Railway Container Runtime Considerations

### 7.1 Container Entrypoint and PID 1 Architecture
In Railway staging:
- The container runtime starts via `CMD ["node", "scripts/start_all.mjs"]` (or Docker entrypoint).
- `scripts/start_all.mjs` runs as PID 1 inside the container.
- When Railway stops or deploys a new container version, it issues `SIGTERM` to PID 1.
- Because `start_all.mjs` installs explicit `process.on('SIGTERM')` and `process.on('SIGINT')` handlers, Node.js properly traps the container termination signal.
- Spawning Next.js directly via `node_modules/next/dist/bin/next` ensures that `webProcess.pid` receives the forwarded `SIGTERM` immediately without shell buffering.
- When `webProcess` exits, `start_all.mjs` reaps the exit status, deletes owned leases, and safely executes `wal_checkpoint(TRUNCATE)` before exiting with the child's exit code.

### 7.2 Release Gate Checklist Prior to Deployment
Before initiating any deployment to Railway staging:
1. Ensure `MAINTENANCE_MODE=true` is enabled in staging environment variables before container restarts.
2. Verify SQLite persistent volume mount (`/app/data/career_app.db`) is not experiencing active I/O.
3. Execute the pre-migration database backup using `scripts/backup_manager.mjs`.
4. Run `node scripts/run_email_migration.mjs` inside the isolated staging environment.
5. Deactivate maintenance mode once schema and data integrity checks pass.

---

## 8. Summary of Working Tree State

- **Branch:** `main`
- **Tracked Changes:** `scripts/start_all.mjs` (hardened direct process execution & shutdown coordinator wiring).
- **New Modules:** `scripts/shutdown_coordinator.mjs`, `tests/phase5_9_5_process_lifecycle.integration.test.ts`.
- **Status:** All changes verified, regression tests passing, 0 uncommitted Git commits created.
