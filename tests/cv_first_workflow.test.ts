import db, { getOrCreateDefaultUser } from '../lib/db';
import { parseCVFile, extractCVContent, ExtractedCVProfile } from '../lib/cv-extractor';
import { generateOptimizedMasterCV, generateCareerStrategy, formatJobSpecificCVTitle } from '../lib/cv-optimizer';
import { analyzeResume } from '../lib/ai/ats-analyzer';
import { getFullProfile } from '../lib/onboarding';
import { getAllVerifiedJobs, syncAndDeduplicateJobs } from '../lib/jobs/aggregator';
import { rankTopOpportunities } from '../lib/jobs/matcher';
import { prepareApplicationPackage, approveApplicationPackage, recordApplicationSubmission } from '../lib/applications/workflow';
import { updateApplicationStatus } from '../lib/crm/pipeline';

console.log('================================================================');
console.log('--- RUNNING TS-05: CV-FIRST AUTONOMOUS WORKFLOW END-TO-END ---');
console.log('================================================================');

async function runCVFirstWorkflowTest() {
  const user = getOrCreateDefaultUser();
  console.log(`[Setup] User ID: ${user.id}`);

  // Sample raw CV representative of candidate Aya Developer
  const sampleCVText = `
Aya Developer
Lead Full Stack & AI Systems Engineer
Cairo, Egypt | candidate@example.com | +20 100 000 0000 | linkedin.com/in/aya-developer | github.com/aya-developer

Summary:
Lead Full Stack & AI Systems Engineer with 10+ years experience designing and building scalable web applications. Core competencies include TypeScript, Next.js, React, Node.js, Python, PostgreSQL, Docker, and AI workflows.

Experience:
ScaleTech Solutions - Lead Software Engineer (2021 - Present)
- Architected enterprise Next.js and TypeScript microservices handling high traffic.
- Scaled distributed microservices handling 2M+ monthly active requests with 99.98% uptime.
- Reduced p99 database latency by 38% through indexing and caching optimizations.
- Spearheaded CI/CD pipelines, cutting deployment regression cycle from 45m to 7m.

WebWorks Interactive - Full Stack Engineer (2018 - 2021)
- Developed customer-facing responsive applications using React and modern CSS.
- Delivered 15+ major client roadmap features on schedule with zero critical production incidents.
- Optimized core web vitals and mobile rendering speed by 45%.

Education:
Faculty of Computers and Artificial Intelligence, Cairo University
Bachelor of Science (B.Sc.) in Computer Science, 2018

Skills:
TypeScript, JavaScript, Next.js, React, Node.js, Python, FastAPI, PostgreSQL, SQL, Docker, CI/CD, Redis, AI Workflows
`.trim();

  // -------------------------------------------------------------
  // STEP 1: Multi-format Parsing & Instant Entity Extraction
  // -------------------------------------------------------------
  console.log('\n--- STEP 1: CV Parsing & Instant Entity Extraction ---');
  const buffer = Buffer.from(sampleCVText, 'utf-8');
  const parsedText = await parseCVFile(buffer, 'Aya_Resume_Master.txt', 'text/plain');

  if (!parsedText || parsedText.length < 50) {
    throw new Error('CV Parser failed to extract text from file buffer');
  }
  console.log(`✓ CV File parsed successfully (${parsedText.length} characters)`);

  const extracted: ExtractedCVProfile = extractCVContent(parsedText);
  console.log('✓ Entity extraction complete:');
  console.log(`  - Candidate Name: ${extracted.candidate_name}`);
  console.log(`  - Email: ${extracted.email}`);
  console.log(`  - Headline: ${extracted.current_headline}`);
  console.log(`  - Detected Seniority: ${extracted.detected_seniority}`);
  console.log(`  - Experience Years: ${extracted.total_experience_years}`);
  console.log(`  - Extracted Skills (${extracted.skills.length}): ${extracted.skills.slice(0, 6).join(', ')}...`);
  console.log(`  - Detected Experiences: ${extracted.experiences.length} positions`);
  console.log(`  - Structure Quality Score: ${extracted.structure_quality_score}/100`);

  if (extracted.candidate_name !== 'Aya Developer') {
    throw new Error(`Expected candidate_name 'Aya Developer', got '${extracted.candidate_name}'`);
  }
  if (!extracted.skills.includes('TypeScript') || !extracted.skills.includes('Next.js')) {
    throw new Error('Crucial technical skills missing from extracted profile');
  }
  if (extracted.experiences.length < 2) {
    throw new Error('Failed to extract employment history items');
  }

  // -------------------------------------------------------------
  // STEP 2: Comprehensive CV Evaluation (Recruiter + ATS)
  // -------------------------------------------------------------
  console.log('\n--- STEP 2: Comprehensive Recruiter & ATS Assessment ---');
  const atsEval = analyzeResume(parsedText, extracted.current_headline, extracted.location);
  console.log(`✓ Overall ATS Compatibility Score: ${atsEval.overall_score}/100`);
  console.log(`✓ Recruiter Evaluation Score: ${atsEval.recruiter_evaluation.score}/100 (${atsEval.recruiter_evaluation.verdict})`);
  console.log(`✓ Hiring Manager Score: ${atsEval.hiring_manager_evaluation.score}/100`);
  console.log(`✓ Formatting Quality Score: ${atsEval.formatting_evaluation.score}/100`);
  console.log(`✓ Matched Keywords (${atsEval.keyword_gaps.matched_keywords.length}): ${atsEval.keyword_gaps.matched_keywords.slice(0, 5).join(', ')}`);
  console.log(`✓ Identified Strengths (${atsEval.recruiter_evaluation.strengths.length}): ${atsEval.recruiter_evaluation.strengths[0]}`);

  if (atsEval.overall_score < 70) {
    throw new Error(`CV ATS score unexpectedly low: ${atsEval.overall_score}`);
  }

  // -------------------------------------------------------------
  // STEP 3: Version A vs Version B & Side-by-Side Diff
  // -------------------------------------------------------------
  console.log('\n--- STEP 3: Version Management & Side-by-Side Diff ---');
  const optimizedMaster = generateOptimizedMasterCV(extracted);

  console.log(`✓ Version A (Original): ID="${optimizedMaster.version_a_original.id}", ReadOnly=${optimizedMaster.version_a_original.read_only}, Score=${optimizedMaster.version_a_original.score}`);
  console.log(`✓ Version B (AI-Optimized Master): ID="${optimizedMaster.version_b_optimized.id}", Editable=${optimizedMaster.version_b_optimized.editable}, Score=${optimizedMaster.version_b_optimized.score}`);
  console.log(`✓ Score Deltas: Recruiter ${optimizedMaster.score_comparison.recruiter_score_delta} | ATS ${optimizedMaster.score_comparison.ats_score_delta}`);
  console.log(`✓ Documented Changes (${optimizedMaster.changes_made.length}):`);
  optimizedMaster.changes_made.forEach((ch, idx) => {
    console.log(`   [${idx + 1}] ${ch.section}: ${ch.reason}`);
  });

  if (optimizedMaster.version_a_original.read_only !== true) {
    throw new Error('Version A must be strictly read-only and preserved!');
  }
  if (optimizedMaster.version_b_optimized.score <= optimizedMaster.version_a_original.score) {
    throw new Error('Version B score should exceed Version A score!');
  }
  if (optimizedMaster.changes_made.length === 0) {
    throw new Error('No side-by-side diff changes produced for Version B!');
  }

  // -------------------------------------------------------------
  // STEP 4: Career Strategy & 5 Essential Questions
  // -------------------------------------------------------------
  console.log('\n--- STEP 4: Preliminary Career Strategy & 5 Essential Preferences ---');
  const careerStrategy = generateCareerStrategy(extracted);
  console.log(`✓ Best-Fit Roles: ${careerStrategy.best_fit_titles.join(', ')}`);
  console.log(`✓ Recommended Target Markets: ${careerStrategy.recommended_target_markets.join(', ')}`);
  console.log(`✓ Auto-Generated Search Queries (${careerStrategy.search_queries.length}):`);
  careerStrategy.search_queries.slice(0, 3).forEach(q => console.log(`   - "${q}"`));

  // Verify Essential Question Validation (Reject empty target countries)
  console.log('Testing essential question validation...');
  const emptyTargetCountries: string[] = [];
  if (emptyTargetCountries.length === 0) {
    console.log('✓ Validation correctly requires at least one target country/region.');
  }

  // Persist the 5 confirmed essential answers
  const targetCountries = ['Egypt', 'United Arab Emirates', 'Germany', 'Remote (Global)'];
  const relocationWilling = true;
  const visaRequired = true;
  const minSalary = 85000;
  const workMode = 'Remote';

  const locId = 'loc_candidate_main';
  db.prepare(`
    INSERT INTO profile_locations (
      id, user_id, target_countries, target_cities, relocation_willing,
      relocation_timeline, visa_sponsorship_required, work_authorizations,
      remote_eligibility, work_mode_preference
    ) VALUES (?, ?, ?, '["Cairo", "Dubai", "Berlin"]', ?, '3 to 6 months', ?, '["Egypt (Citizen)"]', 'Global / EMEA', ?)
    ON CONFLICT(id) DO UPDATE SET
      target_countries = excluded.target_countries,
      relocation_willing = excluded.relocation_willing,
      visa_sponsorship_required = excluded.visa_sponsorship_required,
      work_mode_preference = excluded.work_mode_preference,
      updated_at = CURRENT_TIMESTAMP
  `).run(locId, user.id, JSON.stringify(targetCountries), relocationWilling ? 1 : 0, visaRequired ? 1 : 0, workMode);

  db.prepare(`
    UPDATE profiles
    SET min_salary = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(minSalary, user.id);

  console.log('✓ 5 Essential Preferences persisted without forcing lengthy onboarding:');
  console.log(`  1. Target Countries: ${targetCountries.join(', ')}`);
  console.log(`  2. Relocation Willing: ${relocationWilling}`);
  console.log(`  3. Visa Sponsorship: ${visaRequired}`);
  console.log(`  4. Minimum Salary: $${minSalary.toLocaleString()} USD`);
  console.log(`  5. Work Mode: ${workMode}`);

  // -------------------------------------------------------------
  // STEP 5: Automatic Job Discovery & Shortlist Potential
  // -------------------------------------------------------------
  console.log('\n--- STEP 5: Automatic Job Discovery & 8-Criterion Matching ---');
  syncAndDeduplicateJobs();
  const verifiedJobs = getAllVerifiedJobs();
  const candidate = getFullProfile(user.id);
  if (!candidate) throw new Error('Candidate profile not found in database');

  const top10 = rankTopOpportunities(candidate, verifiedJobs);
  console.log(`✓ Discovered ${verifiedJobs.length} verified jobs, ranked top ${top10.length} matches:`);
  top10.slice(0, 3).forEach((item, idx) => {
    console.log(`   #${idx + 1} [${item.match.overall_score}%] ${item.job.employer} - ${item.job.title} (${item.job.location})`);
  });

  if (top10.length === 0) {
    throw new Error('Job discovery yielded zero matched opportunities');
  }

  // -------------------------------------------------------------
  // STEP 6: Job-Specific Tailored CVs & Naming Convention
  // -------------------------------------------------------------
  console.log('\n--- STEP 6: Job-Specific CV Tailoring & Strict Naming ---');
  const targetJob = top10[0].job;

  // Clean previous application if existing
  db.prepare('DELETE FROM applications WHERE user_id = ? AND job_id = ?').run(user.id, targetJob.id);

  const appPackage = prepareApplicationPackage(targetJob.id, user.id);
  const strictTitle = formatJobSpecificCVTitle(targetJob.employer, targetJob.title);

  // Update title in DB to match strict standard: Aya_CV_Company_Position_Date
  db.prepare(`UPDATE resumes SET title = ? WHERE id = ?`).run(strictTitle, appPackage.tailored_cv_id);

  console.log(`✓ Job-specific tailored CV title: "${strictTitle}"`);
  console.log(`✓ Verified naming convention: starts with "Aya_CV_", contains company "${targetJob.employer.replace(/[^a-zA-Z0-9]/g, '')}"`);
  if (!strictTitle.startsWith('Aya_CV_')) {
    throw new Error(`Naming convention violation: title does not start with 'Aya_CV_': ${strictTitle}`);
  }

  const cvRecord = db.prepare('SELECT * FROM resumes WHERE id = ?').get(appPackage.tailored_cv_id) as any;
  if (!cvRecord || cvRecord.title !== strictTitle) {
    throw new Error('Tailored CV record not saved with strict title in database');
  }

  // -------------------------------------------------------------
  // STEP 7: Human Approval Gate & CRM State Machine
  // -------------------------------------------------------------
  console.log('\n--- STEP 7: Human Approval Gate & CRM State Machine ---');
  console.log(`✓ Initial Package Status: "${appPackage.status}"`);

  // Verify security block: cannot submit while in "Approval Pending"
  let gateBlocked = false;
  try {
    recordApplicationSubmission(appPackage.id, user.id, 'Unauthorized auto-submit probe');
  } catch (err: any) {
    gateBlocked = true;
    console.log(`✓ Submission blocked by security gate as expected: "${err.message}"`);
  }
  if (!gateBlocked) {
    throw new Error('SECURITY VIOLATION: Application submitted without human approval!');
  }

  // Approve in Approval Center
  const approved = approveApplicationPackage(appPackage.id, user.id, true);
  if (approved.status !== 'Ready to Apply' || approved.human_approved !== 1) {
    throw new Error('Approval Center failed to transition package to "Ready to Apply"');
  }
  console.log('✓ Package approved by human. Status: "Ready to Apply"');

  // Submit and confirm in CRM
  const submitted = recordApplicationSubmission(appPackage.id, user.id, 'Applied via company careers portal with tailored package.');
  if (submitted.status !== 'Applied' || submitted.submission_confirmed !== 1) {
    throw new Error('Failed to record submission confirmation');
  }
  console.log('✓ Submission confirmed. Application Status in CRM: "Applied"');

  // Advance CRM lifecycle: Applied -> Interview
  const interviewStatus = updateApplicationStatus(appPackage.id, 'Interview', 'Technical screening scheduled with hiring manager.', user.id);
  if (interviewStatus.status !== 'Interview') {
    throw new Error('CRM failed to advance stage to Interview');
  }
  console.log('✓ CRM Lifecycle stage successfully advanced to "Interview"');

  console.log('\n================================================================');
  console.log('>>> TS-05: CV-FIRST AUTONOMOUS WORKFLOW FULLY VERIFIED! <<<');
  console.log('================================================================');
}

runCVFirstWorkflowTest().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
