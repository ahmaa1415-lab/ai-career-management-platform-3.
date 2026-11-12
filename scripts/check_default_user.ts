import Database from 'better-sqlite3';

const db = new Database('data/career_app.db');

console.log('=== USER_DEFAULT_01 RECORD ===');
const user = db.prepare('SELECT id, email, full_name, role, created_at FROM users WHERE id = ?').get('user_default_01');
console.log('User:', user);

const profile = db.prepare('SELECT id, user_id, headline, active_resume_id FROM profiles WHERE user_id = ?').get('user_default_01');
console.log('Profile:', profile);

const defaultResumes = db.prepare('SELECT id, title, type, ats_score, created_at FROM resumes WHERE user_id = ?').all('user_default_01');
console.log('Resumes Count:', defaultResumes.length);
console.log('Sample Resumes:', defaultResumes.slice(0, 5));
