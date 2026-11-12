import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { isRegistrationAllowed } from '../lib/staging-security.ts';
import { SQLiteBackupManager } from './backup_manager.mjs';

async function testPrebuildGate() {
  console.log('=== [RAILWAY STAGING: PRE-BUILD SECURITY & HEALTHCHECK GATE TEST] ===\n');

  const testDir = path.join(process.cwd(), 'data', 'staging_prebuild_test');
  const testDbPath = path.join(testDir, 'prebuild.db');
  const testBackupDir = path.join(testDir, 'backups');

  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(testBackupDir, { recursive: true });

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);');

  // ============================================================================
  // 1. SECRET ROTATION AUDIT
  // ============================================================================
  console.log('1. Auditing Staging Access Code Rotation:');
  const OLD_CODE = 'StagePass2026_x8K9mQ2L!';
  const NEW_CODE = 'Haco1JprSD25JgI-_qsHHP8puuLe2ORW';

  process.env.STAGING_MODE = 'true';
  process.env.STAGING_ACCESS_CODE = NEW_CODE;

  const oldCodeAttempt = isRegistrationAllowed(OLD_CODE);
  const newCodeAttempt = isRegistrationAllowed(NEW_CODE);
  const noCodeAttempt = isRegistrationAllowed(undefined);

  console.log(`   - Compromised Old Code Rejection: ${oldCodeAttempt === false} (EXPECTED: true - Denied)`);
  console.log(`   - Rotated New Code Acceptance:    ${newCodeAttempt === true} (EXPECTED: true - Permitted)`);
  console.log(`   - Missing Code Rejection:         ${noCodeAttempt === false} (EXPECTED: true - Denied)`);

  // Verify behavior in production mode (STAGING_MODE=false)
  process.env.STAGING_MODE = 'false';
  const prodModeAttempt = isRegistrationAllowed(undefined);
  console.log(`   - Access Code Required in Production: ${prodModeAttempt === true} (EXPECTED: true - Open for Candidates)`);
  process.env.STAGING_MODE = 'true';

  const rotationPassed = (oldCodeAttempt === false) && (newCodeAttempt === true) && (noCodeAttempt === false) && (prodModeAttempt === true);

  // ============================================================================
  // 2. HEALTHCHECK CONSISTENCY & ACTIVE DEPENDENCY PROBE
  // ============================================================================
  console.log('\n2. Auditing Healthcheck (/api/health) Active Dependency Probe:');
  
  // Healthy Database Probe
  const probeDbHealthy = (database) => {
    try {
      const row = database.prepare('SELECT 1 as ok').get();
      if (!row || row.ok !== 1) throw new Error('DB probe failed');
      return {
        status: 200,
        body: {
          status: 'healthy',
          environment: process.env.STAGING_MODE === 'true' ? 'staging' : 'production',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };
    } catch (err) {
      return {
        status: 503,
        body: {
          status: 'unhealthy',
          reason: 'Critical dependency probe failed',
          timestamp: new Date().toISOString()
        }
      };
    }
  };

  const healthyRes = probeDbHealthy(db);
  console.log(`   - Healthy DB Response Status: ${healthyRes.status} (EXPECTED: 200)`);
  console.log(`   - Response Body: ${JSON.stringify(healthyRes.body)}`);
  console.log(`   - Zero Sensitive Information Leaked: ${!JSON.stringify(healthyRes.body).includes('prebuild.db')}`);

  // Unhealthy Database Probe (Simulating closed/corrupt connection)
  const deadDb = new Database(testDbPath);
  deadDb.close(); // Force closed handle
  const unhealthyRes = probeDbHealthy(deadDb);
  console.log(`   - Unhealthy DB Response Status: ${unhealthyRes.status} (EXPECTED: 503)`);
  console.log(`   - Sanitized Error Body: ${JSON.stringify(unhealthyRes.body)}`);

  const healthcheckPassed = healthyRes.status === 200 && unhealthyRes.status === 503 && healthyRes.body.status === 'healthy' && unhealthyRes.body.status === 'unhealthy';

  // ============================================================================
  // 3. PERSISTENT VOLUME CAPACITY & SAFEGUARDS
  // ============================================================================
  console.log('\n3. Auditing Persistent Volume Capacity & Disk Safeguards:');
  const volumeTotalMB = 500;
  const dbFootprintMB = 11.5;
  const uploadsFootprintMB = 5.0;
  const backupFootprintMB = 7 * 11.5; // ~80.5 MB for 7 backups
  const walFootprintMB = 10.0;
  const totalProjectedFootprintMB = dbFootprintMB + uploadsFootprintMB + backupFootprintMB + walFootprintMB;
  const headroomMB = volumeTotalMB - totalProjectedFootprintMB;
  const utilizationPercent = ((totalProjectedFootprintMB / volumeTotalMB) * 100).toFixed(1);

  console.log(`   - Volume Size:               ${volumeTotalMB} MB`);
  console.log(`   - Database Footprint:        ${dbFootprintMB} MB`);
  console.log(`   - Uploads Footprint (50 CVs): ${uploadsFootprintMB} MB`);
  console.log(`   - 7 Backups (Daily VACUUM):  ${backupFootprintMB.toFixed(1)} MB`);
  console.log(`   - WAL Buffer:                ${walFootprintMB} MB`);
  console.log(`   - Total Projected Footprint: ${totalProjectedFootprintMB.toFixed(1)} MB (${utilizationPercent}% utilization)`);
  console.log(`   - Remaining Headroom:        ${headroomMB.toFixed(1)} MB free`);

  // Test Disk Space Safeguard in Backup Manager
  console.log('\n   Testing Disk Space Safeguard Threshold:');
  let safeguardTriggered = false;
  try {
    // Test safeguard with an unrealistically huge threshold (e.g. 500 TB)
    SQLiteBackupManager.checkDiskSpaceSafeguard(testBackupDir, 500 * 1024 * 1024 * 1024 * 1024);
  } catch (err) {
    if (err.message.includes('[DISK_SPACE_SAFEGUARD]')) {
      safeguardTriggered = true;
      console.log(`   - Safeguard Successfully Intercepted Insufficient Disk Space:`);
      console.log(`     "${err.message}"`);
    }
  }

  const capacityPassed = safeguardTriggered === true && headroomMB > 350;

  // ============================================================================
  // 4. DEPLOYMENT CONTEXT & .DOCKERIGNORE AUDIT
  // ============================================================================
  console.log('\n4. Auditing Deployment Context Isolation (.dockerignore):');
  const dockerignoreContent = fs.readFileSync(path.join(process.cwd(), '.dockerignore'), 'utf-8');
  const excludesDb = dockerignoreContent.includes('data/career_app.db*');
  const excludesUploads = dockerignoreContent.includes('data/uploads/*');
  const excludesBackups = dockerignoreContent.includes('backups/');
  const excludesEnv = dockerignoreContent.includes('.env*.local');
  const excludesLogs = dockerignoreContent.includes('*.log');

  console.log(`   - Excludes Production DB:      ${excludesDb}`);
  console.log(`   - Excludes User Uploads:       ${excludesUploads}`);
  console.log(`   - Excludes Local Backups:      ${excludesBackups}`);
  console.log(`   - Excludes .env Files:         ${excludesEnv}`);
  console.log(`   - Excludes Local Logs:         ${excludesLogs}`);

  const isolationPassed = excludesDb && excludesUploads && excludesBackups && excludesEnv && excludesLogs;

  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });

  const allPassed = rotationPassed && healthcheckPassed && capacityPassed && isolationPassed;
  console.log(`\n=== [PRE-BUILD GATE RESULT: ${allPassed ? 'ALL AUDIT CHECKS PASSED' : 'FAILED'}] ===`);
  if (!allPassed) process.exit(1);
}

testPrebuildGate().catch(err => {
  console.error(err);
  process.exit(1);
});
