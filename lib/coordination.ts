import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Phase 4: SQLite-Backed Cross-Process Coordination Subsystem
 *
 * Provides genuine multi-process ACID coordination via a dedicated
 * sidecar SQLite database: /app/data/.coordination.db
 *
 * Guarantees:
 * 1. Cross-process atomic state transitions (INACTIVE -> DRAINING -> ACTIVE).
 * 2. Cross-process active write lease tracking across independent Node.js processes.
 * 3. Automatic stale lease expiration (TTL) for crash recovery.
 * 4. Durable, crash-safe transactional audit spool (outbox pattern).
 * 5. Zero locking contention with the main database (career_app.db).
 */

export const COORDINATION_DB_FILENAME = '.coordination.db';
export const MAINTENANCE_LOCK_FILENAME = '.maintenance_lock';
export const SUPERVISOR_STATUS_FILENAME = '.supervisor_status.json';
export const DEFAULT_LEASE_TTL_MS = 10000;
export const DEFAULT_DRAIN_TIMEOUT_MS = 15000;

export type MaintenanceState = 'INACTIVE' | 'DRAINING' | 'ACTIVE';

export interface MaintenanceLockData {
  state: 'DRAINING' | 'ACTIVE';
  initiatedAt: string;
  activatedAt?: string;
  enabledAt?: string;
  reason: string;
  operator: string;
  pid: number;
}

export interface CoordinationStateRecord {
  id: string;
  state: MaintenanceState;
  reason: string;
  operator: string;
  initiated_at: string;
  activated_at?: string;
  version: number;
}

export interface ActiveLeaseRecord {
  lease_id: string;
  process_type: string;
  pid: number;
  label: string;
  acquired_at: number;
  expires_at: number;
}

export interface DurableAuditEvent {
  id: string;
  action: string;
  details: Record<string, any> | string;
  timestamp?: string;
}

export class MaintenanceActiveError extends Error {
  code = 'MAINTENANCE_MODE_ACTIVE';
  constructor(message = 'Database write rejected: maintenance mode is active or draining.') {
    super(message);
    this.name = 'MaintenanceActiveError';
  }
}

export class MaintenanceDrainTimeoutError extends Error {
  code = 'MAINTENANCE_DRAIN_TIMEOUT';
  constructor(message = 'Failed to achieve write quiescence across processes within timeout.') {
    super(message);
    this.name = 'MaintenanceDrainTimeoutError';
  }
}

// Process-local cached connection to .coordination.db
const cdbCache = new Map<string, InstanceType<typeof Database>>();

export function closeCoordinationDbCache(): void {
  for (const [key, db] of cdbCache.entries()) {
    try {
      if (db.open) db.close();
    } catch {}
  }
  cdbCache.clear();
}

export function getCoordinationDbPath(customDbPath?: string): string {
  const dbPath = customDbPath || process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  return path.join(path.dirname(dbPath), COORDINATION_DB_FILENAME);
}

export function getCoordinationDb(customDbPath?: string): InstanceType<typeof Database> {
  const cdbPath = getCoordinationDbPath(customDbPath);
  const existing = cdbCache.get(cdbPath);
  if (existing && existing.open) {
    return existing;
  }

  const cdbDir = path.dirname(cdbPath);
  if (!fs.existsSync(cdbDir)) {
    fs.mkdirSync(cdbDir, { recursive: true });
  }

  const cdb = new Database(cdbPath, { timeout: 10000 });
  cdb.pragma('journal_mode = WAL');
  cdb.pragma('busy_timeout = 10000');
  cdb.pragma('synchronous = NORMAL');

  // Initialize schema
  cdb.exec(`
    CREATE TABLE IF NOT EXISTS coordination_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      reason TEXT,
      operator TEXT,
      initiated_at TEXT,
      activated_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS active_leases (
      lease_id TEXT PRIMARY KEY,
      process_type TEXT NOT NULL,
      pid INTEGER NOT NULL,
      label TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS durable_audit_spool (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      flushed_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );

    CREATE INDEX IF NOT EXISTS idx_active_leases_expires ON active_leases(expires_at);
    CREATE INDEX IF NOT EXISTS idx_durable_audit_status ON durable_audit_spool(status);
  `);

  cdbCache.set(cdbPath, cdb);
  return cdb;
}

export function purgeExpiredLeases(customDbPath?: string): number {
  try {
    const cdb = getCoordinationDb(customDbPath);
    const now = Date.now();
    const res = cdb.prepare('DELETE FROM active_leases WHERE expires_at <= ?').run(now);
    return res.changes;
  } catch {
    return 0;
  }
}

export function getCrossProcessState(customDbPath?: string): {
  state: MaintenanceState;
  details: CoordinationStateRecord | null;
} {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return {
      state: 'ACTIVE',
      details: {
        id: 'global',
        state: 'ACTIVE',
        reason: 'MAINTENANCE_MODE environment variable override',
        operator: 'system_env',
        initiated_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
        version: 1
      }
    };
  }

  try {
    // Check for legacy or parallel .maintenance_lock file for backward compatibility & fail-closed security
    const lockPath = path.join(path.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
    if (fs.existsSync(lockPath)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        if (fileData.state === 'DRAINING' || fileData.state === 'ACTIVE') {
          return {
            state: fileData.state,
            details: {
              id: 'global',
              state: fileData.state,
              reason: fileData.reason || 'Legacy lockfile sentinel',
              operator: fileData.operator || 'file_sentinel',
              initiated_at: fileData.initiatedAt || new Date().toISOString(),
              version: 1
            }
          };
        }
      } catch {
        // Corrupted lockfile must fail-closed to ACTIVE
        return {
          state: 'ACTIVE',
          details: null
        };
      }
    }

    const cdb = getCoordinationDb(customDbPath);
    const row = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get() as any;
    if (!row) {
      return { state: 'INACTIVE', details: null };
    }

    return {
      state: row.state as MaintenanceState,
      details: row
    };
  } catch (err: any) {
    // Fail-closed on database read error
    console.error('[COORDINATION CRITICAL] Error reading coordination state. Failing closed:', err?.message);
    return {
      state: 'ACTIVE',
      details: null
    };
  }
}

export function isCrossProcessMaintenanceActive(customDbPath?: string): boolean {
  const { state } = getCrossProcessState(customDbPath);
  return state === 'DRAINING' || state === 'ACTIVE';
}

export function isCrossProcessFullyActive(customDbPath?: string): boolean {
  return getCrossProcessState(customDbPath).state === 'ACTIVE';
}

export function acquireCrossProcessWriteLease(options: {
  processType: 'web' | 'worker' | 'backup' | 'script';
  label: string;
  ttlMs?: number;
  customDbPath?: string;
}): { leaseId: string; release: () => void } {
  const customDbPath = options.customDbPath;
  const { state } = getCrossProcessState(customDbPath);

  if (state !== 'INACTIVE') {
    throw new MaintenanceActiveError(`Write rejected: cross-process maintenance state is ${state} (${options.label})`);
  }

  const cdb = getCoordinationDb(customDbPath);
  const leaseId = `lease_${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const ttlMs = options.ttlMs || DEFAULT_LEASE_TTL_MS;
  const expiresAt = now + ttlMs;

  cdb.prepare(`
    INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leaseId, options.processType, process.pid, options.label, now, expiresAt);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      cdb.prepare('DELETE FROM active_leases WHERE lease_id = ?').run(leaseId);
    } catch {}
  };

  return { leaseId, release };
}

export function getActiveLeasesCount(customDbPath?: string): number {
  try {
    purgeExpiredLeases(customDbPath);
    const cdb = getCoordinationDb(customDbPath);
    const row = cdb.prepare('SELECT COUNT(*) as c FROM active_leases WHERE expires_at > ?').get(Date.now()) as any;
    return row?.c || 0;
  } catch {
    return 0;
  }
}

export function getActiveLeases(customDbPath?: string): ActiveLeaseRecord[] {
  try {
    purgeExpiredLeases(customDbPath);
    const cdb = getCoordinationDb(customDbPath);
    return cdb.prepare('SELECT * FROM active_leases WHERE expires_at > ?').all(Date.now()) as ActiveLeaseRecord[];
  } catch {
    return [];
  }
}

export async function requestMaintenanceDrain(options: {
  reason?: string;
  operator?: string;
  drainTimeoutMs?: number;
  customDbPath?: string;
}): Promise<{ success: boolean; state: MaintenanceState; drainedCount: number }> {
  const customDbPath = options.customDbPath;
  const cdb = getCoordinationDb(customDbPath);
  const timeoutMs = options.drainTimeoutMs || DEFAULT_DRAIN_TIMEOUT_MS;
  const reason = options.reason || 'Scheduled database schema migration';
  const operator = options.operator || process.env.USER || process.env.USERNAME || 'railway_operator';

  // Step 1: Transition to DRAINING state in an atomic transaction
  const setDraining = cdb.transaction(() => {
    const existing = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get() as any;
    if (existing && existing.state === 'ACTIVE') {
      return { alreadyActive: true };
    }

    const now = new Date().toISOString();
    cdb.prepare(`
      INSERT INTO coordination_state (id, state, reason, operator, initiated_at, version)
      VALUES ('global', 'DRAINING', ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        state = 'DRAINING',
        reason = excluded.reason,
        operator = excluded.operator,
        initiated_at = excluded.initiated_at,
        activated_at = NULL,
        version = coordination_state.version + 1
    `).run(reason, operator, now);

    return { alreadyActive: false };
  });

  const drainResult = setDraining();
  if (drainResult.alreadyActive) {
    console.log('[COORDINATION] Maintenance is already ACTIVE.');
    return { success: true, state: 'ACTIVE', drainedCount: 0 };
  }

  // Also write .maintenance_lock for legacy watchers
  const lockPath = path.join(path.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ state: 'DRAINING', reason, operator, initiatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch {}

  console.log('[COORDINATION] State transitioned to DRAINING across all processes.');

  // Step 2: Poll active leases until count reaches 0 or timeout
  const start = Date.now();
  let drained = false;

  const supPath = path.join(path.dirname(getCoordinationDbPath(customDbPath)), SUPERVISOR_STATUS_FILENAME);

  while (Date.now() - start < timeoutMs) {
    purgeExpiredLeases(customDbPath);

    const leaseCount = getActiveLeasesCount(customDbPath);

    // Check supervisor status
    let supervisorIdle = true;
    if (fs.existsSync(supPath)) {
      try {
        const sup = JSON.parse(fs.readFileSync(supPath, 'utf-8'));
        if (sup.workerActive || sup.backupActive) {
          supervisorIdle = false;
        }
      } catch {}
    }

    if (leaseCount === 0 && supervisorIdle) {
      drained = true;
      break;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  if (!drained) {
    // Abort and restore INACTIVE
    cdb.prepare(`
      UPDATE coordination_state
      SET state = 'INACTIVE', version = version + 1
      WHERE id = 'global'
    `).run();
    try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}

    const remaining = getActiveLeases(customDbPath);
    throw new MaintenanceDrainTimeoutError(
      `Cross-process drain timeout exceeded (${timeoutMs}ms). In-flight leases remaining: ${JSON.stringify(remaining)}`
    );
  }

  // Step 3: Promote to ACTIVE in an atomic transaction
  const now = new Date().toISOString();
  cdb.prepare(`
    UPDATE coordination_state
    SET state = 'ACTIVE', activated_at = ?, version = version + 1
    WHERE id = 'global'
  `).run(now);

  try {
    fs.writeFileSync(lockPath, JSON.stringify({ state: 'ACTIVE', reason, operator, activatedAt: now }, null, 2), 'utf-8');
  } catch {}

  console.log('[COORDINATION] Zero writers verified across all processes. State is now ACTIVE.');
  return { success: true, state: 'ACTIVE', drainedCount: 0 };
}

export function requestMaintenanceDrainSync(options: {
  reason?: string;
  operator?: string;
  customDbPath?: string;
} = {}): { success: boolean; state: MaintenanceState } {
  const customDbPath = options.customDbPath;
  const cdb = getCoordinationDb(customDbPath);
  const reason = options.reason || 'Scheduled database schema migration';
  const operator = options.operator || process.env.USER || process.env.USERNAME || 'railway_operator';

  // Check if already active
  const existing = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get() as any;
  if (existing && existing.state === 'ACTIVE') {
    return { success: true, state: 'ACTIVE' };
  }

  // Ensure zero in-flight leases
  purgeExpiredLeases(customDbPath);
  const leaseCount = getActiveLeasesCount(customDbPath);
  if (leaseCount > 0) {
    throw new MaintenanceDrainTimeoutError(`Cannot synchronize maintenance drain synchronously: ${leaseCount} in-flight leases remain.`);
  }

  const now = new Date().toISOString();
  cdb.prepare(`
    INSERT INTO coordination_state (id, state, reason, operator, initiated_at, activated_at, version)
    VALUES ('global', 'ACTIVE', ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      state = 'ACTIVE',
      reason = excluded.reason,
      operator = excluded.operator,
      initiated_at = excluded.initiated_at,
      activated_at = excluded.activated_at,
      version = coordination_state.version + 1
  `).run(reason, operator, now, now);

  const lockPath = path.join(path.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ state: 'ACTIVE', reason, operator, activatedAt: now }, null, 2), 'utf-8');
  } catch {}

  console.log('[COORDINATION] Synchronous drain verified (0 writers). State is ACTIVE.');
  return { success: true, state: 'ACTIVE' };
}

export function deactivateCrossProcessMaintenance(customDbPath?: string): void {
  const cdb = getCoordinationDb(customDbPath);
  cdb.prepare(`
    INSERT INTO coordination_state (id, state, reason, operator, version)
    VALUES ('global', 'INACTIVE', 'Maintenance completed', 'system', 1)
    ON CONFLICT(id) DO UPDATE SET
      state = 'INACTIVE',
      activated_at = NULL,
      version = coordination_state.version + 1
  `).run();

  const lockPath = path.join(path.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {}

  console.log('[COORDINATION] Cross-process maintenance deactivated. State is INACTIVE.');
}

// ==============================================================================
// DURABLE AUDIT SPOOL (TRANSACTIONAL OUTBOX)
// ==============================================================================

export function spoolDurableAuditEvent(event: DurableAuditEvent, customDbPath?: string): void {
  const cdb = getCoordinationDb(customDbPath);
  const now = event.timestamp || new Date().toISOString();
  const detailsStr = typeof event.details === 'string' ? event.details : JSON.stringify(event.details);

  cdb.prepare(`
    INSERT INTO durable_audit_spool (id, action, details, created_at, status)
    VALUES (?, ?, ?, ?, 'PENDING')
    ON CONFLICT(id) DO NOTHING
  `).run(event.id, event.action, detailsStr, now);

  console.log(`[DURABLE-AUDIT-SPOOL] Event "${event.action}" (${event.id}) persisted to outbox.`);
}

export function flushDurableAudits(targetDb: InstanceType<typeof Database>, customDbPath?: string): number {
  const cdb = getCoordinationDb(customDbPath);
  const pending = cdb.prepare("SELECT * FROM durable_audit_spool WHERE status = 'PENDING' ORDER BY created_at ASC").all() as any[];

  if (pending.length === 0) return 0;

  console.log(`[DURABLE-AUDIT-FLUSH] Flushing ${pending.length} pending audit events to primary database...`);

  const insertStmt = targetDb.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details, timestamp)
    VALUES (?, 'system_worker', ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  const flushTransaction = targetDb.transaction(() => {
    for (const ev of pending) {
      insertStmt.run(ev.id, ev.action, ev.details, ev.created_at);
    }
  });

  flushTransaction();

  // Mark flushed in coordination database
  const now = new Date().toISOString();
  const markFlushed = cdb.transaction(() => {
    const updateStmt = cdb.prepare("UPDATE durable_audit_spool SET status = 'FLUSHED', flushed_at = ? WHERE id = ?");
    for (const ev of pending) {
      updateStmt.run(now, ev.id);
    }
  });

  markFlushed();
  console.log(`[DURABLE-AUDIT-FLUSH] Successfully flushed ${pending.length} audit events.`);
  return pending.length;
}

export function getPendingAuditCount(customDbPath?: string): number {
  try {
    const cdb = getCoordinationDb(customDbPath);
    const row = cdb.prepare("SELECT COUNT(*) as c FROM durable_audit_spool WHERE status = 'PENDING'").get() as any;
    return row?.c || 0;
  } catch {
    return 0;
  }
}
