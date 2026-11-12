import Database from 'better-sqlite3';
import { getFullProfile } from '../lib/onboarding';

const db = new Database('data/career_app.db');
const AYA_USER_ID = 'usr_test_1794332969504_nx3qt';
const AYA_RESUME_ID = 'res_1794333004581_16333207';

async function runSyncAndIsolationTest() {
  console.log('========================================================================');
  console.log('RUNNING RESUME SYNCHRONIZATION & MULTI-USER ISOLATION TEST');
  console.log('========================================================================');

  // 1. Snapshot Aya profile before test
  const ayaProfileBefore = getFullProfile(AYA_USER_ID, AYA_RESUME_ID);
  console.log(`[AYA BEFORE] Headline: ${ayaProfileBefore.profile.headline}, Target: ${ayaProfileBefore.profile.target_roles?.[0]}`);

  // 2. Create Temporary Test Candidate Profile
  const tempUserId = `temp_sync_test_${Date.now()}`;
  const tempResumeId = `temp_res_${Date.now()}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, created_at)
    VALUES (?, ?, 'dummy_hash', 'Temp Isolated User', 'candidate', datetime('now'))
  `).run(tempUserId, `${tempUserId}@isolation.test`);

  db.prepare(`
    INSERT INTO profiles (id, user_id, onboarding_completed, headline, summary, current_status, experience_years, skills, languages, target_roles, target_industries, active_resume_id)
    VALUES (?, ?, 1, 'Data Science Lead', 'Test Data Summary', 'Employed', 6, '["Python","PyTorch","SQL"]', '["English"]', '["Principal Data Scientist"]', '["AI & Machine Learning"]', ?)
  `).run(`prof_${tempUserId}`, tempUserId, tempResumeId);

  db.prepare(`
    INSERT INTO resumes (id, user_id, title, original_filename, stored_file_path, type, ats_score, version, raw_text, created_at)
    VALUES (?, ?, 'Original — Temp_Data_Scientist.pdf', 'Temp_Data_Scientist.pdf', 'data/uploads/temp.pdf', 'Master', 88, 1, 'Data Science Resume Text', datetime('now'))
  `).run(tempResumeId, tempUserId);

  // 3. Inspect Temp User Profile
  const tempProfile = getFullProfile(tempUserId, tempResumeId);
  console.log(`[TEMP USER] Headline: ${tempProfile.profile.headline}, Target: ${tempProfile.profile.target_roles?.[0]}`);

  // 4. Verify Aya profile is completely unchanged
  const ayaProfileAfter = getFullProfile(AYA_USER_ID, AYA_RESUME_ID);
  console.log(`[AYA AFTER] Headline: ${ayaProfileAfter.profile.headline}, Target: ${ayaProfileAfter.profile.target_roles?.[0]}`);

  const isolationSuccess = 
    ayaProfileBefore.profile.headline === ayaProfileAfter.profile.headline &&
    ayaProfileAfter.profile.headline !== tempProfile.profile.headline &&
    ayaProfileAfter.master_cv?.id === AYA_RESUME_ID;

  console.log(`\nISOLATION ASSERTION: ${isolationSuccess ? 'PASSED (Zero Leakage)' : 'FAILED'}`);

  // 5. Clean up temporary test data
  db.prepare('DELETE FROM resumes WHERE id = ?').run(tempResumeId);
  db.prepare('DELETE FROM profiles WHERE user_id = ?').run(tempUserId);
  db.prepare('DELETE FROM users WHERE id = ?').run(tempUserId);
  console.log('Temporary test data cleaned up safely.');
}

runSyncAndIsolationTest().catch(console.error);
