import { getOrCreateDefaultUser } from '../lib/db';
import db from '../lib/db';
import { GET as getNotifications } from '../app/api/notifications/route';

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
    throw new Error('No activity available for notification stream');
  }

  // Regression Verification for Notifications API Route Handler (Read-Only)
  console.log('\n--- RUNNING NOTIF-02: Notifications Route Handler Regression Test ---');
  const req = new Request('http://localhost:3000/api/notifications', { method: 'GET' });
  const res = await getNotifications(req);

  if (res.status !== 200) {
    const errorBody = await res.json();
    throw new Error(`Notifications API returned status ${res.status}: ${JSON.stringify(errorBody)}`);
  }

  const data = await res.json();
  if (!data.success || !Array.isArray(data.notifications)) {
    throw new Error('Notifications response format is invalid or missing notifications array.');
  }

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

  // Verify non-authenticated / fallback behavior is graceful without writes
  const authReq = new Request('http://localhost:3000/api/notifications', {
    method: 'GET',
    headers: { 'Authorization': `Bearer unauthenticated_test_token` }
  });
  const fallbackRes = await getNotifications(authReq);
  if (fallbackRes.status !== 200) {
    throw new Error(`Fallback notifications query returned status ${fallbackRes.status}`);
  }
  const fallbackData = await fallbackRes.json();
  if (!fallbackData.success || !Array.isArray(fallbackData.notifications)) {
    throw new Error('Fallback notifications test failed format validation.');
  }
  console.log(`✓ Fallback state successfully handled (Status: 200, count: ${fallbackData.notifications.length}).`);

  console.log('\n>>> NOTIF-01 & NOTIF-02 PASSED SUCCESSFULLY <<<');
}

testNotifications().catch(e => {
  console.error('Notifications test failed:', e);
  process.exit(1);
});
