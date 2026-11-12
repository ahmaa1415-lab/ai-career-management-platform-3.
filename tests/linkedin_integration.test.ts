import assert from 'assert';
import db from '../lib/db';
import {
  getLinkedInIntegration,
  updateLinkedInIntegration,
  syncLinkedInProfile
} from '../lib/integrations';

console.log('================================================================');
console.log('--- RUNNING TS-11: LINKEDIN INTEGRATION & RECRUITER SEO TEST ---');
console.log('================================================================');

const TEST_USER_ID = 'user_default_01';

// Test 1: Schema & Default Provisioning
const initial = getLinkedInIntegration(TEST_USER_ID);
assert.ok(initial, 'LinkedIn integration record should exist');
assert.strictEqual(initial.service, 'linkedin', 'Service must be linkedin');
assert.ok(initial.profile_url.includes('linkedin.com'), 'Profile URL must be present');
console.log('[✓ PASS] 1. Schema & Default LinkedIn record initialized:', {
  service: initial.service,
  status: initial.status,
  profile_url: initial.profile_url
});

// Test 2: Configuration Update Persistence
const customUrl = 'https://linkedin.com/in/aya-senior-fullstack-engineer';
const customClientId = 'li_client_verified_production_42';
const updated = updateLinkedInIntegration(TEST_USER_ID, {
  profile_url: customUrl,
  client_id: customClientId,
  status: 'connected',
  sync_enabled: 1
});

assert.strictEqual(updated.profile_url, customUrl, 'Profile URL should be updated');
assert.strictEqual(updated.client_id, customClientId, 'Client ID should be updated');
assert.strictEqual(updated.status, 'connected', 'Status should be connected');

// Direct SQLite Verification
const dbRow = db.prepare('SELECT * FROM integrations WHERE user_id = ? AND service = ?').get(TEST_USER_ID, 'linkedin') as any;
assert.ok(dbRow, 'DB row must exist');
assert.strictEqual(dbRow.profile_url, customUrl, 'DB profile_url must match update');
assert.strictEqual(dbRow.client_id, customClientId, 'DB client_id must match update');
console.log('[✓ PASS] 2. Settings saved & verified directly in SQLite integrations table');

// Test 3: Profile & Recruiter SEO Synchronization
const syncRes = syncLinkedInProfile(TEST_USER_ID);
assert.ok(syncRes.integration.last_synced_at, 'last_synced_at must be populated');
assert.ok(syncRes.summary.synced_keywords_count > 0, 'Must have synced keywords');
assert.strictEqual(syncRes.summary.visibility_score, 94, 'Visibility score must be high index');
console.log('[✓ PASS] 3. Profile synced with LinkedIn Recruiter SEO engine:', {
  synced_keywords: syncRes.summary.synced_keywords_count,
  visibility_score: `${syncRes.summary.visibility_score}%`,
  last_synced_at: syncRes.integration.last_synced_at
});

// Test 4: Status Toggle
const toggledToSandbox = updateLinkedInIntegration(TEST_USER_ID, { status: 'sandbox' });
assert.strictEqual(toggledToSandbox.status, 'sandbox', 'Status should be sandbox');
const toggledBack = updateLinkedInIntegration(TEST_USER_ID, { status: 'connected' });
assert.strictEqual(toggledBack.status, 'connected', 'Status should be connected again');
console.log('[✓ PASS] 4. Mode switching between Live API and Sandbox verified');

// Test 5: Audit Log Compliance
const auditRows = db.prepare(
  "SELECT * FROM audit_logs WHERE user_id = ? AND action LIKE 'LINKEDIN_%' ORDER BY timestamp DESC"
).all(TEST_USER_ID) as any[];

assert.ok(auditRows.length >= 2, 'Audit log entries for LinkedIn operations must exist');
console.log(`[✓ PASS] 5. Audit log compliance verified (${auditRows.length} LinkedIn audit entries logged):`,
  auditRows.slice(0, 3).map(r => r.action)
);

// Test 6: LinkedIn Posts Auto-Apply Engine
import { runLinkedInPostsAutoApply } from '../lib/applications/autonomous-engine';
const postApplyResult = runLinkedInPostsAutoApply(TEST_USER_ID);
assert.strictEqual(postApplyResult.success, true, 'LinkedIn posts auto-apply must succeed');
assert.ok(postApplyResult.total_linkedin_applied > 0, 'Should apply to at least 1 LinkedIn post');
console.log(`[✓ PASS] 6. LinkedIn posts auto-apply verified (${postApplyResult.total_linkedin_applied} LinkedIn posts applied on candidate's behalf):`);
postApplyResult.applications.slice(0, 3).forEach((app, idx) => {
  console.log(`   #${idx + 1}: ${app.employer} - ${app.title} (${app.source}) -> Status: ${app.status}`);
});

console.log('================================================================');
console.log('>>> ALL 6/6 LINKEDIN INTEGRATION TESTS VERIFIED WITH 0 DEFECTS! <<<');
console.log('================================================================\n');
