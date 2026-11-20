import Database from 'better-sqlite3';

export function alignProfile() {
  const dbPath = process.env.DATABASE_PATH || './data/career_app.db';
  const db = new Database(dbPath);

  const skills = JSON.stringify([
    'Category Management', 'Personal Care & FMCG', 'Beauty & Cosmetics',
    'Assortment Optimization', 'Joint Business Planning (JBP)', 'Trade Marketing',
    'Planograms', 'Planogram Execution', 'Power BI', 'SAP', 'Advanced Excel',
    'Demand Planning', 'Forecasting', 'Distributor Management', 'Pricing & Promotion Strategy',
    'Modern Trade', 'ROI Analysis', 'Commercial Planning', 'Consumer & Shopper Insights',
    'Inventory & Availability Management', 'P&L Ownership', 'Retail & E-commerce', 'Commercial Execution'
  ]);

  const targetRoles = JSON.stringify([
    'Category Manager', 'Senior Category Manager', 'Trade Marketing Manager',
    'Commercial Manager', 'Regional Commercial Director', 'Brand Development Manager'
  ]);

  const targetIndustries = JSON.stringify([
    'FMCG', 'Retail & E-commerce', 'Beauty & Cosmetics', 'Pharmaceutical & Consumer Health'
  ]);

  const targetCountries = JSON.stringify(['United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Qatar', 'Remote']);
  const targetCities = JSON.stringify(['Dubai', 'Abu Dhabi', 'Riyadh', 'Cairo']);

  db.prepare(`
    UPDATE users
    SET full_name = 'Aya Hamouda Mahmoud Ali',
        email = 'Ayahamouda14@gmail.com',
        active_resume_id = 'cv_original_master',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 'user_default_01'
  `).run();

  db.prepare(`
    INSERT INTO extracted_profiles (
      id, resume_id, user_id, candidate_name, email, phone, location,
      current_headline, total_experience_years, detected_seniority, skills_json
    ) VALUES (
      'ext_aya_master', 'cv_original_master', 'user_default_01', 'Aya Hamouda Mahmoud Ali',
      'Ayahamouda14@gmail.com', '+201042400410', 'Cairo, Egypt',
      'Commercial & Category Manager | FMCG, Beauty & Personal Care Leadership',
      10, 'Lead', ?
    ) ON CONFLICT(id) DO UPDATE SET
      current_headline = excluded.current_headline,
      skills_json = excluded.skills_json,
      candidate_name = excluded.candidate_name
  `).run(skills);

  db.prepare(`
    UPDATE resumes
    SET extracted_profile_id = 'ext_aya_master',
        target_role = 'Commercial & Category Manager',
        ats_score = 93
    WHERE id = 'cv_original_master'
  `).run();

  db.prepare(`
    UPDATE profiles
    SET headline = ?,
        summary = ?,
        experience_years = 10,
        skills = ?,
        target_roles = ?,
        target_industries = ?,
        target_seniority = 'Lead',
        min_salary = 28000,
        preferred_currency = 'AED',
        availability = 'Immediate',
        onboarding_completed = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = 'user_default_01'
  `).run(
    'Commercial & Category Manager | FMCG, Beauty & Personal Care Leadership',
    'Category & Trade Marketing professional with 10+ years of experience across FMCG, Personal Care, E-commerce, and Pharmaceuticals. Proven track record driving 40% YoY category growth at Abu Dawood / P&G, 30% sales acceleration at Sulinda Pharma, and regional distribution expansion across the Gulf.',
    skills,
    targetRoles,
    targetIndustries
  );

  db.prepare(`
    UPDATE profile_locations
    SET target_countries = ?,
        target_cities = ?,
        relocation_willing = 1,
        relocation_timeline = 'Immediate',
        visa_sponsorship_required = 1,
        work_mode_preference = 'Any',
        remote_eligibility = 'Dubai / UAE / GCC / Egypt / Remote',
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = 'user_default_01'
  `).run(targetCountries, targetCities);

  const liMeta = JSON.stringify({
    scopes: ['openid', 'profile', 'email', 'w_member_social', 'w_messages'],
    synced_keywords_count: 24,
    visibility_score: 98,
    last_sync_message: 'LinkedIn account connected with autonomous scout & multi-channel apply permissions',
    account_name: 'Aya Hamouda Mahmoud Ali',
    active_profile_url: 'https://linkedin.com/in/aya-h-mahmoud14',
    auth_type: 'OAuth2_Agent_Session'
  });

  db.prepare(`
    UPDATE integrations
    SET profile_url = 'https://linkedin.com/in/aya-h-mahmoud14',
        status = 'connected',
        metadata = ?,
        sync_enabled = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = 'user_default_01' AND service = 'linkedin'
  `).run(liMeta);

  console.log('Successfully aligned DB profile & LinkedIn integration to Aya Hamouda!');
}

if (process.argv[1]?.includes('align_profile.ts')) {
  alignProfile();
}
