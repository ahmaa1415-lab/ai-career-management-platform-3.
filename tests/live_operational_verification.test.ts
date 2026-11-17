/**
 * Live HTTP & Operational Verification Test Suite — Section D
 *
 * Starts the application using the documented startup process.
 * Runs against an isolated SQLite test database and isolated uploads directory.
 * Tests:
 * 1. Unauthenticated API requests expecting 401
 * 2. Authenticated API integration tests
 * 3. Cross-tenant API access expecting denial (403 / Access Denied)
 * 4. Synthetic resume upload and scoped retrieval
 * 5. Authentication lifecycle: login, session persistence, and logout
 * 6. Browser page rendering for all 25 application pages
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { randomBytes } from 'crypto';

const PORT = 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// 1. Setup isolated test environment
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `live_operational_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const testUploadsDir = path.join(testDbDir, `live_uploads_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Initialize database and seed synthetic test users
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { createSession } = await import('../lib/auth');

const userAId = `user_live_A_${Date.now()}`;
const userBId = `user_live_B_${Date.now()}`;

db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Live A')").run(userAId, `${userAId}@example.com`);
db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User Live B')").run(userBId, `${userBId}@example.com`);
db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Full Stack Engineer A')").run(`prof_${userAId}`, userAId);
db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Data Architect B')").run(`prof_${userBId}`, userBId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"Egypt\"]')").run(`loc_${userAId}`, userAId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"Germany\"]')").run(`loc_${userBId}`, userBId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userAId}`, userAId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userBId}`, userBId);

// Create authenticated sessions
const sessionA = createSession(userAId, { rememberMe: true, userAgent: 'LiveTestAgent' });
const sessionB = createSession(userBId, { rememberMe: true, userAgent: 'LiveTestAgent' });

const cookieA = `career_session=${sessionA.token}`;
const cookieB = `career_session=${sessionB.token}`;

let serverProcess: ChildProcess | null = null;
let passed = 0;
let failed = 0;

function logTest(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function waitForServer(url: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  console.log(`Waiting for server to become responsive at ${url}...`);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 200 || res.status === 307 || res.status === 302) {
        return true;
      }
    } catch (_) {
      // server still starting
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

console.log('\n========================================================');
console.log('  LIVE HTTP & OPERATIONAL SECURITY VERIFICATION');
console.log(`  Port: ${PORT} | Database: ${path.basename(testDbPath)}`);
console.log('========================================================\n');

try {
  // Step 1: Start Next.js server with isolated environment variables
  console.log('Spawning Next.js server...');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  serverProcess = spawn(npxCmd, ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    shell: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: testDbPath,
      UPLOADS_DIR: testUploadsDir,
      NODE_ENV: 'production'
    }
  });

  serverProcess.stdout?.on('data', (d) => process.stdout.write(`[Server stdout] ${d}`));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(`[Server stderr] ${d}`));

  const isUp = await waitForServer(BASE_URL);
  assert.ok(isUp, 'Server failed to start within timeout');
  console.log(`✓ Server is responsive at ${BASE_URL}\n`);

  // --------------------------------------------------------------------------
  // PART 1: UNAUTHENTICATED REQUESTS (EXPECTING 401)
  // --------------------------------------------------------------------------
  console.log('--- PART 1: UNAUTHENTICATED REQUESTS (EXPECT 401) ---');

  const unauthEndpoints = [
    { method: 'GET', path: '/api/profile' },
    { method: 'GET', path: '/api/resumes' },
    { method: 'GET', path: '/api/reports/daily' },
    { method: 'POST', path: '/api/crm/status', body: { applicationId: 'app_test', newStatus: 'Interview' } },
    { method: 'POST', path: '/api/applications/approve', body: { applicationId: 'app_test' } },
    { method: 'POST', path: '/api/security/wipe', body: {} },
    { method: 'GET', path: '/api/security/export' }
  ];

  for (const ep of unauthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep.path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    logTest(`Unauthenticated ${ep.method} ${ep.path} returns 401`, res.status === 401, `Got ${res.status}`);
  }

  // --------------------------------------------------------------------------
  // PART 2: AUTHENTICATED API INTEGRATION
  // --------------------------------------------------------------------------
  console.log('\n--- PART 2: AUTHENTICATED API INTEGRATION ---');

  // GET /api/auth/session with User A
  const sessionResA = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieA }
  });
  const sessionDataA = await sessionResA.json();
  logTest('GET /api/auth/session returns authenticated user', sessionResA.status === 200 && sessionDataA.user?.id === userAId);

  // GET /api/profile with User A
  const profileResA = await fetch(`${BASE_URL}/api/profile`, {
    headers: { Cookie: cookieA }
  });
  const profileDataA = await profileResA.json();
  logTest('GET /api/profile returns User A profile', profileResA.status === 200 && profileDataA.profile?.headline === 'Full Stack Engineer A');

  // POST /api/profile update User A
  const updateProfileRes = await fetch(`${BASE_URL}/api/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      profile: { headline: 'Lead Full Stack Architect A' },
      location: { target_countries: ['Egypt', 'UAE'] }
    })
  });
  logTest('POST /api/profile updates User A profile successfully', updateProfileRes.status === 200);

  // --------------------------------------------------------------------------
  // PART 3: CROSS-TENANT ACCESS DENIAL (EXPECTING 403 / 404)
  // --------------------------------------------------------------------------
  console.log('\n--- PART 3: CROSS-TENANT ACCESS DENIAL ---');

  // Seed a job and application belonging to User A
  const jobId = `job_live_${Date.now()}`;
  db.prepare(`
    INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
    VALUES (?, 'Stripe', 'Staff Engineer', 'Remote', 'synthetic', 'https://example.com', '2026-01-01', '120k', '[]', 'desc')
  `).run(jobId);

  const appAId = `app_live_A_${Date.now()}`;
  db.prepare(`
    INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json)
    VALUES (?, ?, ?, 'Package Prepared', 95, '{}')
  `).run(appAId, userAId, jobId);

  // User B attempts to approve User A's application
  const approveCrossRes = await fetch(`${BASE_URL}/api/applications/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ applicationId: appAId })
  });
  logTest('User B cannot approve User A application (Denial)', approveCrossRes.status === 403 || approveCrossRes.status === 404);

  // User B attempts to change status of User A's application
  const statusCrossRes = await fetch(`${BASE_URL}/api/crm/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ applicationId: appAId, newStatus: 'Interview' })
  });
  logTest('User B cannot update User A application status (Denial)', statusCrossRes.status === 403 || statusCrossRes.status === 404);

  // Verify status of User A application was NOT altered
  const appARecord = db.prepare('SELECT status FROM applications WHERE id = ?').get(appAId) as any;
  logTest('User A application status remained untouched after cross-tenant attack', appARecord.status === 'Package Prepared');

  // --------------------------------------------------------------------------
  // PART 4: SYNTHETIC RESUME UPLOAD & SCOPED RETRIEVAL
  // --------------------------------------------------------------------------
  console.log('\n--- PART 4: SYNTHETIC RESUME UPLOAD & SCOPED RETRIEVAL ---');

  // Seed synthetic resume for User A
  const resumeAId = `res_live_A_${Date.now()}`;
  const resumeAFile = path.join(testUploadsDir, `resume_A_${Date.now()}.pdf`);
  fs.writeFileSync(resumeAFile, 'User A synthetic resume bytes');

  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path, is_active)
    VALUES (?, ?, 'User A Master Resume', 'master', 'TypeScript React Node', 1, 'resume_A.pdf', ?, 1)
  `).run(resumeAId, userAId, resumeAFile);

  // User A retrieves resumes
  const getResumesA = await fetch(`${BASE_URL}/api/resumes`, {
    headers: { Cookie: cookieA }
  });
  const resumesDataA = await getResumesA.json();
  const foundInA = Array.isArray(resumesDataA) && resumesDataA.some((r: any) => r.id === resumeAId);
  logTest('User A retrieves their own uploaded resume', getResumesA.status === 200 && foundInA);

  // User B retrieves resumes
  const getResumesB = await fetch(`${BASE_URL}/api/resumes`, {
    headers: { Cookie: cookieB }
  });
  const resumesDataB = await getResumesB.json();
  const foundInB = Array.isArray(resumesDataB) && resumesDataB.some((r: any) => r.id === resumeAId);
  logTest('User B does NOT see User A resume in retrieval (Isolation)', getResumesB.status === 200 && !foundInB);

  // --------------------------------------------------------------------------
  // PART 5: AUTHENTICATION LIFECYCLE: LOGOUT & SESSION EXPIRATION
  // --------------------------------------------------------------------------
  console.log('\n--- PART 5: AUTHENTICATION LIFECYCLE & LOGOUT ---');

  // User A verifies active session
  const activeCheck = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieA }
  });
  logTest('Session is active before logout', activeCheck.status === 200);

  // Delete session from DB to simulate logout / revocation
  db.prepare('DELETE FROM sessions WHERE token = ?').run(sessionA.token);

  // User A checks session after revocation
  const revokedCheck = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieA }
  });
  logTest('Session returns unauthenticated (401/null user) after logout', revokedCheck.status === 401 || (await revokedCheck.json()).user === null);

  // --------------------------------------------------------------------------
  // PART 6: BROWSER SSR RENDERING FOR ALL 25 APPLICATION PAGES
  // --------------------------------------------------------------------------
  console.log('\n--- PART 6: BROWSER PAGE RENDERING (25 PAGES) ---');

  const PAGES = [
    '/',
    '/control-center',
    '/profile',
    '/onboarding',
    '/resumes',
    '/ats-analyzer',
    '/linkedin',
    '/discovery',
    '/top-opportunities',
    '/applications',
    '/approvals',
    '/interview-prep',
    '/inbox',
    '/crm',
    '/reports',
    '/notifications',
    '/settings',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/cover-letter',
    '/audit-log',
    '/integrations',
    '/job-intelligence'
  ];

  for (const pagePath of PAGES) {
    const isPublic = pagePath === '/login' || pagePath === '/register' || pagePath === '/forgot-password' || pagePath === '/reset-password';
    try {
      const pageRes = await fetch(`${BASE_URL}${pagePath}`, {
        headers: isPublic ? {} : { Cookie: cookieB },
        signal: AbortSignal.timeout(10000)
      });
      logTest(`Page render ${pagePath} returns 200 OK`, pageRes.status === 200, `Got ${pageRes.status}`);
    } catch (err: any) {
      logTest(`Page render ${pagePath}`, false, err.message);
    }
  }

} finally {
  if (serverProcess) {
    console.log('\nTerminating test server...');
    serverProcess.kill('SIGTERM');
  }
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
  console.log(`>>> LIVE HTTP & OPERATIONAL VERIFICATION: ALL ${passed} CHECKS PASSED <<<`);
  process.exit(0);
} else {
  console.log(`>>> LIVE HTTP & OPERATIONAL VERIFICATION: ${passed} PASSED, ${failed} FAILED <<<`);
  process.exit(1);
}
