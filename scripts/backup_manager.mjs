import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class SQLiteBackupManager {
  /**
   * Performs an atomic online SQLite backup using VACUUM INTO
   * or the SQLite Online Backup API. Safe during active WAL transactions.
   */
  static async createConsistentBackup(sourceDbPath, backupDir) {
    if (!fs.existsSync(sourceDbPath)) {
      throw new Error(`Source database does not exist: ${sourceDbPath}`);
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Disk space safeguard: Abort if available disk space is less than 30MB
    this.checkDiskSpaceSafeguard(backupDir, 30 * 1024 * 1024);

    // Maintenance check: refuse backup if maintenance is active or draining
    const dbDir = path.dirname(sourceDbPath);
    const coordinationDbPath = path.join(dbDir, '.coordination.db');
    if (process.env.MAINTENANCE_MODE === 'true' || fs.existsSync(path.join(dbDir, '.maintenance_lock'))) {
      throw new Error('[BACKUP_ABORTED] Maintenance mode is active or draining. Backup skipped to avoid migration contention.');
    }
    if (fs.existsSync(coordinationDbPath)) {
      try {
        const cdb = new Database(coordinationDbPath, { timeout: 3000 });
        const row = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
        cdb.close();
        if (row && (row.state === 'DRAINING' || row.state === 'ACTIVE')) {
          throw new Error(`[BACKUP_ABORTED] Cross-process maintenance state is ${row.state}. Backup skipped.`);
        }
      } catch (err) {
        if (err.message && err.message.includes('[BACKUP_ABORTED]')) throw err;
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);
    const backupLeaseId = `backup_${process.pid}_${Date.now()}`;

    // Register active lease in .coordination.db
    if (fs.existsSync(coordinationDbPath)) {
      try {
        const cdb = new Database(coordinationDbPath, { timeout: 3000 });
        const now = Date.now();
        cdb.prepare(`
          INSERT INTO active_leases (lease_id, process_type, pid, label, acquired_at, expires_at)
          VALUES (?, 'backup', ?, 'sqlite_atomic_backup', ?, ?)
        `).run(backupLeaseId, process.pid, now, now + 300000);
        cdb.close();
      } catch {}
    }

    const sourceDb = new Database(sourceDbPath);
    try {
      // Method: VACUUM INTO creates a brand new, atomic, compacted snapshot
      // without locking out concurrent WAL readers.
      sourceDb.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, '/')}'`);
    } finally {
      sourceDb.close();
      if (fs.existsSync(coordinationDbPath)) {
        try {
          const cdb = new Database(coordinationDbPath, { timeout: 3000 });
          cdb.prepare('DELETE FROM active_leases WHERE lease_id = ?').run(backupLeaseId);
          cdb.close();
        } catch {}
      }
    }

    // Verify backup integrity immediately
    const isIntegrityOk = this.verifyIntegrity(backupFilePath);
    if (!isIntegrityOk) {
      fs.rmSync(backupFilePath, { force: true });
      throw new Error(`Backup integrity check failed for: ${backupFilePath}`);
    }

    const stats = fs.statSync(backupFilePath);
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
    if (!fs.existsSync(sourceDbPath)) {
      throw new Error(`Source database does not exist: ${sourceDbPath}`);
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Disk space safeguard: Abort if available disk space is less than 30MB
    this.checkDiskSpaceSafeguard(backupDir, 30 * 1024 * 1024);

    // Authorization verification: State MUST be DRAINING or ACTIVE, and active leases MUST be 0
    const dbDir = path.dirname(sourceDbPath);
    const coordinationDbPath = path.join(dbDir, '.coordination.db');
    let state = 'INACTIVE';
    let activeLeases = 0;
    if (fs.existsSync(coordinationDbPath)) {
      const cdb = new Database(coordinationDbPath, { timeout: 3000 });
      try {
        const stateRow = cdb.prepare("SELECT state FROM coordination_state WHERE id = 'global'").get();
        if (stateRow) state = stateRow.state;
        const leaseRow = cdb.prepare("SELECT COUNT(*) as count FROM active_leases WHERE expires_at > ?").get(Date.now());
        if (leaseRow) activeLeases = leaseRow.count;
      } finally {
        cdb.close();
      }
    }

    if (state !== 'DRAINING' && state !== 'ACTIVE') {
      throw new Error(`[PRE_MIGRATION_BACKUP_REJECTED] Migration backup requires DRAINING or ACTIVE state (current: ${state}).`);
    }
    if (activeLeases > 0) {
      throw new Error(`[PRE_MIGRATION_BACKUP_REJECTED] Cannot create pre-migration backup while ${activeLeases} active write leases remain in-flight.`);
    }

    const sourceDb = callerDb || new Database(sourceDbPath, { timeout: 15000 });
    const ownConnection = !callerDb;

    try {
      // Capture data_version on the dedicated handle
      const dataVersion = sourceDb.pragma('data_version', { simple: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `career_app_pre_email_migration_${timestamp}.db`;
      const backupFilePath = path.join(backupDir, backupFileName);

      // Invariant: Never overwrite an existing backup
      if (fs.existsSync(backupFilePath)) {
        throw new Error(`Pre-migration backup file already exists: ${backupFilePath}`);
      }

      // Execute VACUUM INTO outside an active transaction
      sourceDb.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, '/')}'`);

      // 1. Verify PRAGMA integrity_check
      const isIntegrityOk = this.verifyIntegrity(backupFilePath);
      if (!isIntegrityOk) {
        fs.rmSync(backupFilePath, { force: true });
        throw new Error(`Pre-migration backup integrity check failed for: ${backupFilePath}`);
      }

      // 2. Verify PRAGMA foreign_key_check on backup
      const testDb = new Database(backupFilePath, { readonly: true });
      let fkViolationsCount = 0;
      try {
        const fkViolations = testDb.pragma('foreign_key_check');
        fkViolationsCount = Array.isArray(fkViolations) ? fkViolations.length : 0;
        if (fkViolationsCount > 0) {
          throw new Error(`Pre-migration backup failed foreign key check with ${fkViolationsCount} violation(s).`);
        }
      } finally {
        testDb.close();
      }

      // 3. Compute SHA-256
      const fileBytes = fs.readFileSync(backupFilePath);
      const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

      // 4. Write .sha256 and .meta.json
      const sha256FilePath = `${backupFilePath}.sha256`;
      fs.writeFileSync(sha256FilePath, `${sha256}  ${backupFileName}\n`, 'utf-8');

      const stats = fs.statSync(backupFilePath);
      const meta = {
        backupFileName,
        backupFilePath,
        sha256,
        dataVersion,
        sizeBytes: stats.size,
        timestamp: new Date().toISOString(),
        integrity: 'ok',
        fkViolations: fkViolationsCount,
        sourceDbPath
      };
      const metaFilePath = `${backupFilePath}.meta.json`;
      fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), 'utf-8');

      // 5. Test isolated restore verification
      const isolatedRehearsalDir = path.join(backupDir, 'isolated_rehearsal');
      if (!fs.existsSync(isolatedRehearsalDir)) fs.mkdirSync(isolatedRehearsalDir, { recursive: true });
      const testRestorePath = path.join(isolatedRehearsalDir, `verify_restore_${timestamp}.db`);
      try {
        fs.copyFileSync(backupFilePath, testRestorePath);
        const restoreCheck = this.verifyIntegrity(testRestorePath);
        if (!restoreCheck) throw new Error('Isolated restore verification failed integrity check.');
      } finally {
        try { fs.rmSync(testRestorePath, { force: true }); } catch {}
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
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(targetDir);
        const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
        if (freeBytes < BigInt(minFreeBytes)) {
          const freeMB = Math.round(Number(freeBytes) / (1024 * 1024));
          const reqMB = Math.round(minFreeBytes / (1024 * 1024));
          throw new Error(`[DISK_SPACE_SAFEGUARD] Low disk space (${freeMB} MB available). Minimum required for safe backup is ${reqMB} MB. Backup aborted to prevent volume exhaustion.`);
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('[DISK_SPACE_SAFEGUARD]')) {
        throw err;
      }
    }
  }

  /**
   * Verifies PRAGMA integrity_check on any SQLite database file
   */
  static verifyIntegrity(dbFilePath) {
    if (!fs.existsSync(dbFilePath)) return false;
    const testDb = new Database(dbFilePath, { readonly: true });
    try {
      const result = testDb.pragma('integrity_check');
      return Array.isArray(result) && result.length === 1 && result[0].integrity_check === 'ok';
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
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file does not exist: ${backupFilePath}`);
    }

    const isIntegrityOk = this.verifyIntegrity(backupFilePath);
    if (!isIntegrityOk) {
      throw new Error(`Cannot restore corrupted backup file: ${backupFilePath}`);
    }

    const destDir = path.dirname(destinationDbPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Safely copy verified backup to target path
    fs.copyFileSync(backupFilePath, destinationDbPath);

    // Also remove any stale WAL or SHM files for destination
    fs.rmSync(`${destinationDbPath}-wal`, { force: true });
    fs.rmSync(`${destinationDbPath}-shm`, { force: true });

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
    if (!fs.existsSync(backupDir)) return [];
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        return { name: f, path: filePath, mtime: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const toRemove = files.slice(retainCount);
    for (const item of toRemove) {
      fs.rmSync(item.path, { force: true });
    }
    return toRemove.map(r => r.name);
  }

  /**
   * Deep verification of database health and migration invariants.
   * Required before clearing maintenance mode or self-healing to INACTIVE.
   */
  static verifyDatabaseStateDeep(sourceDbPath) {
    if (!fs.existsSync(sourceDbPath)) {
      return {
        healthy: false,
        state: 'CORRUPTED',
        reason: `Target database does not exist: ${sourceDbPath}`
      };
    }

    let db;
    try {
      db = new Database(sourceDbPath, { readonly: true, timeout: 5000 });
    } catch (err) {
      return {
        healthy: false,
        state: 'CORRUPTED',
        reason: `Failed to open database handle: ${err.message}`
      };
    }

    try {
      // 1. Primary engine integrity
      const integrity = db.pragma('integrity_check');
      const isIntegrityOk = Array.isArray(integrity) && integrity.length === 1 && integrity[0].integrity_check === 'ok';
      if (!isIntegrityOk) {
        return {
          healthy: false,
          state: 'CORRUPTED',
          reason: `PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`
        };
      }

      // 2. Foreign key integrity
      const fkViolations = db.pragma('foreign_key_check');
      if (Array.isArray(fkViolations) && fkViolations.length > 0) {
        return {
          healthy: false,
          state: 'CORRUPTED',
          reason: `PRAGMA foreign_key_check failed with ${fkViolations.length} violations: ${JSON.stringify(fkViolations)}`
        };
      }

      // Check emails table exists
      const hasEmailsTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'").get());
      if (!hasEmailsTable) {
        return {
          healthy: false,
          state: 'INCONSISTENT',
          reason: "Required table 'emails' does not exist."
        };
      }

      // 3. Schema & column verification
      const emailCols = (db.prepare('PRAGMA table_info(emails)').all()).map(c => c.name);
      const hasUserId = emailCols.includes('user_id');

      // 4. Migration tracking record
      const hasMigrationTable = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
      const recorded = hasMigrationTable
        ? db.prepare("SELECT * FROM schema_migrations WHERE id = 'add_user_id_to_emails'").get()
        : null;
      const isRecorded = Boolean(recorded);

      // Clean unmigrated baseline
      if (!hasUserId && !isRecorded) {
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

      // Split / inconsistent state
      if (hasUserId !== isRecorded) {
        return {
          healthy: false,
          state: 'INCONSISTENT',
          reason: `Partial migration state detected: hasUserId=${hasUserId}, isRecorded=${isRecorded}. Migration did not commit atomically.`,
          details: { hasUserId, isRecorded }
        };
      }

      // Fully migrated state: Verify indexes, checksum, and data backfill
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='emails'").all()).map(i => i.name);
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

      // Canonical checksum verification
      const migrationFilePath = path.join(process.cwd(), 'migrations', 'add_user_id_to_emails.sql');
      if (fs.existsSync(migrationFilePath)) {
        const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
        const expectedChecksum = crypto.createHash('sha256').update(sqlContent).digest('hex');
        if (recorded.checksum && recorded.checksum !== 'embedded_fallback' && recorded.checksum !== expectedChecksum) {
          return {
            healthy: false,
            state: 'INCONSISTENT',
            reason: `Migration checksum mismatch: recorded="${recorded.checksum}", expected="${expectedChecksum}".`,
            details: { hasUserId, isRecorded }
          };
        }
      }

      // Attributable email backfill completeness:
      // Any email linked to an existing application owned by an existing user must have user_id = applications.user_id
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
          state: 'INCONSISTENT',
          reason: `Attributable email backfill incomplete: ${attributableIncomplete.c} email(s) have application ownership but user_id is null or mismatched.`,
          details: { hasUserId, isRecorded }
        };
      }

      // Historical unlinked emails: must NOT be assigned to a default user
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
          state: 'INCONSISTENT',
          reason: `Data integrity violation: ${unlinkedAssigned.c} unlinked email(s) were assigned a user_id without valid application/user ownership.`,
          details: { hasUserId, isRecorded }
        };
      }

      const totalEmails = (db.prepare('SELECT COUNT(*) as c FROM emails').get())?.c || 0;
      const attributableCount = (db.prepare(`
        SELECT COUNT(*) as c FROM emails e
        JOIN applications a ON a.id = e.application_id
        JOIN users u ON u.id = a.user_id
      `).get())?.c || 0;
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
}
