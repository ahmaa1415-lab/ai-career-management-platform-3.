#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};

// lib/coordination.ts
import Database from "better-sqlite3";
import path2 from "path";
import fs2 from "fs";
function getCoordinationDbPath(customDbPath) {
  const dbPath = customDbPath || process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH || path2.join(process.cwd(), "data", "career_app.db");
  return path2.join(path2.dirname(dbPath), COORDINATION_DB_FILENAME);
}
function getCoordinationDb2(customDbPath) {
  const cdbPath = getCoordinationDbPath(customDbPath);
  const existing = cdbCache.get(cdbPath);
  if (existing && existing.open) {
    return existing;
  }
  const cdbDir = path2.dirname(cdbPath);
  if (!fs2.existsSync(cdbDir)) {
    fs2.mkdirSync(cdbDir, { recursive: true });
  }
  const cdb = new Database(cdbPath, { timeout: 1e4 });
  cdb.pragma("journal_mode = WAL");
  cdb.pragma("busy_timeout = 10000");
  cdb.pragma("synchronous = NORMAL");
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
function purgeExpiredLeases(customDbPath) {
  try {
    const cdb = getCoordinationDb2(customDbPath);
    const now = Date.now();
    const res = cdb.prepare("DELETE FROM active_leases WHERE expires_at <= ?").run(now);
    return res.changes;
  } catch {
    return 0;
  }
}
function getCrossProcessState(customDbPath) {
  if (process.env.MAINTENANCE_MODE === "true") {
    return {
      state: "ACTIVE",
      details: {
        id: "global",
        state: "ACTIVE",
        reason: "MAINTENANCE_MODE environment variable override",
        operator: "system_env",
        initiated_at: (/* @__PURE__ */ new Date()).toISOString(),
        activated_at: (/* @__PURE__ */ new Date()).toISOString(),
        version: 1
      }
    };
  }
  try {
    const lockPath = path2.join(path2.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
    if (fs2.existsSync(lockPath)) {
      try {
        const fileData = JSON.parse(fs2.readFileSync(lockPath, "utf-8"));
        if (fileData.state === "DRAINING" || fileData.state === "ACTIVE") {
          return {
            state: fileData.state,
            details: {
              id: "global",
              state: fileData.state,
              reason: fileData.reason || "Legacy lockfile sentinel",
              operator: fileData.operator || "file_sentinel",
              initiated_at: fileData.initiatedAt || (/* @__PURE__ */ new Date()).toISOString(),
              version: 1
            }
          };
        }
      } catch {
        return {
          state: "ACTIVE",
          details: null
        };
      }
    }
    const cdb = getCoordinationDb2(customDbPath);
    const row = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get();
    if (!row) {
      return { state: "INACTIVE", details: null };
    }
    return {
      state: row.state,
      details: row
    };
  } catch (err) {
    console.error("[COORDINATION CRITICAL] Error reading coordination state. Failing closed:", err?.message);
    return {
      state: "ACTIVE",
      details: null
    };
  }
}
function isCrossProcessMaintenanceActive(customDbPath) {
  const { state } = getCrossProcessState(customDbPath);
  return state === "DRAINING" || state === "ACTIVE";
}
function isCrossProcessFullyActive(customDbPath) {
  return getCrossProcessState(customDbPath).state === "ACTIVE";
}
function acquireCrossProcessWriteLease(options) {
  const customDbPath = options.customDbPath;
  const { state } = getCrossProcessState(customDbPath);
  if (state !== "INACTIVE") {
    throw new MaintenanceActiveError(`Write rejected: cross-process maintenance state is ${state} (${options.label})`);
  }
  const cdb = getCoordinationDb2(customDbPath);
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
      cdb.prepare("DELETE FROM active_leases WHERE lease_id = ?").run(leaseId);
    } catch {
    }
  };
  return { leaseId, release };
}
function getActiveLeasesCount(customDbPath) {
  try {
    purgeExpiredLeases(customDbPath);
    const cdb = getCoordinationDb2(customDbPath);
    const row = cdb.prepare("SELECT COUNT(*) as c FROM active_leases WHERE expires_at > ?").get(Date.now());
    return row?.c || 0;
  } catch {
    return 0;
  }
}
function getActiveLeases(customDbPath) {
  try {
    purgeExpiredLeases(customDbPath);
    const cdb = getCoordinationDb2(customDbPath);
    return cdb.prepare("SELECT * FROM active_leases WHERE expires_at > ?").all(Date.now());
  } catch {
    return [];
  }
}
function requestMaintenanceDrainSync(options = {}) {
  const customDbPath = options.customDbPath;
  const cdb = getCoordinationDb2(customDbPath);
  const reason = options.reason || "Scheduled database schema migration";
  const operator = options.operator || process.env.USER || process.env.USERNAME || "railway_operator";
  const existing = cdb.prepare("SELECT * FROM coordination_state WHERE id = 'global'").get();
  if (existing && existing.state === "ACTIVE") {
    return { success: true, state: "ACTIVE" };
  }
  purgeExpiredLeases(customDbPath);
  const leaseCount = getActiveLeasesCount(customDbPath);
  if (leaseCount > 0) {
    throw new MaintenanceDrainTimeoutError(`Cannot synchronize maintenance drain synchronously: ${leaseCount} in-flight leases remain.`);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
  const lockPath = path2.join(path2.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
  try {
    fs2.writeFileSync(lockPath, JSON.stringify({ state: "ACTIVE", reason, operator, activatedAt: now }, null, 2), "utf-8");
  } catch {
  }
  console.log("[COORDINATION] Synchronous drain verified (0 writers). State is ACTIVE.");
  return { success: true, state: "ACTIVE" };
}
function deactivateCrossProcessMaintenance(customDbPath) {
  const cdb = getCoordinationDb2(customDbPath);
  cdb.prepare(`
    INSERT INTO coordination_state (id, state, reason, operator, version)
    VALUES ('global', 'INACTIVE', 'Maintenance completed', 'system', 1)
    ON CONFLICT(id) DO UPDATE SET
      state = 'INACTIVE',
      activated_at = NULL,
      version = coordination_state.version + 1
  `).run();
  const lockPath = path2.join(path2.dirname(getCoordinationDbPath(customDbPath)), MAINTENANCE_LOCK_FILENAME);
  try {
    if (fs2.existsSync(lockPath)) fs2.unlinkSync(lockPath);
  } catch {
  }
  console.log("[COORDINATION] Cross-process maintenance deactivated. State is INACTIVE.");
}
var COORDINATION_DB_FILENAME, MAINTENANCE_LOCK_FILENAME, DEFAULT_LEASE_TTL_MS, MaintenanceActiveError, MaintenanceDrainTimeoutError, cdbCache;
var init_coordination = __esm({
  "lib/coordination.ts"() {
    "use strict";
    COORDINATION_DB_FILENAME = ".coordination.db";
    MAINTENANCE_LOCK_FILENAME = ".maintenance_lock";
    DEFAULT_LEASE_TTL_MS = 1e4;
    MaintenanceActiveError = class extends Error {
      code = "MAINTENANCE_MODE_ACTIVE";
      constructor(message = "Database write rejected: maintenance mode is active or draining.") {
        super(message);
        this.name = "MaintenanceActiveError";
      }
    };
    MaintenanceDrainTimeoutError = class extends Error {
      code = "MAINTENANCE_DRAIN_TIMEOUT";
      constructor(message = "Failed to achieve write quiescence across processes within timeout.") {
        super(message);
        this.name = "MaintenanceDrainTimeoutError";
      }
    };
    cdbCache = /* @__PURE__ */ new Map();
  }
});

// scripts/run_email_migration.ts
import Database4 from "better-sqlite3";
import fs4 from "fs";
import path4 from "path";

// lib/migrations.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
var EMAIL_USER_ID_MIGRATION_ID = "add_user_id_to_emails";
function ensureMigrationTrackingTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INTEGER DEFAULT 0,
      checksum TEXT
    );
  `);
}
function runEmailUserIdMigration(db, options) {
  db.pragma("foreign_keys = ON");
  if (db.inTransaction) {
    return {
      status: "FAILED",
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      error: "Cannot execute migration: a transaction is already active on the provided database connection.",
      details: {
        hasUserIdColumn: false,
        isRecordedInTracker: false
      }
    };
  }
  const startTime = Date.now();
  let preCount = 0;
  const migrationFilePath = path.join(process.cwd(), "migrations", "add_user_id_to_emails.sql");
  let checksum = "embedded_fallback";
  if (fs.existsSync(migrationFilePath)) {
    const migrationSql = fs.readFileSync(migrationFilePath, "utf-8");
    checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
  }
  try {
    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    if (options?.expectedDataVersion !== void 0) {
      const versionInsideLock = db.pragma("data_version", { simple: true });
      if (versionInsideLock !== options.expectedDataVersion) {
        throw new Error(
          `DATA_VERSION_DIVERGENCE: Database modified by an uncoordinated writer between pre-migration backup (data_version=${options.expectedDataVersion}) and lock acquisition (data_version=${versionInsideLock}). Aborting migration.`
        );
      }
    }
    ensureMigrationTrackingTable(db);
    const emailCols = db.prepare("PRAGMA table_info(emails)").all().map((c) => c.name);
    const hasUserId = emailCols.includes("user_id");
    const recorded = db.prepare("SELECT * FROM schema_migrations WHERE id = ?").get(EMAIL_USER_ID_MIGRATION_ID);
    const isRecorded = Boolean(recorded);
    if (hasUserId && isRecorded) {
      db.exec("COMMIT;");
      return {
        status: "ALREADY_APPLIED",
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        appliedAt: recorded.applied_at,
        checksum: recorded.checksum,
        durationMs: recorded.execution_time_ms,
        details: {
          hasUserIdColumn: true,
          isRecordedInTracker: true
        }
      };
    }
    if (hasUserId && !isRecorded) {
      db.exec("COMMIT;");
      const errorMsg = `INCONSISTENT_STATE: Column 'user_id' already exists in 'emails' table, but migration '${EMAIL_USER_ID_MIGRATION_ID}' is NOT recorded in schema_migrations. Aborting migration to prevent data overwrite.`;
      return {
        status: "INCONSISTENT_STATE",
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        error: errorMsg,
        details: {
          hasUserIdColumn: true,
          isRecordedInTracker: false
        }
      };
    }
    if (!hasUserId && isRecorded) {
      db.exec("COMMIT;");
      const errorMsg = `SCHEMA_DRIFT: Migration '${EMAIL_USER_ID_MIGRATION_ID}' is recorded in schema_migrations, but column 'user_id' is missing from 'emails' table. Aborting migration due to schema drift.`;
      return {
        status: "SCHEMA_DRIFT",
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        error: errorMsg,
        details: {
          hasUserIdColumn: false,
          isRecordedInTracker: true
        }
      };
    }
    preCount = db.prepare("SELECT COUNT(*) as c FROM emails").get()?.c || 0;
    db.exec("ALTER TABLE emails ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;");
    db.exec(`
      UPDATE emails
      SET user_id = (
        SELECT a.user_id
        FROM applications a
        JOIN users u ON u.id = a.user_id
        WHERE a.id = emails.application_id
      )
      WHERE emails.application_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM applications a
          JOIN users u ON u.id = a.user_id
          WHERE a.id = emails.application_id
        );
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_emails_user_category ON emails(user_id, category);");
    const fkViolations = db.prepare("PRAGMA foreign_key_check(emails)").all();
    if (fkViolations.length > 0) {
      throw new Error(`Foreign key integrity check failed after migration: ${JSON.stringify(fkViolations)}`);
    }
    const durationMs = Date.now() - startTime;
    db.prepare(`
      INSERT INTO schema_migrations (id, applied_at, execution_time_ms, checksum)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?)
    `).run(EMAIL_USER_ID_MIGRATION_ID, durationMs, checksum);
    db.exec("COMMIT;");
    const postCount = db.prepare("SELECT COUNT(*) as c FROM emails").get()?.c || 0;
    const backfilledCount = db.prepare("SELECT COUNT(*) as c FROM emails WHERE user_id IS NOT NULL").get()?.c || 0;
    const unlinkedCount = db.prepare("SELECT COUNT(*) as c FROM emails WHERE user_id IS NULL").get()?.c || 0;
    return {
      status: "SUCCESS",
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      appliedAt: (/* @__PURE__ */ new Date()).toISOString(),
      durationMs,
      checksum,
      details: {
        hasUserIdColumn: true,
        isRecordedInTracker: true,
        totalEmailsBefore: preCount,
        totalEmailsAfter: postCount,
        backfilledCount,
        unlinkedCount
      }
    };
  } catch (err) {
    if (db.inTransaction) {
      try {
        db.exec("ROLLBACK;");
      } catch (rollbackErr) {
        console.error("Critical rollback failure:", rollbackErr.message);
      }
    }
    return {
      status: "FAILED",
      migrationId: EMAIL_USER_ID_MIGRATION_ID,
      error: err.message,
      details: {
        hasUserIdColumn: false,
        isRecordedInTracker: false,
        totalEmailsBefore: preCount
      }
    };
  }
}

// lib/maintenance.ts
init_coordination();
import Database2 from "better-sqlite3";
import { NextResponse } from "next/server";
var WriteBarrierRegistryAdapter = class {
  lastCustomDbPath;
  getActiveCount(customDbPath) {
    return getActiveLeasesCount(customDbPath || this.lastCustomDbPath);
  }
  getActiveOperations(customDbPath) {
    const leases = getActiveLeases(customDbPath || this.lastCustomDbPath);
    const now = Date.now();
    return leases.map((l) => ({
      id: l.lease_id,
      label: l.label,
      durationMs: now - l.acquired_at
    }));
  }
  enter(label, customDbPath) {
    if (customDbPath) this.lastCustomDbPath = customDbPath;
    return acquireCrossProcessWriteLease({
      processType: "web",
      label,
      customDbPath: customDbPath || this.lastCustomDbPath
    });
  }
  async awaitDrain(timeoutMs = 1e4, customDbPath) {
    const targetDbPath = customDbPath || this.lastCustomDbPath;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (getActiveLeasesCount(targetDbPath) === 0) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return getActiveLeasesCount(targetDbPath) === 0;
  }
  reset() {
    try {
      const cdb = getCoordinationDb(this.lastCustomDbPath);
      cdb.prepare("DELETE FROM active_leases WHERE pid = ?").run(process.pid);
    } catch {
    }
  }
};
var writeRegistry = new WriteBarrierRegistryAdapter();
function isMaintenanceActive(customDbPath) {
  return isCrossProcessMaintenanceActive(customDbPath);
}
function isMaintenanceFullyActive(customDbPath) {
  return isCrossProcessFullyActive(customDbPath);
}

// scripts/run_email_migration.ts
init_coordination();

// scripts/backup_manager.mjs
import Database3 from "better-sqlite3";
import fs3 from "fs";
import path3 from "path";
import crypto2 from "crypto";
var SQLiteBackupManager = class {
  /**
   * Performs an atomic online SQLite backup using VACUUM INTO
   * or the SQLite Online Backup API. Safe during active WAL transactions.
   */
  static async createConsistentBackup(sourceDbPath, backupDir) {
    if (!fs3.existsSync(sourceDbPath)) {
      throw new Error(`Source database does not exist: ${sourceDbPath}`);
    }
    if (!fs3.existsSync(backupDir)) {
      fs3.mkdirSync(backupDir, { recursive: true });
    }
    this.checkDiskSpaceSafeguard(backupDir, 30 * 1024 * 1024);
    const dbDir = path3.dirname(sourceDbPath);
    const coordinationDbPath = path3.join(dbDir, ".coordination.db");
    if (process.env.MAINTENANCE_MODE === "true" || fs3.existsSync(path3.join(dbDir, ".maintenance_lock"))) {
      throw new Error("[BACKUP_ABORTED] Maintenance mode is active or draining. Backup skipped to avoid migration contention.");
    }
    if (fs3.existsSync(coordinationDbPath)) {
      try {
        const cdb = new Database3(coordinationDbPath, { timeout: 3e3 });
        const row = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
        cdb.close();
        if (row && (row.state === "DRAINING" || row.state === "ACTIVE")) {
          throw new Error(`[BACKUP_ABORTED] Cross-process maintenance state is ${row.state}. Backup skipped.`);
        }
      } catch (err) {
        if (err.message && err.message.includes("[BACKUP_ABORTED]")) throw err;
      }
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFileName = `backup_${timestamp}.db`;
    const backupFilePath = path3.join(backupDir, backupFileName);
    const backupLeaseId = `backup_${process.pid}_${Date.now()}`;
    if (fs3.existsSync(coordinationDbPath)) {
      try {
        const cdb = new Database3(coordinationDbPath, { timeout: 3e3 });
        const now = Date.now();
        cdb.prepare(`
          INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
          VALUES (?, 'backup', ?, 'sqlite_atomic_backup', ?, ?)
        `).run(backupLeaseId, process.pid, now, now + 3e5);
        cdb.close();
      } catch {
      }
    }
    const sourceDb = new Database3(sourceDbPath);
    try {
      sourceDb.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, "/")}'`);
    } finally {
      sourceDb.close();
      if (fs3.existsSync(coordinationDbPath)) {
        try {
          const cdb = new Database3(coordinationDbPath, { timeout: 3e3 });
          cdb.prepare("DELETE FROM active_leases WHERE lease_id = ?").run(backupLeaseId);
          cdb.close();
        } catch {
        }
      }
    }
    const isIntegrityOk = this.verifyIntegrity(backupFilePath);
    if (!isIntegrityOk) {
      fs3.rmSync(backupFilePath, { force: true });
      throw new Error(`Backup integrity check failed for: ${backupFilePath}`);
    }
    const stats = fs3.statSync(backupFilePath);
    return {
      success: true,
      backupFilePath,
      backupFileName,
      sizeBytes: stats.size,
      timestamp
    };
  }
  /**
   * Dedicated, authorized pre-migration safety backup.
   * Runs strictly after cross-process write leases reach zero in DRAINING or ACTIVE mode.
   * Captures data_version, executes VACUUM INTO, verifies SHA-256 and integrity,
   * writes metadata, and verifies isolated restoration.
   */
  static createPreMigrationBackup({ sourceDbPath, backupDir, callerDb = null }) {
    if (!fs3.existsSync(sourceDbPath)) {
      throw new Error(`Source database does not exist: ${sourceDbPath}`);
    }
    if (!fs3.existsSync(backupDir)) {
      fs3.mkdirSync(backupDir, { recursive: true });
    }
    this.checkDiskSpaceSafeguard(backupDir, 30 * 1024 * 1024);
    const dbDir = path3.dirname(sourceDbPath);
    const coordinationDbPath = path3.join(dbDir, ".coordination.db");
    let state = "INACTIVE";
    let activeLeases = 0;
    if (fs3.existsSync(coordinationDbPath)) {
      const cdb = new Database3(coordinationDbPath, { timeout: 3e3 });
      try {
        const stateRow = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
        if (stateRow) state = stateRow.state;
        const leaseRow = cdb.prepare("SELECT COUNT(*) as count FROM active_leases WHERE expires_at > ?").get(Date.now());
        if (leaseRow) activeLeases = leaseRow.count;
      } finally {
        cdb.close();
      }
    }
    if (state !== "DRAINING" && state !== "ACTIVE") {
      throw new Error(`[PRE_MIGRATION_BACKUP_REJECTED] Migration backup requires DRAINING or ACTIVE state (current: ${state}).`);
    }
    if (activeLeases > 0) {
      throw new Error(`[PRE_MIGRATION_BACKUP_REJECTED] Cannot create pre-migration backup while ${activeLeases} active write leases remain in-flight.`);
    }
    const sourceDb = callerDb || new Database3(sourceDbPath, { timeout: 15e3 });
    const ownConnection = !callerDb;
    try {
      const dataVersion = sourceDb.pragma("data_version", { simple: true });
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const backupFileName = `career_app_pre_email_migration_${timestamp}.db`;
      const backupFilePath = path3.join(backupDir, backupFileName);
      if (fs3.existsSync(backupFilePath)) {
        throw new Error(`Pre-migration backup file already exists: ${backupFilePath}`);
      }
      sourceDb.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, "/")}'`);
      const isIntegrityOk = this.verifyIntegrity(backupFilePath);
      if (!isIntegrityOk) {
        fs3.rmSync(backupFilePath, { force: true });
        throw new Error(`Pre-migration backup integrity check failed for: ${backupFilePath}`);
      }
      const testDb = new Database3(backupFilePath, { readonly: true });
      let fkViolationsCount = 0;
      try {
        const fkViolations = testDb.pragma("foreign_key_check");
        fkViolationsCount = Array.isArray(fkViolations) ? fkViolations.length : 0;
        if (fkViolationsCount > 0) {
          throw new Error(`Pre-migration backup failed foreign key check with ${fkViolationsCount} violation(s).`);
        }
      } finally {
        testDb.close();
      }
      const fileBytes = fs3.readFileSync(backupFilePath);
      const sha256 = crypto2.createHash("sha256").update(fileBytes).digest("hex");
      const sha256FilePath = `${backupFilePath}.sha256`;
      fs3.writeFileSync(sha256FilePath, `${sha256}  ${backupFileName}
`, "utf-8");
      const stats = fs3.statSync(backupFilePath);
      const meta = {
        backupFileName,
        backupFilePath,
        sha256,
        dataVersion,
        sizeBytes: stats.size,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        integrity: "ok",
        fkViolations: fkViolationsCount,
        sourceDbPath
      };
      const metaFilePath = `${backupFilePath}.meta.json`;
      fs3.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
      const isolatedRehearsalDir = path3.join(backupDir, "isolated_rehearsal");
      if (!fs3.existsSync(isolatedRehearsalDir)) fs3.mkdirSync(isolatedRehearsalDir, { recursive: true });
      const testRestorePath = path3.join(isolatedRehearsalDir, `verify_restore_${timestamp}.db`);
      try {
        fs3.copyFileSync(backupFilePath, testRestorePath);
        const restoreCheck = this.verifyIntegrity(testRestorePath);
        if (!restoreCheck) throw new Error("Isolated restore verification failed integrity check.");
      } finally {
        try {
          fs3.rmSync(testRestorePath, { force: true });
        } catch {
        }
      }
      return {
        success: true,
        backupFilePath,
        backupFileName,
        sha256,
        dataVersion,
        sizeBytes: stats.size,
        timestamp: meta.timestamp
      };
    } finally {
      if (ownConnection) {
        sourceDb.close();
      }
    }
  }
  /**
   * Safeguards persistent volume by verifying free disk space before running backup
   */
  static checkDiskSpaceSafeguard(targetDir, minFreeBytes = 30 * 1024 * 1024) {
    try {
      if (typeof fs3.statfsSync === "function") {
        const stats = fs3.statfsSync(targetDir);
        const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
        if (freeBytes < BigInt(minFreeBytes)) {
          const freeMB = Math.round(Number(freeBytes) / (1024 * 1024));
          const reqMB = Math.round(minFreeBytes / (1024 * 1024));
          throw new Error(`[DISK_SPACE_SAFEGUARD] Low disk space (${freeMB} MB available). Minimum required for safe backup is ${reqMB} MB. Backup aborted to prevent volume exhaustion.`);
        }
      }
    } catch (err) {
      if (err.message && err.message.includes("[DISK_SPACE_SAFEGUARD]")) {
        throw err;
      }
    }
  }
  /**
   * Verifies PRAGMA integrity_check on any SQLite database file
   */
  static verifyIntegrity(dbFilePath) {
    if (!fs3.existsSync(dbFilePath)) return false;
    const testDb = new Database3(dbFilePath, { readonly: true });
    try {
      const result = testDb.pragma("integrity_check");
      return Array.isArray(result) && result.length === 1 && result[0].integrity_check === "ok";
    } catch (err) {
      console.error(`[BACKUP_VERIFY] Integrity check error for ${dbFilePath}:`, err);
      return false;
    } finally {
      testDb.close();
    }
  }
  /**
   * Restores a backup file into a specified destination database path
   */
  static restoreDatabase(backupFilePath, destinationDbPath) {
    if (!fs3.existsSync(backupFilePath)) {
      throw new Error(`Backup file does not exist: ${backupFilePath}`);
    }
    const isIntegrityOk = this.verifyIntegrity(backupFilePath);
    if (!isIntegrityOk) {
      throw new Error(`Cannot restore corrupted backup file: ${backupFilePath}`);
    }
    const destDir = path3.dirname(destinationDbPath);
    if (!fs3.existsSync(destDir)) {
      fs3.mkdirSync(destDir, { recursive: true });
    }
    fs3.copyFileSync(backupFilePath, destinationDbPath);
    fs3.rmSync(`${destinationDbPath}-wal`, { force: true });
    fs3.rmSync(`${destinationDbPath}-shm`, { force: true });
    const destIntegrity = this.verifyIntegrity(destinationDbPath);
    if (!destIntegrity) {
      throw new Error(`Restored database failed integrity check at: ${destinationDbPath}`);
    }
    return {
      success: true,
      restoredDbPath: destinationDbPath
    };
  }
  /**
   * Prunes old backups keeping only the most recent retainCount backups
   */
  static pruneOldBackups(backupDir, retainCount = 5) {
    if (!fs3.existsSync(backupDir)) return [];
    const files = fs3.readdirSync(backupDir).filter((f) => f.startsWith("backup_") && f.endsWith(".db")).map((f) => {
      const filePath = path3.join(backupDir, f);
      return { name: f, path: filePath, mtime: fs3.statSync(filePath).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    const toRemove = files.slice(retainCount);
    for (const item of toRemove) {
      fs3.rmSync(item.path, { force: true });
    }
    return toRemove.map((r) => r.name);
  }
  /**
   * Deep verification of database health and migration invariants.
   * Required before clearing maintenance mode or self-healing to INACTIVE.
   */
  static verifyDatabaseStateDeep(sourceDbPath) {
    if (!fs3.existsSync(sourceDbPath)) {
      return {
        healthy: false,
        state: "CORRUPTED",
        reason: `Target database does not exist: ${sourceDbPath}`
      };
    }
    let db;
    try {
      db = new Database3(sourceDbPath, { readonly: true, timeout: 5e3 });
    } catch (err) {
      return {
        healthy: false,
        state: "CORRUPTED",
        reason: `Failed to open database handle: ${err.message}`
      };
    }
    try {
      const integrity = db.pragma("integrity_check");
      const isIntegrityOk = Array.isArray(integrity) && integrity.length === 1 && integrity[0].integrity_check === "ok";
      if (!isIntegrityOk) {
        return {
          healthy: false,
          state: "CORRUPTED",
          reason: `PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`
        };
      }
      const fkViolations = db.pragma("foreign_key_check");
      if (Array.isArray(fkViolations) && fkViolations.length > 0) {
        return {
          healthy: false,
          state: "CORRUPTED",
          reason: `PRAGMA foreign_key_check failed with ${fkViolations.length} violations: ${JSON.stringify(fkViolations)}`
        };
      }
      const hasEmailsTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'").get());
      if (!hasEmailsTable) {
        return {
          healthy: false,
          state: "INCONSISTENT",
          reason: "Required table 'emails' does not exist."
        };
      }
      const emailCols = db.prepare("PRAGMA table_info(emails)").all().map((c) => c.name);
      const hasUserId = emailCols.includes("user_id");
      const hasMigrationTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
      const recorded = hasMigrationTable ? db.prepare("SELECT * FROM schema_migrations WHERE id = 'add_user_id_to_emails'").get() : null;
      const isRecorded = Boolean(recorded);
      if (!hasUserId && !isRecorded) {
        const orphanIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_emails_user_id', 'idx_emails_user_category')").all();
        if (orphanIdx.length > 0) {
          return {
            healthy: false,
            state: "INCONSISTENT",
            reason: `Orphan index detected while user_id column is absent: ${JSON.stringify(orphanIdx)}`
          };
        }
        return {
          healthy: true,
          state: "CLEAN_UNMIGRATED",
          details: { hasUserId: false, isRecorded: false }
        };
      }
      if (hasUserId !== isRecorded) {
        return {
          healthy: false,
          state: "INCONSISTENT",
          reason: `Partial migration state detected: hasUserId=${hasUserId}, isRecorded=${isRecorded}. Migration did not commit atomically.`,
          details: { hasUserId, isRecorded }
        };
      }
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='emails'").all().map((i) => i.name);
      const hasIndexUser = indexes.includes("idx_emails_user_id");
      const hasIndexUserCat = indexes.includes("idx_emails_user_category");
      if (!hasIndexUser || !hasIndexUserCat) {
        return {
          healthy: false,
          state: "INCONSISTENT",
          reason: `Required indexes missing: idx_emails_user_id=${hasIndexUser}, idx_emails_user_category=${hasIndexUserCat}`,
          details: { hasUserId, isRecorded }
        };
      }
      const migrationFilePath = path3.join(process.cwd(), "migrations", "add_user_id_to_emails.sql");
      if (fs3.existsSync(migrationFilePath)) {
        const sqlContent = fs3.readFileSync(migrationFilePath, "utf-8");
        const expectedChecksum = crypto2.createHash("sha256").update(sqlContent).digest("hex");
        if (recorded.checksum && recorded.checksum !== "embedded_fallback" && recorded.checksum !== expectedChecksum) {
          return {
            healthy: false,
            state: "INCONSISTENT",
            reason: `Migration checksum mismatch: recorded="${recorded.checksum}", expected="${expectedChecksum}".`,
            details: { hasUserId, isRecorded }
          };
        }
      }
      const attributableIncomplete = db.prepare(`
        SELECT COUNT(*) as c
        FROM emails e
        JOIN applications a ON a.id = e.application_id
        JOIN users u ON u.id = a.user_id
        WHERE e.user_id IS NULL OR e.user_id != a.user_id
      `).get();
      if (attributableIncomplete && attributableIncomplete.c > 0) {
        return {
          healthy: false,
          state: "INCONSISTENT",
          reason: `Attributable email backfill incomplete: ${attributableIncomplete.c} email(s) have application ownership but user_id is null or mismatched.`,
          details: { hasUserId, isRecorded }
        };
      }
      const unlinkedAssigned = db.prepare(`
        SELECT COUNT(*) as c
        FROM emails e
        WHERE (e.application_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = e.application_id
        ))
        AND e.user_id IS NOT NULL
      `).get();
      if (unlinkedAssigned && unlinkedAssigned.c > 0) {
        return {
          healthy: false,
          state: "INCONSISTENT",
          reason: `Data integrity violation: ${unlinkedAssigned.c} unlinked email(s) were assigned a user_id without valid application/user ownership.`,
          details: { hasUserId, isRecorded }
        };
      }
      const totalEmails = db.prepare("SELECT COUNT(*) as c FROM emails").get()?.c || 0;
      const attributableCount = db.prepare(`
        SELECT COUNT(*) as c FROM emails e
        JOIN applications a ON a.id = e.application_id
        JOIN users u ON u.id = a.user_id
      `).get()?.c || 0;
      const unlinkedCount = totalEmails - attributableCount;
      return {
        healthy: true,
        state: "MIGRATED",
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
      try {
        db.close();
      } catch {
      }
    }
  }
};

// scripts/run_email_migration.ts
function validateEnvironmentAndSafeguards() {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const explicitTarget = (process.env.TARGET_ENVIRONMENT || "").toLowerCase();
  const railwayEnv = (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || "").toLowerCase();
  const stagingMode = process.env.STAGING_MODE === "true";
  const stagingAccessCode = process.env.STAGING_ACCESS_CODE || "";
  const allowStagingMigration = process.env.ALLOW_STAGING_MIGRATION === "true";
  const isDryRun = process.env.DRY_RUN === "true";
  if (explicitTarget === "production" || explicitTarget === "prod" || explicitTarget === "live") {
    throw new Error(`FATAL SAFEGUARD: Execution explicitly refused against production environment (TARGET_ENVIRONMENT=${explicitTarget}).`);
  }
  if (railwayEnv.includes("prod") || railwayEnv.includes("live") || railwayEnv === "main") {
    throw new Error(`FATAL SAFEGUARD: Execution explicitly refused against Railway production environment (RAILWAY_ENVIRONMENT=${railwayEnv}).`);
  }
  const hasStagingCredentials = stagingMode && stagingAccessCode.length >= 8;
  const isRailwayStaging = railwayEnv === "staging";
  const isPositiveStaging = hasStagingCredentials || isRailwayStaging;
  if (!isPositiveStaging) {
    throw new Error(
      "FATAL SAFEGUARD: Target environment is NOT positively verified as Staging. Requires either RAILWAY_ENVIRONMENT=staging or (STAGING_MODE=true and valid STAGING_ACCESS_CODE)."
    );
  }
  if (!allowStagingMigration) {
    throw new Error(
      'FATAL SAFEGUARD: Staging environment verified, but ALLOW_STAGING_MIGRATION is not set to "true". Refusing execution.'
    );
  }
  const rawPath = process.env.MIGRATION_DATABASE_PATH || process.env.DATABASE_PATH;
  if (!rawPath || typeof rawPath !== "string" || rawPath.trim().length === 0) {
    throw new Error("FATAL CONFIGURATION: Database path is missing. Set MIGRATION_DATABASE_PATH or DATABASE_PATH.");
  }
  const resolvedPath = path4.resolve(rawPath.trim());
  if (!resolvedPath.endsWith(".db")) {
    throw new Error(`FATAL CONFIGURATION: Database path must point to a .db file, received: ${resolvedPath}`);
  }
  if (!fs4.existsSync(resolvedPath)) {
    throw new Error(`FATAL CONFIGURATION: Database file does not physically exist at: ${resolvedPath}. Refusing to create empty database.`);
  }
  const dbDir = path4.dirname(resolvedPath);
  try {
    fs4.accessSync(dbDir, fs4.constants.R_OK | fs4.constants.W_OK);
  } catch (err) {
    throw new Error(`FATAL PERMISSION: Containing directory is not read/write accessible: ${dbDir} (${err.message})`);
  }
  const bypassMaintenance = process.env.BYPASS_MAINTENANCE_CHECK === "true";
  if (!bypassMaintenance && !isDryRun) {
    if (!isMaintenanceFullyActive(resolvedPath)) {
      throw new Error(
        'FATAL SAFEGUARD: Database is not in verified ACTIVE maintenance mode. Execute "node scripts/maintenance_control.mjs --enable" to drain writes before applying migration.'
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
function executeMigrationCli(customDbPath) {
  const { dbPath, isDryRun } = customDbPath ? { dbPath: customDbPath, isDryRun: false } : validateEnvironmentAndSafeguards();
  console.log("=== [ADMINISTRATIVE MIGRATION RUNNER: add_user_id_to_emails] ===");
  console.log(` - Target Database:  ${dbPath}`);
  console.log(` - Migration ID:     ${EMAIL_USER_ID_MIGRATION_ID}`);
  console.log(` - Timestamp:        ${(/* @__PURE__ */ new Date()).toISOString()}`);
  console.log(` - Dry Run Mode:     ${isDryRun}`);
  const db = new Database4(dbPath, { timeout: 15e3 });
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const fkEnabled = db.pragma("foreign_keys", { simple: true });
    if (fkEnabled !== 1) {
      throw new Error("FATAL: Failed to enable SQLite foreign_keys pragma.");
    }
    db.pragma("synchronous = FULL");
    const synValue = db.pragma("synchronous", { simple: true });
    if (synValue !== 2) {
      throw new Error(`FATAL: Failed to set PRAGMA synchronous = FULL (effective value: ${synValue}).`);
    }
    if (db.inTransaction) {
      throw new Error("FATAL: Database connection is unexpectedly already inside an active transaction.");
    }
    if (isDryRun) {
      console.log("[DRY-RUN] Preflight checks passed. Skipping schema execution in dry-run mode.");
      return {
        status: "SUCCESS",
        migrationId: EMAIL_USER_ID_MIGRATION_ID,
        durationMs: 0,
        details: {
          hasUserIdColumn: false,
          isRecordedInTracker: false
        }
      };
    }
    if (!isMaintenanceActive(dbPath)) {
      requestMaintenanceDrainSync({ customDbPath: dbPath, reason: "migration_preflight" });
    }
    const dataVersionBefore = db.pragma("data_version", { simple: true });
    const backupDir = path4.join(path4.dirname(dbPath), "backups");
    console.log(`[MIGRATION-BACKUP] Creating pre-migration safety backup in ${backupDir}...`);
    const backupResult = SQLiteBackupManager.createPreMigrationBackup({
      sourceDbPath: dbPath,
      backupDir,
      callerDb: db
    });
    console.log(`[MIGRATION-BACKUP] Pre-migration backup captured and verified: ${backupResult.backupFileName}`);
    console.log(` - SHA-256:      ${backupResult.sha256}`);
    console.log(` - data_version: ${dataVersionBefore}`);
    const result = runEmailUserIdMigration(db, { expectedDataVersion: dataVersionBefore });
    if (result.status === "SUCCESS" || result.status === "ALREADY_APPLIED") {
      try {
        const ckpt = db.pragma("wal_checkpoint(TRUNCATE)");
        if (Array.isArray(ckpt) && ckpt.length > 0) {
          if (ckpt[0].busy !== 0) {
            console.warn(`[MIGRATION-CHECKPOINT] wal_checkpoint(TRUNCATE) returned busy=${ckpt[0].busy}, log=${ckpt[0].log}, checkpointed=${ckpt[0].checkpointed}. Committed safely, pending background truncation.`);
          } else {
            console.log(`[MIGRATION-CHECKPOINT] wal_checkpoint(TRUNCATE) succeeded: log=${ckpt[0].log}, checkpointed=${ckpt[0].checkpointed}.`);
          }
        }
      } catch (ckptErr) {
        console.warn(`[MIGRATION-CHECKPOINT] Non-fatal checkpoint error: ${ckptErr.message}`);
      }
      try {
        deactivateCrossProcessMaintenance(dbPath);
        console.log("[MIGRATION-COORDINATION] Deactivated cross-process maintenance mode.");
      } catch (coordErr) {
        console.warn(`[MIGRATION-COORDINATION] Failed to deactivate maintenance mode: ${coordErr.message}`);
      }
    }
    const sanitizedOutput = {
      status: result.status,
      migrationId: result.migrationId,
      appliedAt: result.appliedAt,
      durationMs: result.durationMs,
      checksum: result.checksum,
      error: result.error,
      details: result.details
    };
    console.log("\n=== [MIGRATION RESULT SUMMARY] ===");
    console.log(JSON.stringify(sanitizedOutput, null, 2));
    if (result.status === "FAILED" || result.status === "INCONSISTENT_STATE" || result.status === "SCHEMA_DRIFT") {
      console.error(`
[FATAL] Migration terminated with unrecoverable status: ${result.status}`);
      process.exitCode = 1;
    } else {
      console.log(`
[SUCCESS] Migration completed with status: ${result.status}`);
      process.exitCode = 0;
    }
    return result;
  } finally {
    try {
      db.close();
    } catch {
    }
  }
}
var isDirectEntry = process.argv[1]?.endsWith("run_email_migration.ts") || process.argv[1]?.endsWith("run_email_migration.mjs");
if (isDirectEntry) {
  try {
    executeMigrationCli();
  } catch (err) {
    console.error("\n[FATAL MIGRATION RUNNER ERROR]:", err.message);
    process.exit(1);
  }
}
export {
  executeMigrationCli,
  validateEnvironmentAndSafeguards
};
