import { getOrCreateDefaultUser } from '../lib/db';
import db from '../lib/db';

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

  console.log('>>> NOTIF-01 PASSED SUCCESSFULLY <<<');
}

testNotifications().catch(e => {
  console.error('Notifications test failed:', e);
  process.exit(1);
});
