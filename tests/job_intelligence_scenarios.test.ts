import assert from 'assert';
import { execSync } from 'child_process';
import db, { getOrCreateDefaultUser } from '../lib/db';
import { getFullProfile } from '../lib/onboarding';
import { syncAndDeduplicateJobs, getAllVerifiedJobs, getJobById, VERIFIED_SOURCE_LISTINGS } from '../lib/jobs/aggregator';
import { classifyFreshness, verifyJobListing, consolidateDuplicateJobs } from '../lib/jobs/verifier';
import { evaluateJobFit, calculateMatchScore } from '../lib/jobs/matcher';
import { analyzeResume, evaluateATSParsing, evaluateATSKeywords } from '../lib/ai/ats-analyzer';
import {
  seedLinkedInIntelligence,
  getLinkedInRecruiterActivity,
  getLinkedInCompanyUpdates,
  getLinkedInIndustryInsights,
  searchLinkedInIntelligence
} from '../lib/linkedin/intelligence';
import { FullCandidateProfile, JobListing } from '../lib/types';
import { alignProfile } from '../scripts/align_profile';

// Ensure user and authentic candidate profile are provisioned in case prior tests wiped data
getOrCreateDefaultUser();
alignProfile();

const REAL_AYA_HAMOUDA_CV = `
AYA HAMOUDA MAHMOUD ALI
Nasr City, Cairo, Egypt | Mobile: +201042400410
Ayahamouda14@gmail.com | linkedin.com/in/aya-h-mahmoud14

PROFESSIONAL SUMMARY
Category & Trade Marketing professional with 10+ years of experience across FMCG, Personal Care, E-commerce, and Pharmaceuticals. Experienced in managing consumer categories, optimizing assortments, analyzing market and competitor trends, developing promotional plans, and driving category growth. Proven ability to work cross-functionally with Marketing, Sales, Supply Chain, Finance, retailers, and distributors to turn market insights into commercial opportunities and successful execution.

CORE COMPETENCIES
Category Management | Personal Care & FMCG | Product & Portfolio Management | Assortment Optimization | Market & Competitor Analysis | Consumer & Shopper Insights | Product Launch Support | Pricing & Promotion Strategy | Supplier & Distributor Management | Commercial Planning | Category Growth | Demand Planning | Forecasting | Inventory & Availability Management | Trade Marketing | Retail & E-commerce | Cross-functional Collaboration | ROI Analysis | Planogram & Merchandising
Tools: Advanced Excel | Power BI | SAP | Salesforce Commerce Cloud | CRM Platforms

PROFESSIONAL EXPERIENCE
Commercial Manager – Sulinda Pharmaceutical | KSA & Gulf Region | Apr 2025 – Present
• Delivered 30% sales growth in 6 months through distributor performance improvement, pricing optimization, and stock rotation.
• Led sales forecasting, replenishment planning, and availability initiatives across KSA distributor channels.
• Managed commercial agreements, trading terms, and promotional investments with retail partners and distributors.
• Partnered with Supply Chain and Finance to improve product availability, delivery execution, and commercial performance.

E-commerce Manager – A2Y | Cairo, Egypt | Apr 2024 – Apr 2025
• Managed assortment, pricing, and promotional planning across online retail partners and marketplaces.
• Improved product visibility and conversion through optimized assortment, catalog content, pricing, and stock management.
• Developed product pipelines and collaborated with cross-functional teams to improve the customer experience.
• Used customer and sales insights to identify opportunities for product and e-commerce performance improvement.

Brand Development Manager – Arab Otsuka Nutraceuticals | Dubai, UAE | Sep 2023 – Apr 2025
• Expanded regional distribution by 20% across Oman and Bahrain through strategic distributor onboarding and trade activation.
• Managed product sell-in targets, visibility plans, and retailer commitments across hypermarkets and pharmacies.
• Supported product and brand growth through market analysis, shopper insights, planograms, POSM, and in-store execution.
• Coordinated with distributors and internal stakeholders to improve market penetration and product availability.

FMCG Category Manager – Abu Dawood Group | Cairo, Egypt | Dec 2021 – Sep 2023
• Managed Personal Care / Beauty & Grooming categories, delivering 40% YoY category growth through optimized assortments, retailer-specific JBPs, and promotional calendars.
• Analyzed sales, market trends, competitor activity, pricing, and shelf performance to identify category growth opportunities.
• Optimized SKU assortment, product availability, and shelf placement across modern trade and traditional trade channels.
• Led forecasting, demand planning, replenishment, and stock-aging management in collaboration with Supply Chain and Sales.
• Developed and executed retailer promotions and trade activations, delivering 20%+ ROI on retail promotional investments.
• Conducted regular store audits to evaluate pricing, shelf share, competitor activity, product visibility, and planogram compliance.
• Managed sub-distributors and coordinated with retail partners to improve execution and category performance.

Assistant Trade Marketing Manager – Indomie Egypt | Dec 2020 – Dec 2021
• Executed channel-based promotional plans, visibility initiatives, and in-store activations across key retail chains.
• Used sell-out data and market activity insights to support sales and commercial planning.
• Coordinated with suppliers and internal teams to deliver promotional materials and ensure effective execution.

Medical Representative – ADG Pharma | Cairo, Egypt | Sep 2017 – Dec 2020
• Managed product portfolio communication and promotional activities to healthcare professionals, pharmacies, and clinics.
• Organized product symposiums and professional presentations to increase product awareness and adoption.

EDUCATION
Master of Business Administration (MBA) – German University in Cairo (GUC) | 2020 – 2022
Bachelor of Science (B.Sc.) in Microbiology & Immunology – Port Said University | 2012 – 2016
`.trim();

console.log('========================================================================');
console.log('--- EXECUTING CRITICAL PRODUCT UPGRADE: JOB INTELLIGENCE & ATS SUITE ---');
console.log('                 10 REALISTIC ACCEPTANCE SCENARIOS (A - J)              ');
console.log('========================================================================\n');

// Sync database and seed intelligence
syncAndDeduplicateJobs();
seedLinkedInIntelligence();

const candidate = getFullProfile();
assert(candidate, 'Candidate profile must exist for Aya Hamouda Mahmoud Ali');

// ============================================================================
// TEST A: Old Vacancy Handling
// ============================================================================
console.log('>>> [TEST A] Old Vacancy Handling (>45 days old)...');
const oldJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_old_01');
assert(oldJob, 'job_test_old_01 fixture must exist');

const oldFreshness = classifyFreshness(oldJob.publication_date);
assert.strictEqual(oldFreshness.tier, 'Archived', 'Publication date >45 days ago must be classified as Archived');
assert(oldFreshness.days && oldFreshness.days >= 80, `Days elapsed (${oldFreshness.days}) must reflect 90+ days age`);

const oldVerification = verifyJobListing(oldJob);
assert(
  oldVerification.status === 'Unverified' || oldVerification.freshness === 'Archived',
  'Old vacancy must be marked Unverified / Archived'
);
assert.strictEqual(oldJob.publication_date, '2026-08-01', 'Original publication date must remain untouched and clearly visible');
console.log(`  ✓ Old vacancy classified as '${oldFreshness.tier}' (${oldFreshness.days} days elapsed)`);
console.log(`  ✓ Original publication date [${oldJob.publication_date}] preserved and visible to user.\n`);

// ============================================================================
// TEST B: Broken Job URL Verification
// ============================================================================
console.log('>>> [TEST B] Broken Job URL Verification...');
const brokenJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_broken_02');
assert(brokenJob, 'job_test_broken_02 fixture must exist');

const brokenVer = verifyJobListing(brokenJob);
assert.strictEqual(brokenVer.status, 'Broken Link', 'Job with invalid/dead URL must have status "Broken Link"');
assert.strictEqual(brokenVer.is_verified, false, 'Broken link must never be marked verified');
assert.strictEqual(brokenVer.evidence.http_status, 404, 'Evidence must record 404 HTTP status code');
assert.strictEqual(
  brokenJob.source_url,
  'https://careers.broken-company.com/broken-link-404-role',
  'Original URL must be preserved; never replaced with a fake link'
);
console.log(`  ✓ Broken URL detected: status='${brokenVer.status}', http_status=${brokenVer.evidence.http_status}`);
console.log(`  ✓ Original URL preserved without fabricating replacements.\n`);

// ============================================================================
// TEST C: Irrelevant Job Rejection & Explanation
// ============================================================================
console.log('>>> [TEST C] Irrelevant Job Rejection (Software Engineering vs Commercial Track)...');
const techJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_irrelevant_03');
assert(techJob, 'job_test_irrelevant_03 fixture must exist');

const techFit = evaluateJobFit(candidate, techJob);
assert.strictEqual(techFit.is_disqualified, true, 'Software Engineering role must trigger is_disqualified=true');
assert(
  techFit.overall_score < 30,
  `Disqualified role must be capped strictly below 30% (actual: ${techFit.overall_score}%)`
);
assert(
  techFit.disqualification_reason && techFit.disqualification_reason.includes('Software Engineering'),
  'Disqualification reason must clearly explain mismatch with software engineering'
);
assert.strictEqual(techFit.fit_level, 'Low Fit / Mismatched', 'Fit level must be Low Fit / Mismatched');
console.log(`  ✓ Irrelevant tech role disqualified: score=${techFit.overall_score}%, is_disqualified=${techFit.is_disqualified}`);
console.log(`  ✓ Justification: "${techFit.disqualification_reason}"\n`);

// ============================================================================
// TEST D: Highly Relevant Category Role Match
// ============================================================================
console.log('>>> [TEST D] Highly Relevant Category Role Match (Majid Al Futtaim / Carrefour)...');
const categoryJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_fmcg_maf_01');
assert(categoryJob, 'job_fmcg_maf_01 fixture must exist');

const categoryFit = evaluateJobFit(candidate, categoryJob);
assert(
  categoryFit.overall_score >= 85,
  `Category Manager role must achieve high match score >= 85% (actual: ${categoryFit.overall_score}%)`
);
assert.strictEqual(categoryFit.is_disqualified, false, 'Relevant role must not be disqualified');
assert.strictEqual(categoryFit.dimensions.industry.status, 'Strong Match', 'Industry relevance must be Strong Match');
assert.strictEqual(categoryFit.dimensions.relevant_experience.status, 'Strong Match', 'Experience must be Strong Match');
assert(categoryFit.matching_strengths.length >= 2, 'Must highlight multiple matching strengths');
console.log(`  ✓ Highly relevant Category Manager match: score=${categoryFit.overall_score}% (${categoryFit.fit_level})`);
console.log(`  ✓ Strengths: ${categoryFit.matching_strengths.join('; ')}\n`);

// ============================================================================
// TEST E: ATS Parsing vs Keyword Alignment Separation
// ============================================================================
console.log('>>> [TEST E] ATS Parsing vs Keyword Alignment Separation...');
// Test 1: Real resume has clean single-column structure and standard headers
const parsingResult = evaluateATSParsing(REAL_AYA_HAMOUDA_CV);
assert(
  parsingResult.parsing_score >= 85,
  `Parsing score for clean text resume must be >= 85% (actual: ${parsingResult.parsing_score}%)`
);
assert.strictEqual(parsingResult.layout_compatibility.has_single_column_structure, true);

// Test 2: Evaluate keyword alignment against completely unrelated requirements
const unrelatedKeywords = ['Rust', 'Solidity', 'Kubernetes Cluster Administration', 'iOS Swift Development'];
const unrelatedKeywordEval = evaluateATSKeywords(REAL_AYA_HAMOUDA_CV, unrelatedKeywords);
assert(
  unrelatedKeywordEval.score <= 20,
  `Unrelated keywords must yield low alignment score <= 20% (actual: ${unrelatedKeywordEval.score}%)`
);

// Verify that parsing score remains high even when keyword alignment is low
assert(
  parsingResult.parsing_score > 80 && unrelatedKeywordEval.score < 30,
  'ATS Parsing Score must remain independent of Keyword Alignment'
);
console.log(`  ✓ Clean CV parsing score: ${parsingResult.parsing_score}% (layout=${parsingResult.layout_compatibility.verdict})`);
console.log(`  ✓ Unrelated keyword alignment score: ${unrelatedKeywordEval.score}%`);
console.log(`  ✓ Confirmed: Parsing score is cleanly separated from keyword alignment.\n`);

// ============================================================================
// TEST F: LinkedIn Recruiter Hiring Post Processing
// ============================================================================
console.log('>>> [TEST F] LinkedIn Recruiter Hiring Post Processing...');
const recruiters = getLinkedInRecruiterActivity();
assert(recruiters.length >= 4, 'Must have at least 4 indexed recruiter hiring posts');

const ourshopeeRec = recruiters.find(r => r.company === 'Ourshopee');
assert(ourshopeeRec, 'Must find Ourshopee recruiter activity (Mansi Deo)');
assert.strictEqual(ourshopeeRec.author_name, 'Mansi Deo');
assert(ourshopeeRec.contact_instructions && ourshopeeRec.contact_instructions.includes('mansi.deo@ourshopee.com'));
assert(ourshopeeRec.post_url.includes('linkedin.com/posts/'));
console.log(`  ✓ Recruiter activity parsed: ${ourshopeeRec.author_name} (${ourshopeeRec.author_title}) at ${ourshopeeRec.company}`);
console.log(`  ✓ Contact instructions verified: "${ourshopeeRec.contact_instructions}"\n`);

// ============================================================================
// TEST G: LinkedIn Market Insight & Takeaways
// ============================================================================
console.log('>>> [TEST G] LinkedIn Market Insight & Executive Takeaways...');
const insights = getLinkedInIndustryInsights();
assert(insights.length >= 3, 'Must have at least 3 indexed LinkedIn market insights');

const jbpInsight = insights.find(i => i.topic.includes('JBP'));
assert(jbpInsight, 'Must find JBP market insight');
assert.strictEqual(jbpInsight.author_name, 'Karim Mansour');
assert(jbpInsight.insights_summary.length > 50, 'Must have detailed executive summary');
assert(jbpInsight.career_relevance.includes('Aya Hamouda') || jbpInsight.career_relevance.includes('commercial'), 'Must link insights to candidate commercial experience');
console.log(`  ✓ Industry insight verified: "${jbpInsight.title}" by ${jbpInsight.author_name}`);
console.log(`  ✓ Candidate strategic relevance: "${jbpInsight.career_relevance}"\n`);

// ============================================================================
// TEST H: Multi-Source Duplicate Consolidation
// ============================================================================
console.log('>>> [TEST H] Multi-Source Duplicate Consolidation...');
const rawListings = [
  VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_dup_04_wuzzuf')!,
  VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_dup_04_bayt')!,
  VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_dup_04_linkedin')!
];

const consolidation = consolidateDuplicateJobs(rawListings);
assert.strictEqual(consolidation.canonicalJobs.length, 1, '3 identical roles across 3 sources must merge into 1 canonical listing');
assert.strictEqual(consolidation.duplicatesCount, 2, 'Must detect exactly 2 duplicates');

const canonical = consolidation.canonicalJobs[0];
const sources = JSON.parse(canonical.sources_json || '[]');
assert.strictEqual(sources.length, 3, 'Canonical listing must contain all 3 source references in sources_json');
assert(sources.some((s: any) => s.source === 'Wuzzuf'));
assert(sources.some((s: any) => s.source === 'Bayt'));
assert(sources.some((s: any) => s.source === 'LinkedIn Jobs'));
console.log(`  ✓ Consolidated 3 listings into 1 canonical record: "${canonical.title}" at ${canonical.employer}`);
console.log(`  ✓ Preserved sources: ${sources.map((s: any) => s.source).join(', ')}\n`);

// ============================================================================
// TEST I: Missing Salary Handling ("Not Disclosed" / "Unknown")
// ============================================================================
console.log('>>> [TEST I] Missing Salary Handling ("Not Disclosed" / "Unknown")...');
const noSalaryJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_nosalary_05');
assert(noSalaryJob, 'job_test_nosalary_05 fixture must exist');

const noSalaryFit = evaluateJobFit(candidate, noSalaryJob);
assert.strictEqual(noSalaryFit.dimensions.salary.status, 'Unknown', 'Undisclosed salary must be marked Unknown');
assert(
  noSalaryFit.dimensions.salary.explanation.includes('Not Disclosed'),
  'Explanation must explicitly state Not Disclosed'
);
assert(
  noSalaryFit.overall_score >= 70,
  `Candidate must not be penalized for employer's missing salary (score: ${noSalaryFit.overall_score}%)`
);
console.log(`  ✓ Missing salary evaluated: status='${noSalaryFit.dimensions.salary.status}', score=${noSalaryFit.overall_score}%`);
console.log(`  ✓ Justification: "${noSalaryFit.dimensions.salary.explanation}"\n`);

// ============================================================================
// TEST J: Remote Location Restriction Flagging
// ============================================================================
console.log('>>> [TEST J] Remote Location Restriction Flagging...');
const restrictedJob = VERIFIED_SOURCE_LISTINGS.find(j => j.id === 'job_test_remote_restricted_06');
assert(restrictedJob, 'job_test_remote_restricted_06 fixture must exist');

const restrictedFit = evaluateJobFit(candidate, restrictedJob);
assert.strictEqual(restrictedFit.dimensions.location.status, 'Gap', 'Strict US citizenship requirement must be flagged as Gap');
assert(
  restrictedFit.dimensions.location.explanation.includes('US Citizenship') ||
  restrictedFit.dimensions.location.explanation.includes('geographic authorization restrictions'),
  'Explanation must identify geographic / citizenship restriction'
);
console.log(`  ✓ Geographic restriction flagged: status='${restrictedFit.dimensions.location.status}'`);
console.log(`  ✓ Explanation: "${restrictedFit.dimensions.location.explanation}"\n`);

console.log('========================================================================');
console.log('>>> ALL 10/10 JOB INTELLIGENCE SCENARIO TESTS (A - J) PASSED CLEANLY! <<<');
console.log('========================================================================\n');
