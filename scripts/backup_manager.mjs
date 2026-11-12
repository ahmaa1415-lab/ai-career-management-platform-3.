import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

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

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);

    const sourceDb = new Database(sourceDbPath);
    try {
      // Method: VACUUM INTO creates a brand new, atomic, compacted snapshot
      // without locking out concurrent WAL readers.
      sourceDb.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, '/')}'`);
    } finally {
      sourceDb.close();
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
}
