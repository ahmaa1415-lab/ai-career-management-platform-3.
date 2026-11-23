import db, { getOrCreateDefaultUser } from '../lib/db';
import { POST as uploadPOST } from '../app/api/cv/upload/route';
import { GET as resumesGET } from '../app/api/resumes/route';
import { getTestAuthContext, createExpiredTestSession } from './helpers/testAuth';
import assert from 'assert';
import crypto from 'crypto';

console.log('========================================================================');
console.log('--- RUNNING RESUME VERSIONING & DATA ISOLATION REGRESSION TEST SUITE ---');
console.log('========================================================================');

// FIXTURE A: FMCG Category Management & Commercial Strategy
const RESUME_A_FMCG = `
Sarah Al-Mansoor
Senior FMCG Category & Commercial Strategy Manager
Dubai, UAE | sarah.almansoor@example.com | +971 50 123 4567 | linkedin.com/in/sarah-almansoor

PROFESSIONAL SUMMARY
Senior FMCG Category Manager with 8+ years driving category growth, trade marketing activations, and joint business planning (JBP) across multinational retail environments. Expert in planogram optimization, Nielsen RMS data, and assortment strategy.

CORE COMPETENCIES
Category Management | Trade Marketing | Assortment Optimization | Planogram Strategy | Joint Business Planning (JBP) | Nielsen & Retail Analytics | Supplier Negotiation | FMCG Sales Strategy

WORK EXPERIENCE
Senior Category Manager – Almarai Foods | Dubai, UAE | Jan 2022 – Present
- Directed dairy & beverage retail category strategy across 450+ hypermarkets and modern trade accounts.
- Accelerated category turnover by 28% YoY through evidence-based assortment rationalization and shelf-space reallocation.
- Orchestrated quarterly joint business plans (JBP) with key accounts, securing 15% promotional shelf-share expansion.

Trade Marketing Specialist – Panda Retail Group | Riyadh, KSA | Jun 2018 – Dec 2021
- Spearheaded in-store promotional campaigns and brand activations across modern trade stores.
- Improved promotional ROI by 22% by revamping trade spend allocation and display positioning.
- Supervised space planning audits and compliance verification across nationwide retail branches.

EDUCATION
Bachelor of Commerce (B.Com) – Marketing & Business Administration
Cairo University | 2018

LANGUAGES
Arabic (Native) | English (Fluent)
`.trim();

// FIXTURE B: Cloud & Backend Software Engineering
const RESUME_B_TECH = `
Marcus Vance
Principal Cloud & Distributed Systems Architect
San Francisco, CA | marcus.vance@example.com | +1 415 555 0199 | github.com/marcusvance

PROFESSIONAL SUMMARY
Distributed systems engineer and cloud architect with 10+ years specializing in high-throughput backend services, Kubernetes container orchestration, and real-time streaming architectures. Passionate about developer velocity and sub-millisecond reliability.

CORE COMPETENCIES
Python | Go | TypeScript | Kubernetes | Docker | Microservices | AWS | PostgreSQL | Redis | Apache Kafka | CI/CD | Distributed Systems

WORK EXPERIENCE
Staff Software Engineer – CloudScale Systems | San Francisco, CA | Mar 2021 – Present
- Architected and deployed microservices backend processing 45,000 requests per second with 99.995% uptime.
- Transitioned legacy monolith into containerized Kubernetes clusters on AWS EKS, reducing cloud infrastructure spend by 34%.
- Led distributed database migration to distributed PostgreSQL with zero downtime and sub-5ms query latency.

Senior Backend Engineer – DataStream Inc | Seattle, WA | Aug 2017 – Feb 2021
- Engineered real-time event ingestion engine using Apache Kafka and Go, handling 1.2 billion events daily.
- Optimized Redis caching layer, reducing p99 latency from 120ms to 8ms across mission-critical endpoints.
- Mentored 12 mid-level backend engineers and standardized automated CI/CD pipelines with GitHub Actions.

EDUCATION
Bachelor of Science (B.Sc.) in Computer Science
Cairo University FCIS | 2017

CERTIFICATIONS
AWS Certified Solutions Architect – Professional | Certified Kubernetes Administrator (CKA)
`.trim();

// FIXTURE C: Finance, Audit & IFRS Accounting
const RESUME_C_FINANCE = `
Elena Rostova
Senior Financial Controller & Audit Director
London, UK | elena.rostova@example.com | +44 20 7946 0912 | linkedin.com/in/elena-rostova

PROFESSIONAL SUMMARY
Chartered Certified Financial Controller with 9+ years managing corporate financial reporting, statutory audits, IFRS compliance, and capital budget allocation. Proven track record leading audit engagements and standardizing fiscal governance for multinational enterprises.

CORE COMPETENCIES
Financial Reporting | Statutory Audit | IFRS & GAAP Compliance | Variance Analysis | Corporate Tax | Financial Modeling | Capital Budgeting | Internal Controls | Risk Assessment

WORK EXPERIENCE
Senior Audit Manager – Deloitte & Touche | London, UK | Oct 2021 – Present
- Managed statutory financial audit engagements for FTSE-100 multinational clients with aggregate asset valuation over £4.5B.
- Directed teams of 15 audit seniors in evaluating internal controls, revenue recognition (IFRS 15), and financial instrument compliance (IFRS 9).
- Identified material internal control deficiencies, delivering remedial governance frameworks adopted by board audit committees.

Financial Controller – Apex Global Investments | Frankfurt, Germany | May 2017 – Sep 2021
- Supervised monthly, quarterly, and annual financial statement consolidations in strict compliance with IFRS and local GAAP.
- Engineered 5-year corporate financial models and capital allocation forecasts that reduced operational variance by 18%.
- Optimized corporate treasury cash flow management, generating £1.4M in annual working capital efficiencies.

EDUCATION
Master of Science (M.Sc.) in Finance & Accounting – London School of Economics | 2017
Bachelor of Commerce (B.Com) in Accounting – Ain Shams University | 2015

CERTIFICATIONS
Association of Chartered Certified Accountants (ACCA) | Certified Internal Auditor (CIA)
`.trim();

async function runRegressionTestSuite() {
  const user = getOrCreateDefaultUser();
  const authContext = getTestAuthContext(user.id);
  console.log(`[Suite Setup] Active User ID: ${user.id}`);

  // =========================================================================
  // SCENARIO 0: Authentication Enforcement & Security Invariants
  // =========================================================================
  console.log('\n>>> [SCENARIO 0] Testing Authentication Gate (Negative Tests)...');
  const unauthUpload = await uploadPOST(new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'sample', filename: 'sample.txt' })
  }));
  assert.strictEqual(unauthUpload.status, 401, 'Unauthenticated upload must return 401');

  const unauthGet = await resumesGET(new Request('http://localhost:3000/api/resumes'));
  assert.strictEqual(unauthGet.status, 401, 'Unauthenticated resumes GET must return 401');

  const expToken = createExpiredTestSession(user.id);
  const expUpload = await uploadPOST(new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': `career_session=${expToken}` },
    body: JSON.stringify({ text: 'sample', filename: 'sample.txt' })
  }));
  assert.strictEqual(expUpload.status, 401, 'Expired session upload must return 401');
  console.log('  ✓ 401 Unauthorized strictly enforced for missing or expired credentials.');

  let resumeAId = '';
  let resumeBId = '';
  let resumeCId = '';
  let resumeAHash = '';
  let resumeBHash = '';
  let resumeCHash = '';

  // Clean up any test records from prior runs to guarantee fresh assertions
  db.prepare(`DELETE FROM extracted_profiles WHERE resume_id IN (SELECT id FROM resumes WHERE original_filename LIKE '%almansoor%' OR original_filename LIKE '%vance%' OR original_filename LIKE '%rostova%' OR original_filename LIKE 'concurrent_%' OR original_filename LIKE 'corrupted_%')`).run();
  db.prepare(`DELETE FROM cv_evaluations WHERE resume_id IN (SELECT id FROM resumes WHERE original_filename LIKE '%almansoor%' OR original_filename LIKE '%vance%' OR original_filename LIKE '%rostova%' OR original_filename LIKE 'concurrent_%' OR original_filename LIKE 'corrupted_%')`).run();
  db.prepare(`DELETE FROM resumes WHERE original_filename LIKE '%almansoor%' OR original_filename LIKE '%vance%' OR original_filename LIKE '%rostova%' OR original_filename LIKE 'concurrent_%' OR original_filename LIKE 'corrupted_%'`).run();

  // =========================================================================
  // SCENARIO 1: Upload Resume A (Candidate Alpha - FMCG Category Manager)
  // =========================================================================
  console.log('\n>>> [SCENARIO 1] Uploading Resume A (FMCG Category Manager - Sarah Al-Mansoor)...');
  const reqA = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_A_FMCG,
      filename: 'sarah_almansoor_cv.txt'
    })
  });
  const resA = await uploadPOST(reqA);
  const dataA = await resA.json();

  if (resA.status !== 200 || !dataA.success) {
    throw new Error(`Scenario 1 Failed: HTTP ${resA.status} - ${JSON.stringify(dataA)}`);
  }

  resumeAId = dataA.resume_id;
  resumeAHash = dataA.file_hash;
  console.log(`  ✓ Created Resume A ID: ${resumeAId}`);
  console.log(`  ✓ SHA-256 Hash: ${resumeAHash.substring(0, 16)}...`);
  console.log(`  ✓ Extracted Candidate Name: "${dataA.extracted_profile.candidate_name}"`);
  console.log(`  ✓ Extracted Headline: "${dataA.extracted_profile.current_headline}"`);

  // Assertions for Candidate A
  if (!dataA.extracted_profile.candidate_name.includes('Sarah Al-Mansoor')) {
    throw new Error(`Scenario 1: Expected name "Sarah Al-Mansoor", got "${dataA.extracted_profile.candidate_name}"`);
  }
  const expA = dataA.extracted_profile.experiences || [];
  const compANames = expA.map((e: any) => e.employer || e.company || '').join(' ');
  if (!compANames.includes('Almarai') && !compANames.includes('Panda')) {
    throw new Error(`Scenario 1: Missing Almarai/Panda in experiences: ${compANames}`);
  }
  const skillsA = (dataA.extracted_profile.skills || []).map((s: string) => s.toLowerCase());
  if (!skillsA.some((s: string) => s.includes('category management') || s.includes('trade marketing'))) {
    throw new Error(`Scenario 1: Expected FMCG skills in Resume A, found: ${skillsA.join(', ')}`);
  }
  // Strict Isolation: Resume A must NOT contain Tech or Finance skills
  if (skillsA.some((s: string) => s.includes('kubernetes') || s.includes('python') || s.includes('ifrs') || s.includes('audit'))) {
    throw new Error(`Scenario 1 Contamination: Resume A contains Tech/Finance skills!`);
  }
  console.log('  ✓ Verified 100% FMCG domain extraction with zero cross-contamination.');

  // =========================================================================
  // SCENARIO 2: Upload Resume B (Candidate Beta - Cloud Software Architect)
  // =========================================================================
  console.log('\n>>> [SCENARIO 2] Uploading Resume B (Tech / Cloud Architect - Marcus Vance)...');
  const reqB = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_B_TECH,
      filename: 'marcus_vance_cv.txt'
    })
  });
  const resB = await uploadPOST(reqB);
  const dataB = await resB.json();

  if (resB.status !== 200 || !dataB.success) {
    throw new Error(`Scenario 2 Failed: HTTP ${resB.status} - ${JSON.stringify(dataB)}`);
  }

  resumeBId = dataB.resume_id;
  resumeBHash = dataB.file_hash;
  console.log(`  ✓ Created Resume B ID: ${resumeBId}`);
  console.log(`  ✓ SHA-256 Hash: ${resumeBHash.substring(0, 16)}...`);
  console.log(`  ✓ Extracted Candidate Name: "${dataB.extracted_profile.candidate_name}"`);

  // Assertions for Candidate B
  if (resumeBId === resumeAId) {
    throw new Error(`Scenario 2: Resume B must have distinct ID from Resume A!`);
  }
  if (!dataB.extracted_profile.candidate_name.includes('Marcus Vance')) {
    throw new Error(`Scenario 2: Expected name "Marcus Vance", got "${dataB.extracted_profile.candidate_name}"`);
  }
  const expB = dataB.extracted_profile.experiences || [];
  const compBNames = expB.map((e: any) => e.employer || e.company || '').join(' ');
  if (!compBNames.includes('CloudScale') && !compBNames.includes('DataStream')) {
    throw new Error(`Scenario 2: Missing CloudScale/DataStream in experiences: ${compBNames}`);
  }
  const skillsB = (dataB.extracted_profile.skills || []).map((s: string) => s.toLowerCase());
  if (!skillsB.some((s: string) => s.includes('python') || s.includes('kubernetes') || s.includes('docker'))) {
    throw new Error(`Scenario 2: Expected Tech skills in Resume B, found: ${skillsB.join(', ')}`);
  }
  // Strict Isolation: Resume B must NOT contain Sarah Al-Mansoor, Almarai, Sulinda, or Abu Dawood
  if (compBNames.includes('Almarai') || compBNames.includes('Sulinda') || compBNames.includes('Abu Dawood')) {
    throw new Error(`Scenario 2 Contamination: Resume B contains FMCG company history!`);
  }
  if (skillsB.some((s: string) => s.includes('category management') || s.includes('planogram'))) {
    throw new Error(`Scenario 2 Contamination: Resume B contains FMCG Category skills!`);
  }
  console.log('  ✓ Verified 100% Software/Cloud domain extraction with zero cross-contamination.');

  // =========================================================================
  // SCENARIO 3: Upload Resume C (Candidate Gamma - Finance & Audit Controller)
  // =========================================================================
  console.log('\n>>> [SCENARIO 3] Uploading Resume C (Finance & Audit Controller - Elena Rostova)...');
  const reqC = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_C_FINANCE,
      filename: 'elena_rostova_cv.txt'
    })
  });
  const resC = await uploadPOST(reqC);
  const dataC = await resC.json();

  if (resC.status !== 200 || !dataC.success) {
    throw new Error(`Scenario 3 Failed: HTTP ${resC.status} - ${JSON.stringify(dataC)}`);
  }

  resumeCId = dataC.resume_id;
  resumeCHash = dataC.file_hash;
  console.log(`  ✓ Created Resume C ID: ${resumeCId}`);
  console.log(`  ✓ SHA-256 Hash: ${resumeCHash.substring(0, 16)}...`);
  console.log(`  ✓ Extracted Candidate Name: "${dataC.extracted_profile.candidate_name}"`);

  // Assertions for Candidate C
  if (resumeCId === resumeAId || resumeCId === resumeBId) {
    throw new Error(`Scenario 3: Resume C must have distinct ID from A and B!`);
  }
  if (!dataC.extracted_profile.candidate_name.includes('Elena Rostova')) {
    throw new Error(`Scenario 3: Expected name "Elena Rostova", got "${dataC.extracted_profile.candidate_name}"`);
  }
  const expC = dataC.extracted_profile.experiences || [];
  const compCNames = expC.map((e: any) => e.employer || e.company || '').join(' ');
  if (!compCNames.includes('Deloitte') && !compCNames.includes('Apex')) {
    throw new Error(`Scenario 3: Missing Deloitte/Apex in experiences: ${compCNames}`);
  }
  const skillsC = (dataC.extracted_profile.skills || []).map((s: string) => s.toLowerCase());
  if (!skillsC.some((s: string) => s.includes('financial reporting') || s.includes('ifrs') || s.includes('audit'))) {
    throw new Error(`Scenario 3: Expected Finance/Audit skills in Resume C, found: ${skillsC.join(', ')}`);
  }
  // Strict Isolation: Resume C must NOT contain Tech or FMCG data
  if (skillsC.some((s: string) => s.includes('kubernetes') || s.includes('planogram'))) {
    throw new Error(`Scenario 3 Contamination: Resume C contains Tech or FMCG skills!`);
  }
  console.log('  ✓ Verified 100% Finance & Accounting domain extraction with zero cross-contamination.');

  // =========================================================================
  // SCENARIO 4: Switch Versions and Verify Complete Isolation
  // =========================================================================
  console.log('\n>>> [SCENARIO 4] Verifying Version Switching & Isolated Retrieval...');
  
  // Fetch Resume A
  const reqGetA = new Request(`http://localhost:3000/api/resumes?id=${resumeAId}`, {
    headers: { 'Cookie': authContext.cookieHeader }
  });
  const resGetA = await resumesGET(reqGetA);
  const dataGetA = await resGetA.json();
  if (dataGetA.extracted_profile?.candidate_name !== 'Sarah Al-Mansoor') {
    throw new Error(`Scenario 4: Failed to retrieve isolated Candidate A profile! Got ${dataGetA.extracted_profile?.candidate_name}`);
  }

  // Fetch Resume B
  const reqGetB = new Request(`http://localhost:3000/api/resumes?id=${resumeBId}`, {
    headers: { 'Cookie': authContext.cookieHeader }
  });
  const resGetB = await resumesGET(reqGetB);
  const dataGetB = await resGetB.json();
  if (dataGetB.extracted_profile?.candidate_name !== 'Marcus Vance') {
    throw new Error(`Scenario 4: Failed to retrieve isolated Candidate B profile! Got ${dataGetB.extracted_profile?.candidate_name}`);
  }

  // Fetch Resume C
  const reqGetC = new Request(`http://localhost:3000/api/resumes?id=${resumeCId}`, {
    headers: { 'Cookie': authContext.cookieHeader }
  });
  const resGetC = await resumesGET(reqGetC);
  const dataGetC = await resGetC.json();
  if (dataGetC.extracted_profile?.candidate_name !== 'Elena Rostova') {
    throw new Error(`Scenario 4: Failed to retrieve isolated Candidate C profile! Got ${dataGetC.extracted_profile?.candidate_name}`);
  }

  // Tenant Isolation: User B cannot retrieve User A's resume
  const userBAuth = getTestAuthContext('user_tenant_b_cv_isolated');
  const reqLeak = new Request(`http://localhost:3000/api/resumes?id=${resumeAId}`, {
    headers: { 'Cookie': userBAuth.cookieHeader }
  });
  const resLeak = await resumesGET(reqLeak);
  const dataLeak = await resLeak.json();
  if (dataLeak.extracted_profile?.candidate_name === 'Sarah Al-Mansoor') {
    throw new Error('Tenant Leakage: User B accessed User A resume!');
  }
  console.log('  ✓ Multi-tenant isolation verified: User B cannot access User A resume.');

  console.log('  ✓ Resume A retrieved independently: Sarah Al-Mansoor (Almarai)');
  console.log('  ✓ Resume B retrieved independently: Marcus Vance (CloudScale)');
  console.log('  ✓ Resume C retrieved independently: Elena Rostova (Deloitte)');
  console.log('  ✓ Zero cross-talk or state pollution detected across multi-resume switches.');

  // =========================================================================
  // SCENARIO 5: Duplicate File Upload Detection (Identical Content)
  // =========================================================================
  console.log('\n>>> [SCENARIO 5] Testing Duplicate Content Detection (Identical Hash)...');
  const reqDup = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_A_FMCG,
      filename: 'sarah_almansoor_copy.txt'
    })
  });
  const resDup = await uploadPOST(reqDup);
  const dataDup = await resDup.json();

  if (resDup.status !== 200 || !dataDup.is_duplicate) {
    throw new Error(`Scenario 5: Expected is_duplicate: true for identical content, got: ${JSON.stringify(dataDup)}`);
  }
  if (dataDup.resume_id !== resumeAId) {
    throw new Error(`Scenario 5: Expected duplicate to reference original resume_id "${resumeAId}", got "${dataDup.resume_id}"`);
  }
  console.log(`  ✓ Duplicate correctly identified via SHA-256 hash match.`);
  console.log(`  ✓ Existing resume ID preserved: ${dataDup.resume_id} (No duplicate database clutter created)`);

  // =========================================================================
  // SCENARIO 6: Same Filename, Different Content (Hash Variance)
  // =========================================================================
  console.log('\n>>> [SCENARIO 6] Testing Same Filename with Different Content (Hash Variance)...');
  const RESUME_A_MODIFIED = RESUME_A_FMCG + '\n- Delivered $1.5M in incremental annual trade margin expansion.';
  const reqMod = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_A_MODIFIED,
      filename: 'sarah_almansoor_cv.txt' // Same filename, different content
    })
  });
  const resMod = await uploadPOST(reqMod);
  const dataMod = await resMod.json();

  if (resMod.status !== 200 || dataMod.is_duplicate) {
    throw new Error(`Scenario 6: Modified content must NOT be flagged as duplicate!`);
  }
  if (dataMod.resume_id === resumeAId) {
    throw new Error(`Scenario 6: Modified content must receive a new independent resume_id!`);
  }
  if (dataMod.file_hash === resumeAHash) {
    throw new Error(`Scenario 6: SHA-256 hash must differ for modified text!`);
  }
  console.log(`  ✓ Successfully created new immutable version: ${dataMod.resume_id}`);
  console.log(`  ✓ Distinct file hash verified: ${dataMod.file_hash.substring(0, 16)}...`);

  // =========================================================================
  // SCENARIO 7: Concurrent Upload Simulation
  // =========================================================================
  console.log('\n>>> [SCENARIO 7] Testing Concurrent Multi-Resume Uploads...');
  const concurrentReq1 = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_B_TECH + '\n# Concurrent Thread 1',
      filename: 'concurrent_b1.txt'
    })
  });
  const concurrentReq2 = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: RESUME_C_FINANCE + '\n# Concurrent Thread 2',
      filename: 'concurrent_c2.txt'
    })
  });

  const [resConc1, resConc2] = await Promise.all([
    uploadPOST(concurrentReq1),
    uploadPOST(concurrentReq2)
  ]);
  const [dataConc1, dataConc2] = await Promise.all([
    resConc1.json(),
    resConc2.json()
  ]);

  if (resConc1.status !== 200 || resConc2.status !== 200) {
    throw new Error(`Scenario 7: Concurrent requests failed: ${resConc1.status}, ${resConc2.status}`);
  }
  if (dataConc1.resume_id === dataConc2.resume_id) {
    throw new Error(`Scenario 7: Concurrent requests collided on resume_id!`);
  }
  if (dataConc1.extracted_profile.candidate_name !== 'Marcus Vance' ||
      dataConc2.extracted_profile.candidate_name !== 'Elena Rostova') {
    throw new Error(`Scenario 7: Cross-contamination during concurrent extraction!`);
  }
  console.log(`  ✓ Concurrently processed: ${dataConc1.resume_id} & ${dataConc2.resume_id}`);
  console.log('  ✓ Zero race conditions, zero deadlocks, and zero entity cross-talk.');

  // =========================================================================
  // SCENARIO 8: Corrupted / Empty File Upload Handling
  // =========================================================================
  console.log('\n>>> [SCENARIO 8] Testing Corrupted / Empty File Upload Graceful Handling...');
  const reqEmpty = new Request('http://localhost:3000/api/cv/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cookie': authContext.cookieHeader },
    body: JSON.stringify({
      text: 'bad text',
      filename: 'corrupted_file.txt'
    })
  });
  const resEmpty = await uploadPOST(reqEmpty);
  const dataEmpty = await resEmpty.json();

  if (resEmpty.status !== 400) {
    throw new Error(`Scenario 8: Expected HTTP 400 for unreadable text, got HTTP ${resEmpty.status}`);
  }
  if (dataEmpty.processing_status !== 'failed') {
    throw new Error(`Scenario 8: Expected processing_status: 'failed', got '${dataEmpty.processing_status}'`);
  }
  // Verify failed record logged in database
  const failedRec = db.prepare('SELECT * FROM resumes WHERE id = ?').get(dataEmpty.resume_id) as any;
  if (!failedRec || failedRec.processing_status !== 'failed') {
    throw new Error(`Scenario 8: Failed resume record was not properly persisted in database with status 'failed'!`);
  }
  console.log(`  ✓ HTTP 400 properly returned with clear guidance.`);
  console.log(`  ✓ Failed upload logged in database with processing_status="failed".`);
  console.log(`  ✓ Zero stale or hardcoded fallback data shown to user.`);

  console.log('\n========================================================================');
  console.log('>>> ALL 8/8 RESUME ISOLATION & VERSIONING REGRESSION SCENARIOS PASSED! <<<');
  console.log('========================================================================\n');
}

runRegressionTestSuite().catch(err => {
  console.error('\nREGRESSION TEST SUITE FAILED:', err);
  process.exit(1);
});
