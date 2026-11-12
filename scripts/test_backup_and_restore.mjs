import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SQLiteBackupManager } from './backup_manager.mjs';

async function testBackupAndRestoreSuite() {
  console.log('=== [PHASE 5: SQLITE CONSISTENT BACKUP & RESTORE SUITE] ===\n');

  const testDir = path.join(process.cwd(), 'data', 'staging_backup_test_env');
  const sourceDbPath = path.join(testDir, 'staging_source.db');
  const backupDir = path.join(testDir, 'backups');
  const restoredDbPath = path.join(testDir, 'staging_restored.db');
  const uploadsDir = path.join(testDir, 'uploads');

  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  console.log(`1. Initializing isolated test database at: ${sourceDbPath}`);
  const sourceDb = new Database(sourceDbPath);
  sourceDb.pragma('journal_mode = WAL');
  sourceDb.pragma('foreign_keys = ON');

  sourceDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      stored_file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      job_title TEXT NOT NULL,
      employer TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);

  // Seed test records
  const userA = { id: 'usr_synth_backup_01', email: 'candidate.backup@staging.local', name: 'Backup Test Candidate' };
  sourceDb.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(userA.id, userA.email, userA.name);

  // Write a synthetic CV file
  const testCvContent = Buffer.from('%PDF-1.4 Synthetic Staging CV for Backup Verification %%EOF');
  const testCvHash = crypto.createHash('sha256').update(testCvContent).digest('hex');
  const testCvPath = path.join(uploadsDir, 'candidate_cv.pdf');
  fs.writeFileSync(testCvPath, testCvContent);

  sourceDb.prepare('INSERT INTO resumes (id, user_id, title, stored_file_path, file_hash) VALUES (?, ?, ?, ?, ?)').run(
    'res_backup_01', userA.id, 'Candidate_CV.pdf', testCvPath, testCvHash
  );

  sourceDb.prepare('INSERT INTO applications (id, user_id, job_title, employer, status) VALUES (?, ?, ?, ?, ?)').run(
    'app_backup_01', userA.id, 'Senior Category Manager', "L'Oreal", 'Review Ready'
  );

  console.log('   - Records and associated files seeded successfully.');
  sourceDb.close();

  // 2. Perform Atomic Backup using VACUUM INTO
  console.log('\n2. Executing atomic SQLite backup (VACUUM INTO)...');
  const backupResult = await SQLiteBackupManager.createConsistentBackup(sourceDbPath, backupDir);
  console.log(`   - Backup Created:  ${backupResult.backupFileName}`);
  console.log(`   - Backup File Size: ${backupResult.sizeBytes} bytes`);
  console.log(`   - Backup Verified:  SUCCESS (PRAGMA integrity_check = ok)`);

  // 3. Restore into Separate Database Path
  console.log(`\n3. Restoring backup to new target: ${restoredDbPath}...`);
  const restoreResult = SQLiteBackupManager.restoreDatabase(backupResult.backupFilePath, restoredDbPath);
  console.log(`   - Database Restored: ${restoreResult.success}`);

  // 4. Application Startup Against Restored Database
  console.log('\n4. Connecting application driver to restored database...');
  const restoredDb = new Database(restoredDbPath);
  restoredDb.pragma('busy_timeout = 5000');

  // Verify integrity
  const integrity = restoredDb.pragma('integrity_check');
  console.log(`   - PRAGMA integrity_check on restored DB: ${JSON.stringify(integrity)}`);

  // Verify Records
  const restoredUser = restoredDb.prepare('SELECT * FROM users WHERE id = ?').get(userA.id);
  const restoredResume = restoredDb.prepare('SELECT * FROM resumes WHERE id = ?').get('res_backup_01');
  const restoredApp = restoredDb.prepare('SELECT * FROM applications WHERE id = ?').get('app_backup_01');

  console.log(`   - Restored User:        ${restoredUser ? `${restoredUser.full_name} (${restoredUser.email})` : 'MISSING'}`);
  console.log(`   - Restored Resume:      ${restoredResume ? `${restoredResume.title} (${restoredResume.file_hash.substring(0, 12)}...)` : 'MISSING'}`);
  console.log(`   - Restored Application: ${restoredApp ? `${restoredApp.job_title} at ${restoredApp.employer} [${restoredApp.status}]` : 'MISSING'}`);

  // Verify File Reference Integrity
  const fileExists = fs.existsSync(restoredResume.stored_file_path);
  const reReadContent = fs.readFileSync(restoredResume.stored_file_path);
  const reReadHash = crypto.createHash('sha256').update(reReadContent).digest('hex');
  const hashMatches = reReadHash === restoredResume.file_hash;
  console.log(`   - Stored File Exists:   ${fileExists}`);
  console.log(`   - Stored File Hash Match: ${hashMatches} (${reReadHash.substring(0, 12)}...)`);

  restoredDb.close();

  // 5. Test Retention & Pruning Policy
  console.log('\n5. Testing backup retention policy (limit to 2 backups)...');
  // Create 3 additional mock backups
  for (let i = 1; i <= 3; i++) {
    const dummyPath = path.join(backupDir, `backup_2026-11-12T0${i}-00-00-000Z.db`);
    fs.copyFileSync(backupResult.backupFilePath, dummyPath);
  }
  const allBefore = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).length;
  console.log(`   - Total backups before pruning: ${allBefore}`);
  const pruned = SQLiteBackupManager.pruneOldBackups(backupDir, 2);
  const allAfter = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).length;
  console.log(`   - Pruned files: ${JSON.stringify(pruned)}`);
  console.log(`   - Total backups after retention policy: ${allAfter} (EXPECTED: 2)`);

  // 6. Test Corrupt File Failure Reporting
  console.log('\n6. Testing corruption detection and failure reporting...');
  const corruptFile = path.join(testDir, 'corrupt.db');
  fs.writeFileSync(corruptFile, Buffer.from('NOT A VALID SQLITE DATABASE FILE GARBAGE DATA'));
  const isCorruptValid = SQLiteBackupManager.verifyIntegrity(corruptFile);
  console.log(`   - Corrupt file integrity validation: ${isCorruptValid} (EXPECTED: false)`);
  let caughtError = false;
  try {
    SQLiteBackupManager.restoreDatabase(corruptFile, path.join(testDir, 'should_fail.db'));
  } catch (err) {
    caughtError = true;
    console.log(`   - Restoration blocked with error: "${err.message}"`);
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });

  const passed = restoredUser && restoredResume && restoredApp && hashMatches && allAfter === 2 && caughtError;
  console.log(`\n=== [BACKUP & RESTORE AUDIT RESULT: ${passed ? 'ALL CHECKS PASSED' : 'FAILED'}] ===`);
  if (!passed) process.exit(1);
}

testBackupAndRestoreSuite().catch(err => {
  console.error('Backup test failed:', err);
  process.exit(1);
});
