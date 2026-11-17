/**
 * Wipe Hardening & Transaction Rollback Test Suite — P0-C / P0-D
 *
 * Uses ONLY synthetic users and synthetic records.
 * Never reads, opens, parses, uploads, or processes any real candidate CV.
 * Runs against an isolated SQLite test database (data/test_tenant_isolation/...)
 * to ensure complete isolation from production/development data.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Configure isolated test database environment
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `isolated_wipe_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const testUploadsDir = path.join(testDbDir, `uploads_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Load DB bound to isolated test file
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { wipeAllUserData, exportCompleteUserData, isPathContained } = await import('../lib/security');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\n========================================================');
console.log('  P0 WIPE HARDENING & RECOVERABLE FAILURE TEST SUITE');
console.log('  Database: Isolated test database (data/test_tenant_isolation)');
console.log('  Synthetic data only — zero real CVs or personal data');
console.log('========================================================\n');

try {
  // --- 1. Validation of missing user ID --------------------------------------
  test('wipeAllUserData rejects missing, empty, or whitespace userId', () => {
    assert.throws(() => wipeAllUserData('' as any), /userId is required/i);
    assert.throws(() => wipeAllUserData('   ' as any), /userId is required/i);
    assert.throws(() => (wipeAllUserData as any)(), /userId is required/i);
  });

  // --- 2. Canonical path containment validation -----------------------------
  test('isPathContained correctly identifies permitted vs traversal paths', () => {
    const validInside = path.join(testUploadsDir, 'resume_123.pdf');
    const traversalOutside = path.join(testUploadsDir, '..', '..', 'windows', 'system32', 'calc.exe');
    const dataDirOutsideUploads = path.join(testDbDir, 'career_app.db');
    const absoluteOutside = path.resolve('/outside/directory/file.pdf');

    assert.strictEqual(isPathContained(validInside, testUploadsDir), true);
    assert.strictEqual(isPathContained(traversalOutside, testUploadsDir), false);
    assert.strictEqual(isPathContained(dataDirOutsideUploads, testUploadsDir), false);
    assert.strictEqual(isPathContained(absoluteOutside, testUploadsDir), false);
  });

  // --- 3. User A wipe preserves User B database records ----------------------
  test('wipeAllUserData for User A preserves User B records', () => {
    const uA = `user_wipe_A_${Date.now()}`;
    const uB = `user_wipe_B_${Date.now()}`;

    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uA, `${uA}@example.com`, 'User A');
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uB, `${uB}@example.com`, 'User B');
    db.prepare('INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, ?)').run(`p_${uA}`, uA, 'A Headline');
    db.prepare('INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, ?)').run(`p_${uB}`, uB, 'B Headline');

    const result = wipeAllUserData(uA);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.userId, uA);

    // User A must be gone
    const rowA = db.prepare('SELECT * FROM users WHERE id = ?').get(uA);
    assert.strictEqual(rowA, undefined);

    // User B must be intact
    const rowB = db.prepare('SELECT * FROM users WHERE id = ?').get(uB);
    assert.ok(rowB, 'User B was removed during User A wipe!');
    const profB = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uB);
    assert.ok(profB, 'User B profile was removed during User A wipe!');
  });

  // --- 4. Simulated SQL deletion failure causes full database rollback -------
  test('Simulated SQL error aborts transaction and rolls back database changes', () => {
    const uC = `user_wipe_C_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uC, `${uC}@example.com`, 'User C');
    db.prepare('INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, ?)').run(`p_${uC}`, uC, 'C Headline');
    db.prepare('INSERT INTO user_settings (id, user_id) VALUES (?, ?)').run(`s_${uC}`, uC);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trigger_test_wipe_abort
      BEFORE DELETE ON user_settings
      WHEN OLD.user_id = '${uC}'
      BEGIN
        SELECT RAISE(ABORT, 'Simulated database failure during user_settings delete');
      END;
    `);

    assert.throws(
      () => wipeAllUserData(uC),
      /Simulated database failure during user_settings delete/
    );

    db.exec('DROP TRIGGER IF EXISTS trigger_test_wipe_abort');

    // VERIFY FULL ROLLBACK
    const rowUserC = db.prepare('SELECT * FROM users WHERE id = ?').get(uC);
    const rowProfC = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uC);
    const rowSettingsC = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uC);

    assert.ok(rowUserC, 'Full rollback verification: User record was deleted despite failure!');
    assert.ok(rowProfC, 'Full rollback verification: Profile was deleted despite failure!');
    assert.ok(rowSettingsC, 'Full rollback verification: Settings was deleted despite failure!');
  });

  // --- 5. SCENARIO 1: Valid file belonging only to User A is unlinked ---------
  test('Scenario 1: Valid unshared file belonging only to User A is deleted', () => {
    const u1 = `user_scen1_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u1, `${u1}@example.com`, 'User 1');

    const file1 = path.join(testUploadsDir, `resume_u1_${Date.now()}.pdf`);
    fs.writeFileSync(file1, 'user 1 synthetic resume content');
    assert.ok(fs.existsSync(file1));

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'User 1 Resume', 'master', 'text', 1, 'resume_1.pdf', ?)
    `).run(`res_${u1}`, u1, file1);

    const result = wipeAllUserData(u1);
    assert.strictEqual(result.success, true);
    assert.ok(result.filesDeleted.includes(file1));
    assert.strictEqual(fs.existsSync(file1), false, 'User 1 file must be deleted');
  });

  // --- 6. SCENARIO 2: File belonging to User B is untouched ------------------
  test('Scenario 2: File belonging to User B is untouched when User A is wiped', () => {
    const u2A = `user_scen2A_${Date.now()}`;
    const u2B = `user_scen2B_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u2A, `${u2A}@example.com`, 'User 2A');
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u2B, `${u2B}@example.com`, 'User 2B');

    const file2B = path.join(testUploadsDir, `resume_u2B_${Date.now()}.pdf`);
    fs.writeFileSync(file2B, 'user 2B synthetic resume content');

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'User 2B Resume', 'master', 'text', 1, 'resume_2b.pdf', ?)
    `).run(`res_${u2B}`, u2B, file2B);

    wipeAllUserData(u2A);
    assert.strictEqual(fs.existsSync(file2B), true, 'User B file must remain intact');
  });

  // --- 7. SCENARIO 3: Shared file referenced by both A and B is preserved ----
  test('Scenario 3: File referenced by both User A and User B is preserved when User A is wiped', () => {
    const u3A = `user_scen3A_${Date.now()}`;
    const u3B = `user_scen3B_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u3A, `${u3A}@example.com`, 'User 3A');
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u3B, `${u3B}@example.com`, 'User 3B');

    const sharedFile = path.join(testUploadsDir, `shared_resume_${Date.now()}.pdf`);
    fs.writeFileSync(sharedFile, 'shared synthetic resume content');

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume A', 'master', 'text', 1, 'shared.pdf', ?)
    `).run(`res_${u3A}`, u3A, sharedFile);

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Resume B', 'master', 'text', 1, 'shared.pdf', ?)
    `).run(`res_${u3B}`, u3B, sharedFile);

    const result = wipeAllUserData(u3A);
    assert.strictEqual(result.success, true);
    // Shared file must NOT be deleted because User 3B still references it
    assert.strictEqual(fs.existsSync(sharedFile), true, 'Shared file must be preserved for User B');
    assert.strictEqual(result.filesDeleted.includes(sharedFile), false);
  });

  // --- 8. SCENARIO 4: Symlink pointing outside uploads is quarantined --------
  test('Scenario 4: Symlink pointing outside uploads is quarantined (target NOT deleted)', () => {
    const u4 = `user_scen4_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u4, `${u4}@example.com`, 'User 4');

    const externalTarget = path.join(testDbDir, `external_secret_${Date.now()}.txt`);
    fs.writeFileSync(externalTarget, 'outside uploads confidential data');

    const symlinkInsideUploads = path.join(testUploadsDir, `symlink_outside_${Date.now()}.pdf`);
    let symlinkCreated = false;
    try {
      fs.symlinkSync(externalTarget, symlinkInsideUploads, 'file');
      symlinkCreated = true;
    } catch (_) {
      // Symlink creation might require privileges on Windows
    }

    if (symlinkCreated) {
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'Symlink Outside', 'master', 'text', 1, 'symlink.pdf', ?)
      `).run(`res_${u4}`, u4, symlinkInsideUploads);

      const result = wipeAllUserData(u4);
      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(externalTarget), 'External target outside uploads MUST NOT be deleted');
      assert.ok(result.fileDeletionErrors.some(e => e.error.includes('Security Violation')));
    } else {
      // Validate path containment logic for outside target
      assert.strictEqual(isPathContained(externalTarget, testUploadsDir), false);
    }
  });

  // --- 9. SCENARIO 5: Symlink pointing to data directory outside uploads rejected
  test('Scenario 5: Symlink pointing to data directory outside uploads is rejected', () => {
    const u5 = `user_scen5_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u5, `${u5}@example.com`, 'User 5');

    const dataFile = path.join(testDbDir, `data_dir_file_${Date.now()}.txt`);
    fs.writeFileSync(dataFile, 'data directory content outside uploads');

    const symlinkInUploads = path.join(testUploadsDir, `symlink_data_${Date.now()}.pdf`);
    let symlinkCreated = false;
    try {
      fs.symlinkSync(dataFile, symlinkInUploads, 'file');
      symlinkCreated = true;
    } catch (_) {}

    if (symlinkCreated) {
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'Symlink Data', 'master', 'text', 1, 'symlink.pdf', ?)
      `).run(`res_${u5}`, u5, symlinkInUploads);

      const result = wipeAllUserData(u5);
      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(dataFile), 'File in data directory outside uploads MUST NOT be deleted');
      assert.ok(result.fileDeletionErrors.some(e => e.error.includes('Security Violation')));
    } else {
      assert.strictEqual(isPathContained(dataFile, testUploadsDir), false);
    }
  });

  // --- 10. SCENARIO 6: Database file mistakenly supplied as upload path is untouched
  test('Scenario 6: Database file mistakenly supplied as upload path is rejected and untouched', () => {
    const u6 = `user_scen6_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u6, `${u6}@example.com`, 'User 6');

    // Reference the database file itself as stored_file_path
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Database Resume', 'master', 'text', 1, 'db.pdf', ?)
    `).run(`res_${u6}`, u6, testDbPath);

    assert.ok(fs.existsSync(testDbPath), 'Database file exists before wipe');

    const result = wipeAllUserData(u6);
    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(testDbPath), 'Database file MUST NOT be deleted!');
    assert.ok(result.fileDeletionErrors.some(e => e.error.includes('Security Violation')));
  });

  // --- 11. SCENARIO 7: Missing file is handled gracefully ---------------------
  test('Scenario 7: Missing file referenced in resumes is handled gracefully without failure', () => {
    const u7 = `user_scen7_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u7, `${u7}@example.com`, 'User 7');

    const missingPath = path.join(testUploadsDir, `non_existent_file_${Date.now()}.pdf`);
    assert.strictEqual(fs.existsSync(missingPath), false);

    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
      VALUES (?, ?, 'Missing Resume', 'master', 'text', 1, 'missing.pdf', ?)
    `).run(`res_${u7}`, u7, missingPath);

    const result = wipeAllUserData(u7);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.userId, u7);
  });

  // --- 12. SCENARIO 8: Dangling symlink is handled safely --------------------
  test('Scenario 8: Dangling symlink is handled safely without deleting unintended targets', () => {
    const u8 = `user_scen8_${Date.now()}`;
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(u8, `${u8}@example.com`, 'User 8');

    const nonExistentTarget = path.join(testUploadsDir, `phantom_target_${Date.now()}.pdf`);
    const danglingSymlink = path.join(testUploadsDir, `dangling_symlink_${Date.now()}.pdf`);

    let created = false;
    try {
      fs.symlinkSync(nonExistentTarget, danglingSymlink, 'file');
      created = true;
    } catch (_) {}

    if (created) {
      db.prepare(`
        INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
        VALUES (?, ?, 'Dangling Resume', 'master', 'text', 1, 'dangling.pdf', ?)
      `).run(`res_${u8}`, u8, danglingSymlink);

      const result = wipeAllUserData(u8);
      assert.strictEqual(result.success, true);
    }
  });

  // --- 13. Cross-user email isolation ----------------------------------------
  test('User A wipe does not delete User B application-linked emails', () => {
    const uG1 = `user_wipe_G1_${Date.now()}`;
    const uG2 = `user_wipe_G2_${Date.now()}`;
    const jobId = `job_wipe_${Date.now()}`;

    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uG1, `${uG1}@example.com`, 'User G1');
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uG2, `${uG2}@example.com`, 'User G2');

    db.prepare(`
      INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
      VALUES (?, 'Acme', 'Engineer', 'Remote', 'synthetic', 'https://example.com', '2026-01-01', '1000', '[]', 'desc')
    `).run(jobId);

    const appB = `app_${uG2}`;
    db.prepare(`
      INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json)
      VALUES (?, ?, ?, 'Package Prepared', 85, '{}')
    `).run(appB, uG2, jobId);

    // Seed email belonging to User B's application where User G1 was the sender
    const emailB = `email_B_${Date.now()}`;
    db.prepare(`
      INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
      VALUES (?, ?, 'Recruiter Message', ?, ?, 'Correspondence', 'Body text', 0, 1)
    `).run(emailB, appB, `${uG1}@example.com`, `${uG2}@example.com`);

    // Wipe User G1
    wipeAllUserData(uG1);

    // Verify User B's email linked to their application is 100% intact!
    const preservedEmail = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailB);
    assert.ok(preservedEmail, "User B application email was deleted when User G1 wiped their account!");
  });

  // --- 14. exportCompleteUserData and wipeAllUserData alignment --------------
  test('exportCompleteUserData aligns with wipeAllUserData for application-linked emails', () => {
    const uH1 = `user_wipe_H1_${Date.now()}`;
    const uH2 = `user_wipe_H2_${Date.now()}`;
    const jobId = `job_wipe_H_${Date.now()}`;

    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uH1, `${uH1}@example.com`, 'User H1');
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(uH2, `${uH2}@example.com`, 'User H2');

    db.prepare(`
      INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
      VALUES (?, 'Acme Corp', 'Designer', 'Remote', 'synthetic', 'https://example.com', '2026-01-01', '1000', '[]', 'desc')
    `).run(jobId);

    const appH2 = `app_H2_${Date.now()}`;
    db.prepare(`
      INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json)
      VALUES (?, ?, ?, 'Package Prepared', 90, '{}')
    `).run(appH2, uH2, jobId);

    // Email attached to User H2's application, where User H1 is sender
    const emailLinkedToH2 = `email_H2_${Date.now()}`;
    db.prepare(`
      INSERT INTO emails (id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
      VALUES (?, ?, 'Outreach', ?, ?, 'Subject', 'Body', 0, 1)
    `).run(emailLinkedToH2, appH2, `${uH1}@example.com`, `${uH2}@example.com`);

    // Export User H1 data: should NOT export User H2's application email
    const exportH1 = exportCompleteUserData(uH1);
    const exportedEmailIds = (exportH1.emails as any[]).map(e => e.id);
    assert.strictEqual(
      exportedEmailIds.includes(emailLinkedToH2),
      false,
      'User H1 export must not include emails attached to User H2 applications'
    );
  });

} finally {
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
}

console.log('\n========================================================');
if (failed === 0) {
  console.log(`>>> P0 WIPE HARDENING: ALL ${passed} TESTS PASSED <<<`);
} else {
  console.log(`>>> P0 WIPE HARDENING: ${passed} PASSED, ${failed} FAILED <<<`);
}
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
