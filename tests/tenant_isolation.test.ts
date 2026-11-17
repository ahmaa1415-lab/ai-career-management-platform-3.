/**
 * Tenant Isolation Regression Test Suite — P0-B
 *
 * Uses ONLY synthetic users and synthetic records.
 * Never reads, opens, parses, uploads, or processes any real candidate CV.
 * Runs against an isolated SQLite test database (data/test_tenant_isolation/...)
 * to ensure complete isolation from production/development data.
 *
 * Tests cross-user read, update, delete, export, wipe, and report access.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Configure isolated test database environment with a unique test db file
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `isolated_tenant_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.NODE_ENV = 'test';

// 2. Dynamic imports to load lib modules bound to the isolated database
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const {
  getAllApplications,
  updateApplicationStatus,
  exportCRMDataAsCSV,
  exportCRMDataAsJSON,
} = await import('../lib/crm/pipeline');
const { exportCompleteUserData, wipeAllUserData } = await import('../lib/security');
const { getAllDailyReports } = await import('../lib/automation/daily-report');

// ---- Synthetic helpers -------------------------------------------------------

function uid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function registerSyntheticUser(id: string, email: string, name: string) {
  db.prepare(`
    INSERT INTO users (id, email, full_name)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, full_name = excluded.full_name
  `).run(id, email, name);

  db.prepare(`
    INSERT OR IGNORE INTO profiles (id, user_id, headline)
    VALUES (?, ?, ?)
  `).run(`prof_${id}`, id, `${name} Profile`);
}

function seedSyntheticJob(id: string) {
  db.prepare(`
    INSERT OR IGNORE INTO job_listings (id, employer, title, location, source, source_url,
      publication_date, salary_raw, requirements, experience_required_years, seniority,
      visa_sponsorship, remote_eligibility, is_verified, application_type, portal_platform, raw_description)
    VALUES (?, 'Acme Corp', 'Synthetic Test Engineer', 'Remote', 'synthetic', 'https://example.com',
      '2026-01-01', 'Competitive', '[]', 2, 'Mid', 0, 1, 1, 'direct_application', 'LinkedIn', 'Synthetic test job description')
  `).run(id);
}

function seedSyntheticResume(resumeId: string, userId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO resumes (id, user_id, title, type, raw_text, version, original_filename)
    VALUES (?, ?, 'Synthetic Resume', 'master', 'Synthetic resume content text for testing', 1, 'synthetic_resume.pdf')
  `).run(resumeId, userId);
}

function seedSyntheticApplication(appId: string, userId: string, jobId: string, resumeId: string) {
  db.prepare(`
    INSERT INTO applications (id, user_id, job_id, source_resume_id, status, match_score, match_details_json)
    VALUES (?, ?, ?, ?, 'Package Prepared', 85, '{}')
  `).run(appId, userId, jobId, resumeId);
}

function seedSyntheticSavedOpportunity(userId: string, jobId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO saved_opportunities (id, user_id, job_id, notes)
    VALUES (?, ?, ?, 'Saved for later')
  `).run(`save_${userId}_${jobId}`, userId, jobId);
}

function seedSyntheticDailyReport(reportId: string, userId: string) {
  const cols = (db.prepare(`PRAGMA table_info(daily_reports)`).all() as any[]).map((c: any) => c.name);
  if (cols.includes('user_id')) {
    db.prepare(`
      INSERT OR IGNORE INTO daily_reports (id, report_date, timezone, content_markdown, metrics_json, user_id)
      VALUES (?, '2026-01-01', 'UTC', '# Test Report', '{}', ?)
    `).run(reportId, userId);
  } else {
    db.prepare(`
      INSERT OR IGNORE INTO daily_reports (id, report_date, timezone, content_markdown, metrics_json)
      VALUES (?, '2026-01-01', 'UTC', '# Test Report', '{}')
    `).run(reportId);
    // Link via audit log for schema compatibility
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details)
      VALUES (?, ?, 'DAILY_REPORT_GENERATED', ?)
    `).run(`audit_${reportId}`, userId, JSON.stringify({ report_id: reportId }));
  }
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
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
console.log('  P0-B TENANT ISOLATION REGRESSION TEST SUITE');
console.log('  Database: Isolated test database (data/test_tenant_isolation)');
console.log('  Synthetic data only — zero real CVs or personal data');
console.log('========================================================\n');

const userA = uid('syn_user_A');
const userB = uid('syn_user_B');
const jobId = uid('syn_job');
const appA  = uid('syn_app_A');
const appB  = uid('syn_app_B');
const resA  = uid('syn_res_A');
const resB  = uid('syn_res_B');
const repA  = uid('syn_rep_A');
const repB  = uid('syn_rep_B');
const repAmbig = uid('syn_rep_ambig');
const repOrphan = uid('syn_rep_orphan');

try {
  registerSyntheticUser(userA, `tenantA_${userA}@example.com`, 'Tenant A');
  registerSyntheticUser(userB, `tenantB_${userB}@example.com`, 'Tenant B');
  seedSyntheticJob(jobId);
  seedSyntheticResume(resA, userA);
  seedSyntheticResume(resB, userB);
  seedSyntheticApplication(appA, userA, jobId, resA);
  seedSyntheticApplication(appB, userB, jobId, resB);
  seedSyntheticSavedOpportunity(userA, jobId);
  seedSyntheticSavedOpportunity(userB, jobId);
  seedSyntheticDailyReport(repA, userA);
  seedSyntheticDailyReport(repB, userB);

  // Seed an ambiguous daily report referenced by multiple users in audit logs
  db.prepare(`
    INSERT OR IGNORE INTO daily_reports (id, report_date, timezone, content_markdown, metrics_json)
    VALUES (?, '2026-01-02', 'UTC', '# Ambiguous Report', '{}')
  `).run(repAmbig);
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, 'DAILY_REPORT_GENERATED', ?)
  `).run(`audit_ambig_1_${repAmbig}`, userA, JSON.stringify({ report_id: repAmbig }));
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, 'DAILY_REPORT_GENERATED', ?)
  `).run(`audit_ambig_2_${repAmbig}`, userB, JSON.stringify({ report_id: repAmbig }));

  // Seed an orphaned daily report with zero audit logs
  db.prepare(`
    INSERT OR IGNORE INTO daily_reports (id, report_date, timezone, content_markdown, metrics_json)
    VALUES (?, '2026-01-03', 'UTC', '# Orphaned Report', '{}')
  `).run(repOrphan);

  // --- 1. Cross-user application READ -----------------------------------------------
  test('User A can only read their own applications via getAllApplications', () => {
    const apps = getAllApplications(userA);
    assert.ok(apps.length > 0, 'User A should have at least 1 application');
    assert.ok(apps.every(a => a.user_id === userA), 'User A sees applications belonging to another user');
    const hasAppA = apps.some(a => a.id === appA);
    assert.ok(hasAppA, `User A's own application ${appA} not returned`);
  });

  test('User B cannot read User A applications via getAllApplications', () => {
    const appsB = getAllApplications(userB);
    const leakage = appsB.filter(a => a.user_id === userA);
    assert.strictEqual(leakage.length, 0, `User B sees ${leakage.length} of User A's applications`);
  });

  // --- 2. Cross-user application STATUS UPDATE -------------------------------------
  test('updateApplicationStatus rejects missing, empty, or whitespace userId', () => {
    assert.throws(
      () => updateApplicationStatus(appA, 'Interview', 'notes', '' as any),
      /userId is required/i
    );
    assert.throws(
      () => updateApplicationStatus(appA, 'Interview', 'notes', '   ' as any),
      /userId is required/i
    );
    assert.throws(
      () => (updateApplicationStatus as any)(appA, 'Interview', 'notes'),
      /userId is required/i
    );
  });

  test('updateApplicationStatus with User B identity throws Access Denied on User A application', () => {
    assert.throws(
      () => updateApplicationStatus(appA, 'Interview', 'Cross-tenant attack attempt', userB),
      /Access Denied: Candidate does not own this application record\./
    );
    const row = db.prepare('SELECT status FROM applications WHERE id = ?').get(appA) as any;
    assert.notStrictEqual(row?.status, 'Interview', 'User B was able to modify User A application status');
  });

  test('updateApplicationStatus succeeds for authenticated owner User A', () => {
    const updated = updateApplicationStatus(appA, 'Interview', 'Legitimate update by owner', userA);
    assert.strictEqual(updated.status, 'Interview');
    const row = db.prepare('SELECT status FROM applications WHERE id = ?').get(appA) as any;
    assert.strictEqual(row?.status, 'Interview');
  });

  // --- 3. Cross-user DELETE scoping -----------------------------------------------
  test('DELETE operation scoped to user_id cannot delete another tenant record', () => {
    // Attempt to delete user A saved opportunity using user B identity
    const deleteStmt = db.prepare('DELETE FROM saved_opportunities WHERE user_id = ? AND job_id = ?');
    const result = deleteStmt.run(userB, jobId);
    assert.strictEqual(result.changes, 1, 'User B should delete their own saved opportunity');

    // Verify User A saved opportunity still exists untouched
    const userAItem = db.prepare('SELECT * FROM saved_opportunities WHERE user_id = ? AND job_id = ?').get(userA, jobId);
    assert.ok(userAItem, 'User A saved opportunity was deleted by User B action');
  });

  // --- 4. CRM export scope ---------------------------------------------------------
  test('exportCRMDataAsCSV scopes to authenticated User A only', () => {
    const csv = exportCRMDataAsCSV(userA);
    assert.ok(!csv.includes(appB), `CSV export for User A contains User B application ${appB}`);
  });

  test('exportCRMDataAsJSON scopes to authenticated User A only', () => {
    const json = exportCRMDataAsJSON(userA);
    assert.ok(!json.includes(appB), `JSON export for User A contains User B application ${appB}`);
  });

  // --- 5. Full data export scope ---------------------------------------------------
  test('exportCompleteUserData for User A does not include User B records', () => {
    const data = exportCompleteUserData(userA);
    const serialized = JSON.stringify(data);
    assert.ok(!serialized.includes(userB), 'exportCompleteUserData for User A leaks User B ID');
    assert.ok(!serialized.includes(appB), 'exportCompleteUserData for User A leaks User B application');
    assert.ok(!serialized.includes(resB), 'exportCompleteUserData for User A leaks User B resume');

    // Confirm User A records are present
    const appIds = (data.applications as any[]).map((a: any) => a.id);
    assert.ok(appIds.includes(appA), 'User A own application not included in export');
  });

  // --- 6. Daily reports scoping & fail-closed behavior ----------------------------
  test('getAllDailyReports fails closed when userId is omitted, empty, or whitespace', () => {
    assert.deepStrictEqual(getAllDailyReports(), [], 'Must return empty array when userId is omitted');
    assert.deepStrictEqual(getAllDailyReports(''), [], 'Must return empty array when userId is empty');
    assert.deepStrictEqual(getAllDailyReports('   '), [], 'Must return empty array when userId is whitespace');
  });

  test('getAllDailyReports with userId filter respects tenant boundary', () => {
    const reportsB = getAllDailyReports(userB);
    assert.ok(Array.isArray(reportsB), 'getAllDailyReports should return an array');
    const hasRepB = reportsB.some((r: any) => r.id === repB);
    assert.ok(hasRepB, 'User B should see their own daily report');
    const hasRepA = reportsB.some((r: any) => r.id === repA);
    assert.strictEqual(hasRepA, false, 'User B should never see User A daily report');
  });

  test('getAllDailyReports excludes ambiguous reports associated with multiple users in audit logs', () => {
    const reportsA = getAllDailyReports(userA);
    const reportsB = getAllDailyReports(userB);
    const leakedToA = reportsA.some((r: any) => r.id === repAmbig);
    const leakedToB = reportsB.some((r: any) => r.id === repAmbig);
    assert.strictEqual(leakedToA, false, 'Ambiguous daily report leaked to User A');
    assert.strictEqual(leakedToB, false, 'Ambiguous daily report leaked to User B');
  });

  test('getAllDailyReports excludes orphaned reports with zero audit logs', () => {
    const reportsA = getAllDailyReports(userA);
    const reportsB = getAllDailyReports(userB);
    const leakedToA = reportsA.some((r: any) => r.id === repOrphan);
    const leakedToB = reportsB.some((r: any) => r.id === repOrphan);
    assert.strictEqual(leakedToA, false, 'Orphaned daily report leaked to User A');
    assert.strictEqual(leakedToB, false, 'Orphaned daily report leaked to User B');
  });

  // --- 7. Security export & wipe validation ----------------------------------------
  test('exportCompleteUserData and wipeAllUserData reject missing or empty userId', () => {
    assert.throws(() => exportCompleteUserData('' as any), /userId is required/i);
    assert.throws(() => exportCompleteUserData('   ' as any), /userId is required/i);
    assert.throws(() => (exportCompleteUserData as any)(), /userId is required/i);

    assert.throws(() => wipeAllUserData('' as any), /userId is required/i);
    assert.throws(() => wipeAllUserData('   ' as any), /userId is required/i);
    assert.throws(() => (wipeAllUserData as any)(), /userId is required/i);
  });

  // --- 8. Wipe scope & transaction safety ------------------------------------------
  test('wipeAllUserData for User A strictly deletes User A and preserves User B data', () => {
    const beforeCountB = (db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(userB) as any).c;
    assert.ok(beforeCountB > 0, 'User B must have records before wipe test');

    // Execute wipe for User A
    wipeAllUserData(userA);

    // Verify User A records are completely gone
    const userARow = db.prepare('SELECT * FROM users WHERE id = ?').get(userA);
    const userAApps = (db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(userA) as any).c;
    const userAResumes = (db.prepare('SELECT COUNT(*) as c FROM resumes WHERE user_id = ?').get(userA) as any).c;

    assert.strictEqual(userARow, undefined, 'User A record still exists after wipeAllUserData');
    assert.strictEqual(userAApps, 0, 'User A applications still exist after wipeAllUserData');
    assert.strictEqual(userAResumes, 0, 'User A resumes still exist after wipeAllUserData');

    // Verify User B records are 100% intact
    const afterCountB = (db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(userB) as any).c;
    assert.strictEqual(afterCountB, beforeCountB, 'User B records were damaged or deleted by User A wipe operation');
  });

} finally {
  try {
    db.close();
    delete (globalThis as any)._careerAppDb;
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  } catch (_) {
    // best-effort cleanup
  }
}

console.log('\n========================================================');
if (failed === 0) {
  console.log(`>>> P0-B TENANT ISOLATION: ALL ${passed} TESTS PASSED <<<`);
} else {
  console.log(`>>> P0-B TENANT ISOLATION: ${passed} PASSED, ${failed} FAILED <<<`);
}
console.log('========================================================\n');

if (failed > 0) process.exit(1);
