/**
 * Phase 5.10.58 — SQLite Inbox Initialization Concurrency & Idempotency Test Suite
 *
 * Verifies:
 * 1. Importing `lib/email/inbox.ts` does NOT write to SQLite.
 * 2. First-time initialization succeeds and creates expected seed data.
 * 3. Repeated initialization is idempotent (no duplicate rows, no constraint errors).
 * 4. Concurrent initialization attempts (simulating Next.js build workers) succeed without errors.
 * 5. Existing user emails are preserved and not overwritten.
 * 6. Genuine database errors are NOT masked.
 * 7. The `/api/emails/draft` route exports `dynamic = 'force-dynamic'`, does not trigger build-time writes,
 *    and handles runtime draft generation correctly.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const testDir = path.join(process.cwd(), 'data', 'test_phase5_10_58_inbox');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const inboxModuleUrl = 'file:///' + path.resolve(process.cwd(), 'lib/email/inbox.ts').replace(/\\/g, '/');
const routeModuleUrl = 'file:///' + path.resolve(process.cwd(), 'app/api/emails/draft/route.ts').replace(/\\/g, '/');
const authModuleUrl = 'file:///' + path.resolve(process.cwd(), 'lib/auth.ts').replace(/\\/g, '/');
const dbModuleUrl = 'file:///' + path.resolve(process.cwd(), 'lib/db.ts').replace(/\\/g, '/');
const onboardingModuleUrl = 'file:///' + path.resolve(process.cwd(), 'lib/onboarding.ts').replace(/\\/g, '/');

function initCleanSchema(dbPath: string) {
  if (fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath); } catch {}
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      job_id TEXT,
      status TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS candidate_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE,
      target_seniority TEXT,
      experience_years INTEGER,
      skills TEXT,
      preferred_locations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      application_id TEXT,
      category TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_draft INTEGER DEFAULT 0,
      is_sent INTEGER DEFAULT 0,
      delivery_status TEXT,
      delivery_provider TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();
}

let subprocIndex = 0;
function runSubprocess(code: string, envOverrides: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    subprocIndex++;
    const tempFile = path.join(testDir, `subproc_${Date.now()}_${subprocIndex}_${Math.random().toString(36).substring(2, 6)}.ts`);
    fs.writeFileSync(tempFile, code, 'utf-8');

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', tempFile],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...envOverrides
        },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (exitCode) => {
      try { fs.unlinkSync(tempFile); } catch {}
      resolve({ code: exitCode, stdout, stderr });
    });

    child.on('error', (err) => {
      try { fs.unlinkSync(tempFile); } catch {}
      reject(err);
    });
  });
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   PHASE 5.10.58: INBOX INITIALIZATION CONCURRENCY & REGRESSION SUITE   ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    } else {
      console.log(`[PASS] ${msg}`);
      passed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Importing lib/email/inbox.ts does NOT write to the database
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Zero DB Writes on Module Import ---');
  const dbPathTest1 = path.join(testDir, 'test1_import_quiescence.db');
  initCleanSchema(dbPathTest1);

  const importSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest1)};
    process.env.NODE_ENV = 'test';
    const inbox = await import(${JSON.stringify(inboxModuleUrl)});
    if (typeof inbox.initializeRecruitmentInbox !== 'function') {
      process.exit(2);
    }
  `);

  if (importSubproc.code !== 0) {
    console.error('Import stderr:', importSubproc.stderr);
  }
  assert(importSubproc.code === 0, 'Module import subprocess exited with code 0');

  const db1 = new Database(dbPathTest1, { readonly: true });
  const countAfterImport = (db1.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  db1.close();
  assert(countAfterImport === 0, 'Zero rows written to emails table on module import');

  // --------------------------------------------------------------------------
  // TEST 2: First-time initialization succeeds and creates expected seed data
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: First-time Explicit Initialization ---');
  const dbPathTest2 = path.join(testDir, 'test2_first_init.db');
  initCleanSchema(dbPathTest2);

  const initSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest2)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    initializeRecruitmentInbox('user_seed_test_01');
  `);

  assert(initSubproc.code === 0, 'Explicit initialization subprocess exited with code 0');

  const db2 = new Database(dbPathTest2, { readonly: true });
  const rows2 = db2.prepare('SELECT id, user_id, category, sender, subject FROM emails ORDER BY id ASC').all() as any[];
  db2.close();

  assert(rows2.length === 3, 'Exactly 3 seed emails created on first initialization');
  assert(rows2[0].id === 'email_seed_01' && rows2[0].category === 'Interview', 'email_seed_01 verified');
  assert(rows2[1].id === 'email_seed_02' && rows2[1].category === 'Confirmation', 'email_seed_02 verified');
  assert(rows2[2].id === 'email_seed_03' && rows2[2].category === 'Recruiter Message', 'email_seed_03 verified');
  assert(rows2.every(r => r.user_id === 'user_seed_test_01'), 'user_id correctly populated on seed emails');

  // --------------------------------------------------------------------------
  // TEST 3: Repeated initialization is idempotent
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Idempotent Sequential Initialization ---');
  const idempotencySubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest2)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    // Invoke repeated initializations
    initializeRecruitmentInbox('user_seed_test_01');
    initializeRecruitmentInbox('user_seed_test_01');
    initializeRecruitmentInbox('different_user_should_not_duplicate');
  `);

  assert(idempotencySubproc.code === 0, 'Repeated initialization subprocess exited with code 0');

  const db3 = new Database(dbPathTest2, { readonly: true });
  const countAfterRepeated = (db3.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  db3.close();

  assert(countAfterRepeated === 3, 'Email count remains strictly 3 after repeated calls (no duplicates)');

  // --------------------------------------------------------------------------
  // TEST 4: Concurrent initialization attempts (simulating Next.js build workers)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Concurrent Multi-Worker Initialization Simulation ---');
  const dbPathTest4 = path.join(testDir, 'test4_concurrent_workers.db');
  initCleanSchema(dbPathTest4);

  // Spawn 5 concurrent worker processes simultaneously attempting initialization on the same fresh DB
  const workerCount = 5;
  const workerScript = `
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest4)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    initializeRecruitmentInbox('worker_user');
  `;

  const workerPromises = Array.from({ length: workerCount }, (_, i) => runSubprocess(workerScript));
  const workerResults = await Promise.all(workerPromises);

  let allWorkersSucceeded = true;
  for (let i = 0; i < workerResults.length; i++) {
    const res = workerResults[i];
    if (res.code !== 0) {
      console.error(`Worker ${i + 1} failed with code ${res.code}:`, res.stderr);
      allWorkersSucceeded = false;
    }
  }

  assert(allWorkersSucceeded, 'All 5 concurrent worker processes exited successfully with code 0');

  const db4 = new Database(dbPathTest4, { readonly: true });
  const countConcurrent = (db4.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  db4.close();

  assert(countConcurrent === 3, 'Concurrently initialized database has exactly 3 seed rows (0 constraint collisions)');

  // --------------------------------------------------------------------------
  // TEST 5: Existing user emails are preserved and not overwritten
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Existing User Emails Preservation ---');
  const dbPathTest5 = path.join(testDir, 'test5_preservation.db');
  initCleanSchema(dbPathTest5);

  const db5 = new Database(dbPathTest5);
  // Insert an existing user email
  db5.prepare(`
    INSERT INTO emails (id, user_id, category, sender, recipient, subject, body, is_draft, is_sent)
    VALUES ('custom_email_001', 'user_existing', 'Offer', 'recruiter@faang.com', 'user@example.com', 'Senior Staff Offer', 'Offer letter attached.', 0, 0)
  `).run();
  db5.close();

  const preserveSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest5)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    initializeRecruitmentInbox('new_user');
  `);

  assert(preserveSubproc.code === 0, 'Preservation test subprocess exited with code 0');

  const db5Check = new Database(dbPathTest5, { readonly: true });
  const existingEmail = db5Check.prepare("SELECT * FROM emails WHERE id = 'custom_email_001'").get() as any;
  const totalCount5 = (db5Check.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  db5Check.close();

  assert(Boolean(existingEmail), 'Existing user email remains present');
  assert(existingEmail.subject === 'Senior Staff Offer', 'Existing user email content is untouched');
  assert(totalCount5 === 1, 'Non-empty inbox was not seeded (count remained 1)');

  // --------------------------------------------------------------------------
  // TEST 6: Genuine database errors & NOT NULL violations are NOT masked
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: NOT NULL Violations & Schema Errors Propagate ---');
  const dbPathTest6 = path.join(testDir, 'test6_genuine_error.db');
  if (fs.existsSync(dbPathTest6)) {
    try { fs.unlinkSync(dbPathTest6); } catch {}
  }
  const db6 = new Database(dbPathTest6);
  // Create an emails table with an unsatisfiable NOT NULL constraint on a column not in seed data
  db6.exec(`
    CREATE TABLE emails (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_draft INTEGER DEFAULT 0,
      is_sent INTEGER DEFAULT 0,
      mandatory_security_token TEXT NOT NULL
    );
  `);
  db6.close();

  const errorSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest6)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    try {
      initializeRecruitmentInbox();
      console.log('UNEXPECTED_SUCCESS');
    } catch (err) {
      console.error('EXPECTED_GENUINE_ERROR:', err.message);
      process.exit(42);
    }
  `);

  assert(errorSubproc.code === 42, 'NOT NULL violation causes initializeRecruitmentInbox() to throw (exit code 42)');
  assert(errorSubproc.stderr.includes('NOT NULL constraint failed') || errorSubproc.stderr.includes('SqliteError'), 'Error message confirms NOT NULL constraint failure');

  // --------------------------------------------------------------------------
  // TEST 6B: CHECK constraint violations are NOT silently ignored
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6B: CHECK Constraint Violations Propagate ---');
  const dbPathTest6B = path.join(testDir, 'test6b_check_constraint.db');
  if (fs.existsSync(dbPathTest6B)) {
    try { fs.unlinkSync(dbPathTest6B); } catch {}
  }
  const db6B = new Database(dbPathTest6B);
  db6B.exec(`
    CREATE TABLE emails (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category TEXT NOT NULL CHECK(category IN ('Offer', 'Rejection')),
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_draft INTEGER DEFAULT 0,
      is_sent INTEGER DEFAULT 0
    );
  `);
  db6B.close();

  const checkErrorSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest6B)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox } = await import(${JSON.stringify(inboxModuleUrl)});
    try {
      initializeRecruitmentInbox();
      console.log('UNEXPECTED_SUCCESS');
    } catch (err) {
      console.error('EXPECTED_CHECK_ERROR:', err.message);
      process.exit(43);
    }
  `);

  assert(checkErrorSubproc.code === 43, 'CHECK constraint violation causes initializeRecruitmentInbox() to throw (exit code 43)');
  assert(checkErrorSubproc.stderr.includes('CHECK constraint failed') || checkErrorSubproc.stderr.includes('SqliteError'), 'Error message confirms CHECK constraint failure');

  // --------------------------------------------------------------------------
  // TEST 7: /api/emails/draft route behaves correctly & no build-time writes
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: /api/emails/draft Route Verification ---');
  const dbPathTest7 = path.join(testDir, 'test7_draft_route.db');
  initCleanSchema(dbPathTest7);

  // Setup candidate profile and user for route test
  const db7 = new Database(dbPathTest7);
  db7.prepare("INSERT INTO users (id, email, full_name) VALUES ('user_draft_01', 'aya@example.com', 'Aya Hamouda')").run();
  db7.prepare("INSERT INTO candidate_profiles (id, user_id, target_seniority, experience_years, skills) VALUES ('prof_01', 'user_draft_01', 'Senior', 7, 'TypeScript, React, Next.js')").run();
  db7.close();

  // Test 7a: Importing the route module does zero database writes (build-time evaluation simulation)
  const routeImportSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest7)};
    process.env.NODE_ENV = 'production';
    const routeModule = await import(${JSON.stringify(routeModuleUrl)});
    if (routeModule.dynamic !== 'force-dynamic') {
      console.error('DYNAMIC_NOT_SET: ' + routeModule.dynamic);
      process.exit(10);
    }
    if (typeof routeModule.POST !== 'function') {
      console.error('POST_NOT_EXPORTED');
      process.exit(11);
    }
  `);

  assert(routeImportSubproc.code === 0, 'Route module import succeeded and verified dynamic = "force-dynamic"');

  const db7Check = new Database(dbPathTest7, { readonly: true });
  const draftEmailsCount = (db7Check.prepare('SELECT COUNT(*) as c FROM emails').get() as any).c;
  db7Check.close();
  assert(draftEmailsCount === 0, 'Zero emails written during route module evaluation');

  // Test 7b: Invoking POST at runtime generates a draft successfully
  const routeRuntimeSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest7)};
    process.env.NODE_ENV = 'test';
    const { initializeSchema, getOrCreateDefaultUser } = await import(${JSON.stringify(dbModuleUrl)});
    initializeSchema();
    const user = getOrCreateDefaultUser();

    const { saveOnboarding } = await import(${JSON.stringify(onboardingModuleUrl)});
    saveOnboarding(user.id, {
      profile: {
        headline: 'Senior Full Stack Engineer',
        summary: 'Experienced engineer with strong background',
        skills: ['TypeScript', 'React'],
        target_seniority: 'Senior'
      },
      location: {
        target_countries: ['Germany', 'UAE', 'Remote'],
        open_to_relocation: 1,
        current_location: 'Cairo, Egypt'
      },
      permissions: {
        job_research_authorized: 1,
        cv_analysis_authorized: 1,
        read_emails_authorized: 1,
        draft_emails_authorized: 1,
        disclose_data_authorized: 1,
        scheduled_automation_desired: 1
      }
    });

    const { createSession } = await import(${JSON.stringify(authModuleUrl)});
    const session = createSession(user.id);

    const { POST } = await import(${JSON.stringify(routeModuleUrl)});
    const fakeRequest = new Request('http://localhost:3000/api/emails/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      body: JSON.stringify({
        type: 'Reply',
        target_email: {
          sender: 'recruiter@tech.com',
          recipient: user.email,
          subject: 'Technical Interview Next Week',
          body: 'Hi, are you free for a call?'
        }
      })
    });

    const response = await POST(fakeRequest);
    const body = await response.json();
    if (response.status !== 200 || !body.success || !body.draft) {
      console.error('RUNTIME_POST_FAILED status:', response.status, JSON.stringify(body));
      process.exit(20);
    }
  `);

  if (routeRuntimeSubproc.code !== 0) {
    console.error('Runtime POST stderr:', routeRuntimeSubproc.stderr);
  }
  assert(routeRuntimeSubproc.code === 0, 'POST /api/emails/draft generates draft successfully at runtime');

  const db7Final = new Database(dbPathTest7, { readonly: true });
  const finalDraft = db7Final.prepare("SELECT * FROM emails WHERE user_id = 'user_default_01'").get() as any;
  db7Final.close();

  assert(Boolean(finalDraft), 'Draft record created in database at runtime');
  assert(finalDraft.is_draft === 1, 'Draft has is_draft = 1');
  assert(finalDraft.recipient === 'recruiter@tech.com', 'Draft recipient matches request');

  // --------------------------------------------------------------------------
  // TEST 8: Multi-user isolation verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Multi-User Isolation Verification ---');
  const dbPathTest8 = path.join(testDir, 'test8_multi_user.db');
  initCleanSchema(dbPathTest8);

  const multiUserSubproc = await runSubprocess(`
    process.env.DATABASE_PATH = ${JSON.stringify(dbPathTest8)};
    process.env.NODE_ENV = 'test';
    const { initializeRecruitmentInbox, getAllEmails } = await import(${JSON.stringify(inboxModuleUrl)});
    const { initializeSchema } = await import(${JSON.stringify(dbModuleUrl)});
    initializeSchema();

    // User A initializes inbox
    initializeRecruitmentInbox('user_alice');
    const aliceEmails = getAllEmails(undefined, 'user_alice');

    // User B accesses inbox
    const bobEmails = getAllEmails(undefined, 'user_bob');

    if (aliceEmails.length !== 3) {
      console.error('ALICE_EMAIL_COUNT_MISMATCH: ' + aliceEmails.length);
      process.exit(50);
    }
    if (bobEmails.length !== 0) {
      console.error('BOB_LEAKAGE_DETECTED: ' + bobEmails.length);
      process.exit(51);
    }
    // Verify unauthenticated fails closed
    const unauthEmails = getAllEmails(undefined, '');
    if (unauthEmails.length !== 0) {
      console.error('UNAUTH_LEAKAGE: ' + unauthEmails.length);
      process.exit(52);
    }
  `);

  assert(multiUserSubproc.code === 0, 'Multi-user isolation verified: Alice has 3 emails, Bob has 0 emails, unauthenticated has 0');

  console.log('\n========================================================================');
  console.log(`   PHASE 5.10.58 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('FATAL TEST RUN ERROR:', err);
  process.exit(1);
});
