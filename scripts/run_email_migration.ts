#!/usr/bin/env node
/**
 * Dedicated Administrative Migration CLI Entrypoint: add_user_id_to_emails
 *
 * Implements strict pre-flight safeguards, positive staging environment verification,
 * unconditional production rejection, maintenance quiescence assertion,
 * foreign-key verification, and invokes the canonical runner from lib/migrations.ts.
 *
 * Usage:
 *   STAGING_MODE=true STAGING_ACCESS_CODE=xxxxxxxx ALLOW_STAGING_MIGRATION=true \
 *   DATABASE_PATH=/app/data/career_app.db node scripts/run_email_migration.mjs
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runEmailUserIdMigration, EMAIL_USER_ID_MIGRATION_ID, MigrationResult } from '../lib/migrations';
import { isMaintenanceFullyActive, isMaintenanceActive } from '../lib/maintenance';
import { getActiveLeasesCount, deactivateCrossProcessMaintenance, requestMaintenanceDrainSync } from '../lib/coordination';
import { SQLiteBackupManager } from './backup_manager.mjs';

// ==============================================================================
// 1. ENVIRONMENT VALIDATION & HARDENED STAGING SAFEGUARDS
// ==============================================================================
export function validateEnvironmentAndSafeguards(): { dbPath: string; isDryRun: boolean } {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const explicitTarget = (process.env.TARGET_ENVIRONMENT || '').toLowerCase();
  const railwayEnv = (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase();
  const stagingMode = process.env.STAGING_MODE === 'true';
  const stagingAccessCode = process.env.STAGING_ACCESS_CODE || '';
  const allowStagingMigration = process.env.ALLOW_STAGING_MIGRATION === 'true';
  const isDryRun = process.env.DRY_RUN === 'true';

  // 1. Unconditional Production Rejections
  if (explicitTarget === 'production' || explicitTarget === 'prod' || explicitTarget === 'live') {
    throw new Error(`FATAL SAFEGUARD: Execution explicitly refused against production environment (TARGET_ENVIRONMENT=${explicitTarget}).`);
  }

  if (railwayEnv.includes('prod') || railwayEnv.includes('live') || railwayEnv === 'main') {
    throw new Error(`FATAL SAFEGUARD: Execution explicitly refused against Railway production environment (RAILWAY_ENVIRONMENT=${railwayEnv}).`);
  }

  // 2. Positive Staging Proof Requirement
  const hasStagingCredentials = stagingMode && stagingAccessCode.length >= 8;
  const isRailwayStaging = railwayEnv === 'staging';
  const isPositiveStaging = hasStagingCredentials || isRailwayStaging;

  if (!isPositiveStaging) {
    throw new Error(
      'FATAL SAFEGUARD: Target environment is NOT positively verified as Staging. ' +
      'Requires either RAILWAY_ENVIRONMENT=staging or (STAGING_MODE=true and valid STAGING_ACCESS_CODE).'
    );
  }

  // 3. Defense-in-depth: Explicit Staging Migration Consent Flag
  if (!allowStagingMigration) {
    throw new Error(
      'FATAL SAFEGUARD: Staging environment verified, but ALLOW_STAGING_MIGRATION is not set to "true". Refusing execution.'
    );
  }

  // 4. Validate Target Database Path
  const rawPath = process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH;
  if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new Error('FATAL CONFIGURATION: Database path is missing. Set MIGRATION_DATABASE_PATH or DATABASE_PATH.');
  }

  const resolvedPath = path.resolve(rawPath.trim());

  if (!resolvedPath.endsWith('.db')) {
    throw new Error(`FATAL CONFIGURATION: Database path must point to a .db file, received: ${resolvedPath}`);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`FATAL CONFIGURATION: Database file does not physically exist at: ${resolvedPath}. Refusing to create empty database.`);
  }

  // Verify write permission on containing directory
  const dbDir = path.dirname(resolvedPath);
  try {
    fs.accessSync(dbDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err: any) {
    throw new Error(`FATAL PERMISSION: Containing directory is not read/write accessible: ${dbDir} (${err.message})`);
  }

  // 5. Maintenance Mode Quiescence Check
  const bypassMaintenance = process.env.BYPASS_MAINTENANCE_CHECK === 'true';
  if (!bypassMaintenance && !isDryRun) {
    if (!isMaintenanceFullyActive(resolvedPath)) {
      throw new Error(
        'FATAL SAFEGUARD: Database is not in verified ACTIVE maintenance mode. ' +
        'Execute "node scripts/maintenance_control.mjs --enable" to drain writes before applying migration.'
      );
    }
    const leaseCount = getActiveLeasesCount(resolvedPath);
    if (leaseCount > 0) {
      throw new Error(
        `FATAL SAFEGUARD: Target database still has ${leaseCount} active cross-process write lease(s). Refusing execution.`
      );
    }
  }

  return { dbPath: resolvedPath, isDryRun };
}

// ==============================================================================
// 2. MIGRATION RUNNER INVOCATION
// ==============================================================================
export function executeMigrationCli(customDbPath?: string): MigrationResult {
  const { dbPath, isDryRun } = customDbPath
    ? { dbPath: customDbPath, isDryRun: false }
    : validateEnvironmentAndSafeguards();

  console.log('=== [ADMINISTRATIVE MIGRATION RUNNER: add_user_id_to_emails] ===');
  console.log(` - Target Database:  ${dbPath}`);
  console.log(` - Migration ID:     ${EMAIL_USER_ID_MIGRATION_ID}`);
  console.log(` - Timestamp:        ${new Date().toISOString()}`);
  console.log(` - Dry Run Mode:     ${isDryRun}`);

  // Open dedicated connection
  const db = new Database(dbPath, { timeout: 15000 });

  try {
    // 1. Enforce WAL journal mode
    db.pragma('journal_mode = WAL');

    // 2. Foreign key enforcement check
    db.pragma('foreign_keys = ON');
    const fkEnabled = db.pragma('foreign_keys', { simple: true });
    if (fkEnabled !== 1) {
      throw new Error('FATAL: Failed to enable SQLite foreign_keys pragma.');
    }

    // 3. Explicitly enforce and verify synchronous = FULL for power-loss durability
    db.pragma('synchronous = FULL');
    const synValue = db.pragma('synchronous', { simple: true });
    if (synValue !== 2) {
      throw new Error(`FATAL: Failed to set PRAGMA synchronous = FULL (effective value: ${synValue}).`);
    }

    // Verify connection is not already in an unexpected transaction
    if (db.inTransaction) {
      throw new Error('FATAL: Database connection is unexpectedly already inside an active transaction.');
    }

    if (isDryRun) {
      console.log('[DRY-RUN] Preflight checks passed. Skipping schema execution in dry-run mode.');
      return {
        status: 'SUCCESS',
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        durationMs: 0,
        details: {
          hasUserIdColumn: false,
          isRecordedInTracker: false
        }
      };
    }

    // 4. Capture data_version and create dedicated pre-migration backup before acquiring transaction lock
    if (!isMaintenanceActive(dbPath)) {
      requestMaintenanceDrainSync({ customDbPath: dbPath, reason: 'migration_preflight' });
    }

    const dataVersionBefore = db.pragma('data_version', { simple: true }) as number;
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    console.log(`[MIGRATION-BACKUP] Creating pre-migration safety backup in ${backupDir}...`);
    const backupResult = SQLiteBackupManager.createPreMigrationBackup({
      sourceDbPath: dbPath,
      backupDir,
      callerDb: db
    });
    console.log(`[MIGRATION-BACKUP] Pre-migration backup captured and verified: ${backupResult.backupFileName}`);
    console.log(` - SHA-256:      ${backupResult.sha256}`);
    console.log(` - data_version: ${dataVersionBefore}`);

    // 5. Execute canonical runner with expected data_version assertion inside BEGIN EXCLUSIVE
    const result = runEmailUserIdMigration(db, { expectedDataVersion: dataVersionBefore });

    // 6. Post-commit WAL Checkpoint handling
    if (result.status === 'SUCCESS' || result.status === 'ALREADY_APPLIED') {
      try {
        const ckpt = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number; log: number; checkpointed: number }>;
        if (Array.isArray(ckpt) && ckpt.length > 0) {
          if (ckpt[0].busy !== 0) {
            console.warn(`[MIGRATION-CHECKPOINT] wal_checkpoint(TRUNCATE) returned busy=${ckpt[0].busy}, log=${ckpt[0].log}, checkpointed=${ckpt[0].checkpointed}. Committed safely, pending background truncation.`);
          } else {
            console.log(`[MIGRATION-CHECKPOINT] wal_checkpoint(TRUNCATE) succeeded: log=${ckpt[0].log}, checkpointed=${ckpt[0].checkpointed}.`);
          }
        }
      } catch (ckptErr: any) {
        console.warn(`[MIGRATION-CHECKPOINT] Non-fatal checkpoint error: ${ckptErr.message}`);
      }

      // 7. Deactivate cross-process maintenance coordination
      try {
        deactivateCrossProcessMaintenance(dbPath);
        console.log('[MIGRATION-COORDINATION] Deactivated cross-process maintenance mode.');
      } catch (coordErr: any) {
        console.warn(`[MIGRATION-COORDINATION] Failed to deactivate maintenance mode: ${coordErr.message}`);
      }
    }

    // Sanitize and format structured output
    const sanitizedOutput = {
      status: result.status,
      migrationId: result.migrationId,
      appliedAt: result.appliedAt,
      durationMs: result.durationMs,
      checksum: result.checksum,
      error: result.error,
      details: result.details
    };

    console.log('\n=== [MIGRATION RESULT SUMMARY] ===');
    console.log(JSON.stringify(sanitizedOutput, null, 2));

    if (result.status === 'FAILED' || result.status === 'INCONSISTENT_STATE' || result.status === 'SCHEMA_DRIFT') {
      console.error(`\n[FATAL] Migration terminated with unrecoverable status: ${result.status}`);
      process.exitCode = 1;
    } else {
      console.log(`\n[SUCCESS] Migration completed with status: ${result.status}`);
      process.exitCode = 0;
    }

    return result;
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Standalone execution entrypoint
const isDirectEntry = process.argv[1]?.endsWith('run_email_migration.ts') || process.argv[1]?.endsWith('run_email_migration.mjs');
if (isDirectEntry) {
  try {
    executeMigrationCli();
  } catch (err: any) {
    console.error('\n[FATAL MIGRATION RUNNER ERROR]:', err.message);
    process.exit(1);
  }
}
