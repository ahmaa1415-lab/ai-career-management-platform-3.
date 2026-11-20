import assert from 'assert';
import { getOrCreateDefaultUser } from '../lib/db';
import db from '../lib/db';
import { GET as getNotifications } from '../app/api/notifications/route';
import { getTestAuthContext, createExpiredTestSession } from './helpers/testAuth';

async function testNotifications() {
  console.log('--- RUNNING NOTIF-01: Notifications & Activity Stream Test ---');
  const user = getOrCreateDefaultUser();

  const logs = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE user_id = ?').get(user.id) as any;
  const apps = db.prepare('SELECT COUNT(*) as count FROM applications WHERE user_id = ?').get(user.id) as any;
  const emails = db.prepare('SELECT COUNT(*) as count FROM emails').get() as any;

  console.log(`✓ Total audit events indexed: ${logs.count}`);
  console.log(`✓ Total applications indexed: ${apps.count}`);
  console.log(`✓ Total recruitment emails indexed: ${emails.count}`);

  if (logs.count === 0 && apps.count === 0) {
    // Seed at least one audit event so notifications stream is populated
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details, timestamp)
      VALUES (?, ?, 'TEST_INITIALIZED', '{"seeded": true}', datetime('now'))
    `).run(`audit_init_${Date.now()}`, user.id);
  }

  // Positive Test: Authenticated candidate request
  console.log('\n--- RUNNING NOTIF-02: Authenticated Notifications Route Handler ---');
  const authContext = getTestAuthContext(user.id);
  const req = new Request('http://localhost:3000/api/notifications', {
    method: 'GET',
    headers: { 'Cookie': authContext.cookieHeader }
  });
  const res = await getNotifications(req);

  assert.strictEqual(res.status, 200, `Authenticated request must return HTTP 200, got ${res.status}`);

  const data = await res.json();
  assert.ok(data.success, 'Response must indicate success');
  assert.ok(Array.isArray(data.notifications), 'Response must contain notifications array');
  console.log(`✓ Route handler returned HTTP 200 with ${data.notifications.length} notifications.`);

  // Verify ordering: Newest first
  if (data.notifications.length > 1) {
    for (let i = 0; i < data.notifications.length - 1; i++) {
      const t1 = new Date(data.notifications[i].timestamp).getTime();
      const t2 = new Date(data.notifications[i + 1].timestamp).getTime();
      if (!isNaN(t1) && !isNaN(t2) && t1 < t2) {
        throw new Error(`Ordering violation: notification at index ${i} is older than index ${i + 1}`);
      }
    }
    console.log('✓ Verified: Notifications are strictly sorted newest-first.');
  }

  // Negative Test 1: Unauthenticated request must return HTTP 401
  console.log('\n--- RUNNING NOTIF-03: Security Invariant: Unauthenticated Access Rejected ---');
  const unauthReq = new Request('http://localhost:3000/api/notifications', { method: 'GET' });
  const unauthRes = await getNotifications(unauthReq);
  assert.strictEqual(unauthRes.status, 401, `Unauthenticated request must be rejected with HTTP 401, got ${unauthRes.status}`);
  console.log('✓ Unauthenticated request rejected with HTTP 401.');

  // Negative Test 2: Expired or forged session must return HTTP 401
  console.log('\n--- RUNNING NOTIF-04: Security Invariant: Expired Session Rejected ---');
  const expiredToken = createExpiredTestSession(user.id);
  const expiredReq = new Request('http://localhost:3000/api/notifications', {
    method: 'GET',
    headers: { 'Cookie': `career_session=${expiredToken}` }
  });
  const expiredRes = await getNotifications(expiredReq);
  assert.strictEqual(expiredRes.status, 401, `Expired session must be rejected with HTTP 401, got ${expiredRes.status}`);
  console.log('✓ Expired session rejected with HTTP 401.');

  // Multi-tenant Isolation Test: User B cannot access User A's notifications
  console.log('\n--- RUNNING NOTIF-05: Multi-Tenant Scoping Isolation ---');
  const userBContext = getTestAuthContext('user_tenant_b_isolated');
  const userBReq = new Request('http://localhost:3000/api/notifications', {
    method: 'GET',
    headers: { 'Cookie': userBContext.cookieHeader }
  });
  const userBRes = await getNotifications(userBReq);
  assert.strictEqual(userBRes.status, 200);
  const userBData = await userBRes.json();
  const leakedLogs = userBData.notifications.filter((n: any) => n.user_id && n.user_id !== 'user_tenant_b_isolated');
  assert.strictEqual(leakedLogs.length, 0, 'User B must not see any notifications belonging to User A');
  console.log(`✓ Multi-tenant isolation verified: User B sees ${userBData.notifications.length} scoped notifications, 0 cross-tenant leaks.`);

  console.log('\n>>> NOTIF-01 THROUGH NOTIF-05 PASSED SUCCESSFULLY WITH 0 DEFECTS <<<');
}

testNotifications().catch(e => {
  console.error('Notifications test failed:', e);
  process.exit(1);
});
