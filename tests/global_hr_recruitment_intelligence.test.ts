import { analyzeResume } from '../lib/ai/ats-analyzer';
import { getCVEvaluations, getCVEvaluationById } from '../lib/db';

console.log('========================================================================');
console.log('--- RUNNING SENIOR GLOBAL HR & RECRUITMENT INTELLIGENCE SYSTEM TEST ---');
console.log('========================================================================');

const AYA_HAMOUDA_CV = `
AYA HAMOUDA MAHMOUD ALI
Nasr City, Cairo, Egypt | Mobile: +201042400410
Ayahamouda14@gmail.com | linkedin.com/in/aya-h-mahmoud14

PROFESSIONAL SUMMARY
Category & Trade Marketing professional with 10+ years of experience across FMCG, Personal Care, E-commerce, and Pharmaceuticals. Experienced in managing consumer categories, optimizing assortments, analyzing market and competitor trends, developing promotional plans, and driving category growth.

CORE COMPETENCIES
Category Management | Personal Care & FMCG | Product & Portfolio Management | Assortment Optimization
Market & Competitor Analysis | Consumer & Shopper Insights | Pricing & Promotion Strategy
Supplier & Distributor Management | Demand Planning | Forecasting | Inventory & Availability Management
Trade Marketing | ROI Analysis | Planograms & Merchandising
Tools: Advanced Excel | Power BI | SAP | Salesforce Commerce Cloud

PROFESSIONAL EXPERIENCE
Commercial Manager – Sulinda Pharmaceutical | KSA & Gulf Region | Apr 2025 – Present
• Delivered 30% sales growth in 6 months through distributor performance improvement, pricing optimization, and stock rotation.
• Led sales forecasting, replenishment planning, and availability initiatives across KSA distributor channels.

Brand Development Manager – Arab Otsuka Nutraceuticals | Dubai, UAE | Sep 2023 – Apr 2025
• Expanded regional distribution by 20% across Oman and Bahrain through strategic distributor onboarding and trade activation.

FMCG Category Manager – Abu Dawood Group | Cairo, Egypt | Dec 2021 – Sep 2023
• Managed Personal Care / Beauty & Grooming categories, delivering 40% YoY category growth through optimized assortments, retailer-specific JBPs, and promotional calendars.
• Delivered 20%+ ROI on retail promotional investments.

EDUCATION
MBA – Marketing & Innovation | German University in Cairo | 2023 – Ongoing
B.Sc. Microbiology & Immunology | Port Said University | 2013

LANGUAGES
Arabic – Native | English – Fluent (C1)
`.trim();

async function runTests() {
  // Test 1: Full Evaluation Execution
  console.log('\n>>> [TEST 1] Running Senior Global HR Evaluation for UAE Market...');
  const result = analyzeResume(AYA_HAMOUDA_CV, 'Category Manager', 'United Arab Emirates');

  // Verify Primary Scores on 1–10 Scale
  console.log(`  ✓ Human Recruiter Score: ${result.human_recruiter_score_10} / 10`);
  console.log(`  ✓ ATS Compatibility Score: ${result.ats_compatibility_score_10} / 10`);
  if (result.human_recruiter_score_10 < 1 || result.human_recruiter_score_10 > 10) {
    throw new Error(`Invalid Human Recruiter Score: ${result.human_recruiter_score_10}`);
  }
  if (result.ats_compatibility_score_10 < 1 || result.ats_compatibility_score_10 > 10) {
    throw new Error(`Invalid ATS Compatibility Score: ${result.ats_compatibility_score_10}`);
  }

  // Test 2: Step 1 — Human Recruiter Review Breakdown
  console.log('\n>>> [TEST 2] Verifying Human Recruiter 5-Criterion Breakdown...');
  const hr = result.human_recruiter_review;
  console.log(`  ✓ Format & Structure: ${hr.format_and_structure.score} / 10 (${hr.format_and_structure.layout_clarity})`);
  console.log(`  ✓ Content Relevance: ${hr.content_relevance.score} / 10 (${hr.content_relevance.target_alignment})`);
  console.log(`  ✓ Language & Tone: ${hr.language_and_tone.score} / 10 (${hr.language_and_tone.action_verbs_count} action verbs)`);
  console.log(`  ✓ Achievements & Impact: ${hr.achievements_and_impact.score} / 10`);
  console.log(`  ✓ Overall Recruiter Impact: ${hr.overall_recruiter_impact.score} / 10 (Verdict: ${hr.overall_recruiter_impact.shortlisting_verdict})`);

  if (!hr.achievements_and_impact.missing_metrics_to_request.length) {
    throw new Error('Expected missing budget/SKU metrics to be explicitly flagged for candidate confirmation');
  }
  console.log(`  ✓ Zero-Fabrication Metric Requests: ${hr.achievements_and_impact.missing_metrics_to_request.length} metrics identified to request`);

  // Test 3: Step 2 — ATS Compliance Review
  console.log('\n>>> [TEST 3] Verifying ATS Machine Compliance Review...');
  const ats = result.ats_compliance_review;
  console.log(`  ✓ Keyword Alignment: ${ats.keyword_alignment.score} / 10`);
  console.log(`  ✓ Parsing Compatibility: ${ats.parsing_compatibility.score} / 10 (Single column safe: ${ats.parsing_compatibility.single_column_safe})`);
  console.log(`  ✓ Section Completeness: ${ats.section_completeness.score} / 10 (Detected: ${ats.section_completeness.sections_found.join(', ')})`);
  if (!ats.parsing_compatibility.file_format_safe) {
    throw new Error('Expected parsing to be file format safe');
  }

  // Test 4: Step 3 — Localization & Anti-Bias for Multiple Markets
  console.log('\n>>> [TEST 4] Verifying Localization & Anti-Bias across US vs Germany vs UAE...');
  const uaeLoc = result.localization_market_fit;
  console.log(`  ✓ UAE: Photo status = "${uaeLoc.photo_convention.status}", Recommended Length = "${uaeLoc.recommended_length}"`);

  const usResult = analyzeResume(AYA_HAMOUDA_CV, 'Category Manager', 'United States');
  const usLoc = usResult.localization_market_fit;
  console.log(`  ✓ US: Photo status = "${usLoc.photo_convention.status}" (EEOC compliant: ${usLoc.photo_convention.status === 'Strictly Prohibited'})`);
  if (usLoc.photo_convention.status !== 'Strictly Prohibited') {
    throw new Error('US localization must mandate photos as Strictly Prohibited due to Title VII / EEOC');
  }

  const deResult = analyzeResume(AYA_HAMOUDA_CV, 'Category Manager', 'Germany');
  console.log(`  ✓ Germany: Photo status = "${deResult.localization_market_fit.photo_convention.status}", Date format = "${deResult.localization_market_fit.date_format_convention}"`);

  // Test 5: Step 4 — Headhunter & Recruiter Search Optimization
  console.log('\n>>> [TEST 5] Verifying Headhunter & Recruiter Search Optimization...');
  const hh = result.headhunter_search_optimization;
  console.log(`  ✓ Discoverability Score: ${hh.discoverability_score} / 10`);
  console.log(`  ✓ LinkedIn Recruiter Boolean Query: ${hh.linkedin_recruiter_boolean_strings[0]}`);
  console.log(`  ✓ Recommended Headlines Count: ${hh.linkedin_headlines.length}`);
  console.log(`  ✓ Alternative Market Titles: ${hh.alternative_titles.join(', ')}`);
  if (!hh.linkedin_about_draft.includes('Abu Dawood Group') || !hh.linkedin_about_draft.includes('Sulinda')) {
    throw new Error('LinkedIn About draft missing verified employer history');
  }

  // Test 6: Step 6 — Priority Action Plan (P1 to P7)
  console.log('\n>>> [TEST 6] Verifying Priority-Ordered Action Plan (P1 - P7)...');
  const plan = result.priority_action_plan;
  console.log(`  ✓ Total Action Items: ${plan.length}`);
  plan.forEach(item => {
    console.log(`    • [${item.priority}] ${item.title}`);
  });
  if (plan.length < 5) {
    throw new Error(`Action plan too short (${plan.length} items)`);
  }

  // Test 7: Step 7 — Tailored Resume Draft & Zero Fabrication Policy
  console.log('\n>>> [TEST 7] Verifying Tailored Resume Draft & Zero Fabrication...');
  const draft = result.tailored_resume_draft;
  console.log(`  ✓ Generated Draft Title: ${draft.cv_title}`);
  console.log(`  ✓ Version Label: ${draft.version_label}`);
  console.log(`  ✓ Highlighted Keywords: ${draft.highlighted_keywords.length}`);
  console.log(`  ✓ Bracketed Confirmation Prompts: ${draft.missing_metrics_bracketed.length}`);
  if (!draft.draft_text.includes('[Candidate confirmation needed:')) {
    throw new Error('Tailored CV must bracket missing figures rather than inventing fabricated numbers');
  }
  if (!draft.draft_text.includes('German University in Cairo') || !draft.draft_text.includes('Abu Dawood Group')) {
    throw new Error('Tailored CV corrupted candidate factual education or employment history');
  }

  // Test 8: Step 8 — Report Structure & Markdown
  console.log('\n>>> [TEST 8] Verifying Full Report Markdown Structure...');
  const rpt = result.full_report_markdown;
  if (!rpt.includes('Executive Scores Summary Table') || !rpt.includes('Human Recruiter Review') || !rpt.includes('Headhunter & Recruiter Search Optimization')) {
    throw new Error('Report markdown missing required sections');
  }
  console.log(`  ✓ Full Markdown Report Generated (${rpt.length} characters)`);

  // Test 9: Database Persistence & History Retrieval
  console.log('\n>>> [TEST 9] Verifying SQLite Persistence in cv_evaluations Table...');
  const history = getCVEvaluations('user_default_01', 5);
  console.log(`  ✓ Retrieved ${history.length} evaluation records from database`);
  if (history.length === 0) {
    throw new Error('Failed to find saved evaluation record in cv_evaluations table');
  }
  const latest = history[0];
  console.log(`  ✓ Latest Record: ID=${latest.id}, Role="${latest.target_role}", HumanScore=${latest.human_recruiter_score}, ATSScore=${latest.ats_compatibility_score}`);
  const fetched = getCVEvaluationById(latest.id);
  if (!fetched || fetched.id !== latest.id) {
    throw new Error(`Failed to fetch evaluation by ID: ${latest.id}`);
  }
  console.log(`  ✓ Successfully fetched evaluation by primary key.`);

  console.log('\n========================================================================');
  console.log('>>> ALL 9/9 SENIOR GLOBAL HR & ATS INTELLIGENCE TESTS PASSED CLEANLY! <<<');
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\nGLOBAL HR TEST FAILED:', err);
  process.exit(1);
});
