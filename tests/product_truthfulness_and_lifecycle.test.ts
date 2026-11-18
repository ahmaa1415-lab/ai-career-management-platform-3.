import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 1. CAPTURE ORIGINAL ENVIRONMENT VARIABLES
// ---------------------------------------------------------------------------
const originalDatabasePath = process.env.DATABASE_PATH;
const originalStagingMode = process.env.STAGING_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalStagingAccessCode = process.env.STAGING_ACCESS_CODE;

// ---------------------------------------------------------------------------
// 2. ISOLATED TEST ENVIRONMENT CONFIGURATION
// ---------------------------------------------------------------------------
const testDbDir = path.join(process.cwd(), 'data', 'test_truthfulness');
const testDbPath = path.join(testDbDir, 'isolated_truth_test.db');
if (fs.existsSync(testDbDir)) fs.rmSync(testDbDir, { recursive: true, force: true });
fs.mkdirSync(testDbDir, { recursive: true });

process.env.DATABASE_PATH = testDbPath;
process.env.STAGING_MODE = 'true';
process.env.NODE_ENV = 'production';
process.env.STAGING_ACCESS_CODE = 'STAGING_SECURE_KEY_2026';

// Dynamic imports so lib/db.ts initializes strictly within the isolated database
const { default: db, initializeSchema, logAudit } = await import('../lib/db');
const { verifyJobListing, CURATED_LISTING_DISCLAIMER } = await import('../lib/jobs/verifier');
const {
  prepareApplicationPackage,
  approveApplicationPackage,
  recordCandidateSubmission,
  recordEmployerConfirmation,
  normalizeApplicationStatus
} = await import('../lib/applications/workflow');
const { autoProvisionCompanyPortalAccount } = await import('../lib/company-portals');
const { runAutonomousApplications, runAutonomousApplyEverywhere } = await import('../lib/applications/autonomous-engine');
const { getAllApplications, updateApplicationStatus } = await import('../lib/crm/pipeline');
const { classifyApplicationLifecycle, calculateApplicationKPIs } = await import('../lib/applications/lifecycle');
const { sendEmailWithApproval } = await import('../lib/email/inbox');
const { POST: confirmReceiptHandler } = await import('../app/api/applications/confirm-receipt/route');
const { POST: candidateSubmitHandler } = await import('../app/api/applications/submit/route');

async function runTruthfulnessAndLifecycleTests() {
  console.log('========================================================================');
  console.log('--- RUNNING PRODUCT TRUTHFULNESS & APPLICATION LIFECYCLE TEST SUITE ---');
  console.log('========================================================================\n');

  try {
    initializeSchema();

    // ---------------------------------------------------------------------------
    // TEST FIXTURES SETUP
    // ---------------------------------------------------------------------------
    console.log('>>> [FIXTURES] Initializing synthetic test users, resumes, and jobs...');
    
    // Candidate A
    const userA = {
      id: 'test_candidate_a',
      email: 'cand.a@synthetic-testing.local',
      role: 'candidate',
      name: 'Alice Candidate'
    };
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES (?, ?, 'hash_a', ?, ?)
    `).run(userA.id, userA.email, userA.role, userA.name);

    // Candidate B
    const userB = {
      id: 'test_candidate_b',
      email: 'cand.b@synthetic-testing.local',
      role: 'candidate',
      name: 'Bob Candidate'
    };
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES (?, ?, 'hash_b', ?, ?)
    `).run(userB.id, userB.email, userB.role, userB.name);

    // Profile for Candidate A
    db.prepare(`
      INSERT INTO profiles (id, user_id, headline, summary, skills, experience_years, target_roles, onboarding_completed)
      VALUES ('prof_a', ?, 'Principal Software Engineer', 'Experienced distributed systems engineer', '["TypeScript", "React", "Node.js", "Distributed Systems", "Cloud"]', 10, '["Staff Software Engineer", "Senior Infrastructure Engineer"]', 1)
    `).run(userA.id);

    // Profile locations for Candidate A
    db.prepare(`
      INSERT INTO profile_locations (id, user_id, target_countries, target_cities, remote_eligibility, work_mode_preference)
      VALUES ('loc_a', ?, '["Remote", "United States"]', '["Remote"]', 'Remote Only', 'Remote')
    `).run(userA.id);

    // Profile permissions for Candidate A
    db.prepare(`
      INSERT INTO profile_permissions (id, user_id, job_research_authorized, cv_analysis_authorized, submit_applications_authorized, scheduled_automation_desired)
      VALUES ('perm_a', ?, 1, 1, 1, 1)
    `).run(userA.id);

    // Master CV for Candidate A
    const cvAId = 'cv_master_a';
    db.prepare(`
      INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version)
      VALUES (?, ?, 'Alice Master CV', 'Master', 'Staff Software Engineer', 'Remote', 'Expert in TypeScript, React, Node.js, Distributed Systems, SQLite', 95, 1)
    `).run(cvAId, userA.id);

    // Synthetic Job 1 (Stripe)
    const job1 = {
      id: 'job_synth_stripe',
      title: 'Senior Infrastructure Engineer',
      employer: 'Stripe',
      location: 'Remote',
      source: 'Stripe Careers',
      source_url: 'https://stripe.com/jobs/infrastructure-engineer',
      company_portal_url: 'https://stripe.wd3.myworkdayjobs.com/careers/apply',
      portal_platform: 'Workday',
      application_type: 'company_site_account',
      raw_description: 'We are hiring a Senior Infrastructure Engineer to build reliable distributed payment systems.',
      requirements: JSON.stringify(['TypeScript', 'Distributed Systems', 'Cloud']),
      min_salary: 180000,
      max_salary: 240000,
      currency: 'USD',
      publication_date: new Date().toISOString().split('T')[0],
      verification_status: 'Curated Listing',
      is_verified: 1
    };
    db.prepare(`
      INSERT INTO job_listings (id, title, employer, location, source, source_url, company_portal_url, portal_platform, application_type, raw_description, requirements, min_salary, max_salary, currency, publication_date, verification_status, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job1.id, job1.title, job1.employer, job1.location, job1.source,
      job1.source_url, job1.company_portal_url, job1.portal_platform,
      job1.application_type, job1.raw_description, job1.requirements,
      job1.min_salary, job1.max_salary, job1.currency, job1.publication_date,
      job1.verification_status, job1.is_verified
    );

    // Synthetic Job 2: Positive match job for batch preparation
    const job2Positive = {
      id: 'job_synth_matching_01',
      title: 'Staff Software Engineer',
      employer: 'GitLab',
      location: 'Remote',
      source: 'GitLab Careers',
      source_url: 'https://about.gitlab.com/jobs/staff-engineer',
      company_portal_url: 'https://jobs.lever.co/gitlab/staff-engineer',
      portal_platform: 'Lever',
      application_type: 'company_site_account',
      raw_description: 'Staff Software Engineer to build scalable distributed systems with TypeScript, React, and Node.js.',
      requirements: JSON.stringify(['TypeScript', 'React', 'Node.js', 'Distributed Systems']),
      min_salary: 190000,
      max_salary: 250000,
      currency: 'USD',
      publication_date: new Date().toISOString().split('T')[0],
      verification_status: 'Curated Listing',
      is_verified: 1
    };
    db.prepare(`
      INSERT INTO job_listings (id, title, employer, location, source, source_url, company_portal_url, portal_platform, application_type, raw_description, requirements, min_salary, max_salary, currency, publication_date, verification_status, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job2Positive.id, job2Positive.title, job2Positive.employer, job2Positive.location, job2Positive.source,
      job2Positive.source_url, job2Positive.company_portal_url, job2Positive.portal_platform,
      job2Positive.application_type, job2Positive.raw_description, job2Positive.requirements,
      job2Positive.min_salary, job2Positive.max_salary, job2Positive.currency, job2Positive.publication_date,
      job2Positive.verification_status, job2Positive.is_verified
    );

    const syntheticBenchmarkJob = {
      id: 'test_benchmark_job_01',
      title: 'Staff Architect (Benchmark)',
      employer: 'Defunct Retail Corp',
      location: 'Remote',
      source: 'Internal Benchmark',
      source_url: 'https://benchmark.internal/jobs/arch-1',
      requirements: JSON.stringify(['Architecture', 'Security']),
      raw_description: 'Synthetic benchmark job for test verification',
      publication_date: new Date().toISOString().split('T')[0],
      verification_status: 'Synthetic Benchmark',
      is_synthetic: 1,
      is_verified: 0
    };
    db.prepare(`
      INSERT INTO job_listings (id, title, employer, location, source, source_url, requirements, raw_description, publication_date, verification_status, is_synthetic, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      syntheticBenchmarkJob.id, syntheticBenchmarkJob.title, syntheticBenchmarkJob.employer,
      syntheticBenchmarkJob.location, syntheticBenchmarkJob.source, syntheticBenchmarkJob.source_url,
      syntheticBenchmarkJob.requirements, syntheticBenchmarkJob.raw_description,
      syntheticBenchmarkJob.publication_date, syntheticBenchmarkJob.verification_status,
      syntheticBenchmarkJob.is_synthetic, syntheticBenchmarkJob.is_verified
    );

    console.log('  ✓ Test fixtures successfully created.\n');

    // ---------------------------------------------------------------------------
    // SUITE 1: VACANCY VERIFICATION INTEGRITY & LIMITATIONS
    // ---------------------------------------------------------------------------
    console.log('>>> [SUITE 1] Vacancy Verification Integrity & Limitations (lib/jobs/verifier.ts)...');

    const verificationResult = verifyJobListing(job1 as any);

    if (verificationResult.status === ('Verified Open' as any) || verificationResult.status === 'Live Status Confirmed') {
      throw new Error(`Integrity Violation: Static verification falsely claimed live vacancy status '${verificationResult.status}'. Expected 'Curated Listing'.`);
    }
    if (verificationResult.status !== 'Curated Listing') {
      throw new Error(`Expected status 'Curated Listing', got '${verificationResult.status}'`);
    }
    console.log('  ✓ Status classified truthfully as "Curated Listing" (never "Verified Open" or "Live Status Confirmed")');

    if (verificationResult.evidence.http_status !== null) {
      throw new Error(`Integrity Violation: Fabricated http_status detected (${verificationResult.evidence.http_status}). Static heuristic must report null http_status.`);
    }
    if (verificationResult.evidence.network_checked !== false) {
      throw new Error('Integrity Violation: network_checked must be false when no live network probe was executed.');
    }
    console.log('  ✓ Evidence accurately reports http_status: null and network_checked: false (no fabricated HTTP 200)');

    if (!verificationResult.evidence.verification_limitations || verificationResult.evidence.verification_limitations.length < 10) {
      throw new Error('Missing verification_limitations in verification evidence.');
    }
    if (!CURATED_LISTING_DISCLAIMER || !CURATED_LISTING_DISCLAIMER.includes('Notice:')) {
      throw new Error('CURATED_LISTING_DISCLAIMER must be exported with mandatory user disclaimer.');
    }
    console.log('  ✓ Verification limitations and consumer disclaimer present and explicit.');

    const benchmarkResult = verifyJobListing(syntheticBenchmarkJob as any);
    if (benchmarkResult.status !== 'Synthetic Benchmark') {
      throw new Error(`Synthetic benchmark job expected status 'Synthetic Benchmark', got '${benchmarkResult.status}'`);
    }
    console.log('  ✓ Synthetic test fixture correctly identified as "Synthetic Benchmark".');

    // ---------------------------------------------------------------------------
    // SUITE 2: APPLICATION LIFECYCLE - PACKAGE PREPARATION
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 2] Truthful Application Lifecycle - Package Preparation (lib/applications/workflow.ts)...');

    const preparedPkg = prepareApplicationPackage(job1.id, userA.id);

    if (preparedPkg.status !== 'Package Prepared') {
      throw new Error(`Expected initial status 'Package Prepared', got '${preparedPkg.status}'`);
    }
    if (preparedPkg.human_approved !== 0) {
      throw new Error(`human_approved must be 0 upon initial package preparation, got ${preparedPkg.human_approved}`);
    }
    if (preparedPkg.submission_confirmed !== 0) {
      throw new Error(`submission_confirmed must be 0 upon initial package preparation, got ${preparedPkg.submission_confirmed}`);
    }
    if (preparedPkg.submission_type !== 'Manual') {
      throw new Error(`submission_type must be 'Manual', got '${preparedPkg.submission_type}'`);
    }
    if (preparedPkg.applied_at) {
      throw new Error(`applied_at must be null/empty on unsubmitted package, got '${preparedPkg.applied_at}'`);
    }
    console.log('  ✓ Package prepared in truthful "Package Prepared" state (human_approved: 0, submission_confirmed: 0, submission_type: Manual).');

    // ---------------------------------------------------------------------------
    // SUITE 3: HUMAN APPROVAL GATE & CONSENT ENFORCEMENT
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 3] Human Approval Gate & Consent Enforcement (lib/applications/workflow.ts)...');

    let consentRejected = false;
    try {
      approveApplicationPackage(preparedPkg.id, userA.id, false);
    } catch (err: any) {
      consentRejected = true;
      if (!err.message.includes('consent is mandatory')) {
        throw new Error(`Unexpected error message when consent denied: ${err.message}`);
      }
    }
    if (!consentRejected) {
      throw new Error('Security Violation: approveApplicationPackage succeeded without explicit human consent!');
    }
    console.log('  ✓ Mandatory human consent gate strictly blocks unconsented approval.');

    const approvedPkg = approveApplicationPackage(preparedPkg.id, userA.id, true);
    if (approvedPkg.status !== 'Ready for Candidate Submission') {
      throw new Error(`Expected status 'Ready for Candidate Submission', got '${approvedPkg.status}'`);
    }
    if (approvedPkg.human_approved !== 1) {
      throw new Error(`Expected human_approved === 1, got ${approvedPkg.human_approved}`);
    }
    if (approvedPkg.submission_confirmed !== 0) {
      throw new Error(`submission_confirmed must remain 0 after approval, got ${approvedPkg.submission_confirmed}`);
    }
    console.log('  ✓ Approval transitions status to "Ready for Candidate Submission" with human_approved: 1 (never falsely marks as submitted).');

    // ---------------------------------------------------------------------------
    // SUITE 4: CANDIDATE-DIRECTED SUBMISSION CONFIRMATION
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 4] Candidate-Directed Submission Confirmation (lib/applications/workflow.ts)...');

    const unapprovedAppId = 'app_unapproved_test';
    db.prepare(`
      INSERT INTO applications (id, user_id, job_id, status, match_score, match_details_json, human_approved, submission_confirmed, submission_type)
      VALUES (?, ?, ?, 'Package Prepared', 90, '{}', 0, 0, 'Manual')
    `).run(unapprovedAppId, userA.id, job1.id);

    let unapprovedSubmissionBlocked = false;
    try {
      recordCandidateSubmission(unapprovedAppId, userA.id, true);
    } catch (err: any) {
      unapprovedSubmissionBlocked = true;
      if (!err.message.includes('not received explicit human approval')) {
        throw new Error(`Unexpected error message for unapproved submission: ${err.message}`);
      }
    }
    if (!unapprovedSubmissionBlocked) {
      throw new Error('Security Violation: Unapproved application was submitted without prior human approval!');
    }
    console.log('  ✓ Unapproved application strictly blocked from submission confirmation.');

    let unconfirmedBlocked = false;
    try {
      recordCandidateSubmission(approvedPkg.id, userA.id, false);
    } catch (err: any) {
      unconfirmedBlocked = true;
      if (!err.message.includes('Candidate confirmation is mandatory')) {
        throw new Error(`Unexpected error message for missing confirmation: ${err.message}`);
      }
    }
    if (!unconfirmedBlocked) {
      throw new Error('Integrity Violation: recordCandidateSubmission succeeded with candidateConfirmed: false!');
    }
    console.log('  ✓ False candidate confirmation flag strictly rejected.');

    const candidateNotes = 'Submitted directly on Stripe Workday portal at 14:30 UTC.';
    const submittedPkg = recordCandidateSubmission(approvedPkg.id, userA.id, true, candidateNotes);
    if (submittedPkg.status !== 'Submitted by Candidate') {
      throw new Error(`Expected status 'Submitted by Candidate', got '${submittedPkg.status}'`);
    }
    if (submittedPkg.submission_confirmed !== 1) {
      throw new Error(`Expected submission_confirmed === 1, got ${submittedPkg.submission_confirmed}`);
    }
    if (!submittedPkg.applied_at) {
      throw new Error('Expected applied_at timestamp to be populated on candidate submission confirmation.');
    }
    console.log('  ✓ Explicit candidate confirmation transitions status to "Submitted by Candidate" with submission_confirmed: 1.');

    // ---------------------------------------------------------------------------
    // SUITE 5: EMPLOYER CONFIRMATION EVIDENCE & AUTHENTICITY SEPARATION
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 5] Employer Confirmation Evidence & Authenticity Separation (Critical Issue 2)...');

    // A. Empty reference strictly rejected
    let emptyRefBlocked = false;
    try {
      recordEmployerConfirmation(submittedPkg.id, userA.id, {
        evidence_type: 'candidate_receipt',
        confirmation_reference: '   '
      });
    } catch (err: any) {
      emptyRefBlocked = true;
      if (!err.message.includes('confirmation reference')) {
        throw new Error(`Unexpected error for empty reference: ${err.message}`);
      }
    }
    if (!emptyRefBlocked) {
      throw new Error('Integrity Violation: recordEmployerConfirmation allowed empty confirmation reference!');
    }
    console.log('  ✓ Empty or fabricated whitespace confirmation reference strictly rejected.');

    // B. Candidate-Provided Evidence (unverified by employer)
    const candidateEvidencePkg = recordEmployerConfirmation(submittedPkg.id, userA.id, {
      evidence_type: 'candidate_receipt',
      confirmation_reference: 'STRIPE-WD-994821',
      notes: 'Candidate entered confirmation reference from screen receipt.'
    });

    if (candidateEvidencePkg.status !== 'Candidate Evidence Provided') {
      throw new Error(`Expected status 'Candidate Evidence Provided' for candidate receipt, got '${candidateEvidencePkg.status}'`);
    }
    if (candidateEvidencePkg.evidence_status !== 'Candidate Evidence Provided') {
      throw new Error(`Expected evidence_status 'Candidate Evidence Provided', got '${candidateEvidencePkg.evidence_status}'`);
    }
    console.log('  ✓ Candidate self-reported receipt classified truthfully as "Candidate Evidence Provided" (never claims independent verification).');

    // C. Independently Verified Evidence (via webhook / API with system verification)
    const verifiedWebhookPkg = recordEmployerConfirmation(submittedPkg.id, userA.id, {
      evidence_type: 'verified_webhook',
      confirmation_reference: 'WH-STRIPE-REQ-88219',
      notes: 'Webhook verified via HMAC cryptographic signature from official employer portal.',
      verified_by_system: true
    });

    if (verifiedWebhookPkg.status !== 'Employer Confirmation Independently Verified') {
      throw new Error(`Expected status 'Employer Confirmation Independently Verified', got '${verifiedWebhookPkg.status}'`);
    }
    if (verifiedWebhookPkg.evidence_status !== 'Employer Confirmation Independently Verified') {
      throw new Error(`Expected evidence_status 'Employer Confirmation Independently Verified', got '${verifiedWebhookPkg.evidence_status}'`);
    }
    console.log('  ✓ Verified system webhook classified as "Employer Confirmation Independently Verified".');

    // D. Cross-tenant protection on confirm-receipt endpoint
    const authModule = await import('../lib/auth');
    const bobSessionForReceipt = authModule.createSession(userB.id);
    const crossTenantReq = new Request('http://localhost:3000/api/applications/confirm-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobSessionForReceipt.token}`
      },
      body: JSON.stringify({
        application_id: submittedPkg.id, // Owned by userA, while caller is userB
        confirmation_reference: 'ATTACK-999',
        evidence_type: 'candidate_receipt'
      })
    });
    const crossTenantRes = await confirmReceiptHandler(crossTenantReq);
    const crossTenantData = await crossTenantRes.json();
    if (crossTenantRes.status !== 400 || !crossTenantData.error?.includes('Access Denied')) {
      throw new Error(`Expected HTTP 400 Access Denied for cross-tenant confirmation, got: ${crossTenantRes.status}`);
    }
    console.log('  ✓ Public candidate endpoint strictly enforces tenant isolation (HTTP 400 Access Denied).');

    // E. Candidate API Route Guard against Spoofing
    const defaultUser = (await import('../lib/db')).getOrCreateDefaultUser();
    const defaultSession = authModule.createSession(defaultUser.id);
    const defaultAppId = 'app_default_user_receipt_test';
    db.prepare(`
      INSERT INTO applications (
        id, user_id, job_id, status, match_score, match_details_json, human_approved, submission_confirmed, submission_type
      ) VALUES (?, ?, ?, 'Submitted by Candidate', 90, '{}', 1, 1, 'Manual')
    `).run(defaultAppId, defaultUser.id, job1.id);

    const spoofReq = new Request('http://localhost:3000/api/applications/confirm-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${defaultSession.token}`
      },
      body: JSON.stringify({
        application_id: defaultAppId,
        confirmation_reference: 'SPOOF-WEBHOOK-999',
        evidence_type: 'verified_webhook' // Attempting to spoof independent webhook
      })
    });
    const spoofRes = await confirmReceiptHandler(spoofReq);
    const spoofData = await spoofRes.json();
    if (!spoofData.success) {
      throw new Error(`Candidate receipt endpoint failed: ${JSON.stringify(spoofData)}`);
    }
    if (spoofData.application.evidence_status === 'Employer Confirmation Independently Verified') {
      throw new Error('Security Violation: Candidate public endpoint allowed spoofing of independent verification status!');
    }
    if (spoofData.application.evidence_status !== 'Candidate Evidence Provided') {
      throw new Error(`Expected candidate submission to be downgraded to 'Candidate Evidence Provided', got '${spoofData.application.evidence_status}'`);
    }
    console.log('  ✓ Public candidate endpoint strictly prevents spoofing independent verification status.');

    // ---------------------------------------------------------------------------
    // SUITE 6: POSITIVE AND ZERO-RESULT BATCH PREPARATION TESTS (Critical Issue 3)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 6] Positive & Zero-Result Batch Preparation Tests (lib/applications/autonomous-engine.ts)...');

    // Scenario A: Positive Batch Preparation Test (proving at least 1 package prepared)
    const positiveBatchResult = runAutonomousApplyEverywhere(userA.id, { minMatchScore: 70, forceAll: false });

    if (!positiveBatchResult.success) {
      throw new Error(`Positive batch execution failed: ${positiveBatchResult.message}`);
    }
    if (positiveBatchResult.newly_applied_count < 1) {
      throw new Error(`Expected at least 1 newly prepared package, got ${positiveBatchResult.newly_applied_count}`);
    }
    console.log(`  ✓ Positive Batch Test PASSED: Prepared ${positiveBatchResult.newly_applied_count} new tailored package(s) for eligible vacancy!`);

    // Verify newly prepared package in database
    const gitlabApp = db.prepare('SELECT * FROM applications WHERE user_id = ? AND job_id = ?').get(userA.id, job2Positive.id) as any;
    if (!gitlabApp) {
      throw new Error('Expected new application record for GitLab job in database.');
    }
    if (gitlabApp.status !== 'Package Prepared') {
      throw new Error(`Expected status 'Package Prepared', got '${gitlabApp.status}'`);
    }
    if (gitlabApp.human_approved !== 0) {
      throw new Error(`Expected human_approved === 0, got ${gitlabApp.human_approved}`);
    }
    if (gitlabApp.submission_confirmed !== 0) {
      throw new Error(`Expected submission_confirmed === 0, got ${gitlabApp.submission_confirmed}`);
    }
    if (gitlabApp.applied_at) {
      throw new Error(`applied_at must be null/empty, got '${gitlabApp.applied_at}'`);
    }
    console.log('  ✓ Verified in database: Package Prepared, human_approved: 0, submission_confirmed: 0, applied_at: null.');

    // Verify outbound recruiter outreach emails are strictly drafts
    const recruiterOutreachEmails = db.prepare(`
      SELECT * FROM emails WHERE application_id = ? AND sender NOT LIKE '%portal-assistant%'
    `).all(gitlabApp.id) as any[];
    
    if (recruiterOutreachEmails.length === 0) {
      throw new Error('Expected at least one recruiter outreach draft email for the prepared package.');
    }
    for (const draft of recruiterOutreachEmails) {
      if (draft.is_sent === 1 || draft.is_draft === 0) {
        throw new Error('Security Violation: Outbound recruiter outreach email was marked as sent (is_sent: 1) during package generation!');
      }
    }
    console.log('  ✓ Verified: Outbound recruiter outreach emails are drafts only (is_draft: 1, is_sent: 0, zero external egress).');

    // Scenario B: Zero Eligible Jobs Scenario Test
    const zeroBatchResult = runAutonomousApplyEverywhere(userA.id, { minMatchScore: 100, forceAll: false });
    if (!zeroBatchResult.success) {
      throw new Error(`Zero-result batch failed: ${zeroBatchResult.message}`);
    }
    if (zeroBatchResult.newly_applied_count !== 0) {
      throw new Error(`Expected 0 newly applied packages for threshold 100, got ${zeroBatchResult.newly_applied_count}`);
    }
    if (!zeroBatchResult.message.includes('0 tailored packages')) {
      throw new Error(`Expected message to truthfully state 0 packages prepared, got "${zeroBatchResult.message}"`);
    }
    console.log('  ✓ Zero-Result Batch Test PASSED: Truthfully reports 0 tailored packages prepared.');

    // ---------------------------------------------------------------------------
    // SUITE 7: INTERNAL PORTAL ASSISTANT TRANSPARENCY
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 7] Internal Portal Assistant Transparency (lib/company-portals.ts)...');

    const portalTracker = autoProvisionCompanyPortalAccount(userA.id, job1 as any, { profile: { email: userA.email } } as any);

    if (portalTracker.status !== 'Portal Tracker Initialized') {
      throw new Error(`Expected status 'Portal Tracker Initialized', got '${portalTracker.status}'`);
    }
    if (!portalTracker.confirmation_reference.startsWith('TRACK-')) {
      throw new Error(`Tracking reference must start with 'TRACK-', got '${portalTracker.confirmation_reference}'`);
    }
    console.log(`  ✓ Portal tracking initialized with truthful internal reference: ${portalTracker.confirmation_reference}`);

    const trackingEmail = db.prepare(`
      SELECT * FROM emails WHERE recipient = ? AND subject LIKE '%[Candidate Tracking Guide]%' ORDER BY created_at DESC LIMIT 1
    `).get(userA.email) as any;

    if (!trackingEmail) {
      throw new Error('Expected internal candidate tracking guide email not found.');
    }
    if (!trackingEmail.sender.includes('portal-assistant@career-platform.local')) {
      throw new Error(`Integrity Violation: Fake employer sender detected (${trackingEmail.sender}). Must be internal assistant.`);
    }
    if (!trackingEmail.body.includes('[INTERNAL PLATFORM DEMO/TRACKING RECORD - NOT SENT BY EMPLOYER]')) {
      throw new Error('Integrity Violation: Email body missing mandatory internal tracking record banner.');
    }
    if (!trackingEmail.body.includes('No external submission has been made')) {
      throw new Error('Integrity Violation: Email body missing disclaimer that no external submission was made.');
    }
    console.log('  ✓ Internal candidate tracking email explicitly identified as internal platform guide (no employer impersonation).');

    // ---------------------------------------------------------------------------
    // SUITE 8: CROSS-TENANT MULTI-TENANT ISOLATION
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 8] Cross-Tenant Multi-Tenant Isolation & Ownership Protection...');

    const appOwnedByA = preparedPkg.id;

    // Candidate B cannot approve Candidate A's application
    let unauthorizedApprovalBlocked = false;
    try {
      approveApplicationPackage(appOwnedByA, userB.id, true);
    } catch (err: any) {
      unauthorizedApprovalBlocked = true;
      if (!err.message.includes('Access Denied')) {
        throw new Error(`Unexpected error message for cross-tenant approval: ${err.message}`);
      }
    }
    if (!unauthorizedApprovalBlocked) {
      throw new Error('Security Violation: Candidate B was able to approve Candidate A\'s application package!');
    }
    console.log('  ✓ Candidate B strictly blocked from approving Candidate A\'s application package (Access Denied).');

    // Candidate B cannot submit Candidate A's application
    let unauthorizedSubmissionBlocked = false;
    try {
      recordCandidateSubmission(appOwnedByA, userB.id, true);
    } catch (err: any) {
      unauthorizedSubmissionBlocked = true;
      if (!err.message.includes('Access Denied')) {
        throw new Error(`Unexpected error message for cross-tenant submission: ${err.message}`);
      }
    }
    if (!unauthorizedSubmissionBlocked) {
      throw new Error('Security Violation: Candidate B was able to confirm submission for Candidate A\'s application!');
    }
    console.log('  ✓ Candidate B strictly blocked from confirming submission for Candidate A\'s application (Access Denied).');

    // Candidate B cannot record confirmation for Candidate A's application
    let unauthorizedConfirmationBlocked = false;
    try {
      recordEmployerConfirmation(appOwnedByA, userB.id, {
        evidence_type: 'candidate_receipt',
        confirmation_reference: 'ATTACK-999'
      });
    } catch (err: any) {
      unauthorizedConfirmationBlocked = true;
      if (!err.message.includes('Access Denied')) {
        throw new Error(`Unexpected error message for cross-tenant confirmation: ${err.message}`);
      }
    }
    if (!unauthorizedConfirmationBlocked) {
      throw new Error('Security Violation: Candidate B was able to record employer confirmation for Candidate A\'s application!');
    }
    console.log('  ✓ Candidate B strictly blocked from recording employer confirmation for Candidate A\'s application (Access Denied).');

    // ---------------------------------------------------------------------------
    // SUITE 9: LEGACY STATUS INTEGRITY & TRUTHFUL NORMALIZATION (Critical Issue 1)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 9] Legacy Status Integrity & Truthful Normalization (Critical Issue 1)...');

    // Insert a historical legacy application record with raw status = 'Applied' and NO candidate confirmation
    const legacyAppId = 'app_legacy_unconfirmed_01';
    db.prepare(`
      INSERT INTO applications (
        id, user_id, job_id, status, match_score, match_details_json,
        human_approved, submission_confirmed, submission_type
      ) VALUES (?, ?, ?, 'Applied', 88, '{}', 1, 0, 'Automated')
    `).run(legacyAppId, userA.id, job1.id);

    // Verify SQLite database retains exact original historical status
    const rawLegacyRow = db.prepare('SELECT status, submission_confirmed FROM applications WHERE id = ?').get(legacyAppId) as any;
    if (rawLegacyRow.status !== 'Applied') {
      throw new Error(`Database history altered: expected raw status 'Applied', got '${rawLegacyRow.status}'`);
    }
    console.log('  ✓ Original database status and audit history preserved in SQLite (status: "Applied").');

    // Verify normalizeApplicationStatus NEVER automatically maps unverified 'Applied' to 'Submitted by Candidate'
    const normalizedUnverified = normalizeApplicationStatus(rawLegacyRow.status, rawLegacyRow);
    if (normalizedUnverified === 'Submitted by Candidate') {
      throw new Error('CRITICAL INTEGRITY VIOLATION: normalizeApplicationStatus mapped unverified legacy "Applied" to "Submitted by Candidate"!');
    }
    if (normalizedUnverified !== 'Legacy Applied – Unverified') {
      throw new Error(`Expected 'Legacy Applied – Unverified', got '${normalizedUnverified}'`);
    }
    console.log('  ✓ Unverified legacy Applied record mapped truthfully to "Legacy Applied – Unverified".');

    // Verify that ONLY explicit candidate confirmation promotes to 'Submitted by Candidate'
    const genuineCandidateRow = {
      status: 'Applied',
      submission_confirmed: 1,
      candidate_submission_notes: 'Confirmed submitted by candidate'
    };
    const normalizedGenuine = normalizeApplicationStatus(genuineCandidateRow.status, genuineCandidateRow);
    if (normalizedGenuine !== 'Submitted by Candidate') {
      throw new Error(`Expected 'Submitted by Candidate' when explicit evidence exists, got '${normalizedGenuine}'`);
    }
    console.log('  ✓ Explicit candidate confirmation evidence correctly normalizes to "Submitted by Candidate".');

    // Verify CRM pipeline excludes unverified legacy records from genuine submission counts
    const crmApps = getAllApplications(userA.id);
    const legacyInCRM = crmApps.find(a => a.id === legacyAppId);
    if (!legacyInCRM) {
      throw new Error('Legacy application missing in CRM query.');
    }
    if (legacyInCRM.status === 'Submitted by Candidate') {
      throw new Error('CRM query falsely classified unverified legacy application as "Submitted by Candidate"!');
    }
    if (legacyInCRM.status !== 'Legacy Applied – Unverified') {
      throw new Error(`CRM query expected 'Legacy Applied – Unverified', got '${legacyInCRM.status}'`);
    }
    console.log('  ✓ CRM application retrieval correctly marks legacy row as "Legacy Applied – Unverified" without conflating genuine submissions.');

    // ---------------------------------------------------------------------------
    // SUITE 10: CRM MUTATION GUARDS & STATE TRANSITION SECURITY (Phase 2.2.4 Step 4)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 10] CRM Mutation Guards & State Transition Security...');

    // Setup an approved application for CRM transition testing
    const crmTestAppId = 'app_crm_test_transition_01';
    db.prepare(`
      INSERT INTO applications (
        id, user_id, job_id, status, match_score, match_details_json,
        human_approved, submission_confirmed, submission_type
      ) VALUES (?, ?, ?, 'Ready for Candidate Submission', 92, '{}', 1, 0, 'Manual')
    `).run(crmTestAppId, userA.id, job1.id);

    // 10.1: Updating stage to 'Applied' does NOT set submission_confirmed = 1
    const updatedCrmApp = updateApplicationStatus(crmTestAppId, 'Applied' as any, 'Testing CRM stage change', userA.id);
    const dbCrmRow = db.prepare('SELECT status, submission_confirmed, applied_at FROM applications WHERE id = ?').get(crmTestAppId) as any;
    if (dbCrmRow.submission_confirmed === 1) {
      throw new Error('CRITICAL FLAW: CRM status update to "Applied" automatically fabricated submission_confirmed = 1!');
    }
    if (dbCrmRow.applied_at !== null) {
      throw new Error('CRITICAL FLAW: CRM status update to "Applied" automatically stamped applied_at timestamp!');
    }
    if (updatedCrmApp.status !== 'Legacy Applied – Unverified') {
      throw new Error(`Expected normalized status 'Legacy Applied – Unverified', got '${updatedCrmApp.status}'`);
    }
    console.log('  ✓ CRM stage update to "Applied" does NOT set submission_confirmed = 1 or fabricate applied_at.');

    // 10.2: Direct CRM transition to 'Submitted by Candidate' is strictly prohibited
    let crmSubmitBlocked = false;
    try {
      updateApplicationStatus(crmTestAppId, 'Submitted by Candidate' as any, 'Trying to force submitted status', userA.id);
    } catch (err: any) {
      crmSubmitBlocked = true;
      if (!err.message.includes('Action Prohibited') || !err.message.includes('candidate submission workflow')) {
        throw new Error(`Unexpected CRM error message: ${err.message}`);
      }
    }
    if (!crmSubmitBlocked) {
      throw new Error('CRITICAL FLAW: CRM permitted manual update directly to "Submitted by Candidate" without candidate workflow!');
    }
    console.log('  ✓ Direct CRM update to "Submitted by Candidate" is strictly prohibited and rejected.');

    // 10.3: Direct CRM transition to 'Employer Confirmation Independently Verified' is strictly prohibited
    let crmVerifyBlocked = false;
    try {
      updateApplicationStatus(crmTestAppId, 'Employer Confirmation Independently Verified' as any, 'Trying to force verified status', userA.id);
    } catch (err: any) {
      crmVerifyBlocked = true;
      if (!err.message.includes('Action Prohibited') || !err.message.includes('authenticated employer webhook')) {
        throw new Error(`Unexpected CRM error message: ${err.message}`);
      }
    }
    if (!crmVerifyBlocked) {
      throw new Error('CRITICAL FLAW: CRM permitted manual update directly to "Employer Confirmation Independently Verified"!');
    }
    console.log('  ✓ Direct CRM update to "Employer Confirmation Independently Verified" is strictly prohibited and rejected.');

    // 10.4: Direct CRM transition to 'Candidate Evidence Provided' is strictly prohibited
    let crmEvidenceBlocked = false;
    try {
      updateApplicationStatus(crmTestAppId, 'Candidate Evidence Provided' as any, 'Trying to force evidence status', userA.id);
    } catch (err: any) {
      crmEvidenceBlocked = true;
      if (!err.message.includes('Action Prohibited') || !err.message.includes('confirmation receipt workflow')) {
        throw new Error(`Unexpected CRM error message: ${err.message}`);
      }
    }
    if (!crmEvidenceBlocked) {
      throw new Error('CRITICAL FLAW: CRM permitted manual update directly to "Candidate Evidence Provided"!');
    }
    console.log('  ✓ Direct CRM update to "Candidate Evidence Provided" is strictly prohibited and rejected.');

    // ---------------------------------------------------------------------------
    // SUITE 11: CANDIDATE SUBMISSION API VALIDATION & OWNERSHIP GUARDS (Step 3)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 11] Candidate Submission API Validation & Ownership Guards...');

    // Setup an approved package owned by Alice for API testing
    const apiTestAppId = 'app_api_submit_test_01';
    db.prepare(`
      INSERT INTO applications (
        id, user_id, job_id, status, match_score, match_details_json,
        human_approved, submission_confirmed, submission_type
      ) VALUES (?, ?, ?, 'Ready for Candidate Submission', 95, '{}', 1, 0, 'Manual')
    `).run(apiTestAppId, userA.id, job1.id);

    const { createSession } = await import('../lib/auth');
    const aliceSession = createSession(userA.id);
    const aliceToken = aliceSession.token;

    // 11.1: Missing candidate_confirmed returns HTTP 400
    const missingReq = new Request('http://localhost:3000/api/applications/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ application_id: apiTestAppId })
    });
    const missingRes = await candidateSubmitHandler(missingReq);
    if (missingRes.status !== 400) {
      throw new Error(`Expected HTTP 400 on missing candidate_confirmed, got ${missingRes.status}`);
    }
    const missingJson = await missingRes.json();
    if (!missingJson.error.includes('candidate_confirmed must explicitly be boolean true')) {
      throw new Error(`Unexpected error message on missing confirmation: ${missingJson.error}`);
    }
    console.log('  ✓ Candidate submission API strictly rejects missing candidate_confirmed with HTTP 400.');

    // 11.2: Non-boolean candidate_confirmed ("true" string, 1 number) returns HTTP 400
    const nonBoolReq = new Request('http://localhost:3000/api/applications/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ application_id: apiTestAppId, candidate_confirmed: 'true' })
    });
    const nonBoolRes = await candidateSubmitHandler(nonBoolReq);
    if (nonBoolRes.status !== 400) {
      throw new Error(`Expected HTTP 400 on non-boolean candidate_confirmed, got ${nonBoolRes.status}`);
    }
    console.log('  ✓ Candidate submission API strictly rejects string "true" with HTTP 400.');

    // 11.3: Cross-tenant submission: Bob attempting to submit Alice's application
    // Create authentic session token for Bob
    const bobSession = createSession(userB.id);
    const bobToken = bobSession.token;

    const crossTenantSubmitReq = new Request('http://localhost:3000/api/applications/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobToken}`
      },
      body: JSON.stringify({ application_id: apiTestAppId, candidate_confirmed: true })
    });
    const crossTenantSubmitRes = await candidateSubmitHandler(crossTenantSubmitReq);
    if (crossTenantSubmitRes.status !== 403) {
      throw new Error(`Expected HTTP 403 on cross-tenant submission, got ${crossTenantSubmitRes.status}`);
    }
    const crossTenantSubmitJson = await crossTenantSubmitRes.json();
    if (!crossTenantSubmitJson.error.includes('Access Denied')) {
      throw new Error(`Expected Access Denied error, got: ${crossTenantSubmitJson.error}`);
    }
    console.log('  ✓ Cross-tenant candidate submission strictly blocked with HTTP 403 (Access Denied).');

    // 11.4: Authentic submission by owner (Alice) returns HTTP 200 and logs audit provenance

    const validReq = new Request('http://localhost:3000/api/applications/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        application_id: apiTestAppId,
        candidate_confirmed: true,
        notes: 'Submitted via official Klarna Careers portal directly.'
      })
    });
    const validRes = await candidateSubmitHandler(validReq);
    if (validRes.status !== 200) {
      const err = await validRes.json();
      throw new Error(`Expected HTTP 200 on authentic submission, got ${validRes.status}: ${JSON.stringify(err)}`);
    }
    const validJson = await validRes.json();
    if (validJson.application.status !== 'Submitted by Candidate' || validJson.application.submission_confirmed !== 1) {
      throw new Error('Application was not properly updated to "Submitted by Candidate"');
    }

    // Verify audit event exists
    const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE user_id = ? AND action = 'APPLICATION_SUBMITTED_BY_CANDIDATE'").all(userA.id) as any[];
    if (auditLogs.length === 0) {
      throw new Error('Missing APPLICATION_SUBMITTED_BY_CANDIDATE audit log event!');
    }
    console.log('  ✓ Authentic candidate submission succeeded (HTTP 200) and created trustworthy audit provenance.');

    // 11.5: Idempotency: repeated call returns HTTP 200 without creating duplicate audit log
    const auditCountBefore = auditLogs.length;
    const repeatReq = new Request('http://localhost:3000/api/applications/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ application_id: apiTestAppId, candidate_confirmed: true })
    });
    const repeatRes = await candidateSubmitHandler(repeatReq);
    if (repeatRes.status !== 200) {
      throw new Error(`Expected HTTP 200 on repeated idempotent submission, got ${repeatRes.status}`);
    }
    const auditCountAfter = (db.prepare("SELECT * FROM audit_logs WHERE user_id = ? AND action = 'APPLICATION_SUBMITTED_BY_CANDIDATE'").all(userA.id) as any[]).length;
    if (auditCountAfter !== auditCountBefore) {
      throw new Error('Idempotency violation: repeated submission created duplicate audit event!');
    }
    console.log('  ✓ Repeated submission is idempotent: returned HTTP 200 without duplicate audit events.');

    // ---------------------------------------------------------------------------
    // SUITE 12: EMAIL DELIVERY TRUTHFULNESS & SANDBOX ISOLATION (Step 6)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 12] Email Delivery Truthfulness & Sandbox Isolation...');

    // Draft email creation
    const draftEmailId = 'email_truth_test_01';
    db.prepare(`
      INSERT INTO emails (id, user_id, category, sender, recipient, subject, body, is_draft, is_sent, delivery_status)
      VALUES (?, ?, 'Follow_Up', 'candidate@example.com', 'recruiter@klarna.com', 'Application Follow-up', 'Thank you for considering my application.', 1, 0, 'draft')
    `).run(draftEmailId, userA.id);

    const initialEmail = db.prepare('SELECT is_draft, is_sent, delivery_status FROM emails WHERE id = ?').get(draftEmailId) as any;
    if (initialEmail.is_draft !== 1 || initialEmail.is_sent !== 0 || initialEmail.delivery_status !== 'draft') {
      throw new Error('Initial email draft must have is_draft = 1, is_sent = 0, delivery_status = "draft"');
    }
    console.log('  ✓ Draft email initialized with is_draft = 1, is_sent = 0, delivery_status = "draft".');

    // Send email with approval in sandbox mode
    const sendResult = sendEmailWithApproval(draftEmailId, true, userA.id);
    const sentEmailDb = db.prepare('SELECT is_draft, is_sent, delivery_status, delivery_provider FROM emails WHERE id = ?').get(draftEmailId) as any;
    if (sentEmailDb.is_sent !== 0) {
      throw new Error('CRITICAL FLAW: Sandbox email send set is_sent = 1 without a live mail provider!');
    }
    if (sentEmailDb.is_draft !== 0) {
      throw new Error('Expected is_draft = 0 after user approved send');
    }
    if (sentEmailDb.delivery_status !== 'sandbox_recorded') {
      throw new Error(`Expected delivery_status = 'sandbox_recorded', got '${sentEmailDb.delivery_status}'`);
    }
    console.log('  ✓ Sandbox email dispatch safely records delivery_status = "sandbox_recorded" with is_sent = 0.');

    // ---------------------------------------------------------------------------
    // SUITE 13: UNIFIED CANONICAL KPI CALCULATION & CONSISTENCY (Step 5)
    // ---------------------------------------------------------------------------
    console.log('\n>>> [SUITE 13] Unified Canonical KPI Calculation & Consistency...');

    // Create a heterogeneous set of applications
    const testCohort = [
      // 1. Candidate-Reported Submission
      { id: 'c1', status: 'Submitted by Candidate', submission_confirmed: 1, notes: 'Direct submission' },
      // 2. Candidate Evidence Provided
      { id: 'c2', status: 'Candidate Evidence Provided', evidence_status: 'candidate_evidence_provided' },
      // 3. Independently Verified Employer Receipt
      { id: 'c3', status: 'Employer Confirmation Independently Verified', evidence_status: 'employer_verified', verified_by_system: 1 },
      // 4. Legacy Unverified
      { id: 'c4', status: 'Legacy Applied – Unverified', submission_confirmed: 0 },
      // 5. Legacy Applied with autonomous fabrication notes -> must be classified as legacy unverified
      { id: 'c5', status: 'Applied', submission_confirmed: 1, notes: 'Autonomously applied via portal' },
      // 6. Ready for Candidate Submission
      { id: 'c6', status: 'Ready for Candidate Submission', human_approved: 1 },
      // 7. Prepared package
      { id: 'c7', status: 'Package Prepared', human_approved: 0 },
      // 8. Interview
      { id: 'c8', status: 'Interview', human_approved: 1 }
    ];

    const kpiSummary = calculateApplicationKPIs(testCohort);

    if (kpiSummary.candidate_reported_submissions !== 1) {
      throw new Error(`Expected exactly 1 candidate_reported_submission, got ${kpiSummary.candidate_reported_submissions}`);
    }
    if (kpiSummary.independently_verified_employer_receipts !== 1) {
      throw new Error(`Expected exactly 1 independently_verified_employer_receipt, got ${kpiSummary.independently_verified_employer_receipts}`);
    }
    if (kpiSummary.candidate_evidence_provided !== 1) {
      throw new Error(`Expected exactly 1 candidate_evidence_provided, got ${kpiSummary.candidate_evidence_provided}`);
    }
    if (kpiSummary.legacy_unverified_applications !== 2) {
      throw new Error(`Expected exactly 2 legacy_unverified_applications, got ${kpiSummary.legacy_unverified_applications}`);
    }
    if (kpiSummary.ready_for_candidate_submission !== 1) {
      throw new Error(`Expected exactly 1 ready_for_candidate_submission, got ${kpiSummary.ready_for_candidate_submission}`);
    }
    if (kpiSummary.prepared_applications !== 1) {
      throw new Error(`Expected exactly 1 prepared_application, got ${kpiSummary.prepared_applications}`);
    }
    if (kpiSummary.interviews_and_offers !== 1) {
      throw new Error(`Expected exactly 1 interview, got ${kpiSummary.interviews_and_offers}`);
    }
    if (kpiSummary.total_active_in_pipeline !== 8) {
      throw new Error(`Expected total_active_in_pipeline = 8, got ${kpiSummary.total_active_in_pipeline}`);
    }
    console.log('  ✓ Centralized KPI service produces mutually exclusive, truthful counts across all categories.');

    console.log('\n========================================================================');
    console.log('>>> ALL PRODUCT TRUTHFULNESS & APPLICATION LIFECYCLE TESTS PASSED (13/13) <<<');
    console.log('========================================================================\n');

  } finally {
    // ---------------------------------------------------------------------------
    // ENVIRONMENT CLEANUP
    // ---------------------------------------------------------------------------
    console.log('>>> [CLEANUP] Restoring pre-test environment variables...');
    if (originalDatabasePath !== undefined) {
      process.env.DATABASE_PATH = originalDatabasePath;
    } else {
      delete process.env.DATABASE_PATH;
    }

    if (originalStagingMode !== undefined) {
      process.env.STAGING_MODE = originalStagingMode;
    } else {
      delete process.env.STAGING_MODE;
    }

    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalStagingAccessCode !== undefined) {
      process.env.STAGING_ACCESS_CODE = originalStagingAccessCode;
    } else {
      delete process.env.STAGING_ACCESS_CODE;
    }

    console.log('  ✓ Environment variables restored.');

    console.log('>>> [CLEANUP] Cleaning up isolated test database directory...');
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      }
      console.log('  ✓ Isolated test database cleaned successfully.');
    } catch {
      console.warn('  ! Note: Could not immediately remove test db directory (locked by process); marked for cleanup.');
    }
  }
}

runTruthfulnessAndLifecycleTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
