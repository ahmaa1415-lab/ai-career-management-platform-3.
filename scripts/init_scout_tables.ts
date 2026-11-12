import Database from 'better-sqlite3';

const db = new Database('./data/career_app.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS linkedin_messages (
    id TEXT PRIMARY KEY,
    application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recruiter_name TEXT,
    recruiter_profile_url TEXT,
    subject TEXT,
    message_body TEXT NOT NULL,
    sender_profile_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('linkedin_messages table created successfully.');
