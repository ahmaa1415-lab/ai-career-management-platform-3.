/**
 * Shutdown Coordinator & State Machine for Container Supervisor
 *
 * Implements deterministic process lifecycle management, ordered quiescence,
 * verified child process termination, ownership-safe lease cleanup,
 * and SQLite WAL checkpoint result validation.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

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

const VALID_TRANSITIONS = {
  [ShutdownState.RUNNING]: [ShutdownState.QUIESCING, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.QUIESCING]: [ShutdownState.DRAINING, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.DRAINING]: [ShutdownState.TERMINATING_CHILD, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.TERMINATING_CHILD]: [ShutdownState.VERIFYING_PROCESS_EXIT, ShutdownState.FORCING_TERMINATION, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.FORCING_TERMINATION]: [ShutdownState.VERIFYING_PROCESS_EXIT, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.VERIFYING_PROCESS_EXIT]: [ShutdownState.CLEANING_OWNED_LEASES, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.CLEANING_OWNED_LEASES]: [ShutdownState.CHECKPOINTING, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.CHECKPOINTING]: [ShutdownState.SHUTDOWN_COMPLETE, ShutdownState.SHUTDOWN_FAILED],
  [ShutdownState.SHUTDOWN_COMPLETE]: [],
  [ShutdownState.SHUTDOWN_FAILED]: []
};

/**
 * Validates the raw array returned by PRAGMA wal_checkpoint(TRUNCATE).
 * better-sqlite3 returns: [ { busy: number, log: number, checkpointed: number } ]
 *
 * SQLite WAL Checkpoint Semantics:
 * - 'busy': Status indicator (0 = success, all frames checkpointed and WAL truncated;
 *   non-zero = checkpoint incomplete or could not truncate WAL due to concurrent readers/writers).
 *   Note: 'busy' is a status indicator, NOT a count of retry attempts or busy handlers.
 * - 'log': Total number of frames in the WAL log file at the start of the checkpoint.
 * - 'checkpointed': Number of frames in the WAL successfully transferred to the database file.
 *
 * In TRUNCATE mode, successful checkpointing requires transferring all frames AND truncating the WAL.
 * If 'busy' is non-zero (1), some frames may have been transferred, but WAL truncation was blocked
 * by active readers or open transactions. This is treated as an incomplete checkpoint and fails closed.
 */
export function validateWalCheckpointResult(checkpointResult) {
  if (!Array.isArray(checkpointResult) || checkpointResult.length === 0) {
    return {
      valid: false,
      success: false,
      reason: 'MALFORMED_RESULT',
      message: 'Checkpoint result is not a non-empty array',
      raw: checkpointResult
    };
  }

  const row = checkpointResult[0];
  if (!row || typeof row.busy !== 'number' || typeof row.log !== 'number' || typeof row.checkpointed !== 'number') {
    return {
      valid: false,
      success: false,
      reason: 'INVALID_FIELDS',
      message: 'Checkpoint result missing numeric busy, log, or checkpointed fields',
      raw: row
    };
  }

  if (row.busy !== 0) {
    return {
      valid: true,
      success: false,
      reason: 'CHECKPOINT_BUSY',
      message: `Checkpoint could not truncate WAL: busy=${row.busy} (status indicator: concurrent readers or open locks present)`,
      busy: row.busy,
      log: row.log,
      checkpointed: row.checkpointed,
      raw: row
    };
  }

  return {
    valid: true,
    success: true,
    reason: 'OK',
    message: `Checkpoint successfully transferred frames and truncated WAL: log=${row.log}, checkpointed=${row.checkpointed}`,
    busy: 0,
    log: row.log,
    checkpointed: row.checkpointed,
    raw: row
  };
}

/**
 * Maps a POSIX signal name (e.g. SIGTERM, SIGKILL) to its standard 128+N numeric exit status.
 */
export function signalToExitCode(signal) {
  if (!signal) return null;
  const SIGNALS = {
    SIGHUP: 129,
    SIGINT: 130,
    SIGQUIT: 131,
    SIGKILL: 137,
    SIGUSR1: 138,
    SIGSEGV: 139,
    SIGUSR2: 140,
    SIGTERM: 143
  };
  return SIGNALS[signal] ?? 128;
}

/**
 * Resolves process exit status from raw code, signal string, and ChildProcess instance.
 * Distinguishes normal exits (code is number), signal terminations (code is null, signal is populated),
 * and assigns standard exit codes (128+N) while preserving signalCode.
 */
export function resolveProcessExitStatus(code, signal, targetProcess) {
  const rawCode = (code !== null && code !== undefined) ? code : (targetProcess?.exitCode ?? null);
  const rawSignal = signal || (targetProcess?.signalCode ?? null);

  if (typeof rawCode === 'number') {
    return {
      exitCode: rawCode,
      signalCode: rawSignal,
      isSignalTerminated: Boolean(rawSignal)
    };
  }

  if (rawSignal) {
    return {
      exitCode: signalToExitCode(rawSignal),
      signalCode: rawSignal,
      isSignalTerminated: true
    };
  }

  return {
    exitCode: 0,
    signalCode: null,
    isSignalTerminated: false
  };
}

/**
 * Opens database connection, runs PRAGMA wal_checkpoint(TRUNCATE), validates results,
 * and ensures handle closure.
 */
export function executeAndValidateWalCheckpoint(dbPath, timeoutMs = 10000) {
  if (!fs.existsSync(dbPath)) {
    return {
      valid: false,
      success: false,
      reason: 'DB_FILE_NOT_FOUND',
      message: `Database file does not exist: ${dbPath}`
    };
  }

  let db = null;
  try {
    db = new Database(dbPath, { timeout: timeoutMs });
    const rawResult = db.pragma('wal_checkpoint(TRUNCATE)');
    const validation = validateWalCheckpointResult(rawResult);

    if (!validation.success) {
      console.warn(`[SUPERVISOR-WAL] Checkpoint incomplete or failed: ${validation.message}`);
    } else {
      console.log(`[SUPERVISOR-WAL] ${validation.message}`);
    }

    return validation;
  } catch (err) {
    console.error('[SUPERVISOR-WAL ERROR] Checkpoint threw exception:', err.message);
    return {
      valid: false,
      success: false,
      reason: 'CHECKPOINT_EXCEPTION',
      message: err.message
    };
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
}

export class ShutdownCoordinator {
  constructor(options = {}) {
    this.state = ShutdownState.RUNNING;
    this.stateHistory = [{ state: this.state, timestamp: new Date().toISOString() }];
    this.shutdownPromise = null;
    this.ownedLeaseIds = new Set();
    this.options = options;
  }

  get currentState() {
    return this.state;
  }

  get isShuttingDown() {
    return this.state !== ShutdownState.RUNNING;
  }

  registerOwnedLease(leaseId) {
    if (leaseId) {
      this.ownedLeaseIds.add(leaseId);
    }
  }

  releaseOwnedLease(leaseId) {
    if (leaseId) {
      this.ownedLeaseIds.delete(leaseId);
    }
  }

  transitionTo(nextState, metadata = {}) {
    const allowed = VALID_TRANSITIONS[this.state] || [];
    if (!allowed.includes(nextState)) {
      const errMsg = `[SHUTDOWN_STATE_ERROR] Invalid transition from ${this.state} to ${nextState}`;
      console.error(errMsg);
      this.stateHistory.push({
        state: ShutdownState.SHUTDOWN_FAILED,
        timestamp: new Date().toISOString(),
        error: errMsg,
        attemptedState: nextState
      });
      this.state = ShutdownState.SHUTDOWN_FAILED;
      throw new Error(errMsg);
    }

    this.state = nextState;
    this.stateHistory.push({
      state: nextState,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    console.log(`[SUPERVISOR-STATE] Transitioned to ${nextState}`);
  }

  executeShutdown(signal = 'SIGTERM', forcedExitCode = null, runOptions = {}) {
    if (this.isShuttingDown) {
      console.log(`[SUPERVISOR] Received ${signal} while shutdown in state ${this.state}. Ignoring duplicate signal.`);
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      let finalExitCode = 0;
      try {
        // Step 1: Quiescing
        this.transitionTo(ShutdownState.QUIESCING, { signal });

        if (typeof runOptions.cancelTimers === 'function') {
          runOptions.cancelTimers();
        }

        // Step 2: Draining
        this.transitionTo(ShutdownState.DRAINING);
        const drainTimeoutMs = runOptions.drainTimeoutMs ?? 5000;
        const drainStart = Date.now();
        let drainTimedOut = false;

        if (typeof runOptions.isWorkActive === 'function') {
          while (runOptions.isWorkActive() && (Date.now() - drainStart < drainTimeoutMs)) {
            console.log('[SUPERVISOR] Waiting for in-flight tasks to quiesce...');
            await new Promise(r => setTimeout(r, 100));
          }
          if (runOptions.isWorkActive()) {
            drainTimedOut = true;
            console.warn(`[SUPERVISOR WARNING] Drain timeout of ${drainTimeoutMs}ms expired while tasks still active.`);
          }
        }

        // Step 3: Terminating child process
        this.transitionTo(ShutdownState.TERMINATING_CHILD);
        const targetProcess = runOptions.webProcess;
        let childExitConfirmed = false;
        let childExitCode = null;
        let childSignalCode = null;
        let childTerminationForced = false;

        const hasTarget = Boolean(targetProcess);
        const alreadyExited = hasTarget && (
          typeof targetProcess.exitCode === 'number' ||
          typeof targetProcess.signalCode === 'string'
        );

        if (!hasTarget) {
          childExitConfirmed = true;
          this.transitionTo(ShutdownState.VERIFYING_PROCESS_EXIT, { method: 'NO_CHILD' });
        } else if (alreadyExited) {
          childExitConfirmed = true;
          const status = resolveProcessExitStatus(null, null, targetProcess);
          childExitCode = status.exitCode;
          childSignalCode = status.signalCode;
          console.log(`[SUPERVISOR] Web process already exited (code: ${childExitCode}, signal: ${childSignalCode}).`);
          this.transitionTo(ShutdownState.VERIFYING_PROCESS_EXIT, {
            method: 'ALREADY_EXITED',
            code: childExitCode,
            signal: childSignalCode,
            isSignalTerminated: status.isSignalTerminated
          });
        } else {
          // Process exists and has NOT confirmed exit yet (neither exitCode nor signalCode set).
          // Attach exit listener BEFORE sending termination signal or evaluating timeouts.
          const exitPromise = new Promise((resolve) => {
            targetProcess.once('exit', (code, sig) => {
              const status = resolveProcessExitStatus(code, sig, targetProcess);
              childExitCode = status.exitCode;
              childSignalCode = status.signalCode;
              childExitConfirmed = true;
              resolve(status);
            });
          });

          // Check if child exited immediately before or during listener registration
          if (typeof targetProcess.exitCode === 'number' || typeof targetProcess.signalCode === 'string') {
            childExitConfirmed = true;
            const status = resolveProcessExitStatus(null, null, targetProcess);
            childExitCode = status.exitCode;
            childSignalCode = status.signalCode;
            console.log(`[SUPERVISOR] Web process exited before signal issuance (code: ${childExitCode}, signal: ${childSignalCode}).`);
            this.transitionTo(ShutdownState.VERIFYING_PROCESS_EXIT, {
              method: 'ALREADY_EXITED',
              code: childExitCode,
              signal: childSignalCode,
              isSignalTerminated: status.isSignalTerminated
            });
          } else {
            // Send termination signal only if not already requested on this ChildProcess instance
            if (!targetProcess.killed) {
              try {
                targetProcess.kill(signal);
              } catch (err) {
                console.warn(`[SUPERVISOR] Process kill(${signal}) warning:`, err.message);
              }
            } else {
              console.log(`[SUPERVISOR] Termination signal previously requested (killed=true). Awaiting child process exit...`);
            }

            const gracePeriodMs = runOptions.gracePeriodMs ?? 10000;
            let graceTimer;
            const graceTimeoutPromise = new Promise((resolve) => {
              graceTimer = setTimeout(() => resolve(false), gracePeriodMs);
            });

            const exitedGracefully = await Promise.race([exitPromise, graceTimeoutPromise]);
            clearTimeout(graceTimer);

            if (exitedGracefully) {
              const exitDesc = childSignalCode
                ? `via signal ${childSignalCode} (code ${childExitCode})`
                : `cleanly with code ${childExitCode}`;
              console.log(`[SUPERVISOR] Web process exited ${exitDesc}.`);
              this.transitionTo(ShutdownState.VERIFYING_PROCESS_EXIT, {
                method: 'GRACEFUL_EXIT',
                code: childExitCode,
                signal: childSignalCode,
                forced: false
              });
            } else {
              childTerminationForced = true;
              console.warn(`[SUPERVISOR] Web server did not exit within ${gracePeriodMs}ms. Forcing SIGKILL...`);
              this.transitionTo(ShutdownState.FORCING_TERMINATION);

              try {
                targetProcess.kill('SIGKILL');
              } catch (err) {
                console.warn('[SUPERVISOR] Process kill(SIGKILL) warning:', err.message);
              }

              // CRITICAL: Await confirmed exit after SIGKILL
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
                finalExitCode = 1;
                return {
                  success: false,
                  state: this.state,
                  exitCode: finalExitCode,
                  error: 'UNCONFIRMED_CHILD_EXIT',
                  childTerminationForced: true,
                  childExitCode: null,
                  childSignalCode: null
                };
              }

              // Ensure childExitCode reflects SIGKILL (137) if not already numeric
              if (childExitCode === null || childExitCode === 0) {
                childExitCode = 137;
              }
              if (!childSignalCode) {
                childSignalCode = 'SIGKILL';
              }
              console.warn(`[SUPERVISOR WARNING] Web process forcibly terminated after SIGKILL with code ${childExitCode} (signal: ${childSignalCode}).`);
            }
          }
        }

        // Step 4: Cleaning owned leases
        this.transitionTo(ShutdownState.CLEANING_OWNED_LEASES);
        const cdbPath = runOptions.coordinationDbPath;
        if (cdbPath && fs.existsSync(cdbPath) && this.ownedLeaseIds.size > 0) {
          let cdb = null;
          try {
            cdb = new Database(cdbPath, { timeout: 3000 });
            const deleteStmt = cdb.prepare('DELETE FROM active_leases WHERE lease_id = ? AND pid = ?');
            const pids = process.pid;
            cdb.transaction(() => {
              for (const leaseId of this.ownedLeaseIds) {
                deleteStmt.run(leaseId, pids);
              }
            })();
            console.log(`[SUPERVISOR] Safely cleaned up ${this.ownedLeaseIds.size} owned lease(s).`);
            this.ownedLeaseIds.clear();
          } catch (err) {
            console.warn('[SUPERVISOR] Warning cleaning owned leases:', err.message);
          } finally {
            if (cdb) {
              try { cdb.close(); } catch {}
            }
          }
        }

        // Step 5: Updating supervisor status file
        if (runOptions.statusFilePath) {
          try {
            const statusData = {
              workerActive: false,
              backupActive: false,
              shutdownState: this.state,
              shuttingDown: true,
              timestamp: new Date().toISOString(),
              pid: process.pid
            };
            fs.writeFileSync(runOptions.statusFilePath, JSON.stringify(statusData, null, 2), 'utf-8');
          } catch {}
        }

        // Step 6: WAL Checkpoint strictly after confirmed process exit
        this.transitionTo(ShutdownState.CHECKPOINTING);
        const targetDbPath = runOptions.dbPath;
        let checkpointOutcome = null;

        if (targetDbPath && fs.existsSync(targetDbPath)) {
          checkpointOutcome = executeAndValidateWalCheckpoint(targetDbPath, runOptions.checkpointTimeoutMs ?? 10000);
          if (!checkpointOutcome.success) {
            console.error('[SUPERVISOR SHUTDOWN ERROR] Final WAL checkpoint failed or incomplete:', checkpointOutcome.message);
            this.transitionTo(ShutdownState.SHUTDOWN_FAILED, { reason: 'CHECKPOINT_FAILED', details: checkpointOutcome });
            finalExitCode = forcedExitCode !== null ? forcedExitCode : 1;
            return {
              success: false,
              state: this.state,
              exitCode: finalExitCode,
              checkpointOutcome,
              childTerminationForced,
              drainTimedOut
            };
          }
        }

        if (drainTimedOut) {
          this.transitionTo(ShutdownState.SHUTDOWN_FAILED, { reason: 'DRAIN_TIMEOUT_EXPIRED' });
          finalExitCode = forcedExitCode !== null ? forcedExitCode : 1;
          return { success: false, state: this.state, exitCode: finalExitCode, drainTimedOut };
        }

        // Step 7: Completed
        this.transitionTo(ShutdownState.SHUTDOWN_COMPLETE, {
          childTerminationForced,
          childExitCode,
          childSignalCode,
          checkpointSuccess: checkpointOutcome ? checkpointOutcome.success : true
        });

        if (forcedExitCode !== null) {
          finalExitCode = forcedExitCode;
        } else if (childTerminationForced) {
          // If child termination was forced via SIGKILL, supervisor exit code must reflect forced termination
          finalExitCode = (typeof childExitCode === 'number' && childExitCode !== 0) ? childExitCode : 137;
        } else if (typeof childExitCode === 'number' && childExitCode !== 0 && childSignalCode !== 'SIGTERM') {
          // If child died with unexpected non-zero code and not orderly SIGTERM
          finalExitCode = childExitCode;
        } else {
          finalExitCode = 0;
        }

        const completionMsg = childTerminationForced
          ? `[SUPERVISOR WARNING] Shutdown completed with FORCED child termination. Final code: ${finalExitCode}`
          : `[SUPERVISOR] Shutdown completed successfully. Final code: ${finalExitCode}`;
        console.log(completionMsg);

        return {
          success: true,
          state: this.state,
          exitCode: finalExitCode,
          childTerminationForced,
          childExitCode,
          childSignalCode,
          checkpointOutcome
        };
      } catch (err) {
        console.error('[SUPERVISOR SHUTDOWN CRITICAL EXCEPTION]:', err);
        if (this.state !== ShutdownState.SHUTDOWN_COMPLETE) {
          try { this.transitionTo(ShutdownState.SHUTDOWN_FAILED, { error: err.message }); } catch {}
        }
        finalExitCode = forcedExitCode !== null ? forcedExitCode : 1;
        return { success: false, state: this.state, exitCode: finalExitCode, error: err.message };
      } finally {
        if (runOptions.suppressExit !== true && process.env.SUPERVISOR_SUPPRESS_EXIT !== 'true') {
          process.exit(finalExitCode);
        }
      }
    })();

    return this.shutdownPromise;
  }

  resetForTesting() {
    this.state = ShutdownState.RUNNING;
    this.stateHistory = [{ state: this.state, timestamp: new Date().toISOString() }];
    this.shutdownPromise = null;
    this.ownedLeaseIds.clear();
  }
}
