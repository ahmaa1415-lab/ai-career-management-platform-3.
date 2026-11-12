import assert from 'assert';
import db from '../lib/db';
import {
  runAutonomousApplyEverywhere,
  getAutopilotStatus
} from '../lib/applications/autonomous-engine';

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
assert.ok(result.applied_applications.length > 0, 'Must have applied to opportunities');

console.log(`[✓ PASS] 2. Autonomous engine applied to ${result.applied_applications.length} jobs on behalf of candidate:`);
result.applied_applications.slice(0, 5).forEach((app, idx) => {
  console.log(`   #${idx + 1}: ${app.employer} - ${app.title} (${app.source}) [Score: ${app.match_score}%] -> Status: ${app.status}`);
});

// Test 3: Verify Applications Table in SQLite
const appliedRows = db.prepare(`
  SELECT a.id, j.employer, j.title, a.status, a.submission_type, a.human_approved, a.submission_confirmed, a.applied_at
  FROM applications a
  JOIN job_listings j ON a.job_id = j.id
  WHERE a.user_id = ? AND a.status = 'Applied' AND a.submission_type = 'Automated'
`).all(TEST_USER_ID) as any[];

assert.ok(appliedRows.length >= 5, 'At least 5 applications should be in Applied state');
for (const row of appliedRows) {
  assert.strictEqual(row.status, 'Applied', 'Status must be Applied');
  assert.strictEqual(row.submission_type, 'Automated', 'Submission type must be Automated');
  assert.strictEqual(row.human_approved, 1, 'Human approved flag must be set via delegated mandate');
  assert.strictEqual(row.submission_confirmed, 1, 'Submission confirmed must be 1');
  assert.ok(row.applied_at, 'applied_at timestamp must exist');
}
console.log(`[✓ PASS] 3. Database records verified: ${appliedRows.length} applications with status=Applied & submission_type=Automated`);

// Test 4: Verify Tailored Resumes created
const tailoredCVs = db.prepare(`
  SELECT COUNT(*) as count FROM resumes WHERE user_id = ? AND type = 'Tailored'
`).get(TEST_USER_ID) as any;
assert.ok(tailoredCVs.count > 0, 'Tailored CVs should have been generated');
console.log(`[✓ PASS] 4. Tailored CV generation verified: ${tailoredCVs.count} bespoke Version B CVs on disk`);

// Test 5: Verify Automated Recruiter Outreach Emails in Inbox
const emails = db.prepare(`
  SELECT COUNT(*) as count FROM emails WHERE is_sent = 1
`).get() as any;
assert.ok(emails.count > 0, 'Recruiter outreach emails must be queued / sent');
console.log(`[✓ PASS] 5. Recruiter outreach emails verified: ${emails.count} outreach messages dispatched in CRM inbox`);

// Test 6: Verify Audit Trail
const auditLogs = db.prepare(`
  SELECT action, details, timestamp FROM audit_logs
  WHERE user_id = ? AND action IN ('AUTONOMOUS_APPLICATION_DISPATCHED', 'AUTONOMOUS_AUTOPILOT_COMPLETED')
  ORDER BY timestamp DESC
`).all(TEST_USER_ID) as any[];

assert.ok(auditLogs.length > 0, 'Audit trail for autonomous auto-apply must exist');
console.log(`[✓ PASS] 6. Audit trail verified (${auditLogs.length} autonomous dispatch logs recorded)`);

console.log('================================================================');
console.log('>>> ALL 6/6 AUTONOMOUS AUTOPILOT TESTS VERIFIED WITH 0 DEFECTS! <<<');
console.log('================================================================\n');
