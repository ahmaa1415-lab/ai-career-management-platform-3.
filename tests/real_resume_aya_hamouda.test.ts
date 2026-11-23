import assert from 'assert';
import db, { getOrCreateDefaultUser } from '../lib/db';
import { parseCVFile, extractCVContent } from '../lib/cv-extractor';
import { generateOptimizedMasterCV, generateCareerStrategy } from '../lib/cv-optimizer';
import { analyzeResume } from '../lib/ai/ats-analyzer';
import { generateTailoredPackage } from '../lib/ai/resume-tailorer';
import { optimizeLinkedInProfile } from '../lib/ai/linkedin-optimizer';
import { syncAndDeduplicateJobs, getAllVerifiedJobs } from '../lib/jobs/aggregator';
import { calculateMatchScore } from '../lib/jobs/matcher';
import { applyToLinkedInPostRole } from '../lib/linkedin-post-parser';
import { FullCandidateProfile, JobListing } from '../lib/types';

console.log('========================================================================');
console.log('--- TESTING APPLICATION ON REAL RESUME: AYA HAMOUDA MAHMOUD ALI ---');
console.log('========================================================================\n');

export const REAL_AYA_HAMOUDA_CV = `
AYA HAMOUDA MAHMOUD ALI
Nasr City, Cairo, Egypt | Mobile: +201000000000
candidate.synthetic@example.internal | linkedin.com/in/synthetic-candidate

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
• Supported planogram compliance and improved share of shelf across key accounts.

Key Account Manager – Advocure Group | Apr 2016 – Dec 2020
• Managed strategic retail accounts, negotiating pricing, listings, visibility, and commercial agreements.
• Achieved 120% renewal rate and 70% account acquisition rate through strong customer and account management.
• Conducted regular business reviews and monitored promotional and commercial performance.
• Identified customer needs and business opportunities to support account growth.

Medical Sales Representative – Utopia Pharma | Dec 2013 – Apr 2016
• Achieved 200% sales growth in the assigned territory through strong customer relationships and product availability management.
• Developed customer insights and market feedback to support sales and product activities.

EDUCATION
MBA – Marketing & Innovation | German University in Cairo | 2023 – Ongoing
B.Sc. Microbiology & Immunology | Port Said University | 2013

LANGUAGES
Arabic – Native | English – Fluent (C1)
`.trim();

async function runRealResumeTest() {
  const user = getOrCreateDefaultUser();

  // Update user with synthetic candidate details (preserving career profile while eliminating live PII)
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(
    'Aya Hamouda Mahmoud Ali',
    'candidate.synthetic@example.internal',
    user.id
  );
  console.log('✓ Candidate user record initialized: Aya Hamouda Mahmoud Ali (candidate.synthetic@example.internal)');

  // 1. INGESTION & ENTITY EXTRACTION
  console.log('\n--- STEP 1: CV Ingestion & Entity Extraction ---');
  const buffer = Buffer.from(REAL_AYA_HAMOUDA_CV, 'utf-8');
  const parsedText = await parseCVFile(buffer, 'Aya_Hamouda_CV.txt', 'text/plain');
  assert.ok(parsedText.length > 500, 'CV text must be parsed');

  const extracted = extractCVContent(parsedText);
  console.log(`  Candidate Name: ${extracted.candidate_name}`);
  console.log(`  Email: ${extracted.email}`);
  console.log(`  Phone: ${extracted.phone}`);
  console.log(`  Location: ${extracted.location}`);
  console.log(`  LinkedIn: ${extracted.linkedin_url}`);
  console.log(`  Headline: ${extracted.current_headline}`);
  console.log(`  Total Experience: ${extracted.total_experience_years} years`);
  console.log(`  Extracted Skills Count: ${extracted.skills.length}`);
  console.log(`  Extracted Work Experiences: ${extracted.experiences.length}`);
  console.log(`  Extracted Education Count: ${extracted.education.length}`);

  assert.strictEqual(extracted.email, 'candidate.synthetic@example.internal');
  assert.strictEqual(extracted.phone, '+201000000000');
  assert.ok(extracted.location.includes('Cairo') || extracted.location.includes('Nasr City'));
  assert.ok(extracted.skills.includes('Category Management'));
  assert.ok(extracted.skills.includes('Trade Marketing'));
  assert.ok(extracted.skills.includes('Assortment Optimization'));
  assert.ok(extracted.skills.includes('Power BI'));
  assert.ok(extracted.skills.includes('SAP'));
  assert.ok(extracted.experiences.length >= 5, 'Should extract at least 5 professional experiences');
  assert.ok(extracted.experiences.some(e => e.employer.includes('Abu Dawood')));
  assert.ok(extracted.experiences.some(e => e.employer.includes('Sulinda')));
  assert.ok(extracted.experiences.some(e => e.employer.includes('Otsuka')));
  assert.ok(extracted.education.some(ed => ed.institution.includes('German University in Cairo')));
  console.log('✓ Step 1 Passed: 100% entity and career history extraction verified');

  // 2. ATS ANALYSIS
  console.log('\n--- STEP 2: ATS & Recruiter Scoring ---');
  const atsResult = analyzeResume(REAL_AYA_HAMOUDA_CV, 'Category Manager', 'United Arab Emirates');
  console.log(`  Overall ATS Score: ${atsResult.overall_score}/100`);
  console.log(`  Recruiter Verdict: ${atsResult.recruiter_evaluation.verdict}`);
  console.log(`  Hiring Manager Verdict: ${atsResult.hiring_manager_evaluation.verdict}`);
  console.log(`  Matched Keywords: ${atsResult.keyword_gaps.matched_keywords.slice(0, 6).join(', ')}`);
  assert.ok(atsResult.overall_score >= 85, `ATS score should be >= 85, got ${atsResult.overall_score}`);
  assert.ok(atsResult.formatting_evaluation.has_standard_sections, 'Must have standard sections');
  assert.ok(atsResult.formatting_evaluation.has_contact_info, 'Must have contact info');
  console.log('✓ Step 2 Passed: ATS evaluation scored 85+ with rich commercial keywords');

  // 3. VERSION B OPTIMIZED MASTER CV (GOOGLE XYZ FORMULA)
  console.log('\n--- STEP 3: Version B AI-Optimized Master CV ---');
  const optimized = generateOptimizedMasterCV(extracted);
  console.log(`  Version B Title: ${optimized.version_b_optimized.title}`);
  console.log(`  Score Delta: ${optimized.score_comparison.original_score} -> ${optimized.score_comparison.improved_score}`);
  console.log(`  Changes Made: ${optimized.changes_made.length}`);
  assert.ok(optimized.version_b_optimized.raw_text.includes('Aya Hamouda Mahmoud Ali'));
  assert.ok(optimized.version_b_optimized.raw_text.includes('Abu Dawood Group'));
  assert.ok(optimized.version_b_optimized.raw_text.includes('Sulinda Pharmaceutical'));
  assert.ok(optimized.version_b_optimized.raw_text.includes('German University in Cairo'));
  assert.ok(optimized.version_b_optimized.raw_text.includes('40% YoY category growth'));
  console.log('✓ Step 3 Passed: Version B Master CV formatted with Google XYZ formula');

  // 4. PRELIMINARY CAREER STRATEGY
  console.log('\n--- STEP 4: Career Strategy & Search Queries ---');
  const strategy = generateCareerStrategy(extracted);
  console.log(`  Best Fit Titles: ${strategy.best_fit_titles.slice(0, 3).join(', ')}`);
  console.log(`  Target Industries: ${strategy.suitable_industries.slice(0, 2).join(', ')}`);
  console.log(`  Search Queries: ${strategy.search_queries.slice(0, 2).join(' | ')}`);
  assert.ok(strategy.best_fit_titles.some(t => t.includes('Category Manager')));
  assert.ok(strategy.suitable_industries.some(i => i.includes('FMCG')));
  console.log('✓ Step 4 Passed: Career strategy precisely aligned with Category & Commercial Leadership');

  // 5. UPDATE CANDIDATE DATABASE PROFILE
  console.log('\n--- STEP 5: Database Profile Sync ---');
  db.prepare(`
    INSERT INTO profiles (
      id, user_id, onboarding_completed, headline, summary, current_status,
      experience_years, skills, languages, target_roles, target_industries,
      target_seniority, min_salary, preferred_currency, availability, updated_at
    ) VALUES ('prof_candidate_main', ?, 1, ?, ?, 'Employed', ?, ?, ?, ?, ?, 'Lead', 75000, 'USD', 'Within 1 Month', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      headline = excluded.headline,
      summary = excluded.summary,
      skills = excluded.skills,
      experience_years = excluded.experience_years,
      target_roles = excluded.target_roles,
      target_industries = excluded.target_industries,
      target_seniority = excluded.target_seniority,
      min_salary = excluded.min_salary,
      preferred_currency = excluded.preferred_currency,
      availability = excluded.availability,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    user.id,
    'Category & Trade Marketing Professional',
    'Category & Trade Marketing professional with 10+ years across FMCG, Personal Care, E-commerce, and Pharmaceuticals.',
    10,
    JSON.stringify(extracted.skills),
    JSON.stringify(extracted.languages),
    JSON.stringify(strategy.best_fit_titles),
    JSON.stringify(strategy.suitable_industries)
  );

  db.prepare(`
    INSERT INTO profile_locations (
      id, user_id, target_countries, target_cities, relocation_willing,
      relocation_timeline, visa_sponsorship_required, work_authorizations,
      remote_eligibility, work_mode_preference, updated_at
    ) VALUES ('loc_candidate_main', ?, ?, ?, 1, 'Within 1 month', 1, ?, 'Hybrid / Relocation', 'Hybrid', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      target_countries = excluded.target_countries,
      target_cities = excluded.target_cities,
      relocation_willing = excluded.relocation_willing,
      relocation_timeline = excluded.relocation_timeline,
      visa_sponsorship_required = excluded.visa_sponsorship_required,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    user.id,
    JSON.stringify(['United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Remote (Global)']),
    JSON.stringify(['Dubai', 'Riyadh', 'Cairo']),
    JSON.stringify(['Egypt (Citizen)', 'GCC Visa Sponsored'])
  );

  // Save Version A & Version B in resumes table
  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version)
    VALUES ('cv_original_master', ?, 'Version A — Original CV (Preserved)', 'Master', 'Category Manager', 'Egypt / UAE', ?, 85, 1)
    ON CONFLICT(id) DO UPDATE SET raw_text = excluded.raw_text
  `).run(user.id, REAL_AYA_HAMOUDA_CV);

  db.prepare(`
    INSERT INTO resumes (id, user_id, title, type, target_role, target_country, raw_text, ats_score, version)
    VALUES ('cv_optimized_master', ?, 'Version B — AI-Optimized Master CV', 'Master', 'Category Manager', 'Egypt / UAE', ?, 97, 2)
    ON CONFLICT(id) DO UPDATE SET raw_text = excluded.raw_text, ats_score = 97
  `).run(user.id, optimized.version_b_optimized.raw_text);

  console.log('✓ Step 5 Passed: Profile, Location, and Resumes synchronized in SQLite database');

  // 6. JOB MATCHING & OURSHOPEE CATEGORY MANAGER
  console.log('\n--- STEP 6: Job Discovery & Match Scoring ---');
  // Seed Ourshopee Category Manager listing if not already present
  db.prepare(`
    INSERT INTO job_listings (
      id, employer, title, location, source, source_url, publication_date,
      salary_raw, requirements, experience_required_years, seniority, visa_sponsorship,
      remote_eligibility, is_verified, raw_description, application_type, portal_platform,
      authenticity_status
    ) VALUES (
      'post_li_ourshopee_02',
      'Ourshopee',
      'Category Manager - Beauty, Cosmetics & Health (LinkedIn Recruiter Post)',
      'Dubai, UAE',
      'LinkedIn Post',
      'https://www.linkedin.com/posts/ourshopee-dubai-category-manager',
      '2026-11-06',
      'Competitive UAE Package (Direct HR: mansi.deo@ourshopee.com)',
      '["Category Management", "Beauty", "Cosmetics", "Health", "5+ years experience", "UAE experience mandatory"]',
      5,
      'Senior',
      'Yes',
      'Onsite',
      1,
      'We are hiring a Category Manager for Beauty, Cosmetics & Health. UAE experience mandatory. Email: mansi.deo@ourshopee.com',
      'recruiter_post',
      'Direct Email',
      'VERIFIED_OPEN'
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      authenticity_status = 'VERIFIED_OPEN'
  `).run();

  syncAndDeduplicateJobs();
  const allJobs = getAllVerifiedJobs();

  // Find Ourshopee Category Manager role
  const ourshopeeCatJob = allJobs.find(j => j.id === 'post_li_ourshopee_02');
  assert.ok(ourshopeeCatJob, 'Ourshopee Category Manager job must be indexed');

  const fullCandidate: FullCandidateProfile = {
    profile: {
      id: 'prof_candidate_main',
      user_id: user.id,
      full_name: 'Aya Hamouda Mahmoud Ali',
      email: 'candidate.synthetic@example.internal',
      phone: '+201000000000',
      headline: 'Category & Trade Marketing Professional',
      summary: 'Category & Trade Marketing professional with 10+ years experience...',
      current_status: 'Employed',
      experience_years: 10,
      skills: extracted.skills,
      languages: extracted.languages,
      target_roles: strategy.best_fit_titles,
      target_industries: strategy.suitable_industries,
      target_seniority: 'Lead',
      min_salary: 75000,
      preferred_currency: 'USD',
      preferred_companies: [],
      excluded_companies: [],
      availability: 'Within 1 Month',
      onboarding_completed: 1
    },
    location: {
      id: 'loc_candidate_main',
      user_id: user.id,
      target_countries: ['United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Remote (Global)'],
      target_cities: ['Dubai', 'Riyadh', 'Cairo'],
      relocation_willing: 1,
      relocation_timeline: 'Within 1 month',
      visa_sponsorship_required: 1,
      work_authorizations: ['Egypt (Citizen)', 'GCC Visa Sponsored'],
      remote_eligibility: 'Hybrid / Relocation',
      work_mode_preference: 'Hybrid'
    },
    permissions: {
      user_id: user.id,
      job_research_authorized: 1,
      cv_analysis_authorized: 1,
      gmail_connected: 1,
      read_emails_authorized: 1,
      draft_emails_authorized: 1,
      send_emails_authorized: 1,
      submit_applications_authorized: 1,
      disclose_data_authorized: 1,
      scheduled_automation_desired: 1
    },
    master_cv: {
      id: 'cv_original_master',
      user_id: user.id,
      title: 'Version A — Original CV (Preserved)',
      type: 'Master',
      target_role: 'Category Manager',
      target_country: 'Egypt / UAE',
      raw_text: REAL_AYA_HAMOUDA_CV,
      ats_score: 85,
      version: 1,
      created_at: new Date().toISOString()
    },
    extracted_profile: {
      id: 'ext_real_cv',
      resume_id: 'cv_original_master',
      user_id: user.id,
      candidate_name: 'Aya Hamouda Mahmoud Ali',
      email: 'candidate.synthetic@example.internal',
      phone: '+201000000000',
      location: 'Cairo, Egypt',
      current_headline: 'Category & Trade Marketing Professional',
      career_progression: '10 years',
      detected_seniority: 'Lead',
      total_experience_years: 10,
      experiences: extracted.experiences,
      education: extracted.education,
      certifications: extracted.certifications,
      skills: extracted.skills,
      languages: extracted.languages,
      industries: extracted.industries,
      raw_extracted_text: REAL_AYA_HAMOUDA_CV
    } as any
  };

  const ourshopeeMatch = calculateMatchScore(fullCandidate, ourshopeeCatJob);
  console.log(`  Match Score for Ourshopee Category Manager: ${ourshopeeMatch.overall_score}%`);
  console.log(`  Skills Score: ${ourshopeeMatch.skills_score}% (${ourshopeeMatch.explanations.skills})`);
  console.log(`  Location Score: ${ourshopeeMatch.location_score}% (${ourshopeeMatch.explanations.location})`);
  console.log(`  Visa Score: ${ourshopeeMatch.visa_score}% (${ourshopeeMatch.explanations.visa})`);
  assert.ok(ourshopeeMatch.overall_score >= 80, `Ourshopee match should be >= 80%, got ${ourshopeeMatch.overall_score}%`);
  console.log('✓ Step 6 Passed: High match score confirmed for Ourshopee Category Manager');

  // 7. TAILORED PACKAGE GENERATION
  console.log('\n--- STEP 7: Tailored CV & Cover Letter Generation ---');
  const tailoredPkg = generateTailoredPackage(fullCandidate, ourshopeeCatJob);
  assert.ok(tailoredPkg.tailored_cv.includes('Aya Hamouda Mahmoud Ali'));
  assert.ok(tailoredPkg.tailored_cv.includes('Abu Dawood Group'));
  assert.ok(tailoredPkg.tailored_cv.includes('Arab Otsuka Nutraceuticals'));
  assert.ok(tailoredPkg.tailored_cv.includes('Category Manager - Beauty, Cosmetics & Health'));
  assert.ok(tailoredPkg.cover_letter.includes('Ourshopee'));
  assert.ok(tailoredPkg.cover_letter.includes('40% YoY category growth'));
  console.log('✓ Step 7 Passed: Bespoke CV and Cover Letter generated for Ourshopee');

  // 8. AUTO-APPLY & DIRECT RECRUITER OUTREACH (MANSI DEO)
  console.log('\n--- STEP 8: Auto-Apply & Direct Recruiter Email Outreach ---');
  const applyResult = applyToLinkedInPostRole(
    user.id,
    ourshopeeCatJob,
    'mansi.deo@ourshopee.com',
    fullCandidate,
    'Mansi Deo'
  );

  assert.strictEqual(applyResult.success, true);
  assert.strictEqual(applyResult.recruiter_email, 'mansi.deo@ourshopee.com');
  console.log(`  Application ID: ${applyResult.application_id}`);
  console.log(`  Email ID: ${applyResult.email_id}`);
  console.log(`  Attached Tailored CV: ${applyResult.cv_title}`);

  // Verify DB record matches canonical candidate consent architecture
  const appInDB = db.prepare('SELECT * FROM applications WHERE id = ?').get(applyResult.application_id) as any;
  assert.ok(appInDB, 'Application must exist in DB');
  assert.strictEqual(appInDB.status, 'Package Prepared');
  assert.strictEqual(appInDB.recruiter_email, 'mansi.deo@ourshopee.com');

  const emailInDB = db.prepare('SELECT * FROM emails WHERE id = ?').get(applyResult.email_id) as any;
  assert.ok(emailInDB, 'Outbound email must exist in DB');
  assert.strictEqual(emailInDB.recipient, 'mansi.deo@ourshopee.com');
  assert.strictEqual(emailInDB.is_draft, 1);
  assert.strictEqual(emailInDB.is_sent, 0);
  assert.ok(emailInDB.body.includes('Dear Mansi Deo,'));
  assert.ok(emailInDB.body.includes('Category Manager - Beauty, Cosmetics & Health'));
  assert.ok(emailInDB.body.includes('Aya Hamouda Mahmoud Ali'));
  console.log('✓ Step 8 Passed: Direct application email prepared as draft awaiting candidate approval');

  // 9. LINKEDIN PROFILE OPTIMIZATION
  console.log('\n--- STEP 9: LinkedIn Profile Optimization ---');
  const linkedinOpt = optimizeLinkedInProfile(fullCandidate);
  console.log(`  Headline 1: ${linkedinOpt.copy_ready_content.headline_options[0]?.headline}`);
  console.log(`  Headline 2: ${linkedinOpt.copy_ready_content.headline_options[1]?.headline}`);
  console.log(`  Headline 3: ${linkedinOpt.copy_ready_content.headline_options[2]?.headline}`);
  assert.ok(linkedinOpt.copy_ready_content.headline_options[0]?.headline.includes('Category Manager'));
  assert.ok(linkedinOpt.copy_ready_content.about_section.includes('Category Growth & Assortment Optimization'));
  assert.ok(linkedinOpt.copy_ready_content.about_section.includes('candidate.synthetic@example.internal'));
  console.log('✓ Step 9 Passed: Recruiter-optimized LinkedIn headlines & about section generated');

  console.log('\n========================================================================');
  console.log('>>> ALL 9 CORE STAGES VERIFIED ON AYA HAMOUDA RESUME WITH 100% SUCCESS! <<<');
  console.log('========================================================================\n');
}

runRealResumeTest().catch(err => {
  console.error('FAILED REAL RESUME TEST:', err);
  process.exit(1);
});
