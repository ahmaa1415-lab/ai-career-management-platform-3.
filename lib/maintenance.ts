import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { NextResponse } from 'next/server';
import type {
  MaintenanceState,
  MaintenanceLockData
} from './coordination';
import {
  COORDINATION_DB_FILENAME,
  MAINTENANCE_LOCK_FILENAME,
  SUPERVISOR_STATUS_FILENAME,
  MaintenanceActiveError,
  MaintenanceDrainTimeoutError,
  getCrossProcessState,
  isCrossProcessMaintenanceActive,
  isCrossProcessFullyActive,
  requestMaintenanceDrain,
  deactivateCrossProcessMaintenance,
  acquireCrossProcessWriteLease,
  getActiveLeasesCount,
  getActiveLeases,
  spoolDurableAuditEvent,
  flushDurableAudits,
  getPendingAuditCount,
  getCoordinationDbPath,
  getCoordinationDb
} from './coordination';

export type {
  MaintenanceState,
  MaintenanceLockData
};

export {
  COORDINATION_DB_FILENAME,
  MAINTENANCE_LOCK_FILENAME,
  SUPERVISOR_STATUS_FILENAME,
  MaintenanceActiveError,
  MaintenanceDrainTimeoutError,
  getCrossProcessState,
  isCrossProcessMaintenanceActive,
  isCrossProcessFullyActive,
  requestMaintenanceDrain,
  deactivateCrossProcessMaintenance,
  acquireCrossProcessWriteLease,
  getActiveLeasesCount,
  getActiveLeases,
  spoolDurableAuditEvent,
  flushDurableAudits,
  getPendingAuditCount,
  getCoordinationDbPath
};

export const MAINTENANCE_SPILL_FILENAME = '.deferred_audit_events.json';
export const MAINTENANCE_RETRY_AFTER_SECONDS = 300;

// Process-local registry compatibility adapter
class WriteBarrierRegistryAdapter {
  private lastCustomDbPath?: string;

  public getActiveCount(customDbPath?: string): number {
    return getActiveLeasesCount(customDbPath || this.lastCustomDbPath);
  }

  public getActiveOperations(customDbPath?: string): Array<{ id: string; label: string; durationMs: number }> {
    const leases = getActiveLeases(customDbPath || this.lastCustomDbPath);
    const now = Date.now();
    return leases.map(l => ({
      id: l.lease_id,
      label: l.label,
      durationMs: now - l.acquired_at
    }));
  }

  public enter(label: string, customDbPath?: string): { release: () => void } {
    if (customDbPath) this.lastCustomDbPath = customDbPath;
    return acquireCrossProcessWriteLease({
      processType: 'web',
      label,
      customDbPath: customDbPath || this.lastCustomDbPath
    });
  }

  public async awaitDrain(timeoutMs = 10000, customDbPath?: string): Promise<boolean> {
    const targetDbPath = customDbPath || this.lastCustomDbPath;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (getActiveLeasesCount(targetDbPath) === 0) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    return getActiveLeasesCount(targetDbPath) === 0;
  }

  public reset(): void {
    // Clean up active leases registered by this process
    try {
      const cdb = getCoordinationDb(this.lastCustomDbPath);
      cdb.prepare('DELETE FROM active_leases WHERE pid = ?').run(process.pid);
    } catch {}
  }
}

export const writeRegistry = new WriteBarrierRegistryAdapter();

// Paths
export function getMaintenanceLockPath(customDbPath?: string): string {
  const dbPath = customDbPath || process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  return path.join(path.dirname(dbPath), MAINTENANCE_LOCK_FILENAME);
}

export function getSpillAuditPath(customDbPath?: string): string {
  const dbPath = customDbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  return path.join(path.dirname(dbPath), MAINTENANCE_SPILL_FILENAME);
}

export function getSupervisorStatusPath(customDbPath?: string): string {
  const dbPath = customDbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  return path.join(path.dirname(dbPath), SUPERVISOR_STATUS_FILENAME);
}

// State checks
export function getMaintenanceState(customDbPath?: string): MaintenanceState {
  return getCrossProcessState(customDbPath).state;
}

export function isMaintenanceActive(customDbPath?: string): boolean {
  return isCrossProcessMaintenanceActive(customDbPath);
}

export function isMaintenanceFullyActive(customDbPath?: string): boolean {
  return isCrossProcessFullyActive(customDbPath);
}

export function getMaintenanceDetails(customDbPath?: string): MaintenanceLockData | null {
  const { details, state } = getCrossProcessState(customDbPath);
  if (!details) {
    if (state === 'ACTIVE' || state === 'DRAINING') {
      const now = new Date().toISOString();
      return {
        state,
        initiatedAt: now,
        activatedAt: now,
        enabledAt: now,
        reason: 'Maintenance active (fail-closed)',
        operator: 'system',
        pid: process.pid
      };
    }
    return null;
  }

  const timestamp = details.activated_at || details.initiated_at || new Date().toISOString();
  return {
    state: details.state as 'DRAINING' | 'ACTIVE',
    initiatedAt: details.initiated_at,
    activatedAt: details.activated_at,
    enabledAt: timestamp,
    reason: details.reason,
    operator: details.operator,
    pid: process.pid
  };
}

// Lifecycle transitions
export async function activateMaintenanceWithDrain(options: {
  reason?: string;
  operator?: string;
  drainTimeoutMs?: number;
  customDbPath?: string;
  supervisorCheckFn?: () => boolean;
}): Promise<{ success: boolean; state: MaintenanceState; lockPath: string; drainedCount: number }> {
  const result = await requestMaintenanceDrain(options);
  const lockPath = getMaintenanceLockPath(options.customDbPath);
  return {
    success: result.success,
    state: result.state,
    lockPath,
    drainedCount: result.drainedCount
  };
}

export function deactivateMaintenance(customDbPath?: string): { success: boolean; state: MaintenanceState } {
  deactivateCrossProcessMaintenance(customDbPath);
  return { success: true, state: 'INACTIVE' };
}

export async function withWriteLock<T>(label: string, fn: () => Promise<T> | T, customDbPath?: string): Promise<T> {
  const lease = acquireCrossProcessWriteLease({
    processType: 'web',
    label,
    customDbPath
  });
  try {
    return await fn();
  } finally {
    lease.release();
  }
}

export function assertWriteAllowed(operationName = 'database_mutation', customDbPath?: string): void {
  const state = getMaintenanceState(customDbPath);
  if (state !== 'INACTIVE') {
    throw new MaintenanceActiveError(`Write operation "${operationName}" rejected: maintenance state is ${state}`);
  }
}

export function setMaintenanceState(
  active: boolean,
  optionsOrReason?: string | { reason?: string; customDbPath?: string },
  customDbPath?: string
): void {
  let reason = 'Administrative database maintenance';
  let targetDbPath = customDbPath;

  if (typeof optionsOrReason === 'string') {
    reason = optionsOrReason;
  } else if (optionsOrReason && typeof optionsOrReason === 'object') {
    if (optionsOrReason.reason) reason = optionsOrReason.reason;
    if (optionsOrReason.customDbPath) targetDbPath = optionsOrReason.customDbPath;
  }

  if (active) {
    const lockPath = getMaintenanceLockPath(targetDbPath);
    const lockDir = path.dirname(lockPath);
    if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
    const now = new Date().toISOString();
    const payload: any = {
      state: 'ACTIVE',
      enabledAt: now,
      initiatedAt: now,
      activatedAt: now,
      reason,
      operator: process.env.USER || process.env.USERNAME || 'test_runner',
      pid: process.pid
    };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf-8');

    // Also update .coordination.db
    try {
      const cdb = getCoordinationDbPath(targetDbPath);
      import('./coordination').then(({ getCoordinationDb }) => {
        const db = getCoordinationDb(targetDbPath);
        db.prepare(`
          INSERT INTO coordination_state (id, state, reason, operator, initiated_at, activated_at, version)
          VALUES ('global', 'ACTIVE', ?, 'test_runner', ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            state = 'ACTIVE',
            reason = excluded.reason,
            activated_at = excluded.activated_at,
            version = coordination_state.version + 1
        `).run(reason, now, now);
      });
    } catch {}
  } else {
    deactivateCrossProcessMaintenance(targetDbPath);
  }
}

export function createMaintenanceResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Service Unavailable',
      code: 'MAINTENANCE_MODE_ACTIVE',
      message: 'Scheduled database maintenance is currently in progress. All write operations are temporarily suspended. Please retry your request shortly.',
      retryAfter: MAINTENANCE_RETRY_AFTER_SECONDS,
      timestamp: new Date().toISOString()
    },
    {
      status: 503,
      headers: {
        'Retry-After': String(MAINTENANCE_RETRY_AFTER_SECONDS),
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Content-Type': 'application/json'
      }
    }
  );
}

export interface DeepVerificationResult {
  healthy: boolean;
  state: 'CLEAN_UNMIGRATED' | 'MIGRATED' | 'INCONSISTENT' | 'CORRUPTED';
  reason?: string;
  details?: {
    hasUserId: boolean;
    isRecorded: boolean;
    totalEmails?: number;
    attributableEmails?: number;
    unlinkedEmails?: number;
    appliedAt?: string;
  };
}

export function verifyDatabaseStateDeep(customDbPath?: string): DeepVerificationResult {
  const dbPath = customDbPath || process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  if (!fs.existsSync(dbPath)) {
    return {
      healthy: false,
      state: 'CORRUPTED',
      reason: `Target database does not exist at: ${dbPath}`
    };
  }

  let db: InstanceType<typeof Database>;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 5000 });
  } catch (err: any) {
    return {
      healthy: false,
      state: 'CORRUPTED',
      reason: `Failed to open database in read-only mode: ${err.message}`
    };
  }

  try {
    // 1. Primary Engine Integrity Check
    const integrityResult = db.pragma('integrity_check');
    const isIntegrityOk = Array.isArray(integrityResult) && integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok';
    if (!isIntegrityOk) {
      return {
        healthy: false,
        state: 'CORRUPTED',
        reason: `PRAGMA integrity_check failed: ${JSON.stringify(integrityResult)}`
      };
    }

    // 2. Referential Integrity Check
    const fkViolations = db.pragma('foreign_key_check');
    if (Array.isArray(fkViolations) && fkViolations.length > 0) {
      return {
        healthy: false,
        state: 'CORRUPTED',
        reason: `PRAGMA foreign_key_check failed with ${fkViolations.length} violation(s): ${JSON.stringify(fkViolations)}`
      };
    }

    // Check emails table exists
    const hasEmailsTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'").get());
    if (!hasEmailsTable) {
      return {
        healthy: false,
        state: 'INCONSISTENT',
        reason: "Core table 'emails' does not exist in sqlite_master."
      };
    }

    // 3. Schema & Column Presence
    const emailCols = (db.prepare('PRAGMA table_info(emails)').all() as any[]).map(c => c.name);
    const hasUserId = emailCols.includes('user_id');

    // 4. Migration Tracker Check
    const hasMigrationTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
    const recorded = hasMigrationTable
      ? (db.prepare("SELECT * FROM schema_migrations WHERE id = 'add_user_id_to_emails'").get() as any)
      : null;
    const isRecorded = Boolean(recorded);

    // Case 1: Clean Unmigrated Baseline
    if (!hasUserId && !isRecorded) {
      // Assert no orphan migration indexes exist
      const orphanIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_emails_user_id', 'idx_emails_user_category')").all();
      if (orphanIdx.length > 0) {
        return {
          healthy: false,
          state: 'INCONSISTENT',
          reason: `Orphan index detected while user_id column is absent: ${JSON.stringify(orphanIdx)}`
        };
      }
      return {
        healthy: true,
        state: 'CLEAN_UNMIGRATED',
        details: { hasUserId: false, isRecorded: false }
      };
    }

    // Case 2: Inconsistent / Split State
    if (hasUserId !== isRecorded) {
      return {
        healthy: false,
        state: 'INCONSISTENT',
        reason: `Partial migration state detected: hasUserId=${hasUserId}, isRecorded=${isRecorded}. Migration did not commit atomically.`,
        details: { hasUserId, isRecorded }
      };
    }

    // Case 3: Fully Migrated (hasUserId === true && isRecorded === true)
    // Check covering indexes exist
    const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='emails'").all() as any[]).map(i => i.name);
    const hasIndexUser = indexes.includes('idx_emails_user_id');
    const hasIndexUserCat = indexes.includes('idx_emails_user_category');
    if (!hasIndexUser || !hasIndexUserCat) {
      return {
        healthy: false,
        state: 'INCONSISTENT',
        reason: `Required indexes missing: idx_emails_user_id=${hasIndexUser}, idx_emails_user_category=${hasIndexUserCat}`,
        details: { hasUserId, isRecorded }
      };
    }

    // Check canonical checksum if SQL file exists
    const migrationFilePath = path.join(process.cwd(), 'migrations', 'add_user_id_to_emails.sql');
    if (fs.existsSync(migrationFilePath)) {
      const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
      const expectedChecksum = crypto.createHash('sha256').update(sqlContent).digest('hex');
      if (recorded.checksum && recorded.checksum !== 'embedded_fallback' && recorded.checksum !== expectedChecksum) {
        return {
          healthy: false,
          state: 'INCONSISTENT',
          reason: `Migration checksum mismatch: recorded="${recorded.checksum}", expected="${expectedChecksum}". Possible untracked drift.`,
          details: { hasUserId, isRecorded }
        };
      }
    }

    // Check attributable emails backfill completeness:
    // Criteria: Any email where application_id is linked to an existing application owned by an existing user
    // MUST have user_id = applications.user_id.
    const attributableIncomplete = db.prepare(`
      SELECT COUNT(*) as c
      FROM emails e
      JOIN applications a ON a.id = e.application_id
      JOIN users u ON u.id = a.user_id
      WHERE e.user_id IS NULL OR e.user_id != a.user_id
    `).get() as any;

    if (attributableIncomplete && attributableIncomplete.c > 0) {
      return {
        healthy: false,
        state: 'INCONSISTENT',
        reason: `Attributable email backfill incomplete: ${attributableIncomplete.c} email(s) have application ownership but user_id is null or mismatched.`,
        details: { hasUserId, isRecorded }
      };
    }

    // Check historical unlinked emails:
    // Any email without a valid application/user chain MUST NOT be assigned a fake/default user_id.
    const unlinkedAssigned = db.prepare(`
      SELECT COUNT(*) as c
      FROM emails e
      WHERE (e.application_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = e.application_id
      ))
      AND e.user_id IS NOT NULL
    `).get() as any;

    if (unlinkedAssigned && unlinkedAssigned.c > 0) {
      return {
        healthy: false,
        state: 'INCONSISTENT',
        reason: `Data integrity violation: ${unlinkedAssigned.c} unlinked email(s) were assigned a user_id without valid application/user ownership.`,
        details: { hasUserId, isRecorded }
      };
    }

    const totalEmails = (db.prepare('SELECT COUNT(*) as c FROM emails').get() as any)?.c || 0;
    const attributableCount = (db.prepare(`
      SELECT COUNT(*) as c FROM emails e
      JOIN applications a ON a.id = e.application_id
      JOIN users u ON u.id = a.user_id
    `).get() as any)?.c || 0;
    const unlinkedCount = totalEmails - attributableCount;

    return {
      healthy: true,
      state: 'MIGRATED',
      details: {
        hasUserId: true,
        isRecorded: true,
        totalEmails,
        attributableEmails: attributableCount,
        unlinkedEmails: unlinkedCount,
        appliedAt: recorded.applied_at
      }
    };
  } finally {
    try { db.close(); } catch {}
  }
}
