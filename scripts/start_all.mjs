import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { BackgroundWorkerManager } from './background_worker.mjs';
import { SQLiteBackupManager } from './backup_manager.mjs';

console.log('=== [CONTAINER SUPERVISOR: WEB + BACKGROUND WORKER + BACKUP SCHEDULER] ===');

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
// 2. SPAWN NEXT.JS WEB PROCESS
// ==============================================================================
console.log(`[SUPERVISOR] Spawning Next.js Web Server on ${hostName}:${webPort}...`);

const webProcess = spawn('npx', ['next', 'start', '-p', webPort, '-H', hostName], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: webPort,
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
  // Critical: Container must exit when web server terminates
  process.exit(code ?? 1);
});

// ==============================================================================
// 3. BACKGROUND WORKER PROCESS WITH DISTRIBUTED LEASE & AUDITING
// ==============================================================================
let workerActive = false;

function recordWorkerEvent(action, details) {
  try {
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details, timestamp)
      VALUES (?, 'system_worker', ?, ?, CURRENT_TIMESTAMP)
    `).run(`audit_worker_${Date.now()}`, action, JSON.stringify(details));
    db.close();
  } catch (err) {
    console.error('[SUPERVISOR-AUDIT] Could not record worker event:', err.message);
  }
}

async function triggerWorkerCycle() {
  if (workerActive) {
    console.log('[SUPERVISOR-WORKER] Previous cycle still in-flight. Skipping overlapping trigger.');
    return;
  }
  workerActive = true;
  const workerManager = new BackgroundWorkerManager(dbPath);
  const jobName = 'scheduled_verification_cycle';

  try {
    const acquired = workerManager.acquireLock(jobName, 120000);
    if (!acquired) {
      console.log('[SUPERVISOR-WORKER] Distributed lease held by another instance. Skipping cycle.');
      workerManager.close();
      workerActive = false;
      return;
    }

    console.log('[SUPERVISOR-WORKER] Acquired lease. Running background tasks...');
    
    // Execute worker tasks (e.g. check jobs, verify sources)
    recordWorkerEvent('WORKER_CYCLE_STARTED', { jobName, timestamp: new Date().toISOString() });

    // Simulate safe cycle completion
    setTimeout(() => {
      workerManager.releaseLock(jobName);
      workerManager.close();
      workerActive = false;
      recordWorkerEvent('WORKER_CYCLE_COMPLETED', { jobName, timestamp: new Date().toISOString() });
      console.log('[SUPERVISOR-WORKER] Background tasks completed, lease released.');
    }, 2000);

  } catch (err) {
    console.error('[SUPERVISOR-WORKER CRITICAL ERROR] Background worker failed:', err);
    recordWorkerEvent('WORKER_CYCLE_FAILED', { jobName, error: err.message, stack: err.stack });
    try { workerManager.releaseLock(jobName); workerManager.close(); } catch {}
    workerActive = false;
  }
}

// Worker scheduler timers
const workerInitialTimer = setTimeout(triggerWorkerCycle, 5000);
const workerInterval = setInterval(triggerWorkerCycle, 300000); // Every 5 minutes

// ==============================================================================
// 4. AUTOMATED SQLITE BACKUP SCHEDULER
// ==============================================================================
async function triggerBackupJob() {
  console.log('[SUPERVISOR-BACKUP] Running scheduled SQLite atomic backup...');
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
  }
}

// Backup scheduler: initial backup check after 10s, then every 24 hours
const backupInitialTimer = setTimeout(triggerBackupJob, 10000);
const backupInterval = setInterval(triggerBackupJob, 24 * 60 * 60 * 1000);

// ==============================================================================
// 5. GRACEFUL PROCESS SHUTDOWN
// ==============================================================================
function handleShutdown(signal) {
  console.log(`[SUPERVISOR] Received ${signal}. Executing graceful shutdown...`);
  clearTimeout(workerInitialTimer);
  clearInterval(workerInterval);
  clearTimeout(backupInitialTimer);
  clearInterval(backupInterval);

  // Terminate web server
  webProcess.kill(signal);

  // Flush SQLite WAL checkpoint before terminating
  try {
    const db = new Database(dbPath);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[SUPERVISOR] SQLite WAL checkpoint flushed successfully.');
  } catch {}

  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
