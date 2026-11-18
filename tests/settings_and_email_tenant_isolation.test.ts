/**
 * Settings and Email Tenant Isolation & Auth Hardening Security Test Suite
 *
 * Verifies P1 remediation:
 * 1. Unauthenticated requests to settings/profile, settings/notifications,
 *    active-sessions, change-password, emails, email drafts, and email send fail closed (401).
 * 2. Strict cross-tenant boundaries across profile, notifications, sessions, passwords, and emails.
 * 3. Legitimate authenticated operations for candidate tenants.
 * 4. Sandbox email safety and application ownership validation.
 */

import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { randomBytes } from 'crypto';

// 1. Setup isolated test environment in data/test_tenant_isolation
const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `settings_email_sec_${Date.now()}_${randomBytes(4).toString('hex')}.db`);
const testUploadsDir = path.join(testDbDir, `settings_email_uploads_${Date.now()}_${randomBytes(4).toString('hex')}`);
if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });

delete (globalThis as any)._careerAppDb;
process.env.DATABASE_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;
process.env.NODE_ENV = 'test';

// 2. Initialize schema & auth
const { default: db, initializeSchema } = await import('../lib/db');
initializeSchema();

const { createSession, hashPassword, getUserActiveSessions } = await import('../lib/auth');
const { getAllEmails, generateEmailDraft, sendEmailWithApproval } = await import('../lib/email/inbox');

// 3. Seed synthetic candidates A & B
const userAId = `usr_test_A_${Date.now()}_${randomBytes(3).toString('hex')}`;
const userBId = `usr_test_B_${Date.now()}_${randomBytes(3).toString('hex')}`;
const passA = 'OldSecurePass123!';
const passB = 'OldSecurePass456!';

db.prepare(`
  INSERT INTO users (id, email, full_name, password_hash)
  VALUES (?, ?, 'Candidate User A', ?)
`).run(userAId, `${userAId}@example.com`, hashPassword(passA));

db.prepare(`
  INSERT INTO users (id, email, full_name, password_hash)
  VALUES (?, ?, 'Candidate User B', ?)
`).run(userBId, `${userBId}@example.com`, hashPassword(passB));

db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Head of Commercial A')").run(`prof_${userAId}`, userAId);
db.prepare("INSERT INTO profiles (id, user_id, headline) VALUES (?, ?, 'Head of Commercial B')").run(`prof_${userBId}`, userBId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"Egypt\"]')").run(`loc_${userAId}`, userAId);
db.prepare("INSERT INTO profile_locations (id, user_id, target_countries) VALUES (?, ?, '[\"UAE\"]')").run(`loc_${userBId}`, userBId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userAId}`, userAId);
db.prepare("INSERT INTO profile_permissions (id, user_id) VALUES (?, ?)").run(`perm_${userBId}`, userBId);

// Seed synthetic job and applications for A and B
const jobId = `job_test_${Date.now()}`;
db.prepare(`
  INSERT INTO job_listings (id, employer, title, location, source, source_url)
  VALUES (?, 'Acme Global Corp', 'Commercial Lead', 'Dubai, UAE', 'Direct', 'https://example.com/job')
`).run(jobId);

const appAId = `app_A_${Date.now()}`;
const appBId = `app_B_${Date.now()}`;
db.prepare(`
  INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json, human_approved)
  VALUES (?, ?, ?, 'Ready to Apply', 92, '{}', 1)
`).run(appAId, userAId, jobId);

db.prepare(`
  INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json, human_approved)
  VALUES (?, ?, ?, 'Ready to Apply', 88, '{}', 1)
`).run(appBId, userBId, jobId);

// Create sessions
const sessionA1 = createSession(userAId, { rememberMe: true, userAgent: 'Browser_A1' });
const sessionA2 = createSession(userAId, { rememberMe: false, userAgent: 'Browser_A2' });
const sessionB1 = createSession(userBId, { rememberMe: true, userAgent: 'Browser_B1' });

const cookieA1 = `career_session=${sessionA1.token}`;
const cookieB1 = `career_session=${sessionB1.token}`;

// Import API route handlers
const profileRoute = await import('../app/api/settings/profile/route');
const notificationsRoute = await import('../app/api/settings/notifications/route');
const activeSessionsRoute = await import('../app/api/auth/active-sessions/route');
const changePasswordRoute = await import('../app/api/auth/change-password/route');
const emailsRoute = await import('../app/api/emails/route');
const emailDraftRoute = await import('../app/api/emails/draft/route');
const emailSendRoute = await import('../app/api/emails/send/route');

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

console.log('\n===============================================================');
console.log('   SETTINGS & EMAIL TENANT ISOLATION SECURITY TEST SUITE       ');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Unauthenticated Requests Must Fail Closed (HTTP 401)
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: UNAUTHENTICATED FAIL-CLOSED CHECKS ---');

// 1. GET /api/settings/profile
{
  const req = new Request('http://localhost:3000/api/settings/profile', { headers: {} });
  const res = await profileRoute.GET(req);
  logTest('GET /api/settings/profile returns 401 unauthenticated', res.status === 401);
}

// 2. POST /api/settings/profile
{
  const req = new Request('http://localhost:3000/api/settings/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Malicious Overwrite', email: 'malicious@example.com' })
  });
  const res = await profileRoute.POST(req);
  logTest('POST /api/settings/profile returns 401 unauthenticated', res.status === 401);
}

// 3. GET /api/settings/notifications
{
  const req = new Request('http://localhost:3000/api/settings/notifications', { headers: {} });
  const res = await notificationsRoute.GET(req);
  logTest('GET /api/settings/notifications returns 401 unauthenticated', res.status === 401);
}

// 4. POST /api/settings/notifications
{
  const req = new Request('http://localhost:3000/api/settings/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_reports_enabled: false })
  });
  const res = await notificationsRoute.POST(req);
  logTest('POST /api/settings/notifications returns 401 unauthenticated', res.status === 401);
}

// 5. GET /api/auth/active-sessions
{
  const req = new Request('http://localhost:3000/api/auth/active-sessions', { headers: {} });
  const res = await activeSessionsRoute.GET(req);
  logTest('GET /api/auth/active-sessions returns 401 unauthenticated', res.status === 401);
}

// 6. DELETE /api/auth/active-sessions
{
  const req = new Request('http://localhost:3000/api/auth/active-sessions?all=true', {
    method: 'DELETE',
    headers: {}
  });
  const res = await activeSessionsRoute.DELETE(req);
  logTest('DELETE /api/auth/active-sessions returns 401 unauthenticated', res.status === 401);
}

// 7. POST /api/auth/change-password
{
  const req = new Request('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: passA, newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' })
  });
  const res = await changePasswordRoute.POST(req);
  logTest('POST /api/auth/change-password returns 401 unauthenticated', res.status === 401);
}

// 8. GET /api/emails
{
  const req = new Request('http://localhost:3000/api/emails', { headers: {} });
  const res = await emailsRoute.GET(req);
  logTest('GET /api/emails returns 401 unauthenticated', res.status === 401);
}

// 9. POST /api/emails/draft
{
  const req = new Request('http://localhost:3000/api/emails/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'Reply',
      target_email: { sender: 'recruiter@example.com', recipient: 'cand@example.com', subject: 'Job', body: 'Text' }
    })
  });
  const res = await emailDraftRoute.POST(req);
  logTest('POST /api/emails/draft returns 401 unauthenticated', res.status === 401);
}

// 10. POST /api/emails/send
{
  const req = new Request('http://localhost:3000/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_id: 'any_email_id', confirmed: true })
  });
  const res = await emailSendRoute.POST(req);
  logTest('POST /api/emails/send returns 401 unauthenticated', res.status === 401);
}

// -----------------------------------------------------------------------------
// SECTION 2: Cross-Tenant Isolation Enforcement
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: CROSS-TENANT ISOLATION CHECKS ---');

// 1. Profile Isolation: User A gets own profile; cannot read User B's
{
  const reqA = new Request('http://localhost:3000/api/settings/profile', { headers: { cookie: cookieA1 } });
  const resA = await profileRoute.GET(reqA);
  const dataA = await resA.json();
  logTest('User A reads User A profile only', resA.status === 200 && dataA.user?.id === userAId && dataA.user?.id !== userBId);

  // Modifying A does not affect B
  const reqUpdateA = new Request('http://localhost:3000/api/settings/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({ fullName: 'Updated Full Name A', email: `${userAId}@updated.com` })
  });
  const resUpdateA = await profileRoute.POST(reqUpdateA);
  const userBRow = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(userBId) as any;
  logTest('User A profile update does not mutate User B profile', resUpdateA.status === 200 && userBRow.full_name === 'Candidate User B');
}

// 2. Notifications Isolation: User A gets own settings; cannot tamper with B
{
  const reqA = new Request('http://localhost:3000/api/settings/notifications', { headers: { cookie: cookieA1 } });
  const resA = await notificationsRoute.GET(reqA);
  const dataA = await resA.json();
  logTest('User A accesses own notification settings', resA.status === 200 && dataA.settings?.user_id === userAId);

  const reqUpdateA = new Request('http://localhost:3000/api/settings/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({ job_alerts_enabled: false })
  });
  await notificationsRoute.POST(reqUpdateA);
  const settingsB = db.prepare('SELECT job_alerts_enabled FROM user_settings WHERE user_id = ?').get(userBId) as any;
  logTest('User A settings update does not mutate User B settings', settingsB?.job_alerts_enabled === 1 || settingsB === undefined);
}

// 3. Active Sessions Isolation: User A cannot list or revoke User B's sessions
{
  const reqA = new Request('http://localhost:3000/api/auth/active-sessions', { headers: { cookie: cookieA1 } });
  const resA = await activeSessionsRoute.GET(reqA);
  const dataA = await resA.json();
  const includesBSession = (dataA.sessions || []).some((s: any) => s.id === sessionB1.sessionId);
  logTest('User A active sessions list excludes User B sessions', resA.status === 200 && !includesBSession);

  // User A tries to delete User B's session directly by ID
  const reqDeleteB = new Request(`http://localhost:3000/api/auth/active-sessions?id=${sessionB1.sessionId}`, {
    method: 'DELETE',
    headers: { cookie: cookieA1 }
  });
  const resDeleteB = await activeSessionsRoute.DELETE(reqDeleteB);
  const bSessionStillExists = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionB1.sessionId);
  logTest('User A cannot revoke User B session ID (returns 404, session untouched)', resDeleteB.status === 404 && Boolean(bSessionStillExists));
}

// 4. Change Password Isolation: User A changes A's password; B's password untouched
{
  const reqA = new Request('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({ currentPassword: passA, newPassword: 'BrandNewPassword789!', confirmPassword: 'BrandNewPassword789!' })
  });
  const resA = await changePasswordRoute.POST(reqA);
  logTest('User A changes own password successfully', resA.status === 200);

  // Verify B's password has NOT changed
  const { verifyPassword } = await import('../lib/auth');
  const userBHash = (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userBId) as any).password_hash;
  logTest('User B password remains unchanged and authenticates with passB', verifyPassword(passB, userBHash));
  logTest('User B cannot authenticate with A new password', !verifyPassword('BrandNewPassword789!', userBHash));
}

// -----------------------------------------------------------------------------
// SECTION 3: Email Tenant Isolation & Ownership Enforcement
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: EMAIL TENANT ISOLATION CHECKS ---');

// 1. Create emails for User A and User B
const emailA1Id = `email_A1_${Date.now()}`;
const emailB1Id = `email_B1_${Date.now()}`;

db.prepare(`
  INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
  VALUES (?, ?, ?, 'Opportunity', 'recruiter@careem.com', 'userA@example.com', 'Role for User A', 'Details A', 1, 0)
`).run(emailA1Id, userAId, appAId);

db.prepare(`
  INSERT INTO emails (id, user_id, application_id, category, sender, recipient, subject, body, is_draft, is_sent)
  VALUES (?, ?, ?, 'Opportunity', 'recruiter@deliveryhero.com', 'userB@example.com', 'Role for User B', 'Details B', 1, 0)
`).run(emailB1Id, userBId, appBId);

// 2. User A reads emails via GET /api/emails
{
  const reqA = new Request('http://localhost:3000/api/emails', { headers: { cookie: cookieA1 } });
  const resA = await emailsRoute.GET(reqA);
  const dataA = await resA.json();
  const returnedIds = (dataA.emails || []).map((e: any) => e.id);
  logTest('User A receives User A email', returnedIds.includes(emailA1Id));
  logTest('User A DOES NOT receive User B email', !returnedIds.includes(emailB1Id));
}

// 3. User B reads emails via GET /api/emails
{
  const reqB = new Request('http://localhost:3000/api/emails', { headers: { cookie: cookieB1 } });
  const resB = await emailsRoute.GET(reqB);
  const dataB = await resB.json();
  const returnedIds = (dataB.emails || []).map((e: any) => e.id);
  logTest('User B receives User B email', returnedIds.includes(emailB1Id));
  logTest('User B DOES NOT receive User A email', !returnedIds.includes(emailA1Id));
}

// 4. Draft attached to cross-tenant application rejected with 403
{
  // User A tries to create draft linked to User B's application (appBId)
  const reqCrossDraft = new Request('http://localhost:3000/api/emails/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({
      type: 'Reply',
      target_email: { sender: 'recruiter@company.com', recipient: 'userA@example.com', subject: 'Subject', body: 'Body' },
      application_id: appBId // Belongs to B!
    })
  });
  const resCrossDraft = await emailDraftRoute.POST(reqCrossDraft);
  logTest('User A cannot create email draft for User B application (HTTP 403)', resCrossDraft.status === 403);
}

// 5. User A tries to send User B's email
{
  // User A invokes POST /api/emails/send on emailB1Id
  const reqCrossSend = new Request('http://localhost:3000/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({ email_id: emailB1Id, confirmed: true })
  });
  const resCrossSend = await emailSendRoute.POST(reqCrossSend);
  const emailBRow = db.prepare('SELECT delivery_status, is_sent FROM emails WHERE id = ?').get(emailB1Id) as any;
  logTest('User A cannot dispatch User B email (HTTP 403)', resCrossSend.status === 403);
  logTest('User B email status remained untouched in draft state', emailBRow.delivery_status !== 'sandbox_recorded' && emailBRow.is_sent === 0);
}

// 6. User A sends own email (legitimate access with sandbox safety)
{
  const reqLegitSend = new Request('http://localhost:3000/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieA1 },
    body: JSON.stringify({ email_id: emailA1Id, confirmed: true })
  });
  const resLegitSend = await emailSendRoute.POST(reqLegitSend);
  const data = await resLegitSend.json();
  const emailARow = db.prepare('SELECT delivery_status, is_sent, is_draft FROM emails WHERE id = ?').get(emailA1Id) as any;
  logTest('User A legitimately dispatches own email (HTTP 200)', resLegitSend.status === 200 && data.success === true);
  logTest('Email is safely recorded in sandbox (delivery_status=sandbox_recorded, is_sent=0)', emailARow.delivery_status === 'sandbox_recorded' && emailARow.is_sent === 0 && emailARow.is_draft === 0);
}

// -----------------------------------------------------------------------------
// SECTION 4: Database-Level Isolation & Helper Integrity
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: DATABASE-LEVEL ISOLATION VERIFICATION ---');

// 1. getAllEmails() fail-closed without userId
{
  const emptyRes = getAllEmails();
  logTest('getAllEmails() without userId returns empty list (fail-closed)', Array.isArray(emptyRes) && emptyRes.length === 0);
}

// 2. Direct database query proves user_id column exists and stores correct ownership
{
  const emailA = db.prepare('SELECT user_id FROM emails WHERE id = ?').get(emailA1Id) as any;
  const emailB = db.prepare('SELECT user_id FROM emails WHERE id = ?').get(emailB1Id) as any;
  logTest('emails table stores user_id for User A email', emailA.user_id === userAId);
  logTest('emails table stores user_id for User B email', emailB.user_id === userBId);
}

console.log('\n===============================================================');
console.log(`FINAL SECURITY TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
