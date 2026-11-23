import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { BackgroundWorkerManager } from './background_worker.mjs';
import { SQLiteBackupManager } from './backup_manager.mjs';
import {
  ShutdownCoordinator,
  ShutdownState,
  executeAndValidateWalCheckpoint,
  validateWalCheckpointResult
} from './shutdown_coordinator.mjs';

if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  console.log('=== [CONTAINER SUPERVISOR: WEB + BACKGROUND WORKER + BACKUP SCHEDULER] ===');
}

// Initialize shutdown lifecycle coordinator
const shutdownCoordinator = new ShutdownCoordinator();

// ==============================================================================
// 1. RUNTIME ENVIRONMENT CONFIGURATION GATE
// ==============================================================================
const nodeEnv = process.env.NODE_ENV || 'production';
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads');
const webPort = process.env.PORT || '3000';
const hostName = process.env.HOSTNAME || '0.0.0.0';
const stagingMode = process.env.STAGING_MODE === 'true';
const stagingAccessCode = process.env.STAGING_ACCESS_CODE || '';

console.log('[CONFIG] Runtime Environment Audit:');
console.log(` - NODE_ENV:          ${nodeEnv}`);
console.log(` - PORT:              ${webPort}`);
console.log(` - HOSTNAME:          ${hostName}`);
console.log(` - DATABASE_PATH:     ${dbPath}`);
console.log(` - UPLOADS_DIR:       ${uploadsDir}`);
console.log(` - STAGING_MODE:      ${stagingMode}`);
console.log(` - ACCESS_CODE_SET:   ${stagingAccessCode.length > 0} (Length: ${stagingAccessCode.length})`);

// Validation Gate: Staging Security Requirements
if (stagingMode) {
  if (!stagingAccessCode || stagingAccessCode.trim().length < 8) {
    console.error('[FATAL SECURITY ERROR] STAGING_MODE=true is configured, but STAGING_ACCESS_CODE is missing or less than 8 characters!');
    console.error('[FATAL SECURITY ERROR] Refusing to start an unprotected staging instance. Set STAGING_ACCESS_CODE.');
    process.exit(1);
  }
}

// Ensure persistent storage directories exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const backupDir = path.join(dbDir, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// ==============================================================================
// 2. SPAWN NEXT.JS WEB PROCESS (DIRECT INVOCATION WITHOUT NPM/NPX INTERMEDIARY)
// ==============================================================================
let webProcess = null;

if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  const projectRoot = process.cwd();
  const nextCliPath = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

  if (!fs.existsSync(nextCliPath)) {
    console.error(`[FATAL PROCESS ERROR] Next.js CLI entrypoint not found at: ${nextCliPath}`);
    console.error('[FATAL PROCESS ERROR] Refusing to start supervisor with missing or unverified Next.js binary.');
    process.exit(1);
  }

  const spawnExec = process.execPath; // Verified local Node binary
  const spawnArgs = [nextCliPath, 'start', '-p', String(webPort), '-H', hostName];

  console.log(`[SUPERVISOR] Spawning Next.js Web Server directly via ${spawnExec}...`);
  console.log(` - Entrypoint: ${nextCliPath}`);
  console.log(` - WorkingDir: ${projectRoot}`);
  console.log(` - Host/Port:  ${hostName}:${webPort}`);

  webProcess = spawn(spawnExec, spawnArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false, // Strictly NO shell wrapper on any platform (eliminates npx/shell indirection)
    env: {
      ...process.env,
      PORT: String(webPort),
      HOSTNAME: hostName,
      DATABASE_PATH: dbPath,
      UPLOADS_DIR: uploadsDir
    }
  });

  webProcess.on('error', (err) => {
    console.error('[SUPERVISOR] Failed to launch Next.js process:', err);
    process.exit(1);
  });

  webProcess.on('exit', (code, signal) => {
    console.log(`[SUPERVISOR] Next.js process exited with code ${code} / signal ${signal}.`);
    if (!shutdownCoordinator.isShuttingDown) {
      console.error('[SUPERVISOR] Next.js process terminated unexpectedly. Initiating emergency supervisor shutdown...');
      handleShutdown(signal || 'SIGTERM', code ?? 1);
    }
  });
}

// ==============================================================================
// 3. BACKGROUND WORKER PROCESS WITH DISTRIBUTED LEASE & AUDITING
// ==============================================================================
let workerActive = false;
let backupActive = false;
let wasMaintenanceActive = false;

const coordinationDbPath = path.join(path.dirname(dbPath), '.coordination.db');
const supervisorStatusPath = path.join(path.dirname(dbPath), '.supervisor_status.json');
const spillAuditPath = path.join(path.dirname(dbPath), '.deferred_audit_events.json');

function getCoordinationDb() {
  try {
    const cdb = new Database(coordinationDbPath, { timeout: 5000 });
    cdb.pragma('journal_mode = WAL');
    cdb.pragma('busy_timeout = 5000');
    return cdb;
  } catch {
    return null;
  }
}

function reconcileStartupMaintenanceState() {
  const cdb = getCoordinationDb();
  if (!cdb) return;

  try {
    const row = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
    if (row && (row.state === 'DRAINING' || row.state === 'ACTIVE')) {
      console.log(`[SUPERVISOR-STARTUP] Detected coordination state "${row.state}". Running deep recovery verification on ${dbPath}...`);
      const verification = SQLiteBackupManager.verifyDatabaseStateDeep(dbPath);
      console.log(`[SUPERVISOR-STARTUP] Deep verification outcome: state=${verification.state}, healthy=${verification.healthy}`);

      if (verification.healthy) {
        if (verification.state === 'MIGRATED') {
          console.log('[SUPERVISOR-STARTUP] Migration is fully and durably committed with valid referential integrity. Self-healing coordination to INACTIVE.');
          cdb.prepare("UPDATE coordination_state SET state = 'INACTIVE' WHERE id = 'global'").run();
          cdb.prepare("DELETE FROM active_leases").run();
        } else if (verification.state === 'CLEAN_UNMIGRATED') {
          console.log('[SUPERVISOR-STARTUP] Database is clean and unmigrated. Clearing stale maintenance to INACTIVE.');
          cdb.prepare("UPDATE coordination_state SET state = 'INACTIVE' WHERE id = 'global'").run();
          cdb.prepare("DELETE FROM active_leases").run();
        }
      } else {
        console.error(`[FATAL SUPERVISOR STARTUP ERROR] Database is in an unhealthy/inconsistent state: ${verification.reason}`);
        console.error('[FATAL SUPERVISOR STARTUP ERROR] Keeping maintenance fail-closed. System will remain in 503 mode until operator intervention.');
      }
    }
  } catch (err) {
    console.error('[SUPERVISOR-STARTUP] Error during startup reconciliation:', err.message);
  } finally {
    try { cdb.close(); } catch {}
  }
}

// Reconcile maintenance coordination state on startup
if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  reconcileStartupMaintenanceState();
}

function updateSupervisorStatus() {
  try {
    const statusData = {
      workerActive,
      backupActive,
      timestamp: new Date().toISOString(),
      pid: process.pid
    };
    fs.writeFileSync(supervisorStatusPath, JSON.stringify(statusData, null, 2), 'utf-8');
  } catch {}
}

function isSupervisorMaintenanceActive() {
  if (process.env.MAINTENANCE_MODE === 'true') return true;

  // 1. Check SQLite-backed coordination database
  const cdb = getCoordinationDb();
  if (cdb) {
    try {
      const row = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
      cdb.close();
      if (row && (row.state === 'DRAINING' || row.state === 'ACTIVE')) {
        return true;
      }
    } catch {}
  }

  // 2. Check fallback lockfile
  try {
    const lockPath = path.join(path.dirname(dbPath), '.maintenance_lock');
    return fs.existsSync(lockPath);
  } catch (err) {
    console.error('[SUPERVISOR-MAINTENANCE] Error checking maintenance lock:', err.message);
    return true; // Fail closed
  }
}

function appendDeferredAuditEvent(event) {
  // Primary durable transactional spool into .coordination.db
  const cdb = getCoordinationDb();
  if (cdb) {
    try {
      const detailsStr = typeof event.details === 'string' ? event.details : JSON.stringify(event.details);
      cdb.prepare(`
        INSERT INTO durable_audit_spool (id, action, details, created_at, status)
        VALUES (?, ?, ?, ?, 'PENDING')
        ON CONFLICT(id) DO NOTHING
      `).run(event.id, event.action, detailsStr, event.timestamp || new Date().toISOString());
      cdb.close();
      console.log(`[SUPERVISOR-AUDIT] Persisted audit event "${event.action}" to durable outbox spool.`);
      return;
    } catch (err) {
      console.error('[SUPERVISOR-AUDIT ERROR] Error spooling to .coordination.db:', err.message);
      try { cdb.close(); } catch {}
    }
  }

  // Fallback spill file
  try {
    let existing = [];
    if (fs.existsSync(spillAuditPath)) {
      try { existing = JSON.parse(fs.readFileSync(spillAuditPath, 'utf-8')); } catch { existing = []; }
    }
    existing.push(event);
    fs.writeFileSync(spillAuditPath, JSON.stringify(existing, null, 2), 'utf-8');
    console.log(`[SUPERVISOR-AUDIT] Safely deferred audit event "${event.action}" to fallback spill file.`);
  } catch (err) {
    console.error('[SUPERVISOR-AUDIT ERROR] Could not defer audit event:', err.message);
  }
}

function flushDeferredAuditEvents() {
  const cdb = getCoordinationDb();
  let db = null;

  // 1. Flush durable outbox spool from .coordination.db
  if (cdb) {
    try {
      const pending = cdb.prepare("SELECT * FROM durable_audit_spool WHERE status = 'PENDING' ORDER BY created_at ASC").all();
      if (pending && pending.length > 0) {
        console.log(`[SUPERVISOR-AUDIT] Flushing ${pending.length} durable outbox events to audit_logs...`);
        db = new Database(dbPath);
        const insertStmt = db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, details, timestamp)
          VALUES (?, 'system_worker', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `);

        db.transaction(() => {
          for (const ev of pending) {
            insertStmt.run(ev.id, ev.action, ev.details, ev.created_at);
          }
        })();

        const now = new Date().toISOString();
        cdb.transaction(() => {
          const updateStmt = cdb.prepare("UPDATE durable_audit_spool SET status = 'FLUSHED', flushed_at = ? WHERE id = ?");
          for (const ev of pending) {
            updateStmt.run(now, ev.id);
          }
        })();

        console.log(`[SUPERVISOR-AUDIT] Successfully flushed ${pending.length} durable outbox audit events.`);
      }
    } catch (err) {
      console.error('[SUPERVISOR-AUDIT ERROR] Failed to flush durable spool:', err.message);
    } finally {
      try { cdb.close(); } catch {}
    }
  }

  // 2. Flush legacy fallback spill file if present
  if (fs.existsSync(spillAuditPath)) {
    try {
      const raw = fs.readFileSync(spillAuditPath, 'utf-8');
      const events = JSON.parse(raw);
      if (Array.isArray(events) && events.length > 0) {
        if (!db) db = new Database(dbPath);
        const insertStmt = db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, details, timestamp)
          VALUES (?, 'system_worker', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `);
        db.transaction(() => {
          for (const ev of events) {
            insertStmt.run(ev.id, ev.action, JSON.stringify(ev.details), ev.timestamp || new Date().toISOString());
          }
        })();
        console.log(`[SUPERVISOR-AUDIT] Flushed ${events.length} fallback spill file audit events.`);
      }
      fs.unlinkSync(spillAuditPath);
    } catch (err) {
      console.error('[SUPERVISOR-AUDIT ERROR] Failed to flush fallback spill file:', err.message);
    }
  }

  if (db) {
    try { db.close(); } catch {}
  }
}

function recordWorkerEvent(action, details) {
  const event = {
    id: `audit_worker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    action,
    details,
    timestamp: new Date().toISOString()
  };

  if (isSupervisorMaintenanceActive()) {
    appendDeferredAuditEvent(event);
    return;
  }

  try {
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details, timestamp)
      VALUES (?, 'system_worker', ?, ?, CURRENT_TIMESTAMP)
    `).run(event.id, event.action, JSON.stringify(event.details));
    db.close();
  } catch (err) {
    console.error('[SUPERVISOR-AUDIT] Could not record worker event, deferring:', err.message);
    appendDeferredAuditEvent(event);
  }
}

// Maintenance state watcher: when maintenance transitions to inactive, flush deferred audits
let maintenanceWatcherInterval = null;
if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  maintenanceWatcherInterval = setInterval(() => {
    const isMaint = isSupervisorMaintenanceActive();
    if (wasMaintenanceActive && !isMaint) {
      console.log('[SUPERVISOR] Maintenance window ended. Triggering deferred audit event flush...');
      flushDeferredAuditEvents();
    }
    wasMaintenanceActive = isMaint;
  }, 5000);
}

function registerSupervisorLease(leaseId, processType, label, ttlMs = 120000) {
  shutdownCoordinator.registerOwnedLease(leaseId);
  const cdb = getCoordinationDb();
  if (cdb) {
    try {
      const now = Date.now();
      cdb.prepare(`
        INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(leaseId, processType, process.pid, label, now, now + ttlMs);
    } catch (err) {
      console.warn('[SUPERVISOR-COORDINATION] Failed to register lease:', err.message);
    } finally {
      try { cdb.close(); } catch {}
    }
  }
}

function releaseSupervisorLease(leaseId) {
  shutdownCoordinator.releaseOwnedLease(leaseId);
  const cdb = getCoordinationDb();
  if (cdb) {
    try {
      cdb.prepare('DELETE FROM active_leases WHERE lease_id = ?').run(leaseId);
    } catch {} finally {
      try { cdb.close(); } catch {}
    }
  }
}

async function triggerWorkerCycle() {
  if (shutdownCoordinator.isShuttingDown || isSupervisorMaintenanceActive()) {
    console.log('[SUPERVISOR-WORKER] Maintenance mode active or shutting down. Skipping worker cycle.');
    return;
  }
  if (workerActive) {
    console.log('[SUPERVISOR-WORKER] Previous cycle still in-flight. Skipping overlapping trigger.');
    return;
  }

  workerActive = true;
  updateSupervisorStatus();
  const workerManager = new BackgroundWorkerManager(dbPath);
  const jobName = 'scheduled_verification_cycle';
  const supervisorLeaseId = `worker_sup_${process.pid}_${Date.now()}`;

  try {
    const acquired = workerManager.acquireLock(jobName, 120000);
    if (!acquired) {
      console.log('[SUPERVISOR-WORKER] Distributed lease held or maintenance active. Skipping cycle.');
      workerManager.close();
      workerActive = false;
      updateSupervisorStatus();
      return;
    }

    registerSupervisorLease(supervisorLeaseId, 'worker', jobName, 120000);
    console.log('[SUPERVISOR-WORKER] Acquired lease. Running background tasks...');
    recordWorkerEvent('WORKER_CYCLE_STARTED', { jobName, timestamp: new Date().toISOString() });

    // Simulate safe cycle completion
    setTimeout(() => {
      releaseSupervisorLease(supervisorLeaseId);
      workerManager.releaseLock(jobName);
      workerManager.close();
      workerActive = false;
      updateSupervisorStatus();
      recordWorkerEvent('WORKER_CYCLE_COMPLETED', { jobName, timestamp: new Date().toISOString() });
      console.log('[SUPERVISOR-WORKER] Background tasks completed, lease released.');
    }, 2000);

  } catch (err) {
    console.error('[SUPERVISOR-WORKER CRITICAL ERROR] Background worker failed:', err);
    releaseSupervisorLease(supervisorLeaseId);
    recordWorkerEvent('WORKER_CYCLE_FAILED', { jobName, error: err.message, stack: err.stack });
    try { workerManager.releaseLock(jobName); workerManager.close(); } catch {}
    workerActive = false;
    updateSupervisorStatus();
  }
}

// Worker scheduler timers
let workerInitialTimer = null;
let workerInterval = null;
if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  workerInitialTimer = setTimeout(triggerWorkerCycle, 5000);
  workerInterval = setInterval(triggerWorkerCycle, 300000); // Every 5 minutes
}

// ==============================================================================
// 4. AUTOMATED SQLITE BACKUP SCHEDULER
// ==============================================================================
async function triggerBackupJob() {
  if (shutdownCoordinator.isShuttingDown || isSupervisorMaintenanceActive()) {
    console.log('[SUPERVISOR-BACKUP] Maintenance mode active or shutting down. Skipping automated backup.');
    return;
  }
  if (backupActive) {
    console.log('[SUPERVISOR-BACKUP] Backup already in progress. Skipping overlapping trigger.');
    return;
  }

  backupActive = true;
  updateSupervisorStatus();
  console.log('[SUPERVISOR-BACKUP] Running scheduled SQLite atomic backup...');
  const backupLeaseId = `backup_sup_${process.pid}_${Date.now()}`;
  registerSupervisorLease(backupLeaseId, 'backup', 'sqlite_atomic_backup', 300000);

  try {
    const result = await SQLiteBackupManager.createConsistentBackup(dbPath, backupDir);
    const pruned = SQLiteBackupManager.pruneOldBackups(backupDir, 7); // Retain 7 backups
    recordWorkerEvent('BACKUP_COMPLETED', {
      backupFile: result.backupFileName,
      sizeBytes: result.sizeBytes,
      prunedBackups: pruned
    });
    console.log(`[SUPERVISOR-BACKUP] Backup successful: ${result.backupFileName} (${result.sizeBytes} bytes). Pruned ${pruned.length} old backups.`);
  } catch (err) {
    console.error('[SUPERVISOR-BACKUP ERROR] Scheduled backup failed:', err);
    recordWorkerEvent('BACKUP_FAILED', { error: err.message });
  } finally {
    releaseSupervisorLease(backupLeaseId);
    backupActive = false;
    updateSupervisorStatus();
  }
}

// Backup scheduler: initial backup check after 10s, then every 24 hours
let backupInitialTimer = null;
let backupInterval = null;
if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  backupInitialTimer = setTimeout(triggerBackupJob, 10000);
  backupInterval = setInterval(triggerBackupJob, 24 * 60 * 60 * 1000);
}

// ==============================================================================
// 5. GRACEFUL PROCESS SHUTDOWN & ORDERED QUIESCENCE
// ==============================================================================
async function handleShutdown(signal = 'SIGTERM', forcedExitCode = null, options = {}) {
  const targetWebProcess = options.webProcess !== undefined ? options.webProcess : webProcess;
  const targetDbPath = options.dbPath || dbPath;
  const targetCoordDbPath = options.coordinationDbPath || (targetDbPath ? path.join(path.dirname(targetDbPath), '.coordination.db') : coordinationDbPath);
  const targetStatusPath = options.statusPath || supervisorStatusPath;

  const result = await shutdownCoordinator.executeShutdown(signal, forcedExitCode, {
    webProcess: targetWebProcess,
    dbPath: targetDbPath,
    coordinationDbPath: targetCoordDbPath,
    statusFilePath: targetStatusPath,
    drainTimeoutMs: options.drainTimeoutMs ?? 5000,
    gracePeriodMs: options.gracePeriodMs ?? 10000,
    postKillTimeoutMs: options.postKillTimeoutMs ?? 5000,
    checkpointTimeoutMs: options.checkpointTimeoutMs ?? 10000,
    suppressExit: options.suppressExit,
    cancelTimers: () => {
      if (workerInitialTimer) clearTimeout(workerInitialTimer);
      if (workerInterval) clearInterval(workerInterval);
      if (backupInitialTimer) clearTimeout(backupInitialTimer);
      if (backupInterval) clearInterval(backupInterval);
      if (maintenanceWatcherInterval) clearInterval(maintenanceWatcherInterval);
    },
    isWorkActive: () => (workerActive || backupActive)
  });

  return result.exitCode;
}

if (process.env.SUPERVISOR_DISABLE_AUTOSPAWN !== 'true') {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Export supervisor interfaces for testing and programmatic orchestration
export {
  handleShutdown,
  isSupervisorMaintenanceActive,
  triggerWorkerCycle,
  triggerBackupJob,
  updateSupervisorStatus,
  getCoordinationDb,
  reconcileStartupMaintenanceState,
  shutdownCoordinator,
  ShutdownState,
  executeAndValidateWalCheckpoint,
  validateWalCheckpointResult,
  registerSupervisorLease,
  releaseSupervisorLease
};
export function getIsShuttingDown() { return shutdownCoordinator.isShuttingDown; }
export function _resetShutdownStateForTesting() {
  shutdownCoordinator.resetForTesting();
  workerActive = false;
  backupActive = false;
}
