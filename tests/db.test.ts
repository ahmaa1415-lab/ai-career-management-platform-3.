import db, { initializeSchema, getOrCreateDefaultUser, logAudit } from '../lib/db';

console.log('--- RUNNING TS-01: Database Integrity Test ---');

try {
  initializeSchema();
  console.log('✓ Schema initialization passed.');

  const user = getOrCreateDefaultUser();
  console.log('✓ Default user fetched/created:', user);

  // Test inserting audit log
  logAudit('TEST_ACTION', { ok: true }, user.id);
  const audit = db.prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1').get(user.id) as any;
  console.log('✓ Audit log persisted:', audit.action, audit.details);

  // Test profile creation / query
  const existingProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO profiles (id, user_id, onboarding_completed, headline)
      VALUES (?, ?, ?, ?)
    `).run('prof_01', user.id, 0, 'Senior Full Stack Engineer');
  }

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as any;
  console.log('✓ Profile record verified, onboarding_completed:', profile.onboarding_completed);

  console.log('>>> TS-01 PASSED SUCCESSFULLY <<<');
} catch (error) {
  console.error('TS-01 FAILED:', error);
  process.exit(1);
}
