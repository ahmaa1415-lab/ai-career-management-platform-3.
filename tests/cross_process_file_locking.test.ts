/**
 * Synthetic Test Suite: Cross-Process File Lock Coordination, Lease Expiration & Crash Recovery
 *
 * Verifies that FileDeletionLockCoordinator coordinates deletion leases, reference leases,
 * renewal heartbeats, fencing token protections, and crash recovery across separate Node processes
 * via the durable SQLite `file_coordination_leases` table.
 *
 * Covers:
 * - Interleaving A: Upload reference lease blocks concurrent deletion lease.
 * - Interleaving B: Deletion lease blocks concurrent upload reference lease.
 * - Interleaving C: Upload pause between lease acquisition and DB commit keeps deletion blocked.
 * - Interleaving D: Deletion pause between lease acquisition and unlinking keeps upload blocked.
 * - Interleaving E: Crashed process lease prevents unsafe premature deletion & auto-expires without deadlock.
 * - Interleaving F: Concurrent operations on unrelated file paths do not block each other.
 * - Interleaving G: Multi-tenant shared physical file is preserved when User A wipes while User B still references it.
 * - Scenario 8 (Renewal Heartbeat): Long-running upload outlives initial short TTL via heartbeat renewal.
 * - Scenario 9 (Stale Release Guard): Stale process cannot release a newer lease held by another process.
 * - Scenario 10 (Stale Renewal Guard): Expired lease cannot be renewed by a stale process.
 * - Scenario 11 (Fail-Closed Fencing): Failed renewal prevents database commit and throws Concurrency Conflict.
 * - Scenario 12 (Orphan Recovery): Crash after file-write before DB commit leaves recoverable orphan cleaned safely.
 *
 * Runs exclusively on an isolated SQLite test database and isolated uploads directory.
 * Uses ONLY synthetic records and files — zero real candidate CV access.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { spawn, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

// 1. Configure isolated test environment
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `cross_proc_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const testUploadsDir = path.join(testDbDir, `uploads_xproc_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Load DB bound to isolated test database
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { fileLockCoordinator, wipeAllUserData, cleanupOrphanedUploadFiles, safelyDeletePersistentUpload } = await import('../lib/security');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

const workerScript = path.join(process.cwd(), 'tests', 'helpers', 'xproc_worker.mjs');

console.log('\n========================================================');
console.log('  CROSS-PROCESS LEASE EXPIRATION & CRASH RECOVERY SUITE');
console.log('  Target: Mutually Exclusive Leases, Renewal & Recovery');
console.log('  Database: Isolated test database (data/test_tenant_isolation)');
console.log('========================================================\n');

async function runAllTests() {
  // Interleaving A: Upload reference lease blocks concurrent deletion lease across processes
  await test('Interleaving A: Upload reference lease blocks concurrent deletion lease across processes', () => {
    const targetFile = path.join(testUploadsDir, `interleaving_a_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'content for interleaving A');

    const childAcquire = spawnSync('node', [workerScript, 'acquire_ref', targetFile, 'upload_worker_A', '30000'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(childAcquire.status, 10, 'Child upload worker must acquire reference lease');

    const delAcquired = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe');
    assert.strictEqual(delAcquired, false, 'Deletion lease MUST be rejected while upload holds reference lease');
    assert.strictEqual(fs.existsSync(targetFile), true, 'File must remain intact on disk');

    const childRelease = spawnSync('node', [workerScript, 'release_ref', targetFile, 'upload_worker_A'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(childRelease.status, 0, 'Child must release reference lease');

    const delAcquiredAfter = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe');
    assert.strictEqual(delAcquiredAfter, true, 'Deletion lease succeeds after reference lease released');
    fileLockCoordinator.releaseDeletionLease(targetFile, 'parent_wipe');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Interleaving B: Deletion lease blocks concurrent upload reference lease across processes
  await test('Interleaving B: Deletion lease blocks concurrent upload reference lease across processes', () => {
    const targetFile = path.join(testUploadsDir, `interleaving_b_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'content for interleaving B');

    const childAcquire = spawnSync('node', [workerScript, 'acquire_del', targetFile, 'wipe_worker_B', '30000'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(childAcquire.status, 10, 'Child wipe worker must acquire deletion lease');

    const refAcquired = fileLockCoordinator.acquireReferenceLease(targetFile, 30000, 'parent_upload');
    assert.strictEqual(refAcquired, false, 'Reference lease MUST be rejected while deletion lease is held');

    assert.throws(
      () => fileLockCoordinator.assertCanReferenceFile(targetFile),
      (err: any) => err.message.includes('Concurrency Conflict'),
      'assertCanReferenceFile must throw Concurrency Conflict error'
    );

    const childRelease = spawnSync('node', [workerScript, 'release_del', targetFile, 'wipe_worker_B'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(childRelease.status, 0, 'Child must release deletion lease');

    const refAfter = fileLockCoordinator.acquireReferenceLease(targetFile, 30000, 'parent_upload');
    assert.strictEqual(refAfter, true, 'Reference lease succeeds after deletion lease released');
    fileLockCoordinator.releaseReferenceLease(targetFile, 'parent_upload');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Interleaving C: Upload pause between lease acquisition and DB commit keeps deletion blocked
  await test('Interleaving C: Upload pause between lease acquisition and DB commit keeps deletion blocked', async () => {
    const targetFile = path.join(testUploadsDir, `interleaving_c_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'content for interleaving C');

    const child = spawn('node', [workerScript, 'hold_ref_and_pause', targetFile, 'pause_worker_C', '1500'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      stdio: 'pipe'
    });

    // Wait until child has actively registered its reference lease
    const startC = Date.now();
    while (!fileLockCoordinator.isPathReferenced(targetFile) && Date.now() - startC < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const delDuringPause = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_C');
    assert.strictEqual(delDuringPause, false, 'Deletion MUST remain blocked while upload is paused before DB commit');
    assert.strictEqual(fs.existsSync(targetFile), true, 'File must remain intact during upload pause');

    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    const delAfterPause = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_C');
    assert.strictEqual(delAfterPause, true, 'Deletion succeeds after upload completes');
    fileLockCoordinator.releaseDeletionLease(targetFile, 'parent_wipe_C');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Interleaving D: Deletion pause between lease acquisition and unlinking keeps upload blocked
  await test('Interleaving D: Deletion pause between lease acquisition and unlinking keeps upload blocked', async () => {
    const targetFile = path.join(testUploadsDir, `interleaving_d_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'content for interleaving D');

    const child = spawn('node', [workerScript, 'hold_del_and_pause', targetFile, 'pause_worker_D', '1500'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      stdio: 'pipe'
    });

    // Wait until child has actively registered its deletion lease
    const startD = Date.now();
    while (!fileLockCoordinator.isPathDeleting(targetFile) && Date.now() - startD < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const refDuringPause = fileLockCoordinator.acquireReferenceLease(targetFile, 30000, 'parent_upload_D');
    assert.strictEqual(refDuringPause, false, 'Upload MUST remain blocked while deletion is paused before unlinking');

    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    const refAfterPause = fileLockCoordinator.acquireReferenceLease(targetFile, 30000, 'parent_upload_D');
    assert.strictEqual(refAfterPause, true, 'Upload succeeds after deletion completes');
    fileLockCoordinator.releaseReferenceLease(targetFile, 'parent_upload_D');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Interleaving E: Process crashes while holding lease; expiry prevents unsafe deletion & prevents deadlock
  await test('Interleaving E: Crashed process lease prevents unsafe premature deletion; automatically expires without deadlock', async () => {
    const targetFile = path.join(testUploadsDir, `interleaving_e_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'content for interleaving E');

    const child = spawnSync('node', [workerScript, 'crash_holding_ref', targetFile, 'crashed_worker_E', '1200'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(child.status, 99, 'Child must exit with crash code 99');

    const delImmediate = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_E');
    assert.strictEqual(delImmediate, false, 'Unsafe deletion MUST NOT be permitted while lease is within duration window');

    await new Promise((resolve) => setTimeout(resolve, 1400));

    const delAfterExpiry = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_E');
    assert.strictEqual(delAfterExpiry, true, 'Subsequent operation claims lease cleanly after expiry (no deadlock)');
    fileLockCoordinator.releaseDeletionLease(targetFile, 'parent_wipe_E');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Interleaving F: Two concurrent operations on unrelated file paths must not block each other
  await test('Interleaving F: Concurrent operations on unrelated file paths do not block each other', () => {
    const targetFile1 = path.join(testUploadsDir, `unrelated_1_${Date.now()}.pdf`);
    const targetFile2 = path.join(testUploadsDir, `unrelated_2_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile1, 'unrelated file 1');
    fs.writeFileSync(targetFile2, 'unrelated file 2');

    const childAcquire = spawnSync('node', [workerScript, 'acquire_del', targetFile1, 'worker_file1', '30000'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(childAcquire.status, 10, 'Child acquires deletion lease on file 1');

    const parentRefAcquired = fileLockCoordinator.acquireReferenceLease(targetFile2, 30000, 'worker_file2');
    assert.strictEqual(parentRefAcquired, true, 'Operations on independent paths MUST NOT block each other');

    fileLockCoordinator.releaseReferenceLease(targetFile2, 'worker_file2');
    spawnSync('node', [workerScript, 'release_del', targetFile1, 'worker_file1'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });

    try { fs.unlinkSync(targetFile1); } catch {}
    try { fs.unlinkSync(targetFile2); } catch {}
  });

  // Interleaving G: Two users referencing same physical file must never lose shared file while valid reference remains
  await test('Interleaving G: Multi-tenant shared physical file is preserved when User A wipes while User B still references it', () => {
    const sharedFile = path.join(testUploadsDir, `shared_resume_${Date.now()}.pdf`);
    fs.writeFileSync(sharedFile, 'shared physical resume bytes');

    const userA = `user_alpha_${Date.now()}`;
    const userB = `user_beta_${Date.now()}`;

    db.prepare("INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, 'dummy')").run(userA, `${userA}@test.com`, 'User Alpha');
    db.prepare("INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, 'dummy')").run(userB, `${userB}@test.com`, 'User Beta');

    const resumeA = `res_a_${Date.now()}`;
    const resumeB = `res_b_${Date.now()}`;

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Alpha CV', 'Master', 'Dev', 'US', 'text', 85, 1, 'cv.pdf', ?)
    `).run(resumeA, userA, sharedFile);

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Beta CV', 'Master', 'Dev', 'US', 'text', 88, 1, 'cv.pdf', ?)
    `).run(resumeB, userB, sharedFile);

    const wipeResultA = wipeAllUserData(userA);
    assert.strictEqual(wipeResultA.success, true, 'User A wipe must succeed');

    const userARow = db.prepare('SELECT id FROM users WHERE id = ?').get(userA);
    assert.strictEqual(userARow, undefined, 'User A user record must be deleted');
    const resumeARow = db.prepare('SELECT id FROM resumes WHERE id = ?').get(resumeA);
    assert.strictEqual(resumeARow, undefined, 'User A resume record must be deleted');

    assert.strictEqual(fs.existsSync(sharedFile), true, 'Shared physical file MUST BE PRESERVED while User B reference remains');

    const wipeResultB = wipeAllUserData(userB);
    assert.strictEqual(wipeResultB.success, true, 'User B wipe must succeed');

    const userBRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userB);
    assert.strictEqual(userBRow, undefined, 'User B user record must be deleted');

    assert.strictEqual(fs.existsSync(sharedFile), false, 'Shared physical file must be unlinked once ALL references are wiped');
  });

  // Scenario 8: Long-running operation outlives initial short TTL via heartbeat renewal
  await test('Scenario 8: Heartbeat continuously renews lease so long-running upload cannot lose protection to fixed TTL', async () => {
    const targetFile = path.join(testUploadsDir, `heartbeat_target_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'heartbeat test file bytes');

    // Child runs with short 450ms initial TTL, renewed every 150ms for total of 1500ms
    const child = spawn('node', [workerScript, 'hold_ref_with_heartbeat', targetFile, 'hb_worker_8', '150', '1500'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      stdio: 'pipe'
    });

    // Wait until child has actively registered its reference lease
    const startHb = Date.now();
    while (!fileLockCoordinator.isPathReferenced(targetFile) && Date.now() - startHb < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Wait 700ms (which is well past the initial 450ms TTL!)
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Deletion must STILL be blocked because heartbeat extended the lease!
    const delPastInitialTtl = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_8');
    assert.strictEqual(delPastInitialTtl, false, 'Deletion MUST remain blocked past initial TTL due to active heartbeat renewal');

    // Wait for child to finish total duration and release lease
    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    // Now deletion succeeds
    const delAfterHb = fileLockCoordinator.acquireDeletionLease(targetFile, 30000, 'parent_wipe_8');
    assert.strictEqual(delAfterHb, true, 'Deletion succeeds once heartbeat process completes and releases');
    fileLockCoordinator.releaseDeletionLease(targetFile, 'parent_wipe_8');

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Scenario 9: Stale process cannot release a newer lease held by another process
  await test('Scenario 9: Stale process attempting to release newer lease fails safely without releasing newer lease', () => {
    const targetFile = path.join(testUploadsDir, `stale_target_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'stale test file bytes');

    const staleHolder = 'stale_worker_proc_99';
    const staleToken = 'tok_stale_old_111';

    const newerHolder = 'newer_worker_proc_01';
    const newerToken = 'tok_newer_active_222';

    // 1. Stale worker acquires lease with short TTL (200ms)
    fileLockCoordinator.acquireReferenceLease(targetFile, 200, staleHolder, staleToken);

    // Wait 250ms for stale lease to expire
    const startWait = Date.now();
    while (Date.now() - startWait < 250) {}

    // 2. Newer worker acquires lease on same path with newer token
    const newerAcquired = fileLockCoordinator.acquireReferenceLease(targetFile, 30000, newerHolder, newerToken);
    assert.strictEqual(newerAcquired, true, 'Newer worker must acquire lease');

    // 3. Stale worker attempts to release lease using its old stale token
    fileLockCoordinator.releaseReferenceLease(targetFile, staleHolder, staleToken);

    // 4. Verify newer worker's lease is STILL ACTIVE and UNTOUCHED
    assert.strictEqual(
      fileLockCoordinator.isPathReferenced(targetFile),
      true,
      'Newer lease MUST NOT be released by stale worker release call'
    );
    assert.doesNotThrow(() => {
      fileLockCoordinator.assertReferenceLeaseValid(targetFile, newerHolder, newerToken);
    });

    // Newer worker releases its own lease cleanly
    fileLockCoordinator.releaseReferenceLease(targetFile, newerHolder, newerToken);
    assert.strictEqual(fileLockCoordinator.isPathReferenced(targetFile), false);

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Scenario 10: Stale process attempting to renew an expired lease is rejected
  await test('Scenario 10: Stale process attempting to renew an expired lease is strictly rejected', async () => {
    const targetFile = path.join(testUploadsDir, `expired_renew_target_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'expired renew target bytes');

    const workerId = 'stale_renew_worker_10';
    const token = 'tok_stale_renew_10';

    // Acquire lease with very short TTL (200ms)
    fileLockCoordinator.acquireReferenceLease(targetFile, 200, workerId, token);

    // Wait for lease to expire
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Stale worker attempts to renew its expired lease
    const renewResult = fileLockCoordinator.renewReferenceLease(targetFile, workerId, token, 30000);
    assert.strictEqual(renewResult, false, 'Renewal MUST return false for an expired lease');

    // Verify lease is not treated as active
    assert.throws(
      () => fileLockCoordinator.assertReferenceLeaseValid(targetFile, workerId, token),
      (err: any) => err.message.includes('expired'),
      'assertReferenceLeaseValid must throw expired error'
    );

    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Scenario 11: Fail-closed fencing token aborts database insertion when lease is lost or expired
  await test('Scenario 11: Fencing validation fails closed before database commit when lease expires or is stolen', () => {
    const targetFile = path.join(testUploadsDir, `fencing_target_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'fencing test file bytes');

    const workerId = 'fencing_worker_11';
    const validToken = 'tok_valid_11';
    const wrongToken = 'tok_wrong_99';

    // 1. Token mismatch check
    fileLockCoordinator.acquireReferenceLease(targetFile, 30000, workerId, validToken);
    assert.throws(
      () => fileLockCoordinator.assertReferenceLeaseValid(targetFile, workerId, wrongToken),
      (err: any) => err.message.includes('Stale lease token'),
      'Token mismatch must throw Concurrency Conflict'
    );

    // 2. Non-existent holder check
    assert.throws(
      () => fileLockCoordinator.assertReferenceLeaseValid(targetFile, 'unknown_worker', validToken),
      (err: any) => err.message.includes('does not exist or was lost'),
      'Missing lease must throw Concurrency Conflict'
    );

    fileLockCoordinator.releaseReferenceLease(targetFile, workerId, validToken);
    try { fs.unlinkSync(targetFile); } catch {}
  });

  // Scenario 12: Crash recovery cleans up orphaned physical files without creating dangling DB references
  await test('Scenario 12: Orphaned physical file from crashed upload process is safely reclaimed', () => {
    const orphanFile = path.join(testUploadsDir, `res_orphan_${Date.now()}_file.pdf`);

    // Child process writes file and crashes (exits 99) before DB insertion
    const child = spawnSync('node', [workerScript, 'write_file_and_crash', orphanFile, 'crashed_uploader_12', '100'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      encoding: 'utf8'
    });
    assert.strictEqual(child.status, 99, 'Child must exit with crash code 99');
    assert.strictEqual(fs.existsSync(orphanFile), true, 'Orphaned physical file exists on disk');

    // Wait 150ms for lease TTL to expire
    const startWait = Date.now();
    while (Date.now() - startWait < 150) {}

    // Verify DB has zero references to this file
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path = ?').get(orphanFile) as { count: number };
    assert.strictEqual(dbCount.count, 0, 'Database must have zero references to orphaned file');

    // Run orphan cleanup with 0ms threshold
    const cleanupResult = cleanupOrphanedUploadFiles(0);
    assert.strictEqual(cleanupResult.success, true);
    assert.strictEqual(cleanupResult.cleanedFiles.includes(path.resolve(orphanFile)), true, 'Orphan file must be cleaned');
    assert.strictEqual(fs.existsSync(orphanFile), false, 'Orphan physical file must be unlinked from disk');
  });

  // Scenario 13: Stale upload process in error cleanup cannot delete file when a new upload process has acquired an active reference lease
  await test('Scenario 13: Stale upload process error cleanup cannot delete file actively referenced by another process', async () => {
    const sharedFile = path.join(testUploadsDir, `res_shared_${Date.now()}_conflict.pdf`);
    fs.writeFileSync(sharedFile, 'shared content between old and new upload');

    // Child process B (new upload) acquires reference lease and holds it for 1200ms
    const childB = spawn('node', [workerScript, 'hold_ref_and_pause', sharedFile, 'new_uploader_B', '1200'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: testDbPath, UPLOADS_DIR: testUploadsDir },
      stdio: 'pipe'
    });

    // Wait until child B writes its reference lease to SQLite
    const startWait = Date.now();
    while (!fileLockCoordinator.isPathReferenced(sharedFile) && Date.now() - startWait < 3000) {
      await new Promise(r => setTimeout(r, 50));
    }
    assert.strictEqual(fileLockCoordinator.isPathReferenced(sharedFile), true, 'Child B must hold active reference lease');

    // Process A (stale old upload) enters error cleanup and attempts coordinated deletion
    const cleanupResult = safelyDeletePersistentUpload(sharedFile, {
      holderPrefix: 'stale_uploader_A',
      reason: 'Old upload aborted due to conflict'
    });

    // Deletion must be rejected because Child B holds an active reference lease
    assert.strictEqual(cleanupResult.unlinked, false, 'Stale upload must not unlink file while another process holds reference lease');
    assert.strictEqual(fs.existsSync(sharedFile), true, 'Physical file must be preserved on disk');
    assert.strictEqual(cleanupResult.skippedReason?.includes('actively referenced or locked'), true);

    // Wait for child B to finish cleanly
    await new Promise(resolve => childB.on('close', resolve));
    try { fs.unlinkSync(sharedFile); } catch {}
  });

  // Scenario 14: Coordinated deletion cannot remove a file referenced by another tenant in database
  await test('Scenario 14: Coordinated deletion cannot remove a file referenced by another tenant in database', () => {
    const tenantBFile = path.join(testUploadsDir, `res_tenantB_${Date.now()}_active.pdf`);
    fs.writeFileSync(tenantBFile, 'tenant B valid resume document');

    // Ensure Tenant B exists in users table (satisfies foreign key constraint)
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name)
      VALUES ('user_tenant_B', 'user_b@example.com', 'Tenant B User')
    `).run();

    // Tenant B has an active resume referencing this file
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, original_filename, stored_file_path, type, ats_score, version, raw_text)
      VALUES (?, 'user_tenant_B', 'Tenant B Resume', 'resume.pdf', ?, 'Master', 85, 1, 'text')
    `).run(`res_tb_${Date.now()}`, tenantBFile);

    // Process A enters cleanup (e.g. upload abort or user wipe for Tenant A)
    const result = safelyDeletePersistentUpload(tenantBFile, {
      holderPrefix: 'tenant_A_cleanup',
      reason: 'Upload cleanup for Tenant A'
    });

    // Deletion must be refused because Tenant B references the file
    assert.strictEqual(result.unlinked, false, 'Must not unlink file referenced by Tenant B');
    assert.strictEqual(fs.existsSync(tenantBFile), true, 'Physical file must remain on disk');
    assert.strictEqual(result.skippedReason?.includes('referenced by 1 database resume record(s)'), true);

    // Clean up DB and file
    db.prepare('DELETE FROM resumes WHERE stored_file_path = ?').run(tenantBFile);
    try { fs.unlinkSync(tenantBFile); } catch {}
  });

  // Scenario 15: Deletion with expired or invalid deletion lease strictly fails closed
  await test('Scenario 15: Expired deletion lease or token mismatch strictly fails closed and preserves file', async () => {
    const testFile = path.join(testUploadsDir, `res_exp_${Date.now()}_file.pdf`);
    fs.writeFileSync(testFile, 'file with expiring deletion lease');

    const workerId = `del_worker_${Date.now()}`;
    const token = `tok_del_${Date.now()}`;

    // 1. Expired deletion lease
    const acquired = fileLockCoordinator.acquireDeletionLease(testFile, 50, workerId, token);
    assert.strictEqual(acquired, true);

    // Wait 100ms for lease to expire
    await new Promise(r => setTimeout(r, 100));

    assert.throws(
      () => fileLockCoordinator.assertDeletionLeaseValid(testFile, workerId, token),
      /expired/i,
      'Expired deletion lease must throw Concurrency Conflict'
    );

    // Clean up step 1
    fileLockCoordinator.releaseDeletionLease(testFile, workerId, token);

    // 2. Stale token mismatch on active lease
    const activeToken = `tok_active_${Date.now()}`;
    const acquired2 = fileLockCoordinator.acquireDeletionLease(testFile, 5000, workerId, activeToken);
    assert.strictEqual(acquired2, true, 'Acquisition of active deletion lease must succeed');

    assert.throws(
      () => fileLockCoordinator.assertDeletionLeaseValid(testFile, workerId, 'wrong_token'),
      /stale lease token/i,
      'Token mismatch must throw Concurrency Conflict'
    );

    // 3. Active reference lease concurrently blocks deletion assertion
    const refToken = `tok_ref_${Date.now()}`;
    // Directly inject reference lease to test invariant assertion
    db.prepare(`
      INSERT INTO file_coordination_leases (file_path, lease_type, locked_by, lease_token, locked_at, expires_at)
      VALUES (?, 'reference', 'ref_holder', ?, ?, ?)
    `).run(path.resolve(testFile), refToken, new Date().toISOString(), new Date(Date.now() + 30000).toISOString());

    assert.throws(
      () => fileLockCoordinator.assertDeletionLeaseValid(testFile, workerId, activeToken),
      /Active reference lease held/i,
      'Active reference lease must invalidate deletion assertion'
    );

    fileLockCoordinator.releaseReferenceLease(testFile, 'ref_holder', refToken);
    fileLockCoordinator.releaseDeletionLease(testFile, workerId, activeToken);
    try { fs.unlinkSync(testFile); } catch {}
  });

  // Scenario 16: Coordinated deletion succeeds cleanly on unreferenced, unleased file (normal cleanup path)
  await test('Scenario 16: Coordinated deletion succeeds cleanly on unreferenced and unleased file', () => {
    const targetFile = path.join(testUploadsDir, `res_clean_${Date.now()}_file.pdf`);
    fs.writeFileSync(targetFile, 'unreferenced file ready for deletion');
    assert.strictEqual(fs.existsSync(targetFile), true);

    const result = safelyDeletePersistentUpload(targetFile, {
      holderPrefix: 'normal_cleaner',
      reason: 'Normal unreferenced file deletion'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.unlinked, true, 'File must be unlinked');
    assert.strictEqual(fs.existsSync(targetFile), false, 'Physical file must no longer exist on disk');
    assert.strictEqual(fileLockCoordinator.isPathDeleting(targetFile), false, 'Deletion lease must be released');
  });
}

runAllTests().then(() => {
  try {
    db.close();
    delete (globalThis as any)._careerAppDb;
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    if (fs.existsSync(testUploadsDir)) {
      try { fs.rmSync(testUploadsDir, { recursive: true, force: true }); } catch {}
    }
  } catch (_) {}

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`>>> CROSS-PROCESS LEASE & CRASH RECOVERY: ALL ${passed} TESTS PASSED <<<`);
    process.exit(0);
  } else {
    console.log(`>>> CROSS-PROCESS LEASE & CRASH RECOVERY: ${passed} PASSED, ${failed} FAILED <<<`);
    process.exit(1);
  }
});
