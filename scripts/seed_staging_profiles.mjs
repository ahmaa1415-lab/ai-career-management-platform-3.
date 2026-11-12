import Database from 'better-sqlite3';
import path from 'path';

export function seedStagingProfiles(customDbPath) {
  const dbPath = customDbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'career_app.db');
  console.log(`[SEED_STAGING] Seeding synthetic candidate profiles into: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Candidate A: Commercial FMCG & Beauty
  const candA = {
    userId: 'usr_synth_comm_01',
    email: 'candidate.commercial@staging.local',
    name: 'Synthetic Commercial Lead',
    profileId: 'prof_synth_comm_01',
    headline: 'Senior Category Manager & Trade Marketing Lead | FMCG, Beauty & Personal Care',
    summary: '7+ years managing commercial FMCG portfolios, category assortment, and retail distributor partnerships.',
    skills: JSON.stringify(['Category Management', 'Trade Marketing', 'FMCG', 'Beauty & Personal Care', 'Joint Business Planning (JBP)', 'Assortment Optimization', 'Planogram Strategy']),
    targetRoles: JSON.stringify(['Category Manager', 'Trade Marketing Manager', 'Commercial Lead']),
    targetIndustries: JSON.stringify(['FMCG', 'Beauty & Cosmetics', 'Retail']),
    targetSeniority: 'Senior',
    minSalary: 5000,
    preferredCurrency: 'USD',
    targetCountries: JSON.stringify(['United Arab Emirates', 'Saudi Arabia', 'Egypt']),
    targetCities: JSON.stringify(['Dubai', 'Riyadh', 'Cairo']),
    workMode: 'Hybrid'
  };

  // Candidate B: Technology Cloud & Architecture
  const candB = {
    userId: 'usr_synth_tech_02',
    email: 'candidate.tech@staging.local',
    name: 'Synthetic Cloud Architect',
    profileId: 'prof_synth_tech_02',
    headline: 'Principal Cloud Infrastructure Architect & Technical Lead | Distributed Systems',
    summary: '10+ years designing scalable cloud platforms, multi-region Kubernetes clusters, and distributed systems.',
    skills: JSON.stringify(['Cloud Infrastructure', 'Technical Architecture', 'Software Engineering', 'Kubernetes', 'Docker', 'AWS', 'Distributed Systems', 'Microservices', 'Terraform']),
    targetRoles: JSON.stringify(['Cloud Architect', 'Principal Systems Architect', 'Lead Software Engineer']),
    targetIndustries: JSON.stringify(['Cloud Computing', 'Enterprise Software', 'FinTech']),
    targetSeniority: 'Lead / Principal',
    minSalary: 8000,
    preferredCurrency: 'USD',
    targetCountries: JSON.stringify(['Germany', 'United Arab Emirates', 'United Kingdom']),
    targetCities: JSON.stringify(['Berlin', 'Dubai', 'London']),
    workMode: 'Remote'
  };

  const seedCandidate = (c) => {
    db.prepare(`
      INSERT INTO users (id, email, full_name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, full_name = excluded.full_name
    `).run(c.userId, c.email, c.name);

    db.prepare(`
      INSERT INTO profiles (
        id, user_id, onboarding_completed, headline, summary, current_status,
        experience_years, skills, target_roles, target_industries, target_seniority,
        min_salary, preferred_currency
      ) VALUES (?, ?, 1, ?, ?, 'Actively Looking', 7, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        headline = excluded.headline,
        summary = excluded.summary,
        skills = excluded.skills,
        target_roles = excluded.target_roles,
        target_industries = excluded.target_industries
    `).run(c.profileId, c.userId, c.headline, c.summary, c.skills, c.targetRoles, c.targetIndustries, c.targetSeniority, c.minSalary, c.preferredCurrency);

    db.prepare(`
      INSERT INTO profile_locations (
        id, user_id, target_countries, target_cities, relocation_willing,
        visa_sponsorship_required, work_mode_preference
      ) VALUES (?, ?, ?, ?, 1, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_countries = excluded.target_countries,
        target_cities = excluded.target_cities,
        work_mode_preference = excluded.work_mode_preference
    `).run(`loc_${c.userId}`, c.userId, c.targetCountries, c.targetCities, c.workMode);
  };

  const tx = db.transaction(() => {
    seedCandidate(candA);
    seedCandidate(candB);
  });
  tx();

  console.log('[SEED_STAGING] Synthetic profiles successfully seeded with zero cross-contamination.');
  db.close();
}

if (process.argv[1]?.endsWith('seed_staging_profiles.mjs')) {
  seedStagingProfiles();
}
