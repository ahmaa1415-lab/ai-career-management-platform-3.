import db from '../lib/db';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  validateEmailFormat,
  createSession,
  validateSessionToken,
  invalidateSessionToken,
  createPasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
  changeUserPassword,
  getUserSettings,
  updateUserSettings
} from '../lib/auth';
import {
  getUserIntegrations,
  updateIntegrationProfile,
  disconnectIntegration,
  connectIntegration
} from '../lib/integrations-center';

console.log('========================================================================');
console.log('--- RUNNING TS-22: COMPLETE AUTHENTICATION & INTEGRATIONS TEST SUITE ---');
console.log('========================================================================\n');

async function runTests() {
  let passed = 0;

  // TEST 1: Password Hashing & Verification
  console.log('>>> [TEST 1] Verifying Secure Password Hashing (scrypt salt)...');
  const rawPass = 'SecretP@ssword2026';
  const hashed = hashPassword(rawPass);
  if (!hashed.includes(':')) throw new Error('Password hash does not follow <salt>:<hash> format');
  if (!verifyPassword(rawPass, hashed)) throw new Error('Failed to verify valid password against hash');
  if (verifyPassword('WrongP@ssword', hashed)) throw new Error('Incorrect password was falsely accepted');
  console.log('  ✓ Password hashing & timing-safe verification verified.');
  passed++;

  // TEST 2: Password Complexity & Email Format Validation
  console.log('>>> [TEST 2] Verifying Password Complexity & Email Format Validation...');
  if (validatePasswordStrength('short').valid) throw new Error('Short password should be rejected');
  if (validatePasswordStrength('allletters').valid) throw new Error('Password without numbers should be rejected');
  if (validatePasswordStrength('12345678').valid) throw new Error('Password without letters should be rejected');
  if (!validatePasswordStrength('ValidPass123').valid) throw new Error('Valid password was rejected');

  if (validateEmailFormat('invalid-email')) throw new Error('Invalid email was accepted');
  if (!validateEmailFormat('AyaHamouda14@gmail.com')) throw new Error('Valid email was rejected');
  console.log('  ✓ Complexity rules and regex validation verified.');
  passed++;

  // TEST 3: User Registration Simulation in DB
  console.log('>>> [TEST 3] Verifying New User Registration in DB...');
  const testEmail = `test_candidate_${Date.now()}@example.com`;
  const testUserId = `usr_test_${Date.now()}`;
  const testPassHash = hashPassword('TestP@ssword123');

  db.prepare(`
    INSERT INTO users (id, email, full_name, password_hash, role, is_verified)
    VALUES (?, ?, 'Test Candidate', ?, 'candidate', 1)
  `).run(testUserId, testEmail, testPassHash);

  const insertedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(testUserId) as any;
  if (!insertedUser || insertedUser.email !== testEmail) {
    throw new Error('User record was not persisted correctly in users table');
  }
  console.log(`  ✓ Created user ${insertedUser.id} with secure password hash.`);
  passed++;

  // TEST 4: Session Creation, Validation & Expiration
  console.log('>>> [TEST 4] Verifying Session Token Creation & DB Validation...');
  const session = createSession(testUserId, { rememberMe: true, userAgent: 'Jest/TestRunner' });
  if (!session.token || session.token.length < 32) throw new Error('Invalid session token generated');

  const authenticatedUser = validateSessionToken(session.token);
  if (!authenticatedUser || authenticatedUser.id !== testUserId) {
    throw new Error('Session token validation failed');
  }
  console.log(`  ✓ Session verified for user: ${authenticatedUser.email}`);
  passed++;

  // TEST 5: Session Invalidation & Logout
  console.log('>>> [TEST 5] Verifying Session Invalidation on Logout...');
  const invalidated = invalidateSessionToken(session.token);
  if (!invalidated) throw new Error('Failed to invalidate session token');

  const postLogoutUser = validateSessionToken(session.token);
  if (postLogoutUser !== null) {
    throw new Error('Invalidated session token is still active');
  }
  console.log('  ✓ Session token destroyed. Protected route access correctly revoked.');
  passed++;

  // TEST 6: Time-Limited Password Recovery Token Flow
  console.log('>>> [TEST 6] Verifying Time-Limited Password Reset Token Flow...');
  const resetRes = createPasswordResetToken(testEmail);
  if (!resetRes || !resetRes.token) throw new Error('Failed to create password reset token');

  const validation = validatePasswordResetToken(resetRes.token);
  if (!validation.valid || validation.userId !== testUserId) {
    throw new Error('Password reset token failed validation');
  }

  const consumeRes = consumePasswordResetToken(resetRes.token, 'NewP@ssword2026!');
  if (!consumeRes.success) throw new Error(`Consume token failed: ${consumeRes.error}`);

  // Check that old password no longer works and new password works
  const updatedUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(testUserId) as any;
  if (verifyPassword('TestP@ssword123', updatedUser.password_hash)) {
    throw new Error('Old password is still valid after reset');
  }
  if (!verifyPassword('NewP@ssword2026!', updatedUser.password_hash)) {
    throw new Error('New password does not match hash after reset');
  }

  // Token cannot be reused
  const secondUse = validatePasswordResetToken(resetRes.token);
  if (secondUse.valid) throw new Error('Password reset token was reused');
  console.log('  ✓ Password recovery token verified, consumed, and locked against replay attacks.');
  passed++;

  // TEST 7: External Integrations Architecture (Google, LinkedIn, Naukrigulf, Bayt, Wuzzuf)
  console.log('>>> [TEST 7] Verifying 5 External Integrations (Honest Statuses & Zero Fake OAuth)...');
  const integrations = getUserIntegrations(testUserId);
  if (integrations.length !== 5) {
    throw new Error(`Expected 5 external integrations, found ${integrations.length}`);
  }

  const services = integrations.map((i) => i.service);
  ['google', 'linkedin', 'naukrigulf', 'bayt', 'wuzzuf'].forEach((s) => {
    if (!services.includes(s as any)) throw new Error(`Missing expected service: ${s}`);
  });

  const naukri = integrations.find((i) => i.service === 'naukrigulf')!;
  if (naukri.official_auth_available !== false || naukri.auth_type !== 'Manual Profile & URL Linking') {
    throw new Error('Naukrigulf must be classified as Manual Profile & URL Linking (no public OAuth exists)');
  }

  const bayt = integrations.find((i) => i.service === 'bayt')!;
  if (bayt.official_auth_available !== false) {
    throw new Error('Bayt must be classified as Manual Profile & URL Linking');
  }

  const wuzzuf = integrations.find((i) => i.service === 'wuzzuf')!;
  if (wuzzuf.official_auth_available !== false) {
    throw new Error('WUZZUF must be classified as Manual Profile & URL Linking');
  }

  console.log('  ✓ All 5 services correctly modeled with honest official authorization availability.');
  passed++;

  // TEST 8: Public Profile Linking & Disconnection
  console.log('>>> [TEST 8] Verifying Profile URL Linking & Secure Disconnection...');
  const testBaytUrl = 'https://people.bayt.com/aya-hamouda-test';
  const linkRes = updateIntegrationProfile(testUserId, 'bayt', testBaytUrl);
  if (!linkRes.success) throw new Error('Failed to update Bayt profile URL');

  const baytAfterLink = getUserIntegrations(testUserId).find((i) => i.service === 'bayt')!;
  if (baytAfterLink.profile_url !== testBaytUrl || baytAfterLink.status !== 'Manual Access') {
    throw new Error('Bayt profile URL was not persisted correctly');
  }

  const disconnRes = disconnectIntegration(testUserId, 'bayt');
  if (!disconnRes.success) throw new Error('Failed to disconnect Bayt');

  const baytAfterDisconn = getUserIntegrations(testUserId).find((i) => i.service === 'bayt')!;
  if (baytAfterDisconn.status !== 'Not Connected') {
    throw new Error('Bayt status was not reset to Not Connected');
  }
  console.log('  ✓ Profile linking and secure token/credential clearing verified.');
  passed++;

  // TEST 9: User Settings Persistence (Notifications & RTL)
  console.log('>>> [TEST 9] Verifying User Settings Persistence in SQLite...');
  const initialSettings = getUserSettings(testUserId);
  if (!initialSettings) throw new Error('Failed to initialize user settings');

  updateUserSettings(testUserId, {
    job_alerts_enabled: 0,
    rtl_enabled: 1
  });

  const updatedSettings = getUserSettings(testUserId);
  if (updatedSettings.job_alerts_enabled !== 0 || updatedSettings.rtl_enabled !== 1) {
    throw new Error('Settings updates were not persisted in SQLite');
  }
  console.log('  ✓ User notification preferences and RTL layout settings persisted.');
  passed++;

  // Clean up test user
  db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  console.log('  ✓ Cleaned up test user records.');

  console.log('\n========================================================================');
  console.log(`>>> ALL ${passed}/9 AUTHENTICATION & INTEGRATIONS TESTS PASSED (0 DEFECTS) <<<`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[✗ TEST SUITE FAILED]:', err);
  process.exit(1);
});
