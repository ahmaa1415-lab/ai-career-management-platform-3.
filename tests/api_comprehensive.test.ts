import db from '../lib/db';
import { createSession } from '../lib/auth';

console.log('================================================================');
console.log('--- RUNNING API-01: COMPREHENSIVE LIVE HTTP REST ENDPOINT TEST ---');
console.log('================================================================');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const defaultUser = db.prepare("SELECT * FROM users WHERE id = 'user_default_01'").get() as any;
const testSession = createSession(defaultUser?.id || 'user_default_01', { rememberMe: true, userAgent: 'APITestHarness' });
const authCookie = `career_session=${testSession.token}`;

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = input.startsWith('http') ? input : `${BASE_URL}${input}`;
  const headers = new Headers(init?.headers);
  if (!headers.has('Cookie')) {
    headers.set('Cookie', authCookie);
  }
  return fetch(url, { ...init, headers });
}

async function testAllAPIRoutes() {
  let passedCount = 0;
  let totalCount = 0;

  async function assertAPI(name: string, fn: () => Promise<void>) {
    totalCount++;
    try {
      await fn();
      console.log(`[✓ PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`[✗ FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // 0. Security: Unauthenticated request rejected with 401
  await assertAPI('0. GET /api/profile (Rejects unauthenticated request with 401)', async () => {
    const res = await fetch(`${BASE_URL}/api/profile`);
    if (res.status !== 401) throw new Error(`Expected status 401, got ${res.status}`);
  });

  // 1. GET /api/profile
  await assertAPI('1. GET /api/profile', async () => {
    const res = await apiFetch(`${BASE_URL}/api/profile`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.profile || !data.location || !data.permissions) {
      throw new Error('Profile response missing core components');
    }
  });

  // 2a. POST /api/profile (Validation: Rejects empty target countries)
  await assertAPI('2a. POST /api/profile (Enforces mandatory target country)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: { headline: 'Lead Full Stack Engineer' },
        location: { target_countries: [] }
      })
    });
    if (res.status !== 400) throw new Error(`Expected 400 for empty country, got ${res.status}`);
  });

  // 2b. POST /api/profile (Valid Update)
  await assertAPI('2b. POST /api/profile (Valid update with explicit country)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: {
          headline: 'Lead Full Stack & AI Systems Engineer',
          skills: ['TypeScript', 'Next.js', 'React', 'Node.js', 'Python', 'PostgreSQL', 'Docker'],
          min_salary: 85000,
          preferred_currency: 'USD'
        },
        location: {
          target_countries: ['Egypt', 'United Arab Emirates', 'Germany', 'Remote (Global)'],
          target_cities: ['Cairo', 'Dubai', 'Berlin'],
          relocation_willing: 1,
          visa_sponsorship_required: 1,
          work_mode_preference: 'Remote'
        }
      })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success) throw new Error('Update failed');
  });

  // 3. POST /api/cv/upload
  let uploadedProfile: any = null;
  await assertAPI('3. POST /api/cv/upload (Parse CV & Generate Version B)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Aya Developer
Lead Software Engineer
Cairo, Egypt | candidate@example.com | +201000000000

Experience:
ScaleTech Solutions - Lead Software Engineer (2021-Present)
- Scaled distributed microservices for 2M+ users with 99.98% uptime.
- Reduced database p99 latency by 38%.

Skills:
TypeScript, Next.js, React, Node.js, Python, PostgreSQL, Docker`
      })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.extracted_profile || !data.optimized_master_cv) {
      throw new Error('Upload response missing extracted profile or Version B');
    }
    uploadedProfile = data.extracted_profile;
  });

  // 4. POST /api/cv/essential-preferences (Validation Check: Empty countries rejected)
  await assertAPI('4. POST /api/cv/essential-preferences (Rejects empty countries)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/cv/essential-preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_countries: [],
        relocation_willing: true
      })
    });
    if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
  });

  // 5. POST /api/cv/essential-preferences (Valid 5 Questions)
  let topMatches: any[] = [];
  await assertAPI('5. POST /api/cv/essential-preferences (Submit 5 answers & discover)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/cv/essential-preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_countries: ['Egypt', 'United Arab Emirates', 'Germany', 'Remote (Global)'],
        relocation_willing: true,
        relocation_timeline: 'Relocation immediately',
        visa_sponsorship_required: true,
        min_salary: 85000,
        work_mode_preference: 'Remote'
      })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.top_opportunities)) {
      throw new Error('Preferences response missing top_opportunities');
    }
    topMatches = data.top_opportunities;
  });

  // 6. GET /api/jobs & GET /api/jobs?top=true
  await assertAPI('6. GET /api/jobs (Verified listings & Top 10)', async () => {
    const allRes = await apiFetch(`${BASE_URL}/api/jobs`);
    if (allRes.status !== 200) throw new Error(`Status ${allRes.status}`);
    const allData = await allRes.json();
    if (!allData.jobs || allData.jobs.length === 0) throw new Error('No jobs returned');

    const topRes = await apiFetch(`${BASE_URL}/api/jobs?top=true`);
    if (topRes.status !== 200) throw new Error(`Status ${topRes.status}`);
    const topData = await topRes.json();
    if (!topData.opportunities || topData.opportunities.length === 0) throw new Error('No top opportunities');
  });

  // 7. POST /api/jobs/sync
  await assertAPI('7. POST /api/jobs/sync (Force job aggregator sync)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/jobs/sync`, { method: 'POST' });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success) throw new Error('Sync failed');
  });

  // 8. GET /api/resumes
  await assertAPI('8. GET /api/resumes (Stored resumes list)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/resumes`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.resumes || data.resumes.length === 0) throw new Error('No resumes found');
  });

  // 9. POST /api/ats/analyze
  await assertAPI('9. POST /api/ats/analyze (ATS analysis)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/ats/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cv_text: 'Senior Full Stack Engineer with TypeScript, Next.js, React, Node.js, Python, PostgreSQL, Docker.',
        target_role: 'Lead Full Stack Engineer',
        target_country: 'Germany'
      })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.result || typeof data.result.overall_score !== 'number') {
      throw new Error('Invalid ATS analysis response');
    }
  });

  // 10. POST /api/applications/prepare
  let createdAppId = '';
  await assertAPI('10. POST /api/applications/prepare (Create application package)', async () => {
    // Pick a job listing that is clean
    const allJobsRes = await apiFetch(`${BASE_URL}/api/jobs`);
    const allJobsData = await allJobsRes.json();
    const crmRes = await apiFetch(`${BASE_URL}/api/crm/status`);
    const crmData = await crmRes.json();
    const appliedJobIds = new Set(crmData.applications.map((a: any) => a.job_id));

    const targetJob = allJobsData.jobs.find((j: any) => !appliedJobIds.has(j.id)) || allJobsData.jobs[0];

    // If all applied, clear applications for this test target
    const dbModule = await import('../lib/db');
    const db = dbModule.default;
    db.prepare('DELETE FROM applications WHERE job_id = ?').run(targetJob.id);

    const res = await apiFetch(`${BASE_URL}/api/applications/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: targetJob.id })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.application) throw new Error('Prepare application failed');
    if (!['Package Prepared', 'Approval Pending'].includes(data.application.status)) {
      throw new Error(`Expected 'Package Prepared' or 'Approval Pending', got '${data.application.status}'`);
    }
    createdAppId = data.application.id;
  });

  // 11. POST /api/applications/submit (Security Check: Blocked without approval)
  await assertAPI('11. POST /api/applications/submit (Security gate blocks unapproved submit)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: createdAppId, candidate_confirmed: true, notes: 'Unauthorized probe' })
    });
    if (res.status !== 400) throw new Error(`Expected status 400 for unapproved submit, got ${res.status}`);
  });

  // 12. POST /api/applications/approve (Security Check: Blocked without consent: true)
  await assertAPI('12. POST /api/applications/approve (Rejects approval without explicit consent)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: createdAppId, consent: false })
    });
    if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
  });

  // 13. POST /api/applications/approve (With consent: true)
  await assertAPI('13. POST /api/applications/approve (Approves with human consent)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: createdAppId, consent: true })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!['Ready for Candidate Submission', 'Ready to Apply'].includes(data.application.status)) {
      throw new Error(`Expected 'Ready for Candidate Submission' or 'Ready to Apply', got '${data.application.status}'`);
    }
  });

  // 14. POST /api/applications/submit (Authorized Submission)
  await assertAPI('14. POST /api/applications/submit (Confirms submission in CRM)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: createdAppId, candidate_confirmed: true, notes: 'Applied via careers portal' })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!['Submitted by Candidate', 'Applied'].includes(data.application.status)) {
      throw new Error(`Expected 'Submitted by Candidate' or 'Applied', got '${data.application.status}'`);
    }
  });

  // 15. GET /api/crm/status & POST /api/crm/status
  await assertAPI('15. /api/crm/status (Lifecycle stage progression)', async () => {
    const getRes = await apiFetch(`${BASE_URL}/api/crm/status`);
    if (getRes.status !== 200) throw new Error(`GET Status ${getRes.status}`);
    const getData = await getRes.json();
    if (!Array.isArray(getData.applications)) throw new Error('Missing applications array');

    const updateRes = await apiFetch(`${BASE_URL}/api/crm/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: createdAppId,
        new_status: 'Interview',
        notes: 'Technical screen scheduled with hiring team.'
      })
    });
    if (updateRes.status !== 200) throw new Error(`POST Status ${updateRes.status}`);
    const updateData = await updateRes.json();
    if (updateData.application.status !== 'Interview') {
      throw new Error(`Expected 'Interview', got '${updateData.application.status}'`);
    }
  });

  // 16. GET /api/emails & POST /api/emails/draft
  let draftId = '';
  await assertAPI('16. /api/emails (Inbox & Reply Drafting)', async () => {
    const getRes = await apiFetch(`${BASE_URL}/api/emails`);
    if (getRes.status !== 200) throw new Error(`GET Status ${getRes.status}`);
    const getData = await getRes.json();
    if (!Array.isArray(getData.emails) || getData.emails.length === 0) throw new Error('No emails in inbox');

    const sampleEmail = getData.emails[0];
    const draftRes = await apiFetch(`${BASE_URL}/api/emails/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Reply',
        target_email: sampleEmail
      })
    });
    if (draftRes.status !== 200) throw new Error(`POST Status ${draftRes.status}`);
    const draftData = await draftRes.json();
    if (!draftData.draft || !draftData.draft.id) throw new Error('Draft creation failed');
    draftId = draftData.draft.id;
  });

  // 17. POST /api/emails/send (Security Gate: Rejects without confirmation)
  await assertAPI('17. POST /api/emails/send (Security gate blocks unconfirmed dispatch)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_id: draftId, confirmed: false })
    });
    if (res.status !== 400) throw new Error(`Expected status 400, got ${res.status}`);
  });

  // 18. POST /api/emails/send (Confirmed dispatch)
  await assertAPI('18. POST /api/emails/send (Confirmed email dispatch)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_id: draftId, confirmed: true })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success) throw new Error('Send confirmation failed');
  });

  // 19. GET /api/reports/daily & POST /api/reports/daily
  await assertAPI('19. /api/reports/daily (Executive daily briefing for Cairo)', async () => {
    const postRes = await apiFetch(`${BASE_URL}/api/reports/daily`, { method: 'POST' });
    if (postRes.status !== 200) throw new Error(`POST Status ${postRes.status}`);
    const postData = await postRes.json();
    if (!postData.report || !postData.report.id) throw new Error('Report generation failed');

    const getRes = await apiFetch(`${BASE_URL}/api/reports/daily`);
    if (getRes.status !== 200) throw new Error(`GET Status ${getRes.status}`);
    const getData = await getRes.json();
    if (!Array.isArray(getData.reports) || getData.reports.length === 0) throw new Error('No reports found');
  });

  // 20. GET /api/security/export
  await assertAPI('20. GET /api/security/export (Full GDPR data archive)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/security/export`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.user || !data.auditLogs || data.auditLogs.length === 0) {
      throw new Error('GDPR export incomplete');
    }
  });

  // 21. GET /api/integrations/linkedin
  await assertAPI('21. GET /api/integrations/linkedin (Returns LinkedIn integration record)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/integrations/linkedin`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.integration || data.integration.service !== 'linkedin') {
      throw new Error('Invalid LinkedIn integration response');
    }
  });

  // 22. POST /api/integrations/linkedin (Sync recruiter SEO)
  await assertAPI('22. POST /api/integrations/linkedin (Sync profile & recruiter SEO)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/integrations/linkedin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.summary || data.summary.visibility_score < 90) {
      throw new Error(`LinkedIn sync failed, visibility score: ${data.summary?.visibility_score}`);
    }
  });

  // 23. GET /api/applications/auto-apply (Autopilot Status)
  await assertAPI('23. GET /api/applications/auto-apply (Returns Autopilot configuration & platform list)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/auto-apply`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.autopilot || !Array.isArray(data.autopilot.target_platforms)) {
      throw new Error('Invalid Autopilot status response');
    }
  });

  // 24. POST /api/applications/auto-apply (Autonomous Auto-Apply Everywhere on Behalf of User)
  await assertAPI('24. POST /api/applications/auto-apply (Autonomously applies everywhere on user behalf)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/applications/auto-apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minMatchScore: 70, forceAll: true })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.applied_applications)) {
      throw new Error('Autonomous auto-apply failed to submit applications');
    }
  });

  // 25. POST /api/integrations/linkedin (Auto-Apply to LinkedIn Posts)
  await assertAPI('25. POST /api/integrations/linkedin (Auto-apply to LinkedIn hiring posts)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/integrations/linkedin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto_apply_posts' })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.applications)) {
      throw new Error('LinkedIn posts auto-apply failed');
    }
  });

  // 26. GET /api/portal-accounts (External Company Site Accounts Vault)
  await assertAPI('26. GET /api/portal-accounts (Company Portal Accounts Vault)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/portal-accounts`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.accounts)) {
      throw new Error('Company portal accounts API failed');
    }
  });

  // 27. POST /api/portal-accounts (Provision Company Portal Account)
  await assertAPI('27. POST /api/portal-accounts (Provision candidate account for company portal)', async () => {
    db.prepare(`
      INSERT INTO job_listings (
        id, employer, title, location, source, source_url, publication_date,
        requirements, is_verified, company_portal_url, portal_platform, application_type, raw_description,
        authenticity_status
      ) VALUES (
        'job_de_09', 'Klarna', 'Senior Software Engineer (Backend)', 'Berlin, Germany', 'LinkedIn Jobs',
        'https://klarna.wd3.myworkdayjobs.com/Klarna_Careers/job/senior-backend', '2026-11-01',
        '["TypeScript", "Node.js", "PostgreSQL", "Distributed Systems"]', 1,
        'https://klarna.wd3.myworkdayjobs.com/Klarna_Careers', 'Workday', 'company_site_account',
        'Klarna is hiring a Senior Software Engineer via Workday portal.', 'VERIFIED_OPEN'
      ) ON CONFLICT(id) DO UPDATE SET
        company_portal_url = excluded.company_portal_url,
        portal_platform = excluded.portal_platform,
        application_type = excluded.application_type,
        authenticity_status = 'VERIFIED_OPEN'
    `).run();

    const res = await apiFetch(`${BASE_URL}/api/portal-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'provision', job_id: 'job_de_09' }) // Klarna Workday
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.account || data.account.portal_platform !== 'Workday') {
      throw new Error('Failed to provision portal account');
    }
  });

  // 28. POST /api/auth/login (Candidate Authentication & Session Creation)
  let sessionCookie = '';
  await assertAPI('28. POST /api/auth/login (Candidate Login & Session Issuance)', async () => {
    const userRow = db.prepare("SELECT email FROM users WHERE id = 'user_default_01'").get() as any;
    const loginEmail = userRow?.email || 'candidate.synthetic@example.internal';
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail,
        password: 'Password123!',
        rememberMe: true
      })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.user) throw new Error('Failed to login with valid credentials');
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) sessionCookie = setCookie.split(';')[0];
  });

  // 29. GET /api/auth/session (Session State Retrieval)
  await assertAPI('29. GET /api/auth/session (Session State Verification)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: sessionCookie ? { Cookie: sessionCookie } : {}
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.authenticated || !data.user) throw new Error('Session is not authenticated');
  });

  // 30. POST /api/auth/forgot-password (Password Recovery Dispatch)
  await assertAPI('30. POST /api/auth/forgot-password (Password Recovery Token)', async () => {
    const userRow = db.prepare("SELECT email FROM users WHERE id = 'user_default_01'").get() as any;
    const loginEmail = userRow?.email || 'candidate.synthetic@example.internal';
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail })
    });
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success) throw new Error('Failed to dispatch recovery token');
  });

  // 31. GET /api/integrations/accounts (5 External Integrations Center)
  await assertAPI('31. GET /api/integrations/accounts (Connected Accounts & Integrations)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/integrations/accounts`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.integrations) || data.integrations.length !== 5) {
      throw new Error('Integrations accounts API did not return 5 verified channels');
    }
  });

  // 32. GET /api/settings/profile (Candidate Personal Settings)
  await assertAPI('32. GET /api/settings/profile (Personal Profile Settings)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/settings/profile`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.user) throw new Error('Profile settings API failed');
  });

  // 33. GET /api/settings/notifications (Notification & UI Preferences)
  await assertAPI('33. GET /api/settings/notifications (Notifications & UI Preferences)', async () => {
    const res = await apiFetch(`${BASE_URL}/api/settings/notifications`);
    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Status ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.success || !data.settings) throw new Error('Notifications settings API failed');
  });

  console.log('\n================================================================');
  console.log(`>>> ALL ${passedCount}/${totalCount} LIVE HTTP REST API ENDPOINTS VERIFIED WITH 0 ERRORS! <<<`);
  console.log('================================================================');
}

testAllAPIRoutes().catch(err => {
  console.error('\nAPI INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
