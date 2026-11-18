-- ==============================================================================
-- MIGRATION: add_user_id_to_emails.sql
-- PURPOSE: Deterministic, Fail-Closed Tenant Migration for emails
-- STRICT RULE: DO NOT EXECUTE ON PRODUCTION WITHOUT MAINTENANCE WINDOW SIGN-OFF
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PRE-MIGRATION VALIDATION QUERIES (Run these before applying migration)
-- ------------------------------------------------------------------------------

-- 1. Total emails in database
-- SELECT COUNT(*) AS pre_total_emails FROM emails;

-- 2. Attributable emails (linked to an existing application owned by an existing user)
-- SELECT COUNT(*) AS pre_attributable_emails
-- FROM emails e
-- WHERE e.application_id IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM applications a
--     JOIN users u ON u.id = a.user_id
--     WHERE a.id = e.application_id
--   );

-- 3. Unowned / ambiguous legacy emails (unlinked or linked to non-existent application/user)
-- SELECT COUNT(*) AS pre_unowned_emails
-- FROM emails e
-- WHERE e.application_id IS NULL
--    OR NOT EXISTS (
--      SELECT 1 FROM applications a
--      JOIN users u ON u.id = a.user_id
--      WHERE a.id = e.application_id
--    );

-- ------------------------------------------------------------------------------
-- TRANSACTION BOUNDARY: EXCLUSIVE WRITE LOCK
-- Prevents concurrent write operations from racing during schema mutation.
-- If any statement fails, the entire transaction is automatically rolled back.
-- ------------------------------------------------------------------------------
BEGIN EXCLUSIVE TRANSACTION;

-- ------------------------------------------------------------------------------
-- STEP 0: Ensure Migration Tracking Table Exists
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INTEGER DEFAULT 0,
  checksum TEXT
);

-- ------------------------------------------------------------------------------
-- STEP 1: Add user_id column with Foreign Key Reference
-- SQLite 3.7.11+ supports ALTER TABLE ADD COLUMN with REFERENCES.
-- The column is NULLABLE to allow safe, fail-closed isolation of legacy unowned records.
-- ------------------------------------------------------------------------------
ALTER TABLE emails ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------------------
-- STEP 2: Deterministic, Fail-Closed Backfill Using Trusted Application Ownership
-- Rules:
-- 1. Derives ownership exclusively from applications.user_id via applications.id.
-- 2. Never infers ownership from untrusted sender or recipient text headers.
-- 3. Only assigns if target application exists and belongs to a verified user in users table.
-- 4. Ambiguous and unlinked emails (e.g. system seed emails) remain strictly NULL.
-- ------------------------------------------------------------------------------
UPDATE emails
SET user_id = (
  SELECT a.user_id
  FROM applications a
  JOIN users u ON u.id = a.user_id
  WHERE a.id = emails.application_id
)
WHERE emails.application_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM applications a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = emails.application_id
  );

-- ------------------------------------------------------------------------------
-- STEP 3: Create Covering Indexes for Tenant Scoped Queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_user_category ON emails(user_id, category);

-- ------------------------------------------------------------------------------
-- STEP 4: Record Migration In Tracking Table
-- ------------------------------------------------------------------------------
INSERT INTO schema_migrations (id, applied_at, execution_time_ms, checksum)
VALUES ('add_user_id_to_emails', CURRENT_TIMESTAMP, 0, 'manual_sql_script');

COMMIT;

-- ------------------------------------------------------------------------------
-- POST-MIGRATION VALIDATION QUERIES
-- ------------------------------------------------------------------------------

-- 1. Total emails (must match pre_total_emails)
-- SELECT COUNT(*) AS post_total_emails FROM emails;

-- 2. Attributed emails (must match pre_attributable_emails)
-- SELECT COUNT(*) AS post_assigned_emails FROM emails WHERE user_id IS NOT NULL;

-- 3. Unassigned legacy emails (must match pre_unowned_emails)
-- SELECT COUNT(*) AS post_unassigned_emails FROM emails WHERE user_id IS NULL;

-- 4. Verify Foreign Key Integrity (must return 0 rows)
-- PRAGMA foreign_key_check(emails);

-- ==============================================================================
-- ROLLBACK PROCEDURE
-- ==============================================================================
-- In case of any rollback requirement:
--
-- For SQLite 3.35.0+ (standard in Node 18+ / better-sqlite3):
--   DROP INDEX IF EXISTS idx_emails_user_category;
--   DROP INDEX IF EXISTS idx_emails_user_id;
--   ALTER TABLE emails DROP COLUMN user_id;
--
-- For legacy SQLite (<3.35.0):
--   BEGIN TRANSACTION;
--   CREATE TABLE emails_backup (
--     id TEXT PRIMARY KEY,
--     application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
--     category TEXT NOT NULL,
--     sender TEXT NOT NULL,
--     recipient TEXT NOT NULL,
--     subject TEXT NOT NULL,
--     body TEXT NOT NULL,
--     is_draft INTEGER DEFAULT 1,
--     is_sent INTEGER DEFAULT 0,
--     sent_at DATETIME,
--     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--     provider_message_id TEXT,
--     delivery_status TEXT DEFAULT 'draft',
--     delivery_provider TEXT
--   );
--   INSERT INTO emails_backup SELECT id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at, created_at, provider_message_id, delivery_status, delivery_provider FROM emails;
--   DROP TABLE emails;
--   ALTER TABLE emails_backup RENAME TO emails;
--   COMMIT;
-- ==============================================================================
