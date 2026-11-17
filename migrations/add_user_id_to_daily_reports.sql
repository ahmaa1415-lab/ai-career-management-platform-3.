-- ==============================================================================
-- MIGRATION: add_user_id_to_daily_reports.sql
-- PURPOSE: Deterministic, Fail-Closed Tenant Migration for daily_reports
-- STRICT RULE: DO NOT EXECUTE ON PRODUCTION WITHOUT MAINTENANCE WINDOW SIGN-OFF
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PRE-MIGRATION VALIDATION QUERIES (Run these before applying migration)
-- ------------------------------------------------------------------------------

-- 1. Total daily reports in database
-- SELECT COUNT(*) AS pre_total_reports FROM daily_reports;

-- 2. Uniquely attributable reports (strictly 1 distinct non-null user in audit_logs matching an existing user)
-- SELECT COUNT(*) AS pre_uniquely_attributable_reports
-- FROM daily_reports dr
-- WHERE EXISTS (
--   SELECT 1
--   FROM (
--     SELECT
--       json_extract(al.details, '$.report_id') AS report_id,
--       MAX(al.user_id) AS user_id
--     FROM audit_logs al
--     JOIN users u ON u.id = al.user_id
--     WHERE al.action = 'DAILY_REPORT_GENERATED'
--       AND al.user_id IS NOT NULL
--       AND json_extract(al.details, '$.report_id') IS NOT NULL
--     GROUP BY json_extract(al.details, '$.report_id')
--     HAVING COUNT(DISTINCT al.user_id) = 1
--   ) m
--   WHERE m.report_id = dr.id
-- );

-- 3. Ambiguous reports (associated with > 1 distinct user in audit_logs)
-- SELECT COUNT(*) AS pre_ambiguous_reports
-- FROM daily_reports dr
-- WHERE EXISTS (
--   SELECT 1 FROM audit_logs al
--   WHERE al.action = 'DAILY_REPORT_GENERATED'
--     AND json_extract(al.details, '$.report_id') = dr.id
--     AND al.user_id IS NOT NULL
--   GROUP BY json_extract(al.details, '$.report_id')
--   HAVING COUNT(DISTINCT al.user_id) > 1
-- );

-- 4. Orphaned reports (zero matching audit logs with exact action, or only null user_ids, or user not in users table)
-- SELECT COUNT(*) AS pre_orphaned_reports
-- FROM daily_reports dr
-- WHERE NOT EXISTS (
--   SELECT 1
--   FROM (
--     SELECT
--       json_extract(al.details, '$.report_id') AS report_id,
--       MAX(al.user_id) AS user_id
--     FROM audit_logs al
--     JOIN users u ON u.id = al.user_id
--     WHERE al.action = 'DAILY_REPORT_GENERATED'
--       AND al.user_id IS NOT NULL
--       AND json_extract(al.details, '$.report_id') IS NOT NULL
--     GROUP BY json_extract(al.details, '$.report_id')
--     HAVING COUNT(DISTINCT al.user_id) = 1
--   ) m
--   WHERE m.report_id = dr.id
-- );

-- ------------------------------------------------------------------------------
-- STEP 1: Add user_id column with Foreign Key Reference
-- SQLite 3.7.11+ supports ALTER TABLE ADD COLUMN with REFERENCES.
-- The column is NULLABLE to allow safe, fail-closed handling of ambiguous reports.
-- ------------------------------------------------------------------------------
ALTER TABLE daily_reports ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------------------
-- STEP 2: Deterministic, Fail-Closed Backfill Using Derived Ownership Mapping
-- Rules:
-- 1. Matches ONLY exact action 'DAILY_REPORT_GENERATED'.
-- 2. Groups by report ID extracted from audit_logs details JSON.
-- 3. Evaluates only non-null user_ids; ignores NULL audit events.
-- 4. Verifies candidate user exists in users table via INNER JOIN.
-- 5. Assigns user_id ONLY IF COUNT(DISTINCT al.user_id) = 1.
-- 6. Fully aggregated SELECT: uses MAX(al.user_id), never bare unaggregated columns.
-- 7. Zero LIMIT 1 or arbitrary row selection.
-- 8. Ambiguous reports (>1 user) and orphaned reports remain NULL.
-- ------------------------------------------------------------------------------
UPDATE daily_reports
SET user_id = (
  SELECT m.user_id
  FROM (
    SELECT
      json_extract(al.details, '$.report_id') AS report_id,
      MAX(al.user_id) AS user_id
    FROM audit_logs al
    JOIN users u ON u.id = al.user_id
    WHERE al.action = 'DAILY_REPORT_GENERATED'
      AND al.user_id IS NOT NULL
      AND json_extract(al.details, '$.report_id') IS NOT NULL
    GROUP BY json_extract(al.details, '$.report_id')
    HAVING COUNT(DISTINCT al.user_id) = 1
  ) m
  WHERE m.report_id = daily_reports.id
)
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT
      json_extract(al.details, '$.report_id') AS report_id,
      MAX(al.user_id) AS user_id
    FROM audit_logs al
    JOIN users u ON u.id = al.user_id
    WHERE al.action = 'DAILY_REPORT_GENERATED'
      AND al.user_id IS NOT NULL
      AND json_extract(al.details, '$.report_id') IS NOT NULL
    GROUP BY json_extract(al.details, '$.report_id')
    HAVING COUNT(DISTINCT al.user_id) = 1
  ) m
  WHERE m.report_id = daily_reports.id
);

-- ------------------------------------------------------------------------------
-- STEP 3: Create Covering Indexes for Tenant Queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON daily_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);

-- ------------------------------------------------------------------------------
-- POST-MIGRATION VALIDATION QUERIES
-- ------------------------------------------------------------------------------

-- 1. Total reports
-- SELECT COUNT(*) AS post_total_reports FROM daily_reports;

-- 2. Reports successfully assigned
-- SELECT COUNT(*) AS post_assigned_reports FROM daily_reports WHERE user_id IS NOT NULL;

-- 3. Reports left NULL (must exactly equal pre_ambiguous_reports + pre_orphaned_reports)
-- SELECT COUNT(*) AS post_remaining_null_reports FROM daily_reports WHERE user_id IS NULL;

-- 4. Verify Foreign Key Integrity (must return 0 rows)
-- PRAGMA foreign_key_check(daily_reports);

-- ==============================================================================
-- ROLLBACK PROCEDURE
-- ==============================================================================
-- In case of any rollback requirement:
--
-- For SQLite 3.35.0+ (standard in Node 18+ / better-sqlite3):
--   DROP INDEX IF EXISTS idx_daily_reports_user_date;
--   DROP INDEX IF EXISTS idx_daily_reports_user_id;
--   ALTER TABLE daily_reports DROP COLUMN user_id;
--
-- For legacy SQLite (<3.35.0):
--   BEGIN TRANSACTION;
--   CREATE TABLE daily_reports_backup (
--     id TEXT PRIMARY KEY,
--     report_date TEXT NOT NULL,
--     timezone TEXT DEFAULT 'Africa/Cairo',
--     content_markdown TEXT NOT NULL,
--     metrics_json TEXT NOT NULL,
--     generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
--   );
--   INSERT INTO daily_reports_backup (id, report_date, timezone, content_markdown, metrics_json, generated_at)
--   SELECT id, report_date, timezone, content_markdown, metrics_json, generated_at FROM daily_reports;
--   DROP TABLE daily_reports;
--   ALTER TABLE daily_reports_backup RENAME TO daily_reports;
--   COMMIT;
-- ==============================================================================
