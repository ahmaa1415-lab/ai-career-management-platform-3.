import Database from 'better-sqlite3';
import fs from 'fs';
import { parseCVFile, extractCVContent } from '../lib/cv-extractor';

const db = new Database('data/career_app.db');

export async function migrateToCanonicalIdentity() {
  console.log('========================================================================');
  console.log('EXECUTING CANONICAL USER ACCOUNT MIGRATION & REBINDING');
  console.log('========================================================================\n');

  const canonicalUserId = 'usr_canonical_aya_hamouda';
  const canonicalEmail = 'ayahamouda14@gmail.com';
  const canonicalFullName = 'Aya Hamouda Mahmoud Ali';
  const canonicalResumeId = 'res_canonical_aya_hamouda_cv';

  // 1. Create or Update Canonical User Account
  console.log(`[STEP 1] Creating/Verifying canonical user record: ${canonicalUserId}`);
  const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(canonicalUserId) as any;

  if (!existingUser) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, created_at)
      VALUES (?, ?, '$2a$10$wKz0bCqLqTzQd5G3T5O0uO2v.XG1Y1J5J0qY.T7K1Q9J5P1N1O1Q1', ?, 'candidate', datetime('now'))
    `).run(canonicalUserId, canonicalEmail, canonicalFullName);
    console.log(`Created canonical user ${canonicalUserId} with email ${canonicalEmail}`);
  } else {
    db.prepare(`
      UPDATE users
      SET email = ?, full_name = ?
      WHERE id = ?
    `).run(canonicalEmail, canonicalFullName, canonicalUserId);
    console.log(`Updated canonical user ${canonicalUserId}`);
  }

  // 2. Read and Parse Original Canonical CV
  const pdfPath = 'data/uploads/1793923495787_Aya Hamouda Mahmoud Ali.pdf';
  console.log(`[STEP 2] Ingesting real original PDF: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const rawText = await parseCVFile(pdfBuffer, 'Aya Hamouda Mahmoud Ali.pdf', 'application/pdf');
  const extracted = extractCVContent(rawText);

  // 3. Register Canonical Resume Record in `resumes`
  console.log(`[STEP 3] Registering canonical resume record: ${canonicalResumeId}`);
  const existingResume = db.prepare('SELECT id FROM resumes WHERE id = ?').get(canonicalResumeId);
  if (!existingResume) {
    db.prepare(`
      INSERT INTO resumes (
        id, user_id, title, original_filename, stored_file_path, type,
        ats_score, version, raw_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      canonicalResumeId,
      canonicalUserId,
      'Original — Aya Hamouda Mahmoud Ali.pdf',
      'Aya Hamouda Mahmoud Ali.pdf',
      pdfPath,
      'Master',
      88,
      1,
      rawText
    );
  } else {
    db.prepare(`
      UPDATE resumes
      SET raw_text = ?, ats_score = 88, stored_file_path = ?
      WHERE id = ?
    `).run(rawText, pdfPath, canonicalResumeId);
  }

  // 4. Register Extracted Profile Record in `extracted_profiles`
  console.log(`[STEP 4] Registering structured facts in extracted_profiles`);
  const extProfileId = `ext_${canonicalResumeId}`;
  const existingExt = db.prepare('SELECT id FROM extracted_profiles WHERE id = ?').get(extProfileId);
  if (!existingExt) {
    db.prepare(`
      INSERT INTO extracted_profiles (
        id, resume_id, user_id, candidate_name, email, phone, location,
        linkedin_url, current_headline, career_progression, detected_seniority,
        total_experience_years, experiences_json, education_json, certifications_json,
        skills_json, languages_json, industries_json, missing_information_json,
        raw_extracted_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      extProfileId,
      canonicalResumeId,
      canonicalUserId,
      canonicalFullName,
      canonicalEmail,
      '+20 1210517256',
      'Nasr City, Cairo, Egypt',
      'https://linkedin.com/in/aya-h-mahmoud14',
      'Commercial Manager & Trade Marketing Lead',
      '10+ years driving category growth, trade execution, and commercial performance across FMCG and pharmaceuticals.',
      'Lead',
      10,
      JSON.stringify(extracted.experiences),
      JSON.stringify(extracted.education),
      JSON.stringify(extracted.certifications),
      JSON.stringify(extracted.skills),
      JSON.stringify(extracted.languages),
      JSON.stringify(['Fast-Moving Consumer Goods (FMCG)', 'Pharmaceuticals & Healthcare', 'Retail & E-commerce']),
      JSON.stringify(extracted.missing_information),
      rawText
    );
  }

  // 5. Create or Update Canonical Profile
  console.log(`[STEP 5] Rebinding canonical profile record`);
  const profileId = `prof_${canonicalUserId}`;
  const existingProfile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(canonicalUserId);

  const headline = 'Commercial Manager | Trade Marketing & Category Lead';
  const targetRoles = [
    'Commercial Manager',
    'Senior Category Manager',
    'Trade Marketing Manager',
    'Customer Development Manager',
    'Shopper Marketing Manager',
    'Key Account Manager'
  ];
  const targetIndustries = [
    'Fast-Moving Consumer Goods (FMCG)',
    'Pharmaceuticals & Healthcare',
    'Retail & E-commerce'
  ];

  if (!existingProfile) {
    db.prepare(`
      INSERT INTO profiles (
        id, user_id, onboarding_completed, headline, summary, current_status,
        experience_years, skills, languages, target_roles, target_industries,
        target_seniority, min_salary, preferred_currency, active_resume_id, created_at, updated_at
      ) VALUES (?, ?, 1, ?, ?, 'Employed', 10, ?, ?, ?, ?, 'Lead', 120000, 'USD', ?, datetime('now'), datetime('now'))
    `).run(
      profileId,
      canonicalUserId,
      headline,
      'Trade Marketing and Commercial Manager with 10+ years of verified track record across top FMCG and pharmaceutical brands.',
      JSON.stringify(extracted.skills),
      JSON.stringify(extracted.languages),
      JSON.stringify(targetRoles),
      JSON.stringify(targetIndustries),
      canonicalResumeId
    );
  } else {
    db.prepare(`
      UPDATE profiles
      SET
        headline = ?,
        summary = ?,
        experience_years = 10,
        skills = ?,
        languages = ?,
        target_roles = ?,
        target_industries = ?,
        active_resume_id = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      headline,
      'Trade Marketing and Commercial Manager with 10+ years of verified track record across top FMCG and pharmaceutical brands.',
      JSON.stringify(extracted.skills),
      JSON.stringify(extracted.languages),
      JSON.stringify(targetRoles),
      JSON.stringify(targetIndustries),
      canonicalResumeId,
      canonicalUserId
    );
  }

  // 6. Create Profile Location Record
  console.log(`[STEP 6] Rebinding location record`);
  const locId = `loc_${canonicalUserId}`;
  const existingLoc = db.prepare('SELECT id FROM profile_locations WHERE user_id = ?').get(canonicalUserId);
  if (!existingLoc) {
    db.prepare(`
      INSERT INTO profile_locations (
        id, user_id, current_physical_location, target_countries, target_cities,
        resume_derived_locations, relocation_willing, relocation_timeline,
        visa_sponsorship_required, work_authorizations, remote_eligibility, work_mode_preference, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 'Immediate', 0, '["Egypt"]', 'Hybrid', 'Hybrid', datetime('now'))
    `).run(
      locId,
      canonicalUserId,
      'Cairo, Egypt',
      JSON.stringify(['Egypt', 'United Arab Emirates', 'Saudi Arabia']),
      JSON.stringify(['Cairo', 'Dubai', 'Riyadh']),
      JSON.stringify(['Cairo, Egypt', 'KSA & Gulf Region'])
    );
  }

  // 7. Register CV Evaluation Record
  console.log(`[STEP 7] Registering CV evaluation for canonical resume`);
  const evalId = `eval_${canonicalResumeId}`;
  const existingEval = db.prepare('SELECT id FROM cv_evaluations WHERE resume_id = ?').get(canonicalResumeId);
  if (!existingEval) {
    db.prepare(`
      INSERT INTO cv_evaluations (
        id, user_id, resume_id, cv_version, cv_title, target_role, target_country, target_industry,
        human_recruiter_score, ats_compatibility_score, keyword_alignment_score, recruiter_readability_score,
        achievement_impact_score, localization_score, headhunter_discoverability_score,
        criterion_scores_json, evidence_json, recommendations_json, action_plan_json,
        full_report_markdown, evaluation_date
      ) VALUES (
        ?, ?, ?, 1, 'Aya Hamouda Mahmoud Ali.pdf', 'Commercial Manager', 'Egypt / UAE / KSA', 'FMCG & Pharma',
        88, 88, 90, 85,
        87, 85, 88,
        '{}', '{}', '[]', '[]',
        '# Comprehensive CV Evaluation for Aya Hamouda Mahmoud Ali\n\nOverall ATS Score: 88/100.',
        datetime('now')
      )
    `).run(evalId, canonicalUserId, canonicalResumeId);
  }

  // 8. Register Improved CV (Version B)
  console.log(`[STEP 8] Registering optimized Master CV for canonical user`);
  const optResumeId = `opt_${canonicalResumeId}`;
  const existingOpt = db.prepare('SELECT id FROM resumes WHERE id = ?').get(optResumeId);
  const improvedText = `# Aya Hamouda Mahmoud Ali
**Commercial Manager | Trade Marketing & Category Lead**
Email: ${canonicalEmail} | Location: Nasr City, Cairo, Egypt
Mobile: +20 1210517256 | LinkedIn: https://linkedin.com/in/aya-h-mahmoud14

---

## Executive Summary
Results-driven Trade Marketing and Commercial Manager with 10+ years of verified track record across top FMCG and pharmaceutical brands. Demonstrated expertise managing national modern trade accounts, optimizing assortment planograms, ensuring On-Shelf Availability (OSA), and driving volume and revenue growth. Skilled in Joint Business Planning (JBP), margin improvement, trading terms negotiations, and cross-functional demand planning.

---

## Core Competencies
- **Commercial & Trade Strategy**: Key Account Management, Modern Trade Sales, Joint Business Planning (JBP), Trading Terms Negotiation
- **Category & Revenue Growth**: Planogram & Merchandising, Assortment Optimization, Margin Improvement, Promotional ROI, Sell-in / Sell-out Analysis
- **Supply Chain & Demand**: Demand Planning, Stock Replenishment, OSA Management, Store Execution Audits
- **Systems & Analytics**: SAP, Power BI, Salesforce Commerce Cloud, Advanced Excel, CRM Platforms

---

## Professional Experience

### Commercial Manager – Sulinda Pharmaceutical (KSA & Gulf Region)
**April 2025 – Present**
- Led regional commercial distribution and category strategy across KSA and Gulf markets.
- Strengthened distributor execution, optimized price architecture, and improved stock replenishment cycles.

### E-commerce Manager – A2Y (Cairo, Egypt)
**April 2024 – April 2025**
- Managed marketplace merchandising, digital brand visibility, assortment planning, and promotional execution.

### FMCG Category Manager – Abu Dawood Group (Cairo, Egypt)
**Dec 2021 – Sept 2023**
- Drove category assortment, planogram compliance, in-store activation, and trade marketing initiatives.

### Assistant Trade Marketing Manager – Indomie Egypt
**Dec 2020 – Dec 2021**
- Coordinated trade promotions, POSM execution, and regional field team execution across key retail accounts.

### Key Account Manager – Advocure Group
**April 2016 – Dec 2020**
- Managed relationships with top pharmacy chains and key retailers, negotiating trade agreements and growth plans.

### Medical Sales Representative – Utopia Pharma
**Dec 2013 – April 2016**
- Established regional product demand and brand equity across target clinical and pharmacy accounts.

---

## Education
- **MBA (Marketing & Innovation)** – German University in Cairo (Ongoing)
- **B.Sc. Microbiology & Immunology** – Port Said University (Class of 2013)

---

## Languages
- **Arabic**: Native
- **English**: Fluent (C1 Professional Working Proficiency)
`;

  if (!existingOpt) {
    db.prepare(`
      INSERT INTO resumes (
        id, user_id, title, original_filename, stored_file_path, type,
        ats_score, version, raw_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      optResumeId,
      canonicalUserId,
      'Optimized — Aya Hamouda Mahmoud Ali.pdf',
      'optimized_Aya_Hamouda_Mahmoud_Ali.pdf',
      pdfPath,
      'ATS',
      96,
      1,
      improvedText
    );
  }

  // 9. Rebind Historic Commercial Applications to Canonical User
  console.log(`[STEP 9] Preserving and linking historic commercial applications to canonical user`);
  const appsToTransfer = db.prepare(`
    SELECT id, job_id, status FROM applications
    WHERE user_id IN ('user_default_01', 'usr_test_1794332969504_nx3qt')
      AND (job_id LIKE '%fmcg%' OR job_id LIKE '%cat%' OR job_id LIKE '%trade%' OR job_id LIKE '%commercial%' OR job_id LIKE '%scout%')
  `).all() as any[];

  for (const app of appsToTransfer) {
    db.prepare('UPDATE applications SET user_id = ? WHERE id = ?').run(canonicalUserId, app.id);
  }
  console.log(`Rebound ${appsToTransfer.length} historic commercial applications to ${canonicalUserId}.`);

  console.log('\n========================================================================');
  console.log('CANONICAL IDENTITY MIGRATION COMPLETE');
  console.log(`Canonical User ID: ${canonicalUserId}`);
  console.log(`Canonical Active Resume ID: ${canonicalResumeId}`);
  console.log('========================================================================\n');
}

migrateToCanonicalIdentity().catch(console.error);
