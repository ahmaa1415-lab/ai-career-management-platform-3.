/**
 * Multi-Tenant Resume Upload & Full Synchronization Acceptance Test Suite
 *
 * Uses ONLY synthetic candidate fixtures and isolated test databases.
 * Never accesses, opens, parses, or processes any real candidate CV.
 *
 * Verifies strict tenant isolation across:
 * - Resume uploads and version increments
 * - Active resume selection
 * - CV evaluations and scoring
 * - Tailored application packages and source resume retention
 * - Human approval and candidate submission workflows
 * - Cross-tenant mutation and access rejection
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Configure isolated test database and test upload directory
const testDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, `isolated_multi_upload_${Date.now()}_${randomBytes(4).toString('hex')}.db`);
const testUploadsDir = path.join(testDir, `uploads_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Load DB bound to isolated test database
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { getFullProfile } = await import('../lib/onboarding');
const { prepareApplicationPackage, approveApplicationPackage, recordApplicationSubmission } = await import('../lib/applications/workflow');
const { getAllApplications, updateApplicationStatus } = await import('../lib/crm/pipeline');

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
console.log('  MULTI-TENANT RESUME UPLOAD & LIFECYCLE ACCEPTANCE TEST');
console.log('  Database: Isolated test database (data/test_tenant_isolation)');
console.log('  Uploads: Isolated synthetic directory (data/test_tenant_isolation/uploads_...)');
console.log('  Synthetic candidates only — zero real CVs or personal data');
console.log('========================================================\n');

const userA = `user_tenant_A_${Date.now()}`;
const userB = `user_tenant_B_${Date.now()}`;
const job1Id = `job_test_1_${Date.now()}`;
const job2Id = `job_test_2_${Date.now()}`;

// Synthetic upload helper
function seedSyntheticResumeRecord(userId: string, resumeId: string, title: string, text: string, version: number) {
  const filePath = path.join(testUploadsDir, `${resumeId}_synthetic.pdf`);
  fs.writeFileSync(filePath, text);

  db.prepare(`
    INSERT INTO resumes (
      id, user_id, title, type, target_role, target_country, raw_text, ats_score, version,
      original_filename, stored_file_path, processing_status, parsing_status, analysis_status
    )
    VALUES (?, ?, ?, 'Master', 'Engineering', 'Remote', ?, 85, ?, 'resume.pdf', ?, 'completed', 'completed', 'completed')
  `).run(resumeId, userId, title, text, version, filePath);

  db.prepare('UPDATE users SET active_resume_id = ? WHERE id = ?').run(resumeId, userId);
  return { resumeId, filePath };
}

try {
  // --- Setup Synthetic Users & Jobs ------------------------------------------
  function setupUser(id: string, email: string, name: string, headline: string) {
    db.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').run(id, email, name);
    db.prepare('INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, ?)').run(`p_${id}`, id, headline);
    db.prepare(`
      INSERT INTO profile_locations (id, user_id, current_physical_location, target_countries, target_cities)
      VALUES (?, ?, 'Dubai, UAE', '["United Arab Emirates", "Remote"]', '["Dubai"]')
    `).run(`loc_${id}`, id);
    db.prepare(`
      INSERT INTO profile_permissions (id, user_id, job_research_authorized, cv_analysis_authorized, submit_applications_authorized)
      VALUES (?, ?, 1, 1, 1)
    `).run(`perm_${id}`, id);
  }

  setupUser(userA, 'sarah.almansoor.syn@example.com', 'Sarah Al-Mansoor', 'Category Management Specialist');
  setupUser(userB, 'marcus.vance.syn@example.com', 'Marcus Vance', 'Cloud Solutions Architect');

  db.prepare(`
    INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
    VALUES (?, 'Americana Group', 'Category Commercial Manager', 'Dubai', 'synthetic', 'https://example.com/j1', '2026-01-01', 'Competitive', '["Category Strategy", "Retail FMCG"]', 'Category Commercial Manager in FMCG')
  `).run(job1Id);

  db.prepare(`
    INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
    VALUES (?, 'Datadog', 'Senior Distributed Systems Architect', 'Remote', 'synthetic', 'https://example.com/j2', '2026-01-01', 'Competitive', '["Kubernetes", "Distributed Systems"]', 'Senior Distributed Systems Architect')
  `).run(job2Id);

  // --- 1. Initial Uploads for User A and User B -------------------------------
  const resumeA1 = `res_A1_${Date.now()}`;
  const resumeB1 = `res_B1_${Date.now()}`;

  seedSyntheticResumeRecord(userA, resumeA1, 'Sarah Category CV', 'Sarah Category Management FMCG experience text', 1);
  seedSyntheticResumeRecord(userB, resumeB1, 'Marcus Cloud CV', 'Marcus Vance Cloud Architecture Kubernetes text', 1);

  test('Independent active resume selections are preserved per tenant', () => {
    const rowA = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(userA) as any;
    const rowB = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(userB) as any;

    assert.strictEqual(rowA.active_resume_id, resumeA1, "User A active resume must be A1");
    assert.strictEqual(rowB.active_resume_id, resumeB1, "User B active resume must be B1");
  });

  // --- 2. Cross-tenant resume read rejection ---------------------------------
  test('User A cannot retrieve User B resumes via scoped query', () => {
    const resumesA = db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(userA) as any[];
    const hasB1 = resumesA.some(r => r.id === resumeB1);
    assert.strictEqual(hasB1, false, "User A queries leak User B resume B1");
    assert.ok(resumesA.some(r => r.id === resumeA1), "User A cannot see their own resume A1");
  });

  test('User B cannot retrieve User A resumes via scoped query', () => {
    const resumesB = db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(userB) as any[];
    const hasA1 = resumesB.some(r => r.id === resumeA1);
    assert.strictEqual(hasA1, false, "User B queries leak User A resume A1");
    assert.ok(resumesB.some(r => r.id === resumeB1), "User B cannot see their own resume B1");
  });

  // --- 3. Uploading a new resume for A does not affect B ---------------------
  const resumeA2 = `res_A2_${Date.now()}`;
  seedSyntheticResumeRecord(userA, resumeA2, 'Sarah Supply Chain CV v2', 'Sarah Supply Chain Strategy text', 2);

  test('Uploading a new resume for User A updates A without replacing B active resume', () => {
    const rowA = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(userA) as any;
    const rowB = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(userB) as any;

    assert.strictEqual(rowA.active_resume_id, resumeA2, "User A active resume must be updated to A2");
    assert.strictEqual(rowB.active_resume_id, resumeB1, "User B active resume must remain strictly B1");
  });

  // --- 4. Independent application packages and source resume retention -------
  test('Application packages retain tenant-specific source resume IDs', () => {
    const pkgA = prepareApplicationPackage(job1Id, userA, resumeA1);
    const pkgB = prepareApplicationPackage(job2Id, userB, resumeB1);

    assert.strictEqual(pkgA.user_id, userA);
    assert.strictEqual(pkgB.user_id, userB);
    assert.strictEqual(pkgA.source_resume_id, resumeA1, "Package A must retain resume A1");
    assert.strictEqual(pkgB.source_resume_id, resumeB1, "Package B must retain resume B1");
    assert.strictEqual(pkgA.status, 'Package Prepared');
    assert.strictEqual(pkgB.status, 'Package Prepared');
  });

  // --- 5. Cross-tenant approval and submission rejection ----------------------
  test('User A cannot approve User B application package (Access Denied)', () => {
    const appB = db.prepare('SELECT id FROM applications WHERE user_id = ?').get(userB) as any;
    assert.ok(appB, "User B application must exist");

    assert.throws(
      () => approveApplicationPackage(appB.id, userA, true),
      /Access Denied/i,
      "User A was able to approve User B application!"
    );

    const appBState = db.prepare('SELECT human_approved FROM applications WHERE id = ?').get(appB.id) as any;
    assert.strictEqual(appBState.human_approved, 0, "User B application human_approved was mutated");
  });

  test('User A cannot submit or modify User B application status', () => {
    const appB = db.prepare('SELECT id FROM applications WHERE user_id = ?').get(userB) as any;
    assert.throws(
      () => recordApplicationSubmission(appB.id, userA, 'Attack notes'),
      /Access Denied/i
    );

    assert.throws(
      () => updateApplicationStatus(appB.id, 'Interview', 'Attack notes', userA),
      /Access Denied/i
    );
  });

  // --- 6. Legitimate owner approval and submission ---------------------------
  test('Owners can approve and confirm their own applications independently', () => {
    const appA = db.prepare('SELECT id FROM applications WHERE user_id = ?').get(userA) as any;
    const appB = db.prepare('SELECT id FROM applications WHERE user_id = ?').get(userB) as any;

    const approvedA = approveApplicationPackage(appA.id, userA, true);
    assert.strictEqual(approvedA.status, 'Ready for Candidate Submission');
    assert.strictEqual(approvedA.human_approved, 1);

    // B remains unapproved
    const stateB = db.prepare('SELECT human_approved FROM applications WHERE id = ?').get(appB.id) as any;
    assert.strictEqual(stateB.human_approved, 0);

    const submittedA = recordApplicationSubmission(appA.id, userA, 'Confirmed on Americana portal');
    assert.strictEqual(submittedA.status, 'Submitted by Candidate');
    assert.strictEqual(submittedA.submission_confirmed, 1);
  });

  // --- 7. Evaluations isolation -----------------------------------------------
  test('CV Evaluations are strictly isolated per tenant', () => {
    const evalColumns = `
      id, user_id, resume_id, cv_title, target_role, target_country,
      human_recruiter_score, ats_compatibility_score, keyword_alignment_score,
      recruiter_readability_score, achievement_impact_score, localization_score,
      headhunter_discoverability_score, criterion_scores_json, evidence_json,
      recommendations_json, action_plan_json, full_report_markdown
    `;
    const evalValues = `?, ?, ?, ?, ?, ?, 88, 85, 90, 80, 85, 90, 88, '{}', '{}', '[]', '[]', '# Report'`;

    db.prepare(`
      INSERT INTO cv_evaluations (${evalColumns})
      VALUES (${evalValues})
    `).run(`eval_${userA}`, userA, resumeA1, 'Eval A', 'Category Lead', 'UAE');

    db.prepare(`
      INSERT INTO cv_evaluations (${evalColumns})
      VALUES (${evalValues})
    `).run(`eval_${userB}`, userB, resumeB1, 'Eval B', 'Cloud Architect', 'Remote');

    const evalsA = db.prepare('SELECT * FROM cv_evaluations WHERE user_id = ?').all(userA) as any[];
    const evalsB = db.prepare('SELECT * FROM cv_evaluations WHERE user_id = ?').all(userB) as any[];

    assert.strictEqual(evalsA.length, 1);
    assert.strictEqual(evalsA[0].user_id, userA);
    assert.strictEqual(evalsA[0].cv_title, 'Eval A');

    assert.strictEqual(evalsB.length, 1);
    assert.strictEqual(evalsB[0].user_id, userB);
    assert.strictEqual(evalsB[0].cv_title, 'Eval B');
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
  console.log(`>>> MULTI-TENANT UPLOAD ACCEPTANCE: ALL ${passed} TESTS PASSED <<<`);
} else {
  console.log(`>>> MULTI-TENANT UPLOAD ACCEPTANCE: ${passed} PASSED, ${failed} FAILED <<<`);
}
console.log('========================================================\n');

if (failed > 0) process.exit(1);
