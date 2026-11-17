/**
 * Live API Security Integration Test Suite — Section D
 *
 * Runs against an isolated SQLite test database and isolated uploads directory.
 * Directly invokes App Router route handlers with synthetic Web Requests.
 *
 * Tests:
 * 1. Unauthenticated API requests expecting 401
 * 2. Authenticated API integration
 * 3. Cross-tenant API access denial (Access Denied)
 * 4. Synthetic resume retrieval and cross-tenant isolation
 * 5. Authentication lifecycle: session validation, persistence, and revocation
 */

import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Setup isolated test environment
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `api_sec_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const testUploadsDir = path.join(testDbDir, `api_uploads_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Initialize schema and seed synthetic users
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { createSession } = await import('../lib/auth');

const userAId = `user_api_A_${Date.now()}`;
const userBId = `user_api_B_${Date.now()}`;

db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User API A')").run(userAId, `${userAId}@example.com`);
db.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, 'User API B')").run(userBId, `${userBId}@example.com`);
db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Full Stack Engineer A')").run(`prof_${userAId}`, userAId);
db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Data Architect B')").run(`prof_${userBId}`, userBId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"Egypt\"]')").run(`loc_${userAId}`, userAId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"Germany\"]')").run(`loc_${userBId}`, userBId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userAId}`, userAId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userBId}`, userBId);

// Create sessions
const sessionA = createSession(userAId, { rememberMe: true, userAgent: 'APISecurityTestAgent' });
const sessionB = createSession(userBId, { rememberMe: true, userAgent: 'APISecurityTestAgent' });

const cookieA = `career_session=${sessionA.token}`;
const cookieB = `career_session=${sessionB.token}`;

// Import Route Handlers
const profileRoute = await import('../app/api/profile/route');
const resumesRoute = await import('../app/api/resumes/route');
const crmStatusRoute = await import('../app/api/crm/status/route');
const approveRoute = await import('../app/api/applications/approve/route');
const dailyReportsRoute = await import('../app/api/reports/daily/route');
const exportRoute = await import('../app/api/security/export/route');
const wipeRoute = await import('../app/api/security/wipe/route');
const authSessionRoute = await import('../app/api/auth/session/route');

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

console.log('\n========================================================');
console.log('  LIVE API SECURITY INTEGRATION & TENANT ISOLATION');
console.log(`  Database: ${path.basename(testDbPath)}`);
console.log('========================================================\n');

async function runTests() {
  // --------------------------------------------------------------------------
  // PART 1: UNAUTHENTICATED REQUESTS (EXPECTING 401)
  // --------------------------------------------------------------------------
  console.log('--- PART 1: UNAUTHENTICATED REQUESTS (EXPECT 401) ---');

  const unauthTests = [
    {
      name: 'GET /api/profile without auth returns 401',
      fn: () => profileRoute.GET(new Request('http://localhost:3000/api/profile'))
    },
    {
      name: 'POST /api/profile without auth returns 401',
      fn: () => profileRoute.POST(new Request('http://localhost:3000/api/profile', { method: 'POST', body: JSON.stringify({}) }))
    },
    {
      name: 'GET /api/resumes without auth returns 401',
      fn: () => resumesRoute.GET(new Request('http://localhost:3000/api/resumes'))
    },
    {
      name: 'POST /api/crm/status without auth returns 401',
      fn: () => crmStatusRoute.POST(new Request('http://localhost:3000/api/crm/status', { method: 'POST', body: JSON.stringify({ application_id: 'app_1', new_status: 'Interview' }) }))
    },
    {
      name: 'POST /api/applications/approve without auth returns 401',
      fn: () => approveRoute.POST(new Request('http://localhost:3000/api/applications/approve', { method: 'POST', body: JSON.stringify({ application_id: 'app_1', consent: true }) }))
    },
    {
      name: 'GET /api/reports/daily without auth returns 401',
      fn: () => dailyReportsRoute.GET(new Request('http://localhost:3000/api/reports/daily'))
    },
    {
      name: 'GET /api/security/export without auth returns 401',
      fn: () => exportRoute.GET(new Request('http://localhost:3000/api/security/export'))
    },
    {
      name: 'POST /api/security/wipe without auth returns 401',
      fn: () => wipeRoute.POST(new Request('http://localhost:3000/api/security/wipe', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }) }))
    }
  ];

  for (const t of unauthTests) {
    try {
      const res = await t.fn();
      logTest(t.name, res.status === 401, `Expected 401, got ${res.status}`);
    } catch (err: any) {
      logTest(t.name, false, err.message);
    }
  }

  // --------------------------------------------------------------------------
  // PART 2: AUTHENTICATED API INTEGRATION
  // --------------------------------------------------------------------------
  console.log('\n--- PART 2: AUTHENTICATED API INTEGRATION ---');

  // GET /api/auth/session with User A
  const sessionResA = await authSessionRoute.GET(new Request('http://localhost:3000/api/auth/session', {
    headers: { Cookie: cookieA, Authorization: `Bearer ${sessionA.token}` }
  }));
  const sessionDataA = await sessionResA.json();
  logTest('GET /api/auth/session returns authenticated User A', sessionResA.status === 200 && sessionDataA.user?.id === userAId);

  // GET /api/profile with User A
  const profileResA = await profileRoute.GET(new Request('http://localhost:3000/api/profile', {
    headers: { Cookie: cookieA }
  }));
  const profileDataA = await profileResA.json();
  logTest('GET /api/profile returns User A profile', profileResA.status === 200 && profileDataA.profile?.headline === 'Full Stack Engineer A');

  // POST /api/profile with User A
  const updateProfileRes = await profileRoute.POST(new Request('http://localhost:3000/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      profile: { headline: 'Lead Full Stack Architect A' },
      location: { target_countries: ['Egypt', 'UAE'] }
    })
  }));
  logTest('POST /api/profile updates User A profile successfully', updateProfileRes.status === 200);

  // --------------------------------------------------------------------------
  // PART 3: CROSS-TENANT ACCESS DENIAL
  // --------------------------------------------------------------------------
  console.log('\n--- PART 3: CROSS-TENANT ACCESS DENIAL ---');

  // Seed a job and application belonging to User A
  const jobId = `job_api_${Date.now()}`;
  db.prepare(`
    INSERT INTO job_listings (id, employer, title, location, source, source_url, publication_date, salary_raw, requirements, raw_description)
    VALUES (?, 'Stripe', 'Staff Engineer', 'Remote', 'synthetic', 'https://example.com', '2026-01-01', '120k', '[]', 'desc')
  `).run(jobId);

  const appAId = `app_api_A_${Date.now()}`;
  db.prepare(`
    INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json)
    VALUES (?, ?, ?, 'Package Prepared', 95, '{}')
  `).run(appAId, userAId, jobId);

  // User B attempts to change status of User A's application
  const statusCrossRes = await crmStatusRoute.POST(new Request('http://localhost:3000/api/crm/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ application_id: appAId, new_status: 'Interview' })
  }));
  const statusCrossData = await statusCrossRes.json();
  logTest(
    'User B cannot update User A application status (Access Denied)',
    statusCrossRes.status === 400 && String(statusCrossData.error).toLowerCase().includes('access denied')
  );

  // User B attempts to approve User A's application
  const approveCrossRes = await approveRoute.POST(new Request('http://localhost:3000/api/applications/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ application_id: appAId, consent: true })
  }));
  const approveCrossData = await approveCrossRes.json();
  logTest(
    'User B cannot approve User A application (Access Denied)',
    approveCrossRes.status === 400 && String(approveCrossData.error).toLowerCase().includes('access denied')
  );

  // Verify User A application status was NOT altered in database
  const appARecord = db.prepare('SELECT status FROM applications WHERE id = ?').get(appAId) as any;
  logTest('User A application status remained untouched after cross-tenant attacks', appARecord.status === 'Package Prepared');

  // --------------------------------------------------------------------------
  // PART 4: SYNTHETIC RESUME RETRIEVAL & ISOLATION
  // --------------------------------------------------------------------------
  console.log('\n--- PART 4: SYNTHETIC RESUME RETRIEVAL & ISOLATION ---');

  const resumeAId = `res_api_A_${Date.now()}`;
  const resumeAFile = path.join(testUploadsDir, `resume_A_${Date.now()}.pdf`);
  fs.writeFileSync(resumeAFile, 'User A synthetic resume bytes');

  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, raw_text, version, original_filename, stored_file_path)
    VALUES (?, ?, 'User A Master Resume', 'master', 'TypeScript React Node', 1, 'resume_A.pdf', ?)
  `).run(resumeAId, userAId, resumeAFile);

  // User A retrieves resumes
  const resumesResA = await resumesRoute.GET(new Request('http://localhost:3000/api/resumes', {
    headers: { Cookie: cookieA }
  }));
  const resumesDataA = await resumesResA.json();
  const listA = resumesDataA.resumes || [];
  const foundInA = Array.isArray(listA) && listA.some((r: any) => r.id === resumeAId);
  logTest('User A retrieves their own uploaded resume', resumesResA.status === 200 && foundInA);

  // User B retrieves resumes
  const resumesResB = await resumesRoute.GET(new Request('http://localhost:3000/api/resumes', {
    headers: { Cookie: cookieB }
  }));
  const resumesDataB = await resumesResB.json();
  const listB = resumesDataB.resumes || [];
  const foundInB = Array.isArray(listB) && listB.some((r: any) => r.id === resumeAId);
  logTest('User B does NOT see User A resume in retrieval (Tenant Isolation)', resumesResB.status === 200 && !foundInB);

  // --------------------------------------------------------------------------
  // PART 5: AUTHENTICATION LIFECYCLE & REVOCATION
  // --------------------------------------------------------------------------
  console.log('\n--- PART 5: AUTHENTICATION LIFECYCLE & REVOCATION ---');

  // Verify session is active
  const preRevokeRes = await authSessionRoute.GET(new Request('http://localhost:3000/api/auth/session', {
    headers: { Cookie: cookieA }
  }));
  logTest('Session is valid before revocation', preRevokeRes.status === 200);

  // Revoke session in database
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userAId);

  // Verify session is now revoked (returns null user or 401)
  const postRevokeRes = await authSessionRoute.GET(new Request('http://localhost:3000/api/auth/session', {
    headers: { Cookie: cookieA }
  }));
  logTest('Session returns unauthenticated (401) after session revocation in DB', postRevokeRes.status === 401);
}

runTests().then(() => {
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

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`>>> API SECURITY INTEGRATION: ALL ${passed} CHECKS PASSED <<<`);
    process.exit(0);
  } else {
    console.log(`>>> API SECURITY INTEGRATION: ${passed} PASSED, ${failed} FAILED <<<`);
    process.exit(1);
  }
}).catch((err) => {
  console.error('FATAL UNCAUGHT ERROR:', err);
  process.exit(1);
});
