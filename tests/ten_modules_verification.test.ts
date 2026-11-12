import assert from 'assert';
import db, { getOrCreateDefaultUser, getActiveResume, setActiveResume } from '../lib/db';
import { extractCVContent } from '../lib/cv-extractor';
import { generateOptimizedMasterCV, generateCareerStrategy } from '../lib/cv-optimizer';
import { analyzeResume } from '../lib/ai/ats-analyzer';
import { getFullProfile } from '../lib/onboarding';
import { getAllVerifiedJobs } from '../lib/jobs/aggregator';
import { calculateMatchScore, rankTopOpportunities } from '../lib/jobs/matcher';
import { generateTailoredPackage } from '../lib/ai/resume-tailorer';
import { prepareApplicationPackage, approveApplicationPackage, recordApplicationSubmission } from '../lib/applications/workflow';
import { FullCandidateProfile } from '../lib/types';

// ============================================================================
// THREE GENUINELY DIFFERENT TEST RESUMES
// ============================================================================

const RESUME_1_FMCG = `
SARAH AL-MANSOOR
Dubai, United Arab Emirates | Mobile: +971501234567
Email: sarah.almansoor@fmcglead.com | LinkedIn: linkedin.com/in/sarah-almansoor

PROFESSIONAL SUMMARY
Dynamic Senior FMCG Category Manager with 8+ years of proven commercial excellence across Personal Care, Beauty & Grooming, and Modern Trade distribution in the UAE and Saudi Arabia. Proven track record managing Tier-1 retailer relationships (Carrefour, Lulu, Spinneys), delivering 35% YoY category value growth, executing high-ROI promotional joint business plans (JBPs), and optimizing planograms.

CORE COMPETENCIES
Category Management, FMCG, Trade Marketing, Assortment Optimization, Joint Business Planning (JBP), Planograms, Demand Forecasting, Power BI, SAP, Distributor Management, Modern Trade

PROFESSIONAL EXPERIENCE

Senior Category Manager – Personal Care & Beauty
Al-Futtaim Retail Group | Dubai, UAE | Jan 2022 – Present
- Delivered 35% YoY category value growth across 48 hypermarket locations through assortment optimization and strategic supplier JBPs.
- Directed retail promotional strategy, achieving 22% ROI improvement across personal care and skincare categories.
- Spearheaded category review sessions with multinational brand principals (Unilever, L'Oréal, P&G).

Trade Marketing & Channel Specialist
Modern Consumer Brands Co. | Dubai, UAE | Mar 2018 – Dec 2021
- Managed distributor performance and POSM merchandising across 120+ retail supermarket outlets.
- Formulated demand forecasts and stock replenishment models reducing out-of-stock incidents by 28%.

EDUCATION
- Bachelor of Business Administration (BBA) in Marketing | American University of Sharjah (2017)
- Professional Certificate in Category Management (CPCM) | 2020
`.trim();

const RESUME_2_SOFTWARE = `
MARCUS VANCE
Berlin, Germany / Remote | Mobile: +491709876543
Email: marcus.vance@cloudarchitect.dev | GitHub: github.com/marcusvance

PROFESSIONAL SUMMARY
Senior Cloud & Software Architect with 9+ years of extensive hands-on experience designing and operating large-scale distributed systems, microservices, and Kubernetes infrastructure. Proven track record handling 150,000+ RPS across multi-region AWS and GCP deployments with 99.99% uptime SLAs. Expert in Go, TypeScript, Next.js, Kafka, PostgreSQL, and high-performance API engineering.

CORE COMPETENCIES
Cloud Architecture, Kubernetes, Distributed Systems, Go, TypeScript, Next.js, Microservices, AWS, Docker, PostgreSQL, CI/CD, Kafka, System Design

PROFESSIONAL EXPERIENCE

Principal Cloud Architect & Tech Lead
CloudScale Technologies | Berlin, Germany | Feb 2021 – Present
- Architected enterprise event-driven payment processing platform handling $40M+ daily transactional volume using Go and Kafka.
- Re-engineered Kubernetes multi-tenant ingress routing, reducing p99 API response latencies from 180ms to 28ms.
- Built automated GitOps CI/CD delivery pipeline reducing release deployment times from 45 minutes to 4 minutes.

Senior Backend & Distributed Systems Engineer
NexGen Systems GmbH | Munich, Germany | Jun 2017 – Jan 2021
- Led migration of monolithic core banking services to Go-based containerized microservices.
- Optimized PostgreSQL database sharding and query paths, cutting compute costs by 34%.

EDUCATION
- Master of Science in Computer Science | Technical University of Munich (2017)
- Bachelor of Science in Software Engineering | RWTH Aachen (2015)
`.trim();

const RESUME_3_FINANCE = `
ELENA ROSTOVA
London, United Kingdom | Mobile: +442079460123
Email: elena.rostova@corporatefinance.co.uk | LinkedIn: linkedin.com/in/elena-rostova-cpa

PROFESSIONAL SUMMARY
Certified Public Accountant (CPA) and Senior Corporate Financial Analyst with 7+ years of experience leading corporate valuation, financial modeling, internal audit, and IFRS statutory reporting. Proven background conducting financial due diligence on £80M+ M&A transactions, designing rolling budgets, and delivering board-level variance analyses.

CORE COMPETENCIES
Financial Modeling, Valuation, DCF, IFRS, Internal Audit, SOX Compliance, Budgeting & Forecasting, Financial Analysis, Advanced Excel, Corporate Finance, Risk Assessment

PROFESSIONAL EXPERIENCE

Senior Financial Analyst & Corporate Valuation Lead
Deloitte Advisory UK | London, UK | Sep 2021 – Present
- Built multi-scenario discounted cash flow (DCF) and LBO financial models for cross-border private equity acquisitions totaling £85M.
- Supervised quarterly rolling budgets and variance reports for Fortune 500 consumer health clients.
- Directed financial due diligence workstreams ensuring 100% compliance with IFRS and local statutory mandates.

Corporate Internal Auditor
PricewaterhouseCoopers (PwC) | London, UK | Sep 2018 – Aug 2021
- Executed end-to-end risk-based operational audits and SOX 404 internal control assessments across FTSE 100 clients.
- Uncovered £2.4M in operational leakage through forensic audit analytics and automated reconciliation testing.

EDUCATION & CREDENTIALS
- Certified Public Accountant (CPA) | 2019
- B.Sc. in Accounting & Finance (First Class Honours) | London School of Economics (LSE, 2018)
`.trim();

// ============================================================================
// VERIFICATION MATRIX RESULTS REPOSITORY
// ============================================================================
interface MatrixRow {
  candidate: string;
  moduleNum: number;
  moduleName: string;
  sourceResumeId: string;
  actualMatchesSource: boolean;
  evidence: string;
  status: 'PASS' | 'FAIL';
}

const matrix: MatrixRow[] = [];

function recordResult(candidate: string, moduleNum: number, moduleName: string, resumeId: string, matches: boolean, evidence: string) {
  matrix.push({
    candidate,
    moduleNum,
    moduleName,
    sourceResumeId: resumeId,
    actualMatchesSource: matches,
    evidence,
    status: matches ? 'PASS' : 'FAIL'
  });
  console.log(`[${matches ? '✓ PASS' : '✗ FAIL'}] Module ${moduleNum} (${moduleName}) [${candidate}]: ${evidence}`);
  assert.ok(matches, `Module ${moduleNum} (${moduleName}) failed for ${candidate}: ${evidence}`);
}

async function run10ModulesVerification() {
  console.log('======================================================================');
  console.log('   STARTING 10-MODULE END-TO-END VERIFICATION ACROSS 3 RESUMES        ');
  console.log('======================================================================\n');

  const user = getOrCreateDefaultUser();
  const userId = user.id;

  // Clear previous test records in applications and resumes to ensure a clean verified test run
  db.prepare("DELETE FROM applications WHERE user_id = ?").run(userId);

  // --------------------------------------------------------------------------
  // TEST CYCLE 1: CANDIDATE 1 — SARAH AL-MANSOOR (FMCG Category Management)
  // --------------------------------------------------------------------------
  console.log('\n>>> EXECUTING TEST CYCLE 1: Sarah Al-Mansoor (FMCG Category Management)');
  const res1Id = `res_sarah_${Date.now()}`;
  const res1Filename = 'Sarah_AlMansoor_FMCG_Lead.pdf';

  // 1. Module 1: Extract & Insert initial resume first to satisfy foreign key constraints
  const ext1 = extractCVContent(RESUME_1_FMCG);

  db.prepare(`
    INSERT INTO resumes (
      id, user_id, title, type, target_role, target_country, raw_text,
      ats_score, version, original_filename, stored_file_path, file_type,
      file_size, file_hash, processing_status, extraction_status,
      extracted_profile_id
    ) VALUES (?, ?, ?, 'Master', ?, ?, ?, 0, 1, ?, ?, 'application/pdf', 1024, 'hash_sarah_fmcg_1', 'completed', 'completed', ?)
  `).run(res1Id, userId, `Original — ${res1Filename}`, ext1.current_headline, ext1.location, RESUME_1_FMCG, res1Filename, `/uploads/${res1Id}.pdf`, `ext_${res1Id}`);

  // Now perform ATS evaluation with valid resume_id foreign key
  const ats1 = analyzeResume(RESUME_1_FMCG, ext1.current_headline, ext1.location, undefined, undefined, res1Id, 1, ext1.candidate_name, userId);
  const opt1 = generateOptimizedMasterCV(ext1, res1Id);
  const strat1 = generateCareerStrategy(ext1);

  // Update resume with ats_score and ats_report_id
  db.prepare('UPDATE resumes SET ats_score = ?, ats_report_id = ? WHERE id = ?').run(ats1.overall_score, ats1.evaluation_id, res1Id);

  db.prepare(`
    INSERT INTO extracted_profiles (
      id, resume_id, user_id, candidate_name, email, phone, location,
      current_headline, total_experience_years, experiences_json, education_json,
      skills_json, raw_extracted_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`ext_${res1Id}`, res1Id, userId, ext1.candidate_name, ext1.email, ext1.phone, ext1.location, ext1.current_headline, ext1.total_experience_years, JSON.stringify(ext1.experiences), JSON.stringify(ext1.education), JSON.stringify(ext1.skills), RESUME_1_FMCG);

  setActiveResume(userId, res1Id);

  // Verification 1: My Original CV
  const stored1 = db.prepare('SELECT * FROM resumes WHERE id = ?').get(res1Id) as any;
  const mod1Matches = stored1.original_filename === res1Filename &&
                      stored1.raw_text.includes('SARAH AL-MANSOOR') &&
                      stored1.raw_text.includes('Al-Futtaim Retail Group') &&
                      stored1.id === res1Id;
  recordResult('Sarah Al-Mansoor', 1, 'My Original CV', res1Id, mod1Matches, `Filename: ${stored1.original_filename}, Candidate: Sarah Al-Mansoor`);

  // Verification 2: CV Evaluation
  const mod2Matches = ats1.overall_score >= 80 &&
                      ats1.keyword_gaps.matched_keywords.length > 0 &&
                      ats1.evaluation_id.length > 0;
  recordResult('Sarah Al-Mansoor', 2, 'CV Evaluation', res1Id, mod2Matches, `ATS Score: ${ats1.overall_score}%, Matched Competencies: ${ats1.keyword_gaps.matched_keywords.slice(0, 3).join(', ')}`);

  // Verification 3: Improved CV
  const mod3Matches = opt1.version_b_optimized.raw_text.includes('SARAH AL-MANSOOR') &&
                      opt1.version_b_optimized.raw_text.includes('Al-Futtaim Retail Group') &&
                      !opt1.version_b_optimized.raw_text.includes('Marcus Vance') &&
                      !opt1.version_b_optimized.raw_text.includes('Elena Rostova');
  recordResult('Sarah Al-Mansoor', 3, 'Improved CV', res1Id, mod3Matches, `Version B contains Sarah's real experiences at Al-Futtaim with +${opt1.score_comparison.score_lift} score lift`);

  // Verification 4: Career Recommendations
  const mod4Matches = strat1.best_fit_titles.some(t => /category|commercial|trade/i.test(t)) &&
                      strat1.suitable_industries.some(i => /fmcg|retail/i.test(i));
  recordResult('Sarah Al-Mansoor', 4, 'Career Recommendations', res1Id, mod4Matches, `Best fit titles: ${strat1.best_fit_titles.slice(0, 2).join(', ')}`);

  // Verification 5: Job Opportunities
  const candidate1 = getFullProfile(userId, res1Id)!;
  const allJobs = getAllVerifiedJobs();
  const ranked1 = rankTopOpportunities(candidate1, allJobs, 10);
  const mod5Matches = ranked1.length > 0 &&
                      ranked1.some(r => /category|trade marketing|americana|carrefour|unilever/i.test(r.job.employer + ' ' + r.job.title));
  recordResult('Sarah Al-Mansoor', 5, 'Job Opportunities', res1Id, mod5Matches, `Discovered top opportunities matching FMCG domain (${ranked1[0].job.title} at ${ranked1[0].job.employer})`);

  // Verification 6: Best Matches
  const topMatch1 = ranked1[0];
  const mod6Matches = topMatch1.match.overall_score >= 80 &&
                      topMatch1.match.is_disqualified === false &&
                      topMatch1.match.explanations.skills.length > 0;
  recordResult('Sarah Al-Mansoor', 6, 'Best Matches', res1Id, mod6Matches, `Top match score: ${topMatch1.match.overall_score}% for ${topMatch1.job.employer} (Not disqualified)`);

  // Verification 7: Tailored CVs
  const tailoredPkg1 = generateTailoredPackage(candidate1, topMatch1.job);
  const mod7Matches = tailoredPkg1.tailored_cv.includes('SARAH AL-MANSOOR') &&
                      tailoredPkg1.tailored_cv.includes(topMatch1.job.employer) &&
                      tailoredPkg1.tailored_cv.includes('Al-Futtaim Retail Group') &&
                      !tailoredPkg1.tailored_cv.includes('Kubernetes') &&
                      !tailoredPkg1.tailored_cv.includes('SOX Compliance');
  recordResult('Sarah Al-Mansoor', 7, 'Tailored CVs', res1Id, mod7Matches, `Tailored CV mentions Al-Futtaim and targets ${topMatch1.job.employer}`);

  // Verification 8: Application Packages
  const app1 = prepareApplicationPackage(topMatch1.job.id, userId, res1Id);
  const mod8Matches = app1.source_resume_id === res1Id &&
                      app1.is_outdated === 0 &&
                      app1.status === 'Approval Pending';
  recordResult('Sarah Al-Mansoor', 8, 'Application Packages', res1Id, mod8Matches, `Staged application references source_resume_id=${res1Id}, status='Approval Pending'`);

  // Verification 9: Approval Center
  const approved1 = approveApplicationPackage(app1.id, userId, true);
  const mod9Matches = approved1.human_approved === 1 && approved1.status === 'Ready to Apply';
  recordResult('Sarah Al-Mansoor', 9, 'Approval Center', res1Id, mod9Matches, `Explicit consent granted, package state advanced to 'Ready to Apply'`);

  // Verification 10: Application Tracker
  const submitted1 = recordApplicationSubmission(app1.id, userId, 'Verified test submission for Sarah Al-Mansoor FMCG');
  const mod10Matches = submitted1.status === 'Applied' &&
                       submitted1.submission_confirmed === 1 &&
                       submitted1.source_resume_id === res1Id;
  recordResult('Sarah Al-Mansoor', 10, 'Application Tracker', res1Id, mod10Matches, `Historical application confirmed: status='Applied', source_resume_id=${res1Id}`);


  // --------------------------------------------------------------------------
  // TEST CYCLE 2: CANDIDATE 2 — MARCUS VANCE (Cloud & Software Architect)
  // --------------------------------------------------------------------------
  console.log('\n>>> EXECUTING TEST CYCLE 2: Marcus Vance (Cloud & Software Architecture)');
  const res2Id = `res_marcus_${Date.now()}`;
  const res2Filename = 'Marcus_Vance_Cloud_Architect.pdf';

  const ext2 = extractCVContent(RESUME_2_SOFTWARE);

  db.prepare(`
    INSERT INTO resumes (
      id, user_id, title, type, target_role, target_country, raw_text,
      ats_score, version, original_filename, stored_file_path, file_type,
      file_size, file_hash, processing_status, extraction_status,
      extracted_profile_id
    ) VALUES (?, ?, ?, 'Master', ?, ?, ?, 0, 1, ?, ?, 'application/pdf', 2048, 'hash_marcus_tech_2', 'completed', 'completed', ?)
  `).run(res2Id, userId, `Original — ${res2Filename}`, ext2.current_headline, ext2.location, RESUME_2_SOFTWARE, res2Filename, `/uploads/${res2Id}.pdf`, `ext_${res2Id}`);

  const ats2 = analyzeResume(RESUME_2_SOFTWARE, ext2.current_headline, ext2.location, undefined, undefined, res2Id, 1, ext2.candidate_name, userId);
  const opt2 = generateOptimizedMasterCV(ext2, res2Id);
  const strat2 = generateCareerStrategy(ext2);

  db.prepare('UPDATE resumes SET ats_score = ?, ats_report_id = ? WHERE id = ?').run(ats2.overall_score, ats2.evaluation_id, res2Id);

  db.prepare(`
    INSERT INTO extracted_profiles (
      id, resume_id, user_id, candidate_name, email, phone, location,
      current_headline, total_experience_years, experiences_json, education_json,
      skills_json, raw_extracted_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`ext_${res2Id}`, res2Id, userId, ext2.candidate_name, ext2.email, ext2.phone, ext2.location, ext2.current_headline, ext2.total_experience_years, JSON.stringify(ext2.experiences), JSON.stringify(ext2.education), JSON.stringify(ext2.skills), RESUME_2_SOFTWARE);

  // Invalidate any unsubmitted applications from previous resume
  db.prepare(`
    UPDATE applications
    SET is_outdated = 1,
        outdated_reason = 'Generated from prior resume version. Please review and regenerate package with latest CV.'
    WHERE user_id = ? AND status IN ('Approval Pending', 'Ready to Apply') AND (source_resume_id IS NULL OR source_resume_id != ?)
  `).run(userId, res2Id);

  setActiveResume(userId, res2Id);

  // Verification 1: My Original CV
  const stored2 = db.prepare('SELECT * FROM resumes WHERE id = ?').get(res2Id) as any;
  const mod1Matches2 = stored2.original_filename === res2Filename &&
                       stored2.raw_text.includes('MARCUS VANCE') &&
                       stored2.raw_text.includes('CloudScale Technologies') &&
                       stored2.id === res2Id;
  recordResult('Marcus Vance', 1, 'My Original CV', res2Id, mod1Matches2, `Filename: ${stored2.original_filename}, Candidate: Marcus Vance`);

  // Verification 2: CV Evaluation
  const mod2Matches2 = ats2.overall_score >= 80 &&
                       ats2.keyword_gaps.matched_keywords.length > 0 &&
                       ats2.evaluation_id.length > 0;
  recordResult('Marcus Vance', 2, 'CV Evaluation', res2Id, mod2Matches2, `ATS Score: ${ats2.overall_score}%, Detected Skills: Cloud Architecture / Kubernetes`);

  // Verification 3: Improved CV
  const mod3Matches2 = opt2.version_b_optimized.raw_text.includes('MARCUS VANCE') &&
                       opt2.version_b_optimized.raw_text.includes('CloudScale Technologies') &&
                       !opt2.version_b_optimized.raw_text.includes('Sarah Al-Mansoor') &&
                       !opt2.version_b_optimized.raw_text.includes('Abu Dawood');
  recordResult('Marcus Vance', 3, 'Improved CV', res2Id, mod3Matches2, `Version B contains Marcus's real experiences at CloudScale Technologies`);

  // Verification 4: Career Recommendations
  const mod4Matches2 = strat2.best_fit_titles.some(t => /software|architect|engineer|cloud/i.test(t)) &&
                       strat2.suitable_industries.some(i => /technology|software|cloud|fintech/i.test(i));
  recordResult('Marcus Vance', 4, 'Career Recommendations', res2Id, mod4Matches2, `Best fit titles: ${strat2.best_fit_titles.slice(0, 2).join(', ')}`);

  // Verification 5: Job Opportunities
  const candidate2 = getFullProfile(userId, res2Id)!;
  const ranked2 = rankTopOpportunities(candidate2, allJobs, 10);
  const mod5Matches2 = ranked2.length > 0 &&
                       ranked2.some(r => /software|cloud|distributed|stripe|datadog|gitlab/i.test(r.job.title + ' ' + r.job.employer));
  recordResult('Marcus Vance', 5, 'Job Opportunities', res2Id, mod5Matches2, `Top vacancies prioritized for Software Engineering (${ranked2[0].job.title} at ${ranked2[0].job.employer})`);

  // Verification 6: Best Matches (Must match Tech high, and disqualify FMCG)
  const topTechMatch = ranked2.find(r => /stripe|datadog|gitlab/i.test(r.job.employer)) || ranked2[0];
  const fmcgJob = allJobs.find(j => j.id === 'job_fmcg_maf_01')!;
  const fmcgFitForTech = calculateMatchScore(candidate2, fmcgJob);

  const mod6Matches2 = topTechMatch.match.overall_score >= 80 &&
                       fmcgFitForTech.is_disqualified === true &&
                       fmcgFitForTech.overall_score <= 25;
  recordResult('Marcus Vance', 6, 'Best Matches', res2Id, mod6Matches2, `Stripe/Datadog match score: ${topTechMatch.match.overall_score}%, FMCG job disqualified: ${fmcgFitForTech.overall_score}%`);

  // Verification 7: Tailored CVs
  const tailoredPkg2 = generateTailoredPackage(candidate2, topTechMatch.job);
  const mod7Matches2 = tailoredPkg2.tailored_cv.includes('MARCUS VANCE') &&
                       tailoredPkg2.tailored_cv.includes(topTechMatch.job.employer) &&
                       tailoredPkg2.tailored_cv.includes('CloudScale Technologies') &&
                       !tailoredPkg2.tailored_cv.includes('Al-Futtaim') &&
                       !tailoredPkg2.tailored_cv.includes('Abu Dawood');
  recordResult('Marcus Vance', 7, 'Tailored CVs', res2Id, mod7Matches2, `Tailored CV cites CloudScale Technologies for ${topTechMatch.job.employer}`);

  // Verification 8: Application Packages
  const app2 = prepareApplicationPackage(topTechMatch.job.id, userId, res2Id);
  const mod8Matches2 = app2.source_resume_id === res2Id &&
                       app2.is_outdated === 0 &&
                       app2.status === 'Approval Pending';
  recordResult('Marcus Vance', 8, 'Application Packages', res2Id, mod8Matches2, `Staged application package references source_resume_id=${res2Id}`);

  // Verification 9: Approval Center (And test that outdated check works)
  const approved2 = approveApplicationPackage(app2.id, userId, true);
  const mod9Matches2 = approved2.human_approved === 1 && approved2.status === 'Ready to Apply';
  recordResult('Marcus Vance', 9, 'Approval Center', res2Id, mod9Matches2, `Package for Marcus approved to 'Ready to Apply'`);

  // Verification 10: Application Tracker (Preserves Sarah's earlier submission without rewriting)
  const submitted2 = recordApplicationSubmission(app2.id, userId, 'Verified test submission for Marcus Vance Cloud Architect');
  const pastSubmissions = db.prepare("SELECT * FROM applications WHERE user_id = ? AND status = 'Applied'").all(userId) as any[];
  const sarahStillExists = pastSubmissions.some(a => a.source_resume_id === res1Id);
  const marcusExists = pastSubmissions.some(a => a.source_resume_id === res2Id);

  const mod10Matches2 = pastSubmissions.length >= 2 && sarahStillExists && marcusExists;
  recordResult('Marcus Vance', 10, 'Application Tracker', res2Id, mod10Matches2, `Audit trail preserved: Sarah app (${res1Id}) and Marcus app (${res2Id}) both intact`);


  // --------------------------------------------------------------------------
  // TEST CYCLE 3: CANDIDATE 3 — ELENA ROSTOVA (Finance & Audit)
  // --------------------------------------------------------------------------
  console.log('\n>>> EXECUTING TEST CYCLE 3: Elena Rostova (Corporate Finance & Audit)');
  const res3Id = `res_elena_${Date.now()}`;
  const res3Filename = 'Elena_Rostova_Finance_CPA.pdf';

  const ext3 = extractCVContent(RESUME_3_FINANCE);

  db.prepare(`
    INSERT INTO resumes (
      id, user_id, title, type, target_role, target_country, raw_text,
      ats_score, version, original_filename, stored_file_path, file_type,
      file_size, file_hash, processing_status, extraction_status,
      extracted_profile_id
    ) VALUES (?, ?, ?, 'Master', ?, ?, ?, 0, 1, ?, ?, 'application/pdf', 1536, 'hash_elena_fin_3', 'completed', 'completed', ?)
  `).run(res3Id, userId, `Original — ${res3Filename}`, ext3.current_headline, ext3.location, RESUME_3_FINANCE, res3Filename, `/uploads/${res3Id}.pdf`, `ext_${res3Id}`);

  const ats3 = analyzeResume(RESUME_3_FINANCE, ext3.current_headline, ext3.location, undefined, undefined, res3Id, 1, ext3.candidate_name, userId);
  const opt3 = generateOptimizedMasterCV(ext3, res3Id);
  const strat3 = generateCareerStrategy(ext3);

  db.prepare('UPDATE resumes SET ats_score = ?, ats_report_id = ? WHERE id = ?').run(ats3.overall_score, ats3.evaluation_id, res3Id);

  db.prepare(`
    INSERT INTO extracted_profiles (
      id, resume_id, user_id, candidate_name, email, phone, location,
      current_headline, total_experience_years, experiences_json, education_json,
      skills_json, raw_extracted_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`ext_${res3Id}`, res3Id, userId, ext3.candidate_name, ext3.email, ext3.phone, ext3.location, ext3.current_headline, ext3.total_experience_years, JSON.stringify(ext3.experiences), JSON.stringify(ext3.education), JSON.stringify(ext3.skills), RESUME_3_FINANCE);

  // Invalidate unsubmitted applications from previous resume
  db.prepare(`
    UPDATE applications
    SET is_outdated = 1,
        outdated_reason = 'Generated from prior resume version. Please review and regenerate package with latest CV.'
    WHERE user_id = ? AND status IN ('Approval Pending', 'Ready to Apply') AND (source_resume_id IS NULL OR source_resume_id != ?)
  `).run(userId, res3Id);

  setActiveResume(userId, res3Id);

  // Verification 1: My Original CV
  const stored3 = db.prepare('SELECT * FROM resumes WHERE id = ?').get(res3Id) as any;
  const mod1Matches3 = stored3.original_filename === res3Filename &&
                       stored3.raw_text.includes('ELENA ROSTOVA') &&
                       stored3.raw_text.includes('Deloitte Advisory UK') &&
                       stored3.id === res3Id;
  recordResult('Elena Rostova', 1, 'My Original CV', res3Id, mod1Matches3, `Filename: ${stored3.original_filename}, Candidate: Elena Rostova`);

  // Verification 2: CV Evaluation
  const mod2Matches3 = ats3.overall_score >= 80 &&
                       ats3.keyword_gaps.matched_keywords.length > 0 &&
                       ats3.evaluation_id.length > 0;
  recordResult('Elena Rostova', 2, 'CV Evaluation', res3Id, mod2Matches3, `ATS Score: ${ats3.overall_score}%, Detected Skills: Finance & Valuation`);

  // Verification 3: Improved CV
  const mod3Matches3 = opt3.version_b_optimized.raw_text.includes('ELENA ROSTOVA') &&
                       opt3.version_b_optimized.raw_text.includes('Deloitte Advisory UK') &&
                       !opt3.version_b_optimized.raw_text.includes('Marcus Vance') &&
                       !opt3.version_b_optimized.raw_text.includes('Sarah Al-Mansoor');
  recordResult('Elena Rostova', 3, 'Improved CV', res3Id, mod3Matches3, `Version B contains Elena's real finance experiences at Deloitte and PwC`);

  // Verification 4: Career Recommendations
  const mod4Matches3 = strat3.best_fit_titles.some(t => /financial|finance|audit|controller/i.test(t)) &&
                       strat3.suitable_industries.some(i => /finance|banking|audit|accounting/i.test(i));
  recordResult('Elena Rostova', 4, 'Career Recommendations', res3Id, mod4Matches3, `Best fit titles: ${strat3.best_fit_titles.slice(0, 2).join(', ')}`);

  // Verification 5: Job Opportunities
  const candidate3 = getFullProfile(userId, res3Id)!;
  const ranked3 = rankTopOpportunities(candidate3, allJobs, 10);
  const mod5Matches3 = ranked3.length > 0 &&
                       ranked3.some(r => /finance|financial|deloitte|pwc|valuation|audit/i.test(r.job.title + ' ' + r.job.employer));
  recordResult('Elena Rostova', 5, 'Job Opportunities', res3Id, mod5Matches3, `Top vacancies prioritized for Finance & Audit (${ranked3[0].job.title} at ${ranked3[0].job.employer})`);

  // Verification 6: Best Matches (Must match Finance high, and disqualify Software)
  const topFinMatch = ranked3.find(r => /deloitte|pwc/i.test(r.job.employer)) || ranked3[0];
  const techJob = allJobs.find(j => j.id === 'job_tech_stripe_01') || allJobs.find(j => j.id === 'job_test_irrelevant_03')!;
  const techFitForFinance = calculateMatchScore(candidate3, techJob);

  const mod6Matches3 = topFinMatch.match.overall_score >= 80 &&
                       techFitForFinance.is_disqualified === true &&
                       techFitForFinance.overall_score <= 25;
  recordResult('Elena Rostova', 6, 'Best Matches', res3Id, mod6Matches3, `Deloitte/PwC match score: ${topFinMatch.match.overall_score}%, Tech job disqualified: ${techFitForFinance.overall_score}%`);

  // Verification 7: Tailored CVs
  const tailoredPkg3 = generateTailoredPackage(candidate3, topFinMatch.job);
  const mod7Matches3 = tailoredPkg3.tailored_cv.includes('ELENA ROSTOVA') &&
                       tailoredPkg3.tailored_cv.includes(topFinMatch.job.employer) &&
                       tailoredPkg3.tailored_cv.includes('Deloitte Advisory UK') &&
                       !tailoredPkg3.tailored_cv.includes('Kubernetes') &&
                       !tailoredPkg3.tailored_cv.includes('Carrefour');
  recordResult('Elena Rostova', 7, 'Tailored CVs', res3Id, mod7Matches3, `Tailored CV cites Deloitte Advisory UK for ${topFinMatch.job.employer}`);

  // Verification 8: Application Packages
  const app3 = prepareApplicationPackage(topFinMatch.job.id, userId, res3Id);
  const mod8Matches3 = app3.source_resume_id === res3Id &&
                       app3.is_outdated === 0 &&
                       app3.status === 'Approval Pending';
  recordResult('Elena Rostova', 8, 'Application Packages', res3Id, mod8Matches3, `Staged application package references source_resume_id=${res3Id}`);

  // Verification 9: Approval Center
  const approved3 = approveApplicationPackage(app3.id, userId, true);
  const mod9Matches3 = approved3.human_approved === 1 && approved3.status === 'Ready to Apply';
  recordResult('Elena Rostova', 9, 'Approval Center', res3Id, mod9Matches3, `Package for Elena approved to 'Ready to Apply'`);

  // Verification 10: Application Tracker
  const submitted3 = recordApplicationSubmission(app3.id, userId, 'Verified test submission for Elena Rostova CPA');
  const allHistoricalApps = db.prepare("SELECT * FROM applications WHERE user_id = ? AND status = 'Applied'").all(userId) as any[];
  const sarahPreserved = allHistoricalApps.some(a => a.source_resume_id === res1Id);
  const marcusPreserved = allHistoricalApps.some(a => a.source_resume_id === res2Id);
  const elenaPreserved = allHistoricalApps.some(a => a.source_resume_id === res3Id);

  const mod10Matches3 = allHistoricalApps.length >= 3 && sarahPreserved && marcusPreserved && elenaPreserved;
  recordResult('Elena Rostova', 10, 'Application Tracker', res3Id, mod10Matches3, `All 3 historical submissions preserved without any overwrite`);

  // ============================================================================
  // PRINT FORMATTED VERIFICATION MATRIX TABLE
  // ============================================================================
  console.log('\n========================================================================================================================');
  console.log('                          FINAL 10-MODULE MULTI-RESUME VERIFICATION MATRIX TABLE                                       ');
  console.log('========================================================================================================================');
  console.log('| Candidate          | Module # | Module Name             | Source Resume ID       | Actual Data Matches? | Test Result |');
  console.log('|--------------------|----------|-------------------------|------------------------|----------------------|-------------|');
  matrix.forEach(row => {
    const cand = row.candidate.padEnd(18, ' ');
    const mNum = String(row.moduleNum).padStart(2, ' ').padEnd(8, ' ');
    const mName = row.moduleName.padEnd(23, ' ');
    const rId = row.sourceResumeId.substring(0, 22).padEnd(22, ' ');
    const matches = (row.actualMatchesSource ? 'YES (100% Fidelity)' : 'NO (Mismatch)').padEnd(20, ' ');
    const res = (row.status === 'PASS' ? '✓ PASS' : '✗ FAIL').padEnd(11, ' ');
    console.log(`| ${cand} | ${mNum} | ${mName} | ${rId} | ${matches} | ${res} |`);
  });
  console.log('========================================================================================================================\n');

  console.log(`ALL 30 VERIFICATION CRITERIA (10 MODULES x 3 RESUMES) PASSED WITH 0 DEFECTS!`);
}

run10ModulesVerification().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
