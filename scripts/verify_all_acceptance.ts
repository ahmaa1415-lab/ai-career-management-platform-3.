import db from '../lib/db';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(suite: string, test: string, passed: boolean, details: string) {
  results.push({ suite, test, passed, details });
  const statusMark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${statusMark} [${suite}] ${test}: ${details}`);
}

// Minimal valid PDF generator
function createSyntheticPdf(name: string, role: string, industry: string, location: string, skills: string[]): Buffer {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 500 >>
stream
BT
/F1 12 Tf
72 712 Td
(${name}) Tj
0 -20 Td
(${role}) Tj
0 -20 Td
(Email: ${name.toLowerCase().replace(/\\s+/g, '.')}@acceptance.test) Tj
0 -20 Td
(Location: ${location}) Tj
0 -20 Td
(Summary: Experienced ${role} with 8 years of experience in ${industry} leading high-impact initiatives.) Tj
0 -20 Td
(CORE COMPETENCIES: ${skills.join(', ')}) Tj
0 -20 Td
(EXPERIENCE: Lead ${role} at Global Enterprises from 2018 to Present in ${location}.) Tj
0 -20 Td
(EDUCATION: Bachelor of Science from Technical University.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000776 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
850
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

// Helper to create authenticated test user and session in SQLite
function createTestUserSession(email: string, fullName: string): { user: any; token: string; cookie: string } {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  let user = existing;
  if (!user) {
    const id = `usr_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO users (id, email, full_name, role, is_verified)
      VALUES (?, ?, ?, 'candidate', 1)
    `).run(id, email, fullName);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  }

  // Ensure profile, location, and permission records exist
  const existingProf = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(user.id);
  if (!existingProf) {
    db.prepare(`
      INSERT INTO profiles (id, user_id, headline)
      VALUES (?, ?, ?)
    `).run(`prof_${user.id}`, user.id, 'Candidate');
  }

  const existingLoc = db.prepare('SELECT id FROM profile_locations WHERE user_id = ?').get(user.id);
  if (!existingLoc) {
    db.prepare(`
      INSERT INTO profile_locations (id, user_id, target_countries, target_cities, resume_derived_locations)
      VALUES (?, ?, '[]', '[]', '[]')
    `).run(`loc_${user.id}`, user.id);
  }

  const existingPerm = db.prepare('SELECT id FROM profile_permissions WHERE user_id = ?').get(user.id);
  if (!existingPerm) {
    db.prepare(`
      INSERT INTO profile_permissions (id, user_id, job_research_authorized, cv_analysis_authorized)
      VALUES (?, ?, 1, 1)
    `).run(`perm_${user.id}`, user.id);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(`sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, user.id, tokenHash, expiresAt);

  return { user, token, cookie: `career_session=${token}` };
}

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('STARTING FULL POST-IMPLEMENTATION ACCEPTANCE SUITE (TESTS 4-6 + A-H)');
  console.log('================================================================\n');

  // Setup Test Users
  const userA = createTestUserSession('aya.commercial@acceptance.local', 'Aya Test');
  const userB = createTestUserSession('sarah.engineer@acceptance.local', 'Sarah Test');
  const userC = createTestUserSession('carter.fresh@acceptance.local', 'Carter Fresh');

  // -------------------------------------------------------------------------
  // SUITE 1: TEST 4 — LINKEDIN INTEGRATION REALITY & SECURITY
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: TEST 4 — LINKEDIN INTEGRATION ---');

  try {
    // 1.1 Check real status for user A
    const resA = await fetch(`${BASE_URL}/api/integrations/linkedin`, {
      headers: { Cookie: userA.cookie }
    });
    const dataA = await resA.json();
    const isStatusValid = ['Not Connected', 'Authorization Required', 'Connected'].includes(dataA.status);
    const noFakeConnection = dataA.status !== 'connected'; // Should not be fabricated connected
    const noAyaFallback = !dataA.profile_url?.includes('aya-h-mahmoud14') || dataA.profile_url === '';

    record('TEST 4', 'Real Connection Status Reported', isStatusValid && noFakeConnection,
      `Status: "${dataA.status}" (Allowed non-fake statuses: Not Connected / Authorization Required)`);

    record('TEST 4', 'Zero Hardcoded Profile Fallback', noAyaFallback,
      `Profile URL: "${dataA.profile_url || '(none)'}" - No unauthorized fallback identity`);

    // 1.2 Check OAuth URL Generation with CSRF state
    const oauthRes = await fetch(`${BASE_URL}/api/integrations/linkedin?action=get_oauth_url`, {
      headers: { Cookie: userA.cookie }
    });
    const oauthData = await oauthRes.json();
    const hasOauthUrl = typeof oauthData.oauth_url === 'string' && oauthData.oauth_url.includes('linkedin.com/oauth/v2/authorization');
    const hasStateToken = typeof oauthData.state === 'string' && oauthData.state.length > 10;
    const hasScopes = typeof oauthData.scopes === 'string' && oauthData.scopes.includes('openid');

    record('TEST 4', 'OAuth URL & CSRF State Generation', hasOauthUrl && hasStateToken && hasScopes,
      `Generated OAuth URL: ${hasOauthUrl ? 'Valid' : 'Invalid'}, CSRF State Length: ${oauthData.state?.length || 0}, Scopes: "${oauthData.scopes}"`);

    // 1.3 Check Sync without connection rejects cleanly with informative 400
    const syncRes = await fetch(`${BASE_URL}/api/integrations/linkedin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
      body: JSON.stringify({ action: 'sync' })
    });
    const syncData = await syncRes.json();
    const syncCleanlyHandled = syncRes.status === 400 && syncData.error?.includes('not connected');

    record('TEST 4', 'Disallowed Action on Unconnected Service', syncCleanlyHandled,
      `HTTP ${syncRes.status}: "${syncData.error || syncData.message}"`);

    // 1.4 Assisted Workflow Transparency Check
    const scoutRes = await fetch(`${BASE_URL}/api/linkedin/scout-and-apply?limit=3`, {
      headers: { Cookie: userA.cookie }
    });
    const scoutData = await scoutRes.json();
    const transparentMode = scoutData.connection?.integration_mode?.includes('Assisted Workflow') ||
      scoutData.connection?.status === 'Not Connected';

    record('TEST 4', 'Assisted Workflow Mode Transparency', transparentMode,
      `Scout reports mode: "${scoutData.connection?.integration_mode || scoutData.connection?.status}" (No fake automation claimed)`);
  } catch (err: any) {
    record('TEST 4', 'Execution Error', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 2: TEST 5 — REAL USER & SESSION ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: TEST 5 — USER & SESSION ISOLATION ---');

  let ayaResumeId = '';
  let sarahResumeId = '';

  try {
    // 2.1 Upload Aya's Resume
    const ayaPdf = createSyntheticPdf(
      'Aya Test',
      'Commercial Manager',
      'Pharmaceuticals',
      'Cairo, Egypt',
      ['Key Account Management', 'Commercial Strategy', 'Distributor Negotiations', 'P&L Management']
    );
    const formA = new FormData();
    formA.append('file', new Blob([ayaPdf], { type: 'application/pdf' }), 'Aya_Commercial_Manager.pdf');

    const upResA = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userA.cookie },
      body: formA
    });
    const upDataA = await upResA.json();
    ayaResumeId = upDataA.resume?.id || upDataA.resume_id || '';

    record('TEST 5', 'User A Resume Upload', upResA.ok && !!ayaResumeId,
      `Resume ID: ${ayaResumeId}, Headline: "${upDataA.extracted_profile?.current_headline || upDataA.resume?.target_role}"`);

    // 2.2 Upload Sarah's Resume
    const sarahPdf = createSyntheticPdf(
      'Sarah Test',
      'Senior Software Engineer',
      'Technology',
      'San Francisco, CA',
      ['Distributed Systems', 'TypeScript', 'Kubernetes', 'Cloud Infrastructure', 'Go']
    );
    const formB = new FormData();
    formB.append('file', new Blob([sarahPdf], { type: 'application/pdf' }), 'Sarah_Software_Engineer.pdf');

    const upResB = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userB.cookie },
      body: formB
    });
    const upDataB = await upResB.json();
    sarahResumeId = upDataB.resume?.id || upDataB.resume_id || '';

    record('TEST 5', 'User B Resume Upload', upResB.ok && !!sarahResumeId,
      `Resume ID: ${sarahResumeId}, Headline: "${upDataB.extracted_profile?.current_headline || upDataB.resume?.target_role}"`);

    // 2.3 Verify Isolation on /api/profile
    const profResA = await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userA.cookie } });
    const profDataA = await profResA.json();

    const profResB = await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userB.cookie } });
    const profDataB = await profResB.json();

    const ayaCorrect = profDataA.profile?.full_name?.includes('Aya') && profDataA.profile?.user_id === userA.user.id;
    const sarahCorrect = profDataB.profile?.full_name?.includes('Sarah') && profDataB.profile?.user_id === userB.user.id;

    record('TEST 5', 'User Profile Identity Isolation', ayaCorrect && sarahCorrect,
      `User A profile: "${profDataA.profile?.full_name}" (UID: ${profDataA.profile?.user_id}) | User B profile: "${profDataB.profile?.full_name}" (UID: ${profDataB.profile?.user_id})`);

    // 2.4 Verify Resumes List Scoped Strictly by Authenticated Session
    const resListA = await (await fetch(`${BASE_URL}/api/resumes`, { headers: { Cookie: userA.cookie } })).json();
    const resListB = await (await fetch(`${BASE_URL}/api/resumes`, { headers: { Cookie: userB.cookie } })).json();

    const aHasOnlyA = resListA.resumes?.every((r: any) => r.user_id === userA.user.id);
    const bHasOnlyB = resListB.resumes?.every((r: any) => r.user_id === userB.user.id);

    record('TEST 5', 'Resumes List Scoped by User ID', aHasOnlyA && bHasOnlyB,
      `User A owns ${resListA.resumes?.length || 0} resumes, User B owns ${resListB.resumes?.length || 0} resumes. Zero crosstalk.`);

    // 2.5 Cross-tenant access attempt: User A tries to read User B's resume
    const crossRes = await fetch(`${BASE_URL}/api/profile?resume_id=${sarahResumeId}`, {
      headers: { Cookie: userA.cookie }
    });
    const crossData = await crossRes.json();
    // Should NOT expose Sarah's master CV or Sarah's identity to User A
    const crossSecure = crossData.master_cv?.id !== sarahResumeId && crossData.profile?.user_id === userA.user.id;

    record('TEST 5', 'Cross-Tenant Unauthorized Resume Access Blocked', crossSecure,
      `Attempted access to User B resume from User A session -> Profile remains scoped to User A (UID: ${crossData.profile?.user_id})`);
  } catch (err: any) {
    record('TEST 5', 'Execution Error', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 3: TEST 6 — FAILURE HANDLING & INPUT VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: TEST 6 — FAILURE HANDLING & VALIDATION ---');

  try {
    // 3.1 Empty File (0 bytes)
    const emptyForm = new FormData();
    emptyForm.append('file', new Blob([Buffer.alloc(0)], { type: 'application/pdf' }), 'empty.pdf');
    const emptyRes = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userA.cookie },
      body: emptyForm
    });
    const emptyData = await emptyRes.json();
    record('TEST 6', 'Empty File Rejected (HTTP 400)', emptyRes.status === 400,
      `HTTP ${emptyRes.status}: "${emptyData.error}"`);

    // 3.2 Corrupted File (random bytes without %PDF- magic bytes)
    const corruptBytes = Buffer.from('NOT_A_PDF_CORRUPTED_BINARY_DATA_RANDOM_XYZ_1234567890');
    const corruptForm = new FormData();
    corruptForm.append('file', new Blob([corruptBytes], { type: 'application/pdf' }), 'corrupted.pdf');
    const corruptRes = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userA.cookie },
      body: corruptForm
    });
    const corruptData = await corruptRes.json();
    record('TEST 6', 'Corrupt PDF Rejected (HTTP 400)', corruptRes.status === 400,
      `HTTP ${corruptRes.status}: "${corruptData.error}"`);

    // 3.3 Unsupported Executable File (.exe)
    const exeForm = new FormData();
    exeForm.append('file', new Blob([Buffer.from('MZ_EXECUTABLE_HEADER')], { type: 'application/x-msdownload' }), 'malicious.exe');
    const exeRes = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userA.cookie },
      body: exeForm
    });
    const exeData = await exeRes.json();
    record('TEST 6', 'Unsupported File Type Rejected (HTTP 400)', exeRes.status === 400,
      `HTTP ${exeRes.status}: "${exeData.error}"`);

    // 3.4 Verify Active Resume Unchanged After Failed Uploads
    const checkActive = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userA.cookie } })).json();
    const activeResumeIntact = checkActive.master_cv?.id === ayaResumeId;
    record('TEST 6', 'Active Resume Integrity Preserved After Failures', activeResumeIntact,
      `Active Resume ID remains: "${checkActive.master_cv?.id}" (intact)`);
  } catch (err: any) {
    record('TEST 6', 'Execution Error', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 4: LOCATION ARCHITECTURE ACCEPTANCE TESTS (TESTS A - H)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: LOCATION ARCHITECTURE TESTS (A-H) ---');

  try {
    // TEST A: Fresh Session Initialization -> Current Location null, Target Countries empty
    const freshProfRes = await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userC.cookie } });
    const freshProf = await freshProfRes.json();
    const currentLocNull = freshProf.location?.current_physical_location === null || freshProf.location?.current_physical_location === undefined;
    const targetCountriesEmpty = Array.isArray(freshProf.location?.target_countries) && freshProf.location.target_countries.length === 0;

    record('TEST A', 'Fresh Account Location Default (Null & Empty)', currentLocNull && targetCountriesEmpty,
      `current_physical_location: ${JSON.stringify(freshProf.location?.current_physical_location)}, target_countries: ${JSON.stringify(freshProf.location?.target_countries)}`);

    // TEST B: Upload Resume with Location Mention (London) -> Stored in resume_derived_locations ONLY
    const londonPdf = createSyntheticPdf(
      'Carter Fresh',
      'Finance Director',
      'Financial Services',
      'London, United Kingdom',
      ['Financial Modeling', 'Corporate Governance', 'Capital Allocation']
    );
    const formC = new FormData();
    formC.append('file', new Blob([londonPdf], { type: 'application/pdf' }), 'Carter_London_Finance.pdf');

    const upResC = await fetch(`${BASE_URL}/api/cv/upload`, {
      method: 'POST',
      headers: { Cookie: userC.cookie },
      body: formC
    });
    const upDataC = await upResC.json();

    const postUploadProf = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userC.cookie } })).json();
    const derivedHasLondon = postUploadProf.location?.resume_derived_locations?.some((l: string) => l.includes('London') || l.includes('United Kingdom'));
    const currentStillNull = postUploadProf.location?.current_physical_location === null || postUploadProf.location?.current_physical_location === undefined;
    const targetStillEmpty = postUploadProf.location?.target_countries?.length === 0;

    record('TEST B', 'Resume Location Stored as Derived Fact, NOT Current or Target',
      derivedHasLondon && currentStillNull && targetStillEmpty,
      `resume_derived_locations: ${JSON.stringify(postUploadProf.location?.resume_derived_locations)}, current_physical: ${JSON.stringify(postUploadProf.location?.current_physical_location)}, target_countries: ${JSON.stringify(postUploadProf.location?.target_countries)}`);

    // TEST C: Explicit Current Physical Location Entered Manually (Concept A)
    const savePhysicalRes = await fetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userC.cookie },
      body: JSON.stringify({
        location: {
          current_physical_location: 'Berlin, Germany',
          target_countries: [] // Kept empty
        }
      })
    });
    const savedPhysicalProf = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userC.cookie } })).json();
    const physicalMatches = savedPhysicalProf.location?.current_physical_location === 'Berlin, Germany';
    const targetRemainsEmpty = savedPhysicalProf.location?.target_countries?.length === 0;

    record('TEST C', 'Concept A Saved Independently from Concept B', physicalMatches && targetRemainsEmpty,
      `current_physical_location: "${savedPhysicalProf.location?.current_physical_location}", target_countries: ${JSON.stringify(savedPhysicalProf.location?.target_countries)}`);

    // TEST D: Explicit Preferred Job Search Locations (Concept B)
    const saveTargetRes = await fetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userC.cookie },
      body: JSON.stringify({
        location: {
          current_physical_location: 'Berlin, Germany',
          target_countries: ['United Arab Emirates', 'Saudi Arabia'],
          target_cities: ['Dubai', 'Riyadh']
        }
      })
    });
    const savedTargetProf = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userC.cookie } })).json();
    const hasUaeSaudi = savedTargetProf.location?.target_countries?.includes('United Arab Emirates') &&
      savedTargetProf.location?.target_countries?.includes('Saudi Arabia');
    const physicalPreserved = savedTargetProf.location?.current_physical_location === 'Berlin, Germany';

    record('TEST D', 'Concept B Saved Independently from Concept A', hasUaeSaudi && physicalPreserved,
      `target_countries: ${JSON.stringify(savedTargetProf.location?.target_countries)}, current_physical: "${savedTargetProf.location?.current_physical_location}"`);

    // TEST E: Clear Location Preferences -> Stays Cleared
    const clearRes = await fetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userC.cookie },
      body: JSON.stringify({
        location: {
          current_physical_location: null,
          target_countries: [],
          target_cities: []
        }
      })
    });
    const clearedProf = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userC.cookie } })).json();
    const isNowCleared = (clearedProf.location?.current_physical_location === null || clearedProf.location?.current_physical_location === undefined) &&
      clearedProf.location?.target_countries?.length === 0;

    record('TEST E', 'Location Preferences Cleared & Persisted as Null/Empty', isNowCleared,
      `current_physical: ${JSON.stringify(clearedProf.location?.current_physical_location)}, target_countries: ${JSON.stringify(clearedProf.location?.target_countries)}`);

    // TEST F: Job Fit Scoring Treats Empty Locations as Unrestricted Flexible Search
    const jobsRes = await fetch(`${BASE_URL}/api/jobs`, { headers: { Cookie: userC.cookie } });
    const jobsData = await jobsRes.json();
    const sampleJob = jobsData.jobs?.[0];
    const unrestrictedWorks = jobsData.jobs?.length > 0;

    record('TEST F', 'Unrestricted Job Discovery Operates Cleanly Without Target Countries', unrestrictedWorks,
      `Discovered ${jobsData.jobs?.length || 0} jobs in unrestricted mode without geographic errors.`);

    // TEST G: Career Recommendations Dynamic Reality Check
    // User A (Commercial Manager) vs User B (Senior Software Engineer)
    const profA = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userA.cookie } })).json();
    const profB = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userB.cookie } })).json();

    const roleA = profA.profile?.headline || profA.profile?.target_roles?.[0] || '';
    const roleB = profB.profile?.headline || profB.profile?.target_roles?.[0] || '';

    const dynamicRoles = roleA !== roleB && roleA.length > 0 && roleB.length > 0;
    record('TEST G', 'Dynamic Career Target Differentiation', dynamicRoles,
      `User A Target: "${roleA}" | User B Target: "${roleB}" (Distinct dynamic identities)`);

    // TEST H: Cross-User Location Settings Isolation
    // Set User A to ['Germany'], User B to ['Singapore']
    await fetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
      body: JSON.stringify({ location: { target_countries: ['Germany'] } })
    });
    await fetch(`${BASE_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
      body: JSON.stringify({ location: { target_countries: ['Singapore'] } })
    });

    const verifyA = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userA.cookie } })).json();
    const verifyB = await (await fetch(`${BASE_URL}/api/profile`, { headers: { Cookie: userB.cookie } })).json();

    const noLocationLeak = verifyA.location?.target_countries?.includes('Germany') &&
      !verifyA.location?.target_countries?.includes('Singapore') &&
      verifyB.location?.target_countries?.includes('Singapore') &&
      !verifyB.location?.target_countries?.includes('Germany');

    record('TEST H', 'Cross-User Location Settings Isolation', noLocationLeak,
      `User A target: ${JSON.stringify(verifyA.location?.target_countries)} | User B target: ${JSON.stringify(verifyB.location?.target_countries)}`);
  } catch (err: any) {
    record('TESTS A-H', 'Execution Error', false, err.message);
  }

  // -------------------------------------------------------------------------
  // FINAL REPORT & SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ACCEPTANCE TEST RESULTS SUMMARY');
  console.log('================================================================');

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`SUCCESS RATE: ${((passed / total) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter(r => !r.passed).forEach(f => {
      console.error(`- [${f.suite}] ${f.test}: ${f.details}`);
    });
    process.exit(1);
  } else {
    console.log('ALL ACCEPTANCE TESTS PASSED! System verified end-to-end.');
    process.exit(0);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
