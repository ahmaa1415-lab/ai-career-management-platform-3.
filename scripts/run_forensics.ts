import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('data/career_app.db');

console.log('========================================================================');
console.log('PHASE 1: ACCOUNT & DATA FORENSICS AUDIT');
console.log('========================================================================\n');

// 1. Users
console.log('--- ALL USERS ---');
const users = db.prepare('SELECT id, email, full_name, role, created_at FROM users').all() as any[];
for (const u of users) {
  let category = 'Uncertain';
  if (u.id === 'user_default_01') category = 'Legacy Seed Data (Mixed with Test Data)';
  else if (u.id.includes('test') || u.email.includes('test') || u.email.includes('local')) category = 'Test Data';
  else if (u.email.includes('aya') || u.full_name.includes('Aya')) category = 'Candidate Account Candidate';
  console.log(`User: [${u.id}] ${u.full_name} <${u.email}> (${u.role}) -> ${category}`);
}

// 2. Resumes associated with Aya
console.log('\n--- RESUMES ASSOCIATED WITH AYA (BY USER_ID, TITLE, OR FILENAME) ---');
const resumes = db.prepare(`
  SELECT id, user_id, title, original_filename, stored_file_path, type, ats_score, version, created_at
  FROM resumes
  WHERE user_id IN ('user_default_01', 'usr_test_1794332969504_nx3qt', 'usr_1794269673590_9gky2', 'usr_test_1794331957190_o2isq')
     OR title LIKE '%Aya%'
     OR original_filename LIKE '%Aya%'
     OR stored_file_path LIKE '%Aya%'
`).all() as any[];

console.log(`Total resumes matching Aya criteria: ${resumes.length}`);
for (const r of resumes.slice(0, 15)) {
  console.log(`- [${r.id}] (User: ${r.user_id}) "${r.title}" | File: ${r.original_filename || 'N/A'} | Type: ${r.type} | ATS: ${r.ats_score}`);
}

// 3. Inspect real files in data/uploads matching Aya
console.log('\n--- PHYSICAL PDF FILES IN DATA/UPLOADS ---');
const uploadFiles = fs.readdirSync('data/uploads').filter(f => f.toLowerCase().includes('aya'));
for (const f of uploadFiles) {
  const filePath = path.join('data/uploads', f);
  const stat = fs.statSync(filePath);
  console.log(`File: ${f} | Size: ${stat.size} bytes | Modified: ${stat.mtime.toISOString()}`);
}

// 4. Extracted Profiles
console.log('\n--- EXTRACTED PROFILES ---');
const extProfiles = db.prepare(`
  SELECT id, resume_id, user_id, candidate_name, current_headline, detected_seniority, total_experience_years
  FROM extracted_profiles
  WHERE candidate_name LIKE '%Aya%' OR user_id IN ('usr_test_1794332969504_nx3qt', 'user_default_01')
`).all() as any[];
for (const ep of extProfiles) {
  console.log(`Extracted: [${ep.id}] (User: ${ep.user_id}, Resume: ${ep.resume_id}) Name: ${ep.candidate_name} | Headline: ${ep.current_headline} | Seniority: ${ep.detected_seniority} | Exp: ${ep.total_experience_years}y`);
}

// 5. Applications Count
console.log('\n--- APPLICATIONS BY USER ---');
const appCounts = db.prepare('SELECT user_id, count(*) as count FROM applications GROUP BY user_id').all() as any[];
for (const ac of appCounts) {
  console.log(`User: ${ac.user_id} -> ${ac.count} applications`);
}
