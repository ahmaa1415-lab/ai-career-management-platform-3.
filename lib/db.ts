import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure database directory exists and support configurable DATABASE_PATH
const defaultDataDir = path.join(process.cwd(), 'data');
export const dbPath = process.env.DATABASE_PATH || path.join(defaultDataDir, 'career_app.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database with singleton on globalThis to prevent multiple handles during HMR in Next.js dev
const globalForDb = globalThis as unknown as { _careerAppDb?: InstanceType<typeof Database> };
const db = globalForDb._careerAppDb || new Database(dbPath);
if (!globalForDb._careerAppDb) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');
  globalForDb._careerAppDb = db;
}

// Driver-level write barrier: protect all mutating statements against maintenance mode and track cross-process in-flight writes
import { acquireCrossProcessWriteLease } from './coordination';
const originalPrepare = db.prepare.bind(db);
(db as any).prepare = function (source: string) {
  const statement = originalPrepare(source);

  // Native SQLite engine classification via sqlite3_stmt_readonly
  if (!statement.readonly) {
    const originalRun = statement.run.bind(statement);
    statement.run = function (...params: any[]) {
      const lease = acquireCrossProcessWriteLease({
        processType: 'web',
        label: source.trim().substring(0, 40)
      });
      try {
        return originalRun(...params);
      } finally {
        lease.release();
      }
    };

    const originalGet = statement.get.bind(statement);
    statement.get = function (...params: any[]) {
      const lease = acquireCrossProcessWriteLease({
        processType: 'web',
        label: source.trim().substring(0, 40)
      });
      try {
        return originalGet(...params);
      } finally {
        lease.release();
      }
    };

    const originalAll = statement.all.bind(statement);
    statement.all = function (...params: any[]) {
      const lease = acquireCrossProcessWriteLease({
        processType: 'web',
        label: source.trim().substring(0, 40)
      });
      try {
        return originalAll(...params);
      } finally {
        lease.release();
      }
    };

    const originalIterate = statement.iterate.bind(statement);
    statement.iterate = function (...params: any[]) {
      const lease = acquireCrossProcessWriteLease({
        processType: 'web',
        label: source.trim().substring(0, 40)
      });
      try {
        return originalIterate(...params);
      } finally {
        lease.release();
      }
    };
  }

  return statement;
};

const originalExec = db.exec.bind(db);
(db as any).exec = function (source: string) {
  const lease = acquireCrossProcessWriteLease({
    processType: 'web',
    label: source.trim().substring(0, 40)
  });
  try {
    return originalExec(source);
  } finally {
    lease.release();
  }
};

const originalTransaction = db.transaction.bind(db);
(db as any).transaction = function (fn: any) {
  const wrappedTx = originalTransaction((...args: any[]) => {
    const lease = acquireCrossProcessWriteLease({
      processType: 'web',
      label: 'db.transaction'
    });
    try {
      return fn(...args);
    } finally {
      lease.release();
    }
  });
  return wrappedTx;
};

// Schema initialization
export function initializeSchema() {
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      availability TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_locations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_physical_location TEXT DEFAULT NULL,
      target_countries TEXT NOT NULL DEFAULT '[]',
      target_cities TEXT NOT NULL DEFAULT '[]',
      resume_derived_locations TEXT NOT NULL DEFAULT '[]',
      relocation_willing INTEGER NOT NULL DEFAULT 0,
      relocation_timeline TEXT,
      visa_sponsorship_required INTEGER NOT NULL DEFAULT 0,
      work_authorizations TEXT DEFAULT '[]',
      remote_eligibility TEXT,
      work_mode_preference TEXT NOT NULL DEFAULT 'Remote',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_research_authorized INTEGER DEFAULT 0,
      cv_analysis_authorized INTEGER DEFAULT 0,
      gmail_connected INTEGER DEFAULT 0,
      read_emails_authorized INTEGER DEFAULT 0,
      draft_emails_authorized INTEGER DEFAULT 0,
      send_emails_authorized INTEGER DEFAULT 0,
      submit_applications_authorized INTEGER DEFAULT 0,
      disclose_data_authorized INTEGER DEFAULT 0,
      scheduled_automation_desired INTEGER DEFAULT 0,
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
      structured_json TEXT,
      ats_score REAL DEFAULT 0,
      version INTEGER DEFAULT 1,
      original_filename TEXT,
      stored_file_path TEXT,
      file_type TEXT,
      file_size INTEGER DEFAULT 0,
      file_hash TEXT,
      upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      processing_status TEXT DEFAULT 'completed',
      extraction_status TEXT DEFAULT 'completed',
      extraction_timestamp DATETIME,
      extraction_version INTEGER DEFAULT 1,
      source_text_reference TEXT,
      extracted_profile_id TEXT,
      ats_report_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS job_listings (
      id TEXT PRIMARY KEY,
      employer TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      publication_date TEXT,
      application_deadline TEXT,
      salary_raw TEXT,
      min_salary INTEGER,
      max_salary INTEGER,
      currency TEXT,
      requirements TEXT DEFAULT '[]',
      experience_required_years REAL DEFAULT 0,
      seniority TEXT,
      visa_sponsorship TEXT DEFAULT 'Unknown',
      remote_eligibility TEXT DEFAULT 'Remote',
      is_verified INTEGER DEFAULT 1,
      raw_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      match_score REAL NOT NULL,
      match_details_json TEXT NOT NULL,
      tailored_cv_id TEXT REFERENCES resumes(id),
      cover_letter TEXT,
      screening_responses TEXT DEFAULT '{}',
      disclosures_accepted INTEGER DEFAULT 0,
      human_approved INTEGER DEFAULT 0,
      approved_at DATETIME,
      submission_type TEXT DEFAULT 'Manual',
      submission_confirmed INTEGER DEFAULT 0,
      applied_at DATETIME,
      recruiter_name TEXT,
      recruiter_email TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_draft INTEGER DEFAULT 1,
      is_sent INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL,
      timezone TEXT DEFAULT 'Africa/Cairo',
      content_markdown TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sandbox',
      profile_url TEXT,
      client_id TEXT,
      client_secret TEXT,
      access_token TEXT,
      sync_enabled INTEGER DEFAULT 1,
      last_synced_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, service)
    );

    CREATE TABLE IF NOT EXISTS company_portal_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES job_listings(id) ON DELETE SET NULL,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      employer TEXT NOT NULL,
      portal_platform TEXT NOT NULL,
      portal_url TEXT NOT NULL,
      account_email TEXT NOT NULL,
      account_username TEXT,
      password_hint TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      confirmation_reference TEXT,
      applied_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS linkedin_recruiter_activity (
      id TEXT PRIMARY KEY,
      author_name TEXT NOT NULL,
      author_title TEXT NOT NULL,
      company TEXT NOT NULL,
      post_text TEXT NOT NULL,
      job_title TEXT,
      location TEXT,
      publication_date TEXT NOT NULL,
      post_url TEXT NOT NULL,
      recruiter_profile_url TEXT,
      contact_instructions TEXT,
      author_avatar TEXT,
      is_verified INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS linkedin_company_updates (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      headline TEXT NOT NULL,
      update_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      career_relevance TEXT NOT NULL,
      publication_date TEXT NOT NULL,
      source_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS linkedin_industry_insights (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_title TEXT NOT NULL,
      company TEXT,
      publication_date TEXT NOT NULL,
      insights_summary TEXT NOT NULL,
      career_relevance TEXT NOT NULL,
      post_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved_opportunities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
      notes TEXT,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      filters_json TEXT DEFAULT '{}',
      results_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cv_evaluations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      cv_version INTEGER DEFAULT 1,
      cv_title TEXT NOT NULL,
      job_id TEXT REFERENCES job_listings(id) ON DELETE SET NULL,
      target_role TEXT NOT NULL,
      target_country TEXT NOT NULL,
      target_industry TEXT,
      human_recruiter_score REAL NOT NULL,
      ats_compatibility_score REAL NOT NULL,
      keyword_alignment_score REAL NOT NULL,
      recruiter_readability_score REAL NOT NULL,
      achievement_impact_score REAL NOT NULL,
      localization_score REAL NOT NULL,
      headhunter_discoverability_score REAL NOT NULL,
      job_fit_score REAL,
      scoring_methodology_version TEXT DEFAULT 'Senior Global HR & ATS Intelligence v2.0',
      criterion_scores_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recommendations_json TEXT NOT NULL,
      action_plan_json TEXT NOT NULL,
      tailored_cv_text TEXT,
      full_report_markdown TEXT NOT NULL,
      evaluation_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      job_alerts_enabled INTEGER DEFAULT 1,
      match_alerts_enabled INTEGER DEFAULT 1,
      application_status_alerts INTEGER DEFAULT 1,
      recruiter_activity_alerts INTEGER DEFAULT 1,
      interview_reminders INTEGER DEFAULT 1,
      daily_reports_enabled INTEGER DEFAULT 1,
      auto_sync_external_accounts INTEGER DEFAULT 0,
      rtl_enabled INTEGER DEFAULT 0,
      theme TEXT DEFAULT 'dark',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_deletion_leases (
      file_path TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      locked_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_coordination_leases (
      file_path TEXT NOT NULL,
      lease_type TEXT NOT NULL,
      locked_by TEXT NOT NULL,
      lease_token TEXT,
      locked_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      PRIMARY KEY (file_path, locked_by)
    );
    CREATE INDEX IF NOT EXISTS idx_file_coordination_lookup ON file_coordination_leases(file_path, lease_type, expires_at);
  `);

  // Safe idempotent column additions
  function safeAddColumn(table: string, columnDef: string) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
    } catch {
      // Column already exists, ignore
    }
  }

  safeAddColumn('file_coordination_leases', 'lease_token TEXT');

  safeAddColumn('users', 'password_hash TEXT');
  safeAddColumn('users', "role TEXT DEFAULT 'candidate'");
  safeAddColumn('users', 'is_verified INTEGER DEFAULT 1');
  safeAddColumn('users', 'profile_image TEXT');
  safeAddColumn('users', "timezone TEXT DEFAULT 'Africa/Cairo'");
  safeAddColumn('users', "language TEXT DEFAULT 'en'");
  safeAddColumn('users', 'google_id TEXT');
  safeAddColumn('users', 'linkedin_id TEXT');
  safeAddColumn('users', 'active_resume_id TEXT');

  safeAddColumn('profiles', 'active_resume_id TEXT');
  safeAddColumn('profile_locations', 'current_physical_location TEXT DEFAULT NULL');
  safeAddColumn('profile_locations', "resume_derived_locations TEXT DEFAULT '[]'");

  safeAddColumn('integrations', "auth_type TEXT DEFAULT 'oauth'");
  safeAddColumn('integrations', 'display_name TEXT');
  safeAddColumn('integrations', 'account_identifier TEXT');
  safeAddColumn('integrations', "capabilities_json TEXT DEFAULT '[]'");
  safeAddColumn('integrations', "permissions_json TEXT DEFAULT '[]'");
  safeAddColumn('integrations', 'error_message TEXT');

  safeAddColumn('job_listings', "application_type TEXT DEFAULT 'direct'");
  safeAddColumn('job_listings', 'company_portal_url TEXT');
  safeAddColumn('job_listings', "portal_platform TEXT DEFAULT 'Direct'");
  safeAddColumn('job_listings', 'original_publication_date TEXT');
  safeAddColumn('job_listings', 'last_updated_date TEXT');
  safeAddColumn('job_listings', 'last_verified_date TEXT');
  safeAddColumn('job_listings', "verification_status TEXT DEFAULT 'Verified Open'");
  safeAddColumn('job_listings', "verification_evidence TEXT DEFAULT '{}'");
  safeAddColumn('job_listings', "freshness_classification TEXT DEFAULT 'Recent'");
  safeAddColumn('job_listings', 'job_fit_score REAL DEFAULT 0');
  safeAddColumn('job_listings', 'ats_compatibility_score REAL DEFAULT 0');
  safeAddColumn('job_listings', 'ats_keyword_alignment_score REAL DEFAULT 0');
  safeAddColumn('job_listings', 'recruiter_readability_score REAL DEFAULT 0');
  safeAddColumn('job_listings', 'job_family TEXT');
  safeAddColumn('job_listings', 'duplicate_of_id TEXT');
  safeAddColumn('job_listings', "sources_json TEXT DEFAULT '[]'");
  safeAddColumn('job_listings', 'company_career_url TEXT');
  safeAddColumn('job_listings', 'company_linkedin_url TEXT');
  safeAddColumn('job_listings', 'application_destination TEXT');
  safeAddColumn('job_listings', 'reporting_line TEXT');
  safeAddColumn('job_listings', 'team_responsibilities TEXT');
  safeAddColumn('job_listings', "authenticity_status TEXT DEFAULT 'UNVERIFIED'");
  safeAddColumn('job_listings', 'final_destination_url TEXT');
  safeAddColumn('job_listings', 'requisition_id TEXT');
  safeAddColumn('job_listings', 'verification_method TEXT');
  safeAddColumn('job_listings', 'is_synthetic INTEGER DEFAULT 0');
  safeAddColumn('job_listings', "ingestion_provider_type TEXT DEFAULT 'official_career_page'");

  safeAddColumn('applications', 'external_portal_account_created INTEGER DEFAULT 0');
  safeAddColumn('applications', 'portal_account_id TEXT');
  safeAddColumn('applications', 'confirmation_reference TEXT');
  safeAddColumn('applications', 'source_resume_id TEXT');
  safeAddColumn('applications', 'resume_version INTEGER DEFAULT 1');
  safeAddColumn('applications', 'is_outdated INTEGER DEFAULT 0');
  safeAddColumn('applications', 'outdated_reason TEXT');
  safeAddColumn('applications', 'submission_confirmed_at DATETIME');
  safeAddColumn('applications', 'candidate_submission_notes TEXT');
  safeAddColumn('applications', 'employer_confirmation_received_at DATETIME');
  safeAddColumn('applications', 'employer_confirmation_evidence_type TEXT');
  safeAddColumn('applications', 'employer_confirmation_evidence TEXT');
  safeAddColumn('applications', 'evidence_status TEXT DEFAULT NULL');

  // Email delivery truthfulness columns
  safeAddColumn('emails', 'provider_message_id TEXT');
  safeAddColumn('emails', "delivery_status TEXT DEFAULT 'draft'");
  safeAddColumn('emails', 'delivery_provider TEXT');

  // Resume versioning and isolation columns
  safeAddColumn('resumes', 'original_filename TEXT');
  safeAddColumn('resumes', 'stored_file_path TEXT');
  safeAddColumn('resumes', 'file_type TEXT');
  safeAddColumn('resumes', 'file_size INTEGER DEFAULT 0');
  safeAddColumn('resumes', 'file_hash TEXT');
  safeAddColumn('resumes', 'upload_timestamp DATETIME');
  safeAddColumn('resumes', "processing_status TEXT DEFAULT 'completed'");
  safeAddColumn('resumes', "extraction_status TEXT DEFAULT 'completed'");
  safeAddColumn('resumes', "parsing_status TEXT DEFAULT 'completed'");
  safeAddColumn('resumes', "analysis_status TEXT DEFAULT 'completed'");
  safeAddColumn('resumes', 'processing_error TEXT');
  safeAddColumn('resumes', 'extraction_timestamp DATETIME');
  safeAddColumn('resumes', 'extraction_version INTEGER DEFAULT 1');
  safeAddColumn('resumes', 'source_text_reference TEXT');
  safeAddColumn('resumes', 'extracted_profile_id TEXT');
  safeAddColumn('resumes', 'ats_report_id TEXT');

  // Indexes for high performance isolation & lookups
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resumes_file_hash ON resumes(file_hash);
      CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON resumes(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_extracted_profiles_resume ON extracted_profiles(resume_id);
      CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
      CREATE INDEX IF NOT EXISTS idx_emails_user_category ON emails(user_id, category);
    `);
  } catch {}
  } catch (err: any) {
    if (err?.code === 'MAINTENANCE_MODE_ACTIVE') {
      // Cleanly skip schema initialization when maintenance mode is active at startup
      return;
    }
    throw err;
  }
}

// Automatically initialize schema on first import
initializeSchema();

// Audit log helper
export function logAudit(action: string, details: Record<string, any>, userId = 'default-user', ipAddress = '127.0.0.1') {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(`audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, userId, action, JSON.stringify(details), ipAddress);
}

// Single default user provisioning
export function getOrCreateDefaultUser() {
  const findStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  let user = findStmt.get('user_default_01') as any;
  if (!user) {
    const insertStmt = db.prepare(`
      INSERT INTO users (id, email, full_name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        full_name = excluded.full_name
    `);
    const id = 'user_default_01';
    insertStmt.run(id, 'candidate@example.com', 'Career Candidate');
    user = { id, email: 'candidate@example.com', full_name: 'Career Candidate' };
    logAudit('USER_INITIALIZED', { email: user.email }, user.id);
  }
  return user;
}

export function saveCVEvaluation(record: {
  id: string;
  user_id: string;
  resume_id?: string | null;
  cv_version?: number;
  cv_title: string;
  job_id?: string | null;
  target_role: string;
  target_country: string;
  target_industry?: string | null;
  human_recruiter_score: number;
  ats_compatibility_score: number;
  keyword_alignment_score: number;
  recruiter_readability_score: number;
  achievement_impact_score: number;
  localization_score: number;
  headhunter_discoverability_score: number;
  job_fit_score?: number | null;
  scoring_methodology_version?: string;
  criterion_scores_json: string;
  evidence_json: string;
  recommendations_json: string;
  action_plan_json: string;
  tailored_cv_text?: string | null;
  full_report_markdown: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO cv_evaluations (
      id, user_id, resume_id, cv_version, cv_title, job_id, target_role, target_country, target_industry,
      human_recruiter_score, ats_compatibility_score, keyword_alignment_score, recruiter_readability_score,
      achievement_impact_score, localization_score, headhunter_discoverability_score, job_fit_score,
      scoring_methodology_version, criterion_scores_json, evidence_json, recommendations_json,
      action_plan_json, tailored_cv_text, full_report_markdown
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  stmt.run(
    record.id,
    record.user_id,
    record.resume_id || null,
    record.cv_version || 1,
    record.cv_title,
    record.job_id || null,
    record.target_role,
    record.target_country,
    record.target_industry || null,
    record.human_recruiter_score,
    record.ats_compatibility_score,
    record.keyword_alignment_score,
    record.recruiter_readability_score,
    record.achievement_impact_score,
    record.localization_score,
    record.headhunter_discoverability_score,
    record.job_fit_score || null,
    record.scoring_methodology_version || 'Senior Global HR & ATS Intelligence v2.0',
    record.criterion_scores_json,
    record.evidence_json,
    record.recommendations_json,
    record.action_plan_json,
    record.tailored_cv_text || null,
    record.full_report_markdown
  );

  return record;
}

export function getCVEvaluations(userId = 'user_default_01', limit = 20, resumeId?: string) {
  if (resumeId) {
    const stmt = db.prepare(`
      SELECT * FROM cv_evaluations
      WHERE user_id = ? AND resume_id = ?
      ORDER BY evaluation_date DESC
      LIMIT ?
    `);
    return stmt.all(userId, resumeId, limit) as any[];
  }
  const stmt = db.prepare(`
    SELECT * FROM cv_evaluations
    WHERE user_id = ?
    ORDER BY evaluation_date DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit) as any[];
}

export function getCVEvaluationById(id: string) {
  const stmt = db.prepare('SELECT * FROM cv_evaluations WHERE id = ?');
  return stmt.get(id) as any;
}

export function getActiveResume(userId = 'user_default_01') {
  // Check user active_resume_id first
  const user = db.prepare('SELECT active_resume_id FROM users WHERE id = ?').get(userId) as any;
  if (user?.active_resume_id) {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(user.active_resume_id) as any;
    if (resume) return resume;
  }
  // Fall back to most recent Master resume
  const master = db.prepare(`
    SELECT * FROM resumes
    WHERE user_id = ? AND type = 'Master'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId) as any;
  return master || null;
}

export function setActiveResume(userId: string, resumeId: string) {
  db.prepare('UPDATE users SET active_resume_id = ? WHERE id = ?').run(resumeId, userId);
  try {
    db.prepare('UPDATE profiles SET active_resume_id = ? WHERE user_id = ?').run(resumeId, userId);

    const ext = db.prepare(`
      SELECT * FROM extracted_profiles
      WHERE resume_id = ? OR id = (SELECT extracted_profile_id FROM resumes WHERE id = ?)
      LIMIT 1
    `).get(resumeId, resumeId) as any;

    if (ext) {
      if (ext.candidate_name && ext.candidate_name !== 'Candidate') {
        db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(ext.candidate_name, userId);
      }
      if (ext.email) {
        try {
          db.prepare('UPDATE users SET email = ? WHERE id = ?').run(ext.email, userId);
        } catch {}
      }

      const hl = (ext.current_headline || '').toLowerCase();
      let roles: string[] = [];
      let industries: string[] = [];

      if (/software|cloud|developer|engineer|full stack|backend|frontend|devops|architect/i.test(hl)) {
        roles = ['Principal Cloud Architect', 'Senior Software Engineer', 'Staff Backend Engineer', 'DevOps Lead'];
        industries = ['Software Engineering & Technology', 'Cloud & SaaS'];
      } else if (/category|fmcg|trade marketing|retail buyer|commercial/i.test(hl)) {
        roles = ['Senior Category Manager', 'Trade Marketing Manager', 'Commercial Lead', 'Retail Merchandising Manager'];
        industries = ['Fast-Moving Consumer Goods (FMCG)', 'Retail & E-commerce'];
      } else if (/finance|financial|accountant|accounting|audit|cpa|controller/i.test(hl)) {
        roles = ['Senior Financial Analyst', 'Corporate Valuation Lead', 'Internal Audit Manager', 'Financial Controller'];
        industries = ['Finance & Accounting', 'Audit & Advisory'];
      } else if (/supply chain|logistics|procurement|operations/i.test(hl)) {
        roles = ['VP of Global Supply Chain', 'Director of Logistics & Operations', 'Head of Strategic Procurement', 'Supply Chain Transformation Lead'];
        industries = ['Supply Chain & Logistics', 'Global Operations & Manufacturing'];
      } else {
        const title = ext.current_headline || 'Senior Professional';
        roles = [
          title,
          `Director of ${title.replace(/Senior|Staff|Principal|Lead|Manager/gi, '').trim() || 'Operations'}`,
          `Lead ${title.replace(/Senior|Staff|Principal|Lead/gi, '').trim() || 'Strategist'}`,
          `Strategic ${title}`
        ].filter(Boolean);
        industries = ['Global Enterprise & Technology', 'Cross-Industry Operations'];
      }

      if (ext.industries_json) {
        try {
          const parsedInd = JSON.parse(ext.industries_json);
          if (Array.isArray(parsedInd) && parsedInd.length > 0) {
            industries = parsedInd;
          }
        } catch {}
      }

      let expSummary = '';
      try {
        const exps = JSON.parse(ext.experiences_json || '[]');
        if (exps.length > 0 && exps[0].responsibilities && exps[0].responsibilities.length > 0) {
          expSummary = exps[0].responsibilities.slice(0, 3).join('. ');
        }
      } catch {}
      if (!expSummary) expSummary = ext.career_progression || '';

      db.prepare(`
        UPDATE profiles SET
          headline = ?,
          summary = ?,
          experience_years = ?,
          skills = ?,
          target_roles = ?,
          target_industries = ?,
          target_seniority = ?
        WHERE user_id = ?
      `).run(
        ext.current_headline || 'Professional',
        expSummary,
        ext.total_experience_years || 5,
        ext.skills_json || '[]',
        JSON.stringify(roles),
        JSON.stringify(industries),
        ext.detected_seniority || 'Senior',
        userId
      );

      if (ext.location) {
        try {
          // Strictly store extracted location as resume-derived fact
          // NEVER overwrite current_physical_location or target_countries
          const existingLoc = db.prepare('SELECT resume_derived_locations FROM profile_locations WHERE user_id = ?').get(userId) as any;
          let derived: string[] = [];
          if (existingLoc && existingLoc.resume_derived_locations) {
            try { derived = JSON.parse(existingLoc.resume_derived_locations); } catch {}
          }
          if (!derived.includes(ext.location)) {
            derived.push(ext.location);
          }
          db.prepare(`
            UPDATE profile_locations SET
              resume_derived_locations = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `).run(JSON.stringify(derived), userId);
        } catch {}
      }
    }

    // Invalidate unsubmitted applications generated from prior resumes, preserving submitted applications intact
    db.prepare(`
      UPDATE applications
      SET is_outdated = 1,
          outdated_reason = 'Generated from prior resume version. Please review and regenerate package with latest CV.'
      WHERE user_id = ?
        AND status IN ('Approval Pending', 'Ready to Apply')
        AND (source_resume_id IS NULL OR source_resume_id != ?)
    `).run(userId, resumeId);
  } catch (err: any) {
    console.warn('Could not sync profile on setActiveResume:', err.message);
  }
}

export default db;
