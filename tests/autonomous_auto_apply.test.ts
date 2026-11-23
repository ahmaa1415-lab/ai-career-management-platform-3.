import assert from 'assert';
import db from '../lib/db';
import {
  runAutonomousApplyEverywhere,
  getAutopilotStatus
} from '../lib/applications/autonomous-engine';
import {
  approveApplicationPackage,
  recordCandidateSubmission
} from '../lib/applications/workflow';

console.log('================================================================');
console.log('--- RUNNING TS-12: AUTONOMOUS AUTOPILOT APPLY EVERYWHERE TEST ---');
console.log('================================================================');

const TEST_USER_ID = 'user_default_01';

// Test 1: Autopilot Initial Status
const status = getAutopilotStatus(TEST_USER_ID);
assert.ok(status, 'Autopilot status should be returned');
assert.ok(status.target_platforms.length >= 6, 'Should cover at least 6 recruitment platforms');
console.log('[✓ PASS] 1. Autopilot status verified:', {
  mode: status.mode,
  target_platforms: status.target_platforms.join(', '),
  human_delegation: status.human_delegation
});

// Test 2: Execute Autonomous Auto-Apply Everywhere on behalf of user
console.log('2. Executing autonomous auto-apply everywhere on behalf of candidate...');
const result = runAutonomousApplyEverywhere(TEST_USER_ID, { minMatchScore: 70, forceAll: true });

assert.strictEqual(result.success, true, 'Autopilot execution must succeed');
assert.ok(result.total_applied_in_system > 0, 'Total applied in system must be greater than 0');
assert.ok(result.applied_applications.length > 0, 'Must have prepared opportunities');

console.log(`[✓ PASS] 2. Autonomous engine prepared ${result.applied_applications.length} jobs on behalf of candidate:`);
result.applied_applications.slice(0, 5).forEach((app, idx) => {
  console.log(`   #${idx + 1}: ${app.employer} - ${app.title} (${app.source}) [Score: ${app.match_score}%] -> Status: ${app.status}`);
});

// Test 3: Verify Applications Table in SQLite (Truthful Lifecycle: 'Package Prepared', not forged 'Applied')
const appliedRows = db.prepare(`
  SELECT a.id, j.employer, j.title, a.status, a.submission_type, a.human_approved, a.submission_confirmed, a.applied_at
  FROM applications a
  JOIN job_listings j ON a.job_id = j.id
  WHERE a.user_id = ? AND a.status = 'Package Prepared' AND a.submission_type = 'Manual'
`).all(TEST_USER_ID) as any[];

assert.ok(appliedRows.length >= 5, 'At least 5 applications should be in Package Prepared state');
for (const row of appliedRows) {
  assert.strictEqual(row.status, 'Package Prepared', 'Status must be Package Prepared');
  assert.strictEqual(row.submission_type, 'Manual', 'Submission type must be Manual');
  assert.strictEqual(row.human_approved, 0, 'Human approved flag must not be forged prior to candidate approval');
  assert.strictEqual(row.submission_confirmed, 0, 'Submission confirmed must be 0 prior to candidate submission');
}
console.log(`[✓ PASS] 3. Database records verified: ${appliedRows.length} applications with status=Package Prepared & submission_type=Manual`);

// Test 4: Verify Tailored Resumes created
const tailoredCVs = db.prepare(`
  SELECT COUNT(*) as count FROM resumes WHERE user_id = ? AND type = 'Tailored'
`).get(TEST_USER_ID) as any;
assert.ok(tailoredCVs.count > 0, 'Tailored CVs should have been generated');
console.log(`[✓ PASS] 4. Tailored CV generation verified: ${tailoredCVs.count} bespoke Version B CVs on disk`);

// Test 5: Verify Automated Recruiter Outreach Emails in Inbox (Draft Mode, not forged Sent)
const emails = db.prepare(`
  SELECT COUNT(*) as count FROM emails WHERE is_draft = 1
`).get() as any;
assert.ok(emails.count > 0, 'Recruiter outreach emails must be prepared in draft mode for candidate review');
console.log(`[✓ PASS] 5. Recruiter outreach draft emails verified: ${emails.count} draft messages in CRM inbox`);

// Test 6: Verify Audit Trail
const auditLogs = db.prepare(`
  SELECT action, details, timestamp FROM audit_logs
  WHERE user_id = ? AND action IN ('PACKAGE_PREPARED', 'AUTONOMOUS_AUTOPILOT_COMPLETED')
  ORDER BY timestamp DESC
`).all(TEST_USER_ID) as any[];

assert.ok(auditLogs.length > 0, 'Audit trail for autonomous auto-apply must exist');
console.log(`[✓ PASS] 6. Audit trail verified (${auditLogs.length} autonomous dispatch logs recorded)`);

// Test 7: Verify Candidate Approval & Submission Lifecycle Transitions
console.log('7. Verifying Human Approval and Candidate Submission transitions...');
const firstApp = appliedRows[0];
const approved = approveApplicationPackage(firstApp.id, TEST_USER_ID, true);
assert.strictEqual(approved.status, 'Ready for Candidate Submission', 'Approved package must transition to Ready for Candidate Submission');
assert.strictEqual(approved.human_approved, 1, 'human_approved flag must be set to 1');

const submitted = recordCandidateSubmission(firstApp.id, TEST_USER_ID, true, 'Confirmed direct portal application.');
assert.strictEqual(submitted.status, 'Submitted by Candidate', 'Submitted application must transition to Submitted by Candidate');
assert.strictEqual(submitted.submission_confirmed, 1, 'submission_confirmed flag must be set to 1');
assert.ok(submitted.applied_at, 'applied_at timestamp must exist');
console.log(`[✓ PASS] 7. Approval & Submission lifecycle verified: Package Prepared -> Ready for Candidate Submission -> Submitted by Candidate`);

console.log('================================================================');
console.log('>>> ALL 7/7 AUTONOMOUS AUTOPILOT TESTS VERIFIED WITH 0 DEFECTS! <<<');
console.log('================================================================\n');
