/**
 * Synthetic Test Suite: Symlink Deletion Semantics & Concurrent Shared-File Protection
 *
 * Runs exclusively on an isolated SQLite test database and isolated uploads directory.
 * Uses ONLY synthetic records and files — never accesses real candidate data.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Configure isolated test environment
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `isolated_conc_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const testUploadsDir = path.join(testDbDir, `uploads_conc_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Load DB bound to isolated test database
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { wipeAllUserData, isPathContained, fileLockCoordinator } = await import('../lib/security');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(
        () => {
          console.log(`  ✓ ${name}`);
          passed++;
        },
        (err) => {
          console.error(`  ✗ ${name}: ${err.message}`);
          failed++;
        }
      );
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\n========================================================');
console.log('  SYMLINK DELETION & CONCURRENT FILE PROTECTION TEST SUITE');
console.log('  Database: Isolated test database (data/test_tenant_isolation)');
console.log('  Synthetic records only — zero real CVs');
console.log('========================================================\n');

async function runAllTests() {
  // --------------------------------------------------------------------------
  // SECTION B: SYMLINK DELETION SEMANTICS
  // --------------------------------------------------------------------------

  // Test 1: Internal Symlink: unlink removes ONLY the symlink, NOT the target
  await test('Symlink Deletion: Unlink removes ONLY the symlink itself; target file is NOT deleted', () => {
    const uSym1 = `user_sym1_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Sym1')").run(uSym1, `${uSym1}@example.com`);

    // Create real target file inside uploads
    const targetFile = path.join(testUploadsDir, `real_target_${Date.now()}.pdf`);
    fs.writeFileSync(targetFile, 'target content that MUST survive');
    assert.strictEqual(fs.existsSync(targetFile), true);

    // Create symlink pointing to target
    const symlinkPath = path.join(testUploadsDir, `symlink_to_target_${Date.now()}.pdf`);
    let symlinkCreated = false;
    try {
      fs.symlinkSync(targetFile, symlinkPath, 'file');
      symlinkCreated = true;
    } catch (_) {
      // If Windows developer mode is off, skip physical symlink creation
    }

    if (symlinkCreated) {
      // Seed resume pointing to the SYMLINK
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'Symlink Resume', 'master', 'text', 1, 'link.pdf', ?)
      `).run(`res_${uSym1}`, uSym1, symlinkPath);

      const result = wipeAllUserData(uSym1);
      assert.strictEqual(result.success, true);

      // PROOF: Symlink itself is deleted
      assert.strictEqual(fs.existsSync(symlinkPath), false, 'The symlink itself must be unlinked');

      // CRITICAL PROOF: Symlink target was NOT deleted through the link!
      assert.strictEqual(fs.existsSync(targetFile), true, 'The symlink target MUST NOT be deleted through the link!');

      // Cleanup target
      try { fs.unlinkSync(targetFile); } catch {}
    } else {
      // Verify path containment logic
      assert.strictEqual(isPathContained(targetFile, testUploadsDir), true);
    }
  });

  // Test 2: External Symlink target remains untouched
  await test('Symlink Deletion: Symlink pointing outside uploads is rejected; external target is untouched', () => {
    const uSym2 = `user_sym2_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Sym2')").run(uSym2, `${uSym2}@example.com`);

    const externalFile = path.join(testDbDir, `external_sensitive_${Date.now()}.txt`);
    fs.writeFileSync(externalFile, 'external secret data');

    const symlinkInside = path.join(testUploadsDir, `symlink_ext_${Date.now()}.pdf`);
    let symlinkCreated = false;
    try {
      fs.symlinkSync(externalFile, symlinkInside, 'file');
      symlinkCreated = true;
    } catch (_) {}

    if (symlinkCreated) {
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'External Symlink', 'master', 'text', 1, 'ext.pdf', ?)
      `).run(`res_${uSym2}`, uSym2, symlinkInside);

      const result = wipeAllUserData(uSym2);
      assert.strictEqual(result.success, true);
      assert.strictEqual(fs.existsSync(externalFile), true, 'External target must remain untouched!');
      assert.ok(result.fileDeletionErrors.some(e => e.error.includes('Security Violation')));

      try { fs.unlinkSync(symlinkInside); } catch {}
      try { fs.unlinkSync(externalFile); } catch {}
    } else {
      assert.strictEqual(isPathContained(externalFile, testUploadsDir), false);
    }
  });

  // Test 3: Dangling symlink is handled safely without deleting unintended targets
  await test('Symlink Deletion: Dangling symlink is safely unlinked without unintended side-effects', () => {
    const uSym3 = `user_sym3_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Sym3')").run(uSym3, `${uSym3}@example.com`);

    const nonExistentTarget = path.join(testUploadsDir, `ghost_target_${Date.now()}.pdf`);
    const danglingLink = path.join(testUploadsDir, `dangling_${Date.now()}.pdf`);
    let symlinkCreated = false;
    try {
      fs.symlinkSync(nonExistentTarget, danglingLink, 'file');
      symlinkCreated = true;
    } catch (_) {}

    if (symlinkCreated) {
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'Dangling Resume', 'master', 'text', 1, 'dang.pdf', ?)
      `).run(`res_${uSym3}`, uSym3, danglingLink);

      const result = wipeAllUserData(uSym3);
      assert.strictEqual(result.success, true);
      assert.strictEqual(fs.existsSync(danglingLink), false, 'Dangling symlink itself was removed');
    }
  });

  // Test 4: Directory cannot be deleted through wipe
  await test('Filesystem Safety: Directory supplied as upload path is rejected and NOT deleted', () => {
    const uDir = `user_dir_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Dir')").run(uDir, `${uDir}@example.com`);

    const subDir = path.join(testUploadsDir, `sub_directory_${Date.now()}`);
    fs.mkdirSync(subDir, { recursive: true });
    assert.strictEqual(fs.existsSync(subDir), true);

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Dir Resume', 'master', 'text', 1, 'dir', ?)
    `).run(`res_${uDir}`, uDir, subDir);

    const result = wipeAllUserData(uDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(fs.existsSync(subDir), true, 'Directory MUST NOT be deleted!');
    assert.ok(result.fileDeletionErrors.some(e => e.error.includes('not a regular file')));

    try { fs.rmdirSync(subDir); } catch {}
  });

  // --------------------------------------------------------------------------
  // SECTION C: CONCURRENT SHARED-FILE PROTECTION (5 SCENARIOS)
  // --------------------------------------------------------------------------

  // Scenario 1: Upload attempts to reference a file while wipe is deleting it
  await test('Scenario 1: Upload attempts to reference a file while wipe is deleting it (fails closed)', () => {
    const activeDeletingFile = path.join(testUploadsDir, `active_deleting_${Date.now()}.pdf`);
    fs.writeFileSync(activeDeletingFile, 'content in deletion window');

    // Acquire lease to simulate active deletion window
    const acquired = fileLockCoordinator.acquireDeletionLease(activeDeletingFile);
    assert.strictEqual(acquired, true, 'Deletion lease must be acquired');
    assert.strictEqual(fileLockCoordinator.isPathDeleting(activeDeletingFile), true);

    try {
      // An upload attempt checking the reference must be rejected with concurrency conflict
      assert.throws(
        () => fileLockCoordinator.assertCanReferenceFile(activeDeletingFile),
        /Concurrency Conflict: File .* is actively undergoing deletion/
      );
    } finally {
      fileLockCoordinator.releaseDeletionLease(activeDeletingFile);
    }

    // After release, reference check succeeds
    assert.doesNotThrow(() => fileLockCoordinator.assertCanReferenceFile(activeDeletingFile));
    try { fs.unlinkSync(activeDeletingFile); } catch {}
  });

  // Scenario 2: Two users wipe references to the same physical file concurrently
  await test('Scenario 2: Two users wipe references to the same physical file concurrently (no double-free)', async () => {
    const uC2A = `user_c2a_${Date.now()}`;
    const uC2B = `user_c2b_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User C2A')").run(uC2A, `${uC2A}@example.com`);
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User C2B')").run(uC2B, `${uC2B}@example.com`);

    const sharedFile2 = path.join(testUploadsDir, `shared_concurrent_${Date.now()}.pdf`);
    fs.writeFileSync(sharedFile2, 'concurrent wipe target');

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume 2A', 'master', 'text', 1, 'c2.pdf', ?)
    `).run(`res_${uC2A}`, uC2A, sharedFile2);

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume 2B', 'master', 'text', 1, 'c2.pdf', ?)
    `).run(`res_${uC2B}`, uC2B, sharedFile2);

    // Execute both wipe operations concurrently
    const [resA, resB] = await Promise.all([
      Promise.resolve().then(() => wipeAllUserData(uC2A)),
      Promise.resolve().then(() => wipeAllUserData(uC2B))
    ]);

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);

    // Both users must be deleted
    assert.strictEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(uC2A), undefined);
    assert.strictEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(uC2B), undefined);

    // The shared file must now be deleted since both users wiped
    assert.strictEqual(fs.existsSync(sharedFile2), false, 'Shared file must be deleted after both users wiped');
  });

  // Scenario 3: A new reference is committed immediately before the deletion check
  await test('Scenario 3: A new reference is committed immediately before the deletion check (file preserved)', () => {
    const uC3A = `user_c3a_${Date.now()}`;
    const uC3B = `user_c3b_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User C3A')").run(uC3A, `${uC3A}@example.com`);
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User C3B')").run(uC3B, `${uC3B}@example.com`);

    const raceFile = path.join(testUploadsDir, `race_upload_${Date.now()}.pdf`);
    fs.writeFileSync(raceFile, 'race upload content');

    // User A has this file initially
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume A', 'master', 'text', 1, 'race.pdf', ?)
    `).run(`res_${uC3A}`, uC3A, raceFile);

    // Concurrently: User B commits a reference immediately before the deletion check
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume B Concurrently Added', 'master', 'text', 1, 'race.pdf', ?)
    `).run(`res_${uC3B}`, uC3B, raceFile);

    // Now User A's wipe executes
    const result = wipeAllUserData(uC3A);
    assert.strictEqual(result.success, true);

    // User B's reference MUST protect the file from being unlinked
    assert.strictEqual(fs.existsSync(raceFile), true, 'File referenced by User B MUST be protected from deletion!');
    assert.strictEqual(result.filesDeleted.includes(raceFile), false);

    // User A must be gone, User B must be intact
    assert.strictEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(uC3A), undefined);
    const userBRes = db.prepare('SELECT * FROM resumes WHERE user_id = ?').get(uC3B);
    assert.ok(userBRes, 'User B resume reference must remain intact');
  });

  // Scenario 4: A new reference attempts to commit during the deletion window
  await test('Scenario 4: A new reference attempts to commit during the deletion window (lease blocks reference)', () => {
    const windowFile = path.join(testUploadsDir, `deletion_window_${Date.now()}.pdf`);
    fs.writeFileSync(windowFile, 'deletion window test');

    // Lease active
    const lease = fileLockCoordinator.acquireDeletionLease(windowFile);
    assert.strictEqual(lease, true);

    try {
      // Simulate resume upload handler checking file coordination before insertion
      let blocked = false;
      try {
        fileLockCoordinator.assertCanReferenceFile(windowFile);
      } catch (err: any) {
        blocked = true;
        assert.ok(err.message.includes('Concurrency Conflict'));
      }
      assert.strictEqual(blocked, true, 'Commit during deletion window must be blocked');
    } finally {
      fileLockCoordinator.releaseDeletionLease(windowFile);
    }

    try { fs.unlinkSync(windowFile); } catch {}
  });

  // Scenario 5: A failed deletion remains recoverable
  await test('Scenario 5: A failed physical deletion remains recoverable (auditable error, DB committed, lease freed)', () => {
    const uC5 = `user_c5_${Date.now()}`;
    db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User C5')").run(uC5, `${uC5}@example.com`);

    // Create a read-only directory acting as a file path so fs.unlink fails (or invalid permission)
    const blockedPath = path.join(testUploadsDir, `unremovable_${Date.now()}.pdf`);
    fs.mkdirSync(blockedPath); // directory cannot be unlinked via fs.unlinkSync

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Unremovable File', 'master', 'text', 1, 'unremovable.pdf', ?)
    `).run(`res_${uC5}`, uC5, blockedPath);

    const result = wipeAllUserData(uC5);

    // Wipe succeeds at DB level (account and data wiped)
    assert.strictEqual(result.success, true);
    assert.strictEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(uC5), undefined);

    // File deletion failure is recorded in fileDeletionErrors for audit/recovery
    assert.ok(result.fileDeletionErrors.length > 0, 'Deletion error must be recorded');
    assert.strictEqual(result.fileDeletionErrors[0].path, blockedPath);

    // Coordinator lease was safely released in finally block
    assert.strictEqual(fileLockCoordinator.isPathDeleting(blockedPath), false, 'Lease must be freed after failure');

    try { fs.rmdirSync(blockedPath); } catch {}
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
    console.log(`>>> SYMLINK & CONCURRENCY: ALL ${passed} TESTS PASSED <<<`);
    process.exit(0);
  } else {
    console.log(`>>> SYMLINK & CONCURRENCY: ${passed} PASSED, ${failed} FAILED <<<`);
    process.exit(1);
  }
});
