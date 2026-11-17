/**
 * Synthetic Test: Deterministic Fail-Closed daily_reports Migration & Rollback
 *
 * Runs exclusively on an isolated SQLite test database.
 * Does NOT touch production data.
 *
 * Verifies all 7 deterministic attribution scenarios:
 * 1. Exactly one valid user.
 * 2. One valid user plus NULL audit entries.
 * 3. Two distinct users.
 * 4. Only NULL user IDs.
 * 5. No matching audit record.
 * 6. A user ID absent from users.
 * 7. Duplicate audit events for the same user.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

const testDbDir = path.join(process.cwd(), 'data', 'test_tenant_isolation');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, `test_migration_${Date.now()}_${randomBytes(4).toString('hex')}.db`);

const db = new Database(testDbPath);
db.pragma('foreign_keys = ON');

try {
  console.log('\n========================================================');
  console.log('--- TESTING DETERMINISTIC DAILY_REPORTS MIGRATION ---');
  console.log('========================================================\n');

  // 1. Setup schema matching pre-migration state
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE daily_reports (
      id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL,
      timezone TEXT DEFAULT 'Africa/Cairo',
      content_markdown TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Seed synthetic users in users table: u1 and u2 exist; u_ghost does NOT exist
  db.prepare("INSERT INTO users VALUES ('u1', 'u1@example.com', 'User 1')").run();
  db.prepare("INSERT INTO users VALUES ('u2', 'u2@example.com', 'User 2')").run();

  // 3. Seed synthetic daily reports matching the 7 scenarios:

  // Scenario 1: Exactly one valid user (u1)
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_1', '2026-11-14', 'content 1', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a1', 'u1', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_1'))").run();

  // Scenario 2: One valid user (u2) plus NULL audit entries
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_2', '2026-11-14', 'content 2', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a2_valid', 'u2', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_2'))").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a2_null', NULL, 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_2'))").run();

  // Scenario 3: Two distinct users (u1 and u2) -> Ambiguous, must remain NULL
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_3', '2026-11-14', 'content 3', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a3_u1', 'u1', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_3'))").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a3_u2', 'u2', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_3'))").run();

  // Scenario 4: Only NULL user IDs -> Orphaned, must remain NULL
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_4', '2026-11-14', 'content 4', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a4_null1', NULL, 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_4'))").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a4_null2', NULL, 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_4'))").run();

  // Scenario 5: No matching audit record -> Orphaned, must remain NULL
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_5', '2026-11-14', 'content 5', '{}')").run();

  // Scenario 6: A user ID absent from users table ('u_ghost') -> Foreign key invalid, must remain NULL
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_6', '2026-11-14', 'content 6', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a6_ghost', 'u_ghost', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_6'))").run();

  // Scenario 7: Duplicate audit events for the same valid user (u1) -> Exactly one user, must be assigned to u1
  db.prepare("INSERT INTO daily_reports (id, report_date, content_markdown, metrics_json) VALUES ('rep_7', '2026-11-14', 'content 7', '{}')").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a7_dup1', 'u1', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_7'))").run();
  db.prepare("INSERT INTO audit_logs (id, user_id, action, details) VALUES ('a7_dup2', 'u1', 'DAILY_REPORT_GENERATED', json_object('report_id', 'rep_7'))").run();

  // 4. PRE-MIGRATION VALIDATION
  const preTotal = (db.prepare('SELECT COUNT(*) AS count FROM daily_reports').get() as any).count;
  assert.strictEqual(preTotal, 7, 'Pre-migration total reports must be 7');

  const preUniquelyAttributable = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM daily_reports dr
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
      WHERE m.report_id = dr.id
    )
  `).get() as any).count;
  assert.strictEqual(preUniquelyAttributable, 3, 'Pre-migration uniquely attributable must be 3 (rep_1, rep_2, rep_7)');

  const preAmbiguous = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM daily_reports dr
    WHERE EXISTS (
      SELECT 1 FROM audit_logs al
      WHERE al.action = 'DAILY_REPORT_GENERATED'
        AND json_extract(al.details, '$.report_id') = dr.id
        AND al.user_id IS NOT NULL
      GROUP BY json_extract(al.details, '$.report_id')
      HAVING COUNT(DISTINCT al.user_id) > 1
    )
  `).get() as any).count;
  assert.strictEqual(preAmbiguous, 1, 'Pre-migration ambiguous must be 1 (rep_3)');

  const preOrphaned = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM daily_reports dr
    WHERE NOT EXISTS (
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
      WHERE m.report_id = dr.id
    )
  `).get() as any).count;
  assert.strictEqual(preOrphaned, 4, 'Pre-migration orphaned/unattributable must be 4 (rep_3, rep_4, rep_5, rep_6)');

  console.log(`Pre-migration Metrics: Total=${preTotal}, Unique=${preUniquelyAttributable}, Ambiguous=${preAmbiguous}, Orphaned=${preOrphaned}`);

  // 5. APPLY MIGRATION
  // Step 1: Add user_id column
  db.exec('ALTER TABLE daily_reports ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;');

  // Step 2: Deterministic backfill using derived ownership mapping
  db.exec(`
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
  `);

  // Step 3: Covering indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON daily_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);
  `);

  // 6. POST-MIGRATION VERIFICATION
  const rep1 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_1'").get() as any;
  const rep2 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_2'").get() as any;
  const rep3 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_3'").get() as any;
  const rep4 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_4'").get() as any;
  const rep5 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_5'").get() as any;
  const rep6 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_6'").get() as any;
  const rep7 = db.prepare("SELECT user_id FROM daily_reports WHERE id = 'rep_7'").get() as any;

  // Verify Scenario 1: Exactly one valid user
  assert.strictEqual(rep1.user_id, 'u1', 'Scenario 1: rep_1 must be assigned to u1');
  console.log('  ✓ Scenario 1: Exactly one valid user -> correctly attributed to u1');

  // Verify Scenario 2: One valid user plus NULL audit entries
  assert.strictEqual(rep2.user_id, 'u2', 'Scenario 2: rep_2 must be assigned to u2 (NULL audit log ignored)');
  console.log('  ✓ Scenario 2: One valid user plus NULL audit entries -> correctly attributed to u2');

  // Verify Scenario 3: Two distinct users
  assert.strictEqual(rep3.user_id, null, 'Scenario 3: rep_3 (ambiguous) must remain NULL');
  console.log('  ✓ Scenario 3: Two distinct users -> remains NULL (fail-closed)');

  // Verify Scenario 4: Only NULL user IDs
  assert.strictEqual(rep4.user_id, null, 'Scenario 4: rep_4 (only NULL user_ids) must remain NULL');
  console.log('  ✓ Scenario 4: Only NULL user IDs -> remains NULL (fail-closed)');

  // Verify Scenario 5: No matching audit record
  assert.strictEqual(rep5.user_id, null, 'Scenario 5: rep_5 (no audit records) must remain NULL');
  console.log('  ✓ Scenario 5: No matching audit record -> remains NULL (fail-closed)');

  // Verify Scenario 6: User ID absent from users table
  assert.strictEqual(rep6.user_id, null, 'Scenario 6: rep_6 (user absent from users table) must remain NULL');
  console.log('  ✓ Scenario 6: User ID absent from users -> remains NULL (fail-closed)');

  // Verify Scenario 7: Duplicate audit events for the same valid user
  assert.strictEqual(rep7.user_id, 'u1', 'Scenario 7: rep_7 must be assigned to u1');
  console.log('  ✓ Scenario 7: Duplicate audit events for same user -> correctly attributed to u1');

  // Verify post counts
  const postAssigned = (db.prepare('SELECT COUNT(*) AS count FROM daily_reports WHERE user_id IS NOT NULL').get() as any).count;
  const postNull = (db.prepare('SELECT COUNT(*) AS count FROM daily_reports WHERE user_id IS NULL').get() as any).count;
  assert.strictEqual(postAssigned, 3, 'Post-migration assigned reports must be exactly 3');
  assert.strictEqual(postNull, 4, 'Post-migration remaining NULL reports must be exactly 4');

  // Foreign key check
  const fkErrors = db.prepare('PRAGMA foreign_key_check(daily_reports)').all();
  assert.strictEqual(fkErrors.length, 0, 'Foreign key check must return zero violations');

  console.log(`\nPost-migration Metrics: Assigned=${postAssigned}, Remaining Null=${postNull}, FK Violations=${fkErrors.length}`);

  // 7. ROLLBACK VERIFICATION
  db.exec(`
    DROP INDEX IF EXISTS idx_daily_reports_user_date;
    DROP INDEX IF EXISTS idx_daily_reports_user_id;
    ALTER TABLE daily_reports DROP COLUMN user_id;
  `);

  const colsAfterRollback = (db.prepare('PRAGMA table_info(daily_reports)').all() as any[]).map(c => c.name);
  assert.strictEqual(colsAfterRollback.includes('user_id'), false, 'user_id column must be removed after rollback');
  assert.strictEqual(colsAfterRollback.length, 6, 'daily_reports should have original 6 columns');

  console.log('✓ Rollback verified: database returned to exact original state!');
} finally {
  db.close();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
}
