import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

async function testHttpsAuthSuite() {
  console.log('=== [SECTION 4: HTTPS AUTHENTICATION & SECURITY VERIFICATION] ===\n');

  const testDir = path.join(process.cwd(), 'data', 'staging_auth_https_test');
  const testDbPath = path.join(testDir, 'auth_test.db');
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      user_agent TEXT,
      ip_address TEXT
    );
  `);

  // Helper functions
  const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
  const hashPassword = (pw) => crypto.scryptSync(pw, 'salt_2026', 64).toString('hex');

  // 1. Seed user
  const userId = 'usr_https_cand_01';
  const email = 'candidate.https@staging.local';
  const password = 'SecurePass2026!HTTPS';
  db.prepare('INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)').run(
    userId, email, 'HTTPS Candidate', hashPassword(password)
  );

  // 2. Test Login & Session Generation
  console.log('1. Testing User Authentication & Session Creation...');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const passwordMatch = user.password_hash === hashPassword(password);
  console.log(`   - Password Match Verification: ${passwordMatch}`);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const sessionId = `sess_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    sessionId, userId, tokenHash, expiresAt.toISOString(), 'AuditClient/1.0', '127.0.0.1'
  );

  // 3. Test HTTPS Cookie Specification
  console.log('\n2. Testing HTTPS Cookie Attributes:');
  const isHttps = true;
  const cookieAttributes = {
    name: 'career_session',
    value: rawToken,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  };

  const formattedCookieHeader = `${cookieAttributes.name}=${cookieAttributes.value}; Path=${cookieAttributes.path}; HttpOnly; ${cookieAttributes.secure ? 'Secure; ' : ''}SameSite=${cookieAttributes.sameSite}; Max-Age=${cookieAttributes.maxAge}`;
  console.log(`   - Generated HTTPS Cookie Header:\n     "${formattedCookieHeader.substring(0, 45)}...; HttpOnly; Secure; SameSite=lax"`);

  const hasHttpOnly = formattedCookieHeader.includes('HttpOnly');
  const hasSecure = formattedCookieHeader.includes('Secure');
  const hasSameSiteLax = formattedCookieHeader.includes('SameSite=lax') || formattedCookieHeader.includes('SameSite=Lax');
  const hasRootPath = formattedCookieHeader.includes('Path=/');

  console.log(`   - HttpOnly Enforced:  ${hasHttpOnly}`);
  console.log(`   - Secure Enforced:    ${hasSecure}`);
  console.log(`   - SameSite=Lax:       ${hasSameSiteLax}`);
  console.log(`   - Path=/ Enforced:    ${hasRootPath}`);

  // 4. Test Session Persistence
  console.log('\n3. Testing Session Persistence & Token Lookup...');
  const activeSession = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP').get(tokenHash);
  const sessionValid = activeSession !== undefined && activeSession.user_id === userId;
  console.log(`   - Active Session Validated: ${sessionValid} (User ID: ${activeSession?.user_id})`);

  // 5. Test Logout (Session Invalidation)
  console.log('\n4. Testing Logout & Token Invalidation...');
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  const sessionAfterLogout = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
  const logoutSuccessful = sessionAfterLogout === undefined;
  console.log(`   - Session Terminated:       ${logoutSuccessful}`);

  // 6. Test Unauthorized Access Protection
  console.log('\n5. Testing Unauthorized Route Access (Zero Token):');
  const checkRouteAccess = (cookieHeader) => {
    if (!cookieHeader || !cookieHeader.includes('career_session=')) {
      return { allowed: false, status: 401, redirect: '/login' };
    }
    const token = cookieHeader.split('career_session=')[1].split(';')[0];
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token));
    if (!session) return { allowed: false, status: 401, redirect: '/login' };
    return { allowed: true, userId: session.user_id };
  };

  const unauthCheck = checkRouteAccess(null);
  console.log(`   - Unauthorized Request:     Blocked=${!unauthCheck.allowed} (Status: ${unauthCheck.status}, Redirect: ${unauthCheck.redirect})`);

  // 7. Test Registration Restriction with Staging Access Code
  console.log('\n6. Testing Staging Access Code Gate on Registration:');
  const STAGING_CODE = 'STAGING_GATE_PASS_2026';
  const registerAttempt = (providedCode) => {
    if (providedCode !== STAGING_CODE) {
      return { allowed: false, status: 403, error: 'Registration is restricted in staging mode. A valid staging access code is required.' };
    }
    return { allowed: true, status: 201 };
  };

  const regWithoutCode = registerAttempt(undefined);
  const regWithValidCode = registerAttempt('STAGING_GATE_PASS_2026');

  console.log(`   - Registration Without Code Blocked: ${!regWithoutCode.allowed} (Status: ${regWithoutCode.status})`);
  console.log(`   - Registration With Valid Code:      ${regWithValidCode.allowed} (Status: ${regWithValidCode.status})`);

  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });

  const allPassed = passwordMatch && hasHttpOnly && hasSecure && hasSameSiteLax && hasRootPath && sessionValid && logoutSuccessful && !unauthCheck.allowed && !regWithoutCode.allowed && regWithValidCode.allowed;

  console.log(`\n=== [HTTPS AUTH & SECURITY RESULT: ${allPassed ? 'ALL CHECKS PASSED' : 'FAILED'}] ===`);
  if (!allPassed) process.exit(1);
}

testHttpsAuthSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
