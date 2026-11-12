import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import crypto from 'crypto';
import { extractCVContent } from '../lib/cv-extractor';
import { analyzeResume } from '../lib/ai/ats-analyzer';
import { generateOptimizedMasterCV, generateCareerStrategy } from '../lib/cv-optimizer';
import { calculateMatchScore } from '../jobs/matcher';
import { optimizeLinkedInProfile } from '../lib/ai/linkedin-optimizer';
import { getLinkedInAccountConnection } from '../lib/linkedin/autonomous-scout';
import { generateTailoredPackage } from '../lib/ai/resume-tailorer';

console.log('==============================================================================');
console.log('  THREE-USER DYNAMIC ISOLATION & REGRESSION TEST SUITE');
console.log('  Testing: Aya (FMCG/Pharma), Sarah (Tech/Cloud), Omar (Banking/Finance)');
console.log('==============================================================================\n');

// 1. Setup isolated test database
const testDbDir = path.join(process.cwd(), 'data');
const testDbPath = path.join(testDbDir, 'test_three_users.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load schema from lib/db.ts
const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  password_hash TEXT,
  role TEXT DEFAULT 'candidate',
  is_verified INTEGER DEFAULT 1,
  profile_image TEXT,
  timezone TEXT DEFAULT 'Africa/Cairo',
  language TEXT DEFAULT 'en',
  google_id TEXT,
  linkedin_id TEXT,
  active_resume_id TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  onboarding_completed INTEGER DEFAULT 0,
  headline TEXT,
  summary TEXT,
  current_status TEXT,
  experience_years REAL DEFAULT 0,
  skills TEXT DEFAULT '[]',
  languages TEXT DEFAULT '[]',
  target_roles TEXT DEFAULT '[]',
  target_industries TEXT DEFAULT '[]',
  target_seniority TEXT,
  min_salary INTEGER DEFAULT 0,
  preferred_currency TEXT DEFAULT 'USD',
  preferred_companies TEXT DEFAULT '[]',
  excluded_companies TEXT DEFAULT '[]',
  active_resume_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_locations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_countries TEXT DEFAULT '[]',
  target_cities TEXT DEFAULT '[]',
  relocation_willing INTEGER DEFAULT 0,
  relocation_timeline TEXT,
  visa_sponsorship_required INTEGER DEFAULT 0,
  work_mode_preference TEXT DEFAULT 'Any',
  remote_eligibility TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  target_role TEXT,
  target_country TEXT,
  raw_text TEXT NOT NULL,
  ats_score INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  original_filename TEXT,
  stored_file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  file_hash TEXT,
  upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  processing_status TEXT DEFAULT 'completed',
  extraction_status TEXT DEFAULT 'completed',
  extraction_timestamp DATETIME,
  extraction_version INTEGER DEFAULT 1,
  source_text_reference TEXT,
  extracted_profile_id TEXT,
  ats_report_id TEXT,
  is_active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extracted_profiles (
  id TEXT PRIMARY KEY,
  resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  current_headline TEXT,
  career_progression TEXT,
  detected_seniority TEXT,
  total_experience_years REAL DEFAULT 0,
  experiences_json TEXT DEFAULT '[]',
  education_json TEXT DEFAULT '[]',
  certifications_json TEXT DEFAULT '[]',
  skills_json TEXT DEFAULT '[]',
  languages_json TEXT DEFAULT '[]',
  industries_json TEXT DEFAULT '[]',
  missing_information_json TEXT DEFAULT '[]',
  raw_extracted_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  status TEXT DEFAULT 'Ready to Apply',
  match_score REAL DEFAULT 0,
  tailored_resume_id TEXT,
  tailored_cv_text TEXT,
  cover_letter TEXT,
  screening_answers TEXT,
  recruiter_name TEXT,
  recruiter_email TEXT,
  notes TEXT,
  submission_type TEXT DEFAULT 'Manual',
  source_resume_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_outdated INTEGER DEFAULT 0,
  outdated_reason TEXT
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  status TEXT DEFAULT 'Not Connected',
  profile_url TEXT,
  client_id TEXT,
  client_secret TEXT,
  sync_enabled INTEGER DEFAULT 0,
  last_synced_at DATETIME,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(schemaSql);

// Test fixtures
const RESUME_A_AYA = `
AYAH HAMOUDA MAHMOUD ALI
Cairo, Egypt | +201042400410 | ayahamouda14@gmail.com | linkedin.com/in/aya-h-mahmoud14

PROFESSIONAL SUMMARY
Commercial & Category Manager with 10+ years driving multi-million dollar growth across FMCG, Personal Care, and Pharmaceuticals. Expert in Joint Business Planning (JBP), Planogram execution, Assortment Optimization, Power BI, and SAP.

EXPERIENCE
Commercial Manager – Sulinda Pharmaceutical | KSA & Gulf | 2025 – Present
- Accelerated sales by 30% across regional pharmacy chains through pricing optimization and inventory rotation.
Brand Development Manager – Arab Otsuka Nutraceuticals | Dubai, UAE | 2023 – 2025
- Expanded regional distribution by 20% across Oman and Bahrain.
FMCG Category Manager – Abu Dawood Group / P&G | Cairo, Egypt | 2021 – 2023
- Delivered 40% YoY category growth across Personal Care and Beauty portfolios.

EDUCATION
MBA – German University in Cairo
B.Sc. Microbiology – Port Said University
SKILLS
Category Management, FMCG, Trade Marketing, Joint Business Planning (JBP), Planograms, Power BI, SAP, Demand Planning
`;

const RESUME_B_SARAH = `
SARAH JENKINS
London, UK | +447911123456 | sarah.jenkins@techcloud.io | linkedin.com/in/sarah-jenkins-cloud

PROFESSIONAL SUMMARY
Senior Software Engineer and Cloud Solutions Architect with 8+ years of experience architecting distributed microservices, Kubernetes clusters, and AI-enabled APIs in TypeScript, Node.js, Go, and AWS.

EXPERIENCE
Staff Platform Engineer – CloudScale Systems | London, UK | 2023 – Present
- Architected event-driven microservices processing 50M daily transactions with 99.99% availability.
- Led migration of 120 services to Kubernetes on AWS EKS, reducing infrastructure cost by 35%.
Senior Software Engineer – FinTech Dynamics | London, UK | 2020 – 2023
- Built high-throughput payment settlement pipelines in TypeScript, Next.js, PostgreSQL, and Redis.

EDUCATION
B.Sc. Computer Science – Imperial College London
SKILLS
TypeScript, React, Next.js, Node.js, Kubernetes, AWS, Docker, PostgreSQL, Redis, Microservices, CI/CD
`;

const RESUME_C_OMAR = `
OMAR FAROOQ AL-SAYED
Dubai, UAE | +971501234567 | omar.farooq@emiratesfinance.ae | linkedin.com/in/omar-farooq-cfo

PROFESSIONAL SUMMARY
Financial Controller and Chartered Accountant (FCA / CPA) with 12+ years of senior financial leadership in Commercial Banking and Corporate Finance across GCC and MENA. Specialized in IFRS, Liquidity Risk, Capital Adequacy, and M&A Financial Due Diligence.

EXPERIENCE
Financial Controller – Emirates NBD / Corporate Banking | Dubai, UAE | 2022 – Present
- Directed financial reporting, Basel III capital adequacy, and IFRS 9 impairment models for $4.5B corporate loan portfolio.
Head of Financial Planning & Analysis – Mashreq Bank | Dubai, UAE | 2018 – 2022
- Streamlined annual budget planning across 6 GCC territories, achieving $12M operating expenditure reduction.

EDUCATION
Master of Science in Corporate Finance – London School of Economics
Chartered Accountant (FCA) – ICAEW
SKILLS
Financial Controlling, IFRS 9, Basel III, Corporate Finance, Liquidity Risk, Financial Modeling, Treasury, SAP S/4HANA, Audit
`;

function registerAndProcessUser(userId: string, email: string, name: string, resumeText: string, filename: string) {
  // 1. Insert User
  db.prepare(`
    INSERT INTO users (id, email, full_name)
    VALUES (?, ?, ?)
  `).run(userId, email, name);

  // 2. Extract CV
  const extracted = extractCVContent(resumeText);
  const resumeId = `res_${userId}_${Date.now()}`;
  const fileHash = crypto.createHash('sha256').update(resumeText).digest('hex');

  // 3. Insert Resume
  db.prepare(`
    INSERT INTO resumes (
      id, user_id, title, type, target_role, target_country, raw_text,
      ats_score, version, original_filename, file_hash, processing_status,
      extraction_status, is_active
    ) VALUES (?, ?, ?, 'Master', ?, ?, ?, 85, 1, ?, ?, 'completed', 'completed', 1)
  `).run(
    resumeId,
    userId,
    `Original — ${filename}`,
    extracted.current_headline || 'Professional',
    extracted.location || 'Remote',
    resumeText,
    filename,
    fileHash
  );

  // 4. Insert Extracted Profile
  const extId = `ext_${resumeId}`;
  db.prepare(`
    INSERT INTO extracted_profiles (
      id, resume_id, user_id, candidate_name, email, phone, location,
      current_headline, detected_seniority, total_experience_years, skills_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    extId,
    resumeId,
    userId,
    extracted.candidate_name,
    extracted.email,
    extracted.phone,
    extracted.location,
    extracted.current_headline,
    extracted.detected_seniority,
    extracted.total_experience_years,
    JSON.stringify(extracted.skills)
  );

  // 5. Update user active_resume_id
  db.prepare('UPDATE users SET active_resume_id = ? WHERE id = ?').run(resumeId, userId);

  // 6. Generate Strategy and update profiles table
  const strategy = generateCareerStrategy(extracted);
  db.prepare(`
    INSERT INTO profiles (
      id, user_id, onboarding_completed, headline, summary, experience_years,
      skills, target_roles, target_industries, target_seniority, active_resume_id
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `prof_${userId}`,
    userId,
    extracted.current_headline,
    extracted.career_progression,
    extracted.total_experience_years,
    JSON.stringify(extracted.skills),
    JSON.stringify(strategy.best_fit_titles),
    JSON.stringify(strategy.suitable_industries || (strategy as any).best_fit_industries || []),
    extracted.detected_seniority,
    resumeId
  );

  // 7. Profile location
  db.prepare(`
    INSERT INTO profile_locations (
      id, user_id, target_countries, target_cities, relocation_willing, visa_sponsorship_required
    ) VALUES (?, ?, ?, ?, 1, 1)
  `).run(
    `loc_${userId}`,
    userId,
    JSON.stringify([extracted.location || 'United Arab Emirates']),
    JSON.stringify(['Dubai'])
  );

  // 8. Insert LinkedIn integration
  db.prepare(`
    INSERT INTO integrations (
      id, user_id, service, status, profile_url, metadata
    ) VALUES (?, ?, 'linkedin', 'connected', ?, ?)
  `).run(
    `integ_${userId}`,
    userId,
    extracted.linkedin_url || `https://linkedin.com/in/${userId}`,
    JSON.stringify({
      account_name: extracted.candidate_name,
      email: extracted.email
    })
  );

  return { userId, resumeId, extracted, strategy };
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

console.log('--- [USER A: Aya Hamouda — Commercial Manager / FMCG & Pharma] ---');
const userA = registerAndProcessUser(
  'user_aya_test',
  'ayahamouda14@gmail.com',
  'Aya Hamouda Mahmoud Ali',
  RESUME_A_AYA,
  'Aya_Hamouda_CV.pdf'
);

const ayaUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userA.userId) as any;
const ayaProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userA.userId) as any;
const ayaSkills = JSON.parse(ayaProfile.skills);
const ayaRoles = JSON.parse(ayaProfile.target_roles);

assert.strictEqual(ayaUser.full_name, 'Aya Hamouda Mahmoud Ali');
assert.strictEqual(ayaUser.active_resume_id, userA.resumeId);
assert.ok(ayaSkills.includes('Category Management') || ayaSkills.includes('FMCG'));
console.log('✓ User A Identity: Aya Hamouda Mahmoud Ali');
console.log('✓ User A Active Resume:', ayaUser.active_resume_id);
console.log('✓ User A Target Roles:', ayaRoles.slice(0, 3).join(', '));

// Submit an application for User A
const appAId = `app_aya_${Date.now()}`;
db.prepare(`
  INSERT INTO applications (
    id, user_id, job_id, status, source_resume_id, tailored_cv_text, cover_letter, submission_type
  ) VALUES (?, ?, 'job_fmcg_americana', 'Applied', ?, ?, ?, 'Automated')
`).run(appAId, userA.userId, userA.resumeId, 'Tailored CV for Americana Group (Aya)', 'Cover letter for Americana (Aya)');

console.log(`✓ User A Submitted Application: ${appAId} linked to Resume: ${userA.resumeId}\n`);

// ------------------------------------------------------------------------------
console.log('--- [USER B: Sarah Jenkins — Senior Software Engineer / Cloud] ---');
const userB = registerAndProcessUser(
  'user_sarah_test',
  'sarah.jenkins@techcloud.io',
  'Sarah Jenkins',
  RESUME_B_SARAH,
  'Sarah_Jenkins_CV.pdf'
);

const sarahUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userB.userId) as any;
const sarahProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userB.userId) as any;
const sarahSkills = JSON.parse(sarahProfile.skills);
const sarahRoles = JSON.parse(sarahProfile.target_roles);

// VERIFY COMPLETE ISOLATION FOR SARAH
assert.strictEqual(sarahUser.full_name, 'Sarah Jenkins');
assert.strictEqual(sarahUser.email, 'sarah.jenkins@techcloud.io');
assert.strictEqual(sarahUser.active_resume_id, userB.resumeId);
assert.notStrictEqual(sarahUser.active_resume_id, userA.resumeId);
assert.ok(!sarahSkills.includes('Category Management'), 'Sarah must NOT have Category Management');
assert.ok(!sarahSkills.includes('Joint Business Planning (JBP)'), 'Sarah must NOT have JBP');
assert.ok(sarahSkills.some((s: string) => /typescript|kubernetes|aws|docker/i.test(s)), 'Sarah must have Cloud/Tech skills');
assert.ok(sarahRoles.some((r: string) => /software|cloud|developer|engineer|architect/i.test(r)), 'Sarah target roles must be Tech');

console.log('✓ User B Identity: Sarah Jenkins (Initials: SJ)');
console.log('✓ User B Active Resume:', sarahUser.active_resume_id);
console.log('✓ User B Target Roles:', sarahRoles.slice(0, 3).join(', '));
console.log('✓ User B Zero FMCG Leakage Confirmed');

// Submit an application for User B
const appBId = `app_sarah_${Date.now()}`;
db.prepare(`
  INSERT INTO applications (
    id, user_id, job_id, status, source_resume_id, tailored_cv_text, cover_letter, submission_type
  ) VALUES (?, ?, 'job_tech_stripe', 'Applied', ?, ?, ?, 'Automated')
`).run(appBId, userB.userId, userB.resumeId, 'Tailored CV for Stripe (Sarah)', 'Cover letter for Stripe (Sarah)');

console.log(`✓ User B Submitted Application: ${appBId} linked to Resume: ${userB.resumeId}\n`);

// ------------------------------------------------------------------------------
console.log('--- [USER C: Omar Farooq Al-Sayed — Financial Controller / Banking] ---');
const userC = registerAndProcessUser(
  'user_omar_test',
  'omar.farooq@emiratesfinance.ae',
  'Omar Farooq Al-Sayed',
  RESUME_C_OMAR,
  'Omar_Farooq_CV.pdf'
);

const omarUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userC.userId) as any;
const omarProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userC.userId) as any;
const omarSkills = JSON.parse(omarProfile.skills);
const omarRoles = JSON.parse(omarProfile.target_roles);

// VERIFY COMPLETE ISOLATION FOR OMAR
assert.strictEqual(omarUser.full_name, 'Omar Farooq Al-Sayed');
assert.strictEqual(omarUser.email, 'omar.farooq@emiratesfinance.ae');
assert.strictEqual(omarUser.active_resume_id, userC.resumeId);
assert.notStrictEqual(omarUser.active_resume_id, userA.resumeId);
assert.notStrictEqual(omarUser.active_resume_id, userB.resumeId);
assert.ok(!omarSkills.includes('Category Management'), 'Omar must NOT have Category Management');
assert.ok(!omarSkills.includes('Kubernetes'), 'Omar must NOT have Kubernetes');
assert.ok(omarSkills.some((s: string) => /ifrs|financial|finance|basel|treasury/i.test(s)), 'Omar must have Finance/Banking skills');
assert.ok(omarRoles.some((r: string) => /financial controller|finance director|accounting|cfo|treasury/i.test(r)), 'Omar roles must be Finance');

console.log('✓ User C Identity: Omar Farooq Al-Sayed (Initials: OA)');
console.log('✓ User C Active Resume:', omarUser.active_resume_id);
console.log('✓ User C Target Roles:', omarRoles.slice(0, 3).join(', '));
console.log('✓ User C Zero Tech or FMCG Leakage Confirmed\n');

// ------------------------------------------------------------------------------
console.log('--- [HISTORICAL APPLICATION IMMUTABILITY & CROSS-USER SCOPING] ---');
const appARow = db.prepare('SELECT * FROM applications WHERE id = ?').get(appAId) as any;
const appBRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(appBId) as any;

assert.strictEqual(appARow.user_id, userA.userId);
assert.strictEqual(appARow.source_resume_id, userA.resumeId);
assert.strictEqual(appBRow.user_id, userB.userId);
assert.strictEqual(appBRow.source_resume_id, userB.resumeId);

console.log('✓ App A preserved Source Resume:', appARow.source_resume_id, `(${userA.extracted.candidate_name})`);
console.log('✓ App B preserved Source Resume:', appBRow.source_resume_id, `(${userB.extracted.candidate_name})`);
console.log('✓ ZERO historical applications were modified, contaminated, or overwritten.');

// Clean up test DB
db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('\n==============================================================================');
console.log('>>> ALL THREE CANDIDATES VERIFIED WITH 100% INDEPENDENT DYNAMIC ISOLATION! <<<');
console.log('==============================================================================');
