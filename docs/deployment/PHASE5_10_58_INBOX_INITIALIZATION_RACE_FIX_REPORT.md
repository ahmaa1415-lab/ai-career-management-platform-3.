# Phase 5.10.58 — Fix SQLite Inbox Initialization Race During Next.js Build Report

**Phase:** Phase 5.10.58  
**Project:** AI Career Management Platform  
**Repository:** `ahmaa1415-lab/ai-career-management-platform-3.`  
**Base `main` Commit:** `dfa812d6bb3cf43df4b4425273eafac1d7b1094a`  
**Fix Branch:** `fix/inbox-init-build-race`  
**Status:** Verification Complete — Ready for Review  

---

## 1. Executive Summary

Following the authorized merge of Pull Request #1 into `main` (`dfa812d6bb3cf43df4b4425273eafac1d7b1094a`), GitHub Actions CI run `45168066687` failed during Step 1 Docker Build (`RUN npm run build`).

Investigation revealed that Next.js Turbopack invokes worker threads during build-time page and route configuration collection (`Collecting page data using 3 workers ...`). Route handlers importing `lib/email/inbox.ts` (specifically `app/api/emails/draft/route.ts`) triggered an uncoordinated, top-level module evaluation write: `initializeRecruitmentInbox()`. Because `initializeRecruitmentInbox()` used non-idempotent `INSERT INTO emails` without primary key conflict handling (`INSERT OR IGNORE`), concurrent worker evaluation against an empty build-time database triggered a primary key collision (`SqliteError: UNIQUE constraint failed: emails.id`), aborting the build.

A minimal, robust, and concurrency-safe fix has been designed, implemented, and comprehensively verified:
1. **Module-level write elimination:** Removed top-level auto-invocation from `lib/email/inbox.ts`. Importing the module is now strictly side-effect-free (0 database queries, 0 writes).
2. **Conflict-safe seeding:** Updated `initializeRecruitmentInbox()` to use `INSERT OR IGNORE INTO emails` with atomic transactions, ensuring multi-process or multi-worker concurrency never fails on primary key collisions.
3. **Explicit dynamic routing:** Added `export const dynamic = 'force-dynamic'` to `app/api/emails/draft/route.ts`, `app/api/emails/route.ts`, and `app/api/emails/send/route.ts`, and added runtime on-demand seeding to `app/api/emails/route.ts`.
4. **Comprehensive verification:** 
   - New isolated test suite `tests/phase5_10_58_inbox_init_race.test.ts`: **24/24 assertions passed (0 failed)**.
   - Core test suite (`npm test`): **26/26 test suites passed (0 defects)**.
   - Production build (`npm run build`): **55/55 static pages generated successfully (exit code 0)**.
   - Supervisor lifecycle suite (`tests/test_supervisor_identity_scenarios.sh`): **45/45 scenarios passed (0 failed)**.

---

## 2. Root Cause Analysis

### CI Failure Evidence
- **GitHub Actions Run ID:** `45168066687`
- **Job ID:** `137670089192` (`Verify Tini PID 1 & Process Lifecycle (Linux)`)
- **Failing Step:** Step 1 Docker Build (`docker build --pull --no-cache -t linux-test-app .`)
- **Execution Log Excerpt:**
  ```text
  2026-11-23T11:46:44.7794541Z #20 8.625   Collecting page data using 3 workers ...
  2026-11-23T11:46:46.2960580Z #20 10.29 Error: Failed to collect configuration for /api/emails/draft
  2026-11-23T11:46:46.2961983Z #20 10.29     at ignore-listed frames {
  2026-11-23T11:46:46.2962913Z #20 10.29   [cause]: SqliteError: UNIQUE constraint failed: emails.id
  2026-11-23T11:46:46.2963877Z #20 10.29       at T.run (lib/db.ts:38:16)
  2026-11-23T11:46:46.2964675Z #20 10.29       at <unknown> (lib/email/inbox.ts:76:20)
  2026-11-23T11:46:46.2965529Z #20 10.29       at <unknown> (lib/db.ts:108:14)
  2026-11-23T11:46:46.2966606Z #20 10.29       at <unknown> (lib/email/inbox.ts:78:9)
  2026-11-23T11:46:46.2967450Z #20 10.29       at module evaluation (lib/email/inbox.ts:97:1)
  2026-11-23T11:46:46.2968613Z #20 10.29       at module evaluation (app/api/emails/draft/route.ts:2:1)
  ...
  2026-11-23T11:46:46.5615215Z #20 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
  ```

### Detailed Failure Sequence
1. During `docker build`, Next.js invokes `next build`, spawning 3 worker threads in parallel to evaluate routes and extract configuration.
2. Worker 1 and Worker 2 both evaluate route module `app/api/emails/draft/route.ts`.
3. Route line 2 executes `import { generateEmailDraft } from '@/lib/email/inbox';`.
4. In `lib/email/inbox.ts`, top-level module code executed:
   ```typescript
   try {
     initializeRecruitmentInbox();
   } catch (err: any) {
     if (err?.code !== 'MAINTENANCE_MODE_ACTIVE') {
       throw err;
     }
   }
   ```
5. On a clean/empty build-time database, both worker threads ran `SELECT COUNT(*) as c FROM emails` concurrently; both observed `c === 0`.
6. Worker 1 initiated a transaction and inserted seed emails (`email_seed_01`, `email_seed_02`, `email_seed_03`) via plain `INSERT INTO emails`.
7. Worker 2 initiated its transaction and attempted to insert `email_seed_01` via plain `INSERT INTO emails`.
8. Because `id` is the primary key of `emails`, SQLite threw `SqliteError: UNIQUE constraint failed: emails.id`.
9. The error escaped module evaluation, causing Next.js to fail page collection for `/api/emails/draft` and abort the production build with exit code 1.

---

## 3. Implementation Details

### Files Modified

#### 1. `lib/email/inbox.ts`
- **Removed top-level module execution:** Deleted lines 99–105 (`try { initializeRecruitmentInbox(); } catch ...`). Importing `lib/email/inbox.ts` is now purely declarative and performs zero SQLite reads or writes.
- **Conflict-Safe Seeding SQL:** Updated both migration-aware variants of `initializeRecruitmentInbox()` to use `INSERT OR IGNORE INTO emails (...)`:
  ```typescript
  // With user_id column present
  const insert = db.prepare(`
    INSERT OR IGNORE INTO emails (id, user_id, category, sender, recipient, subject, body, is_draft, is_sent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Without user_id column present (pre-migration)
  const insert = db.prepare(`
    INSERT OR IGNORE INTO emails (id, category, sender, recipient, subject, body, is_draft, is_sent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  ```
- **Error Transparency:** Retained fail-fast behavior: genuine database errors (disk corruption, disk full, missing columns, syntax errors) are NOT masked by catch blocks and rethrow cleanly.

#### 2. `app/api/emails/draft/route.ts`
- Added explicit dynamic route declaration:
  ```typescript
  export const dynamic = 'force-dynamic';
  ```
  Prevents Next.js from attempting static pre-rendering or uncoordinated build-time data generation.

#### 3. `app/api/emails/route.ts`
- Added `export const dynamic = 'force-dynamic';`.
- Added runtime on-demand seeding in `GET /api/emails`:
  ```typescript
  let emails = getAllEmails(category, authUser.id);
  if (emails.length === 0 && (!category || category === 'All')) {
    initializeRecruitmentInbox(authUser.id);
    emails = getAllEmails(category, authUser.id);
  }
  return NextResponse.json({ emails });
  ```
  Ensures that when an authenticated user accesses their inbox at runtime, seed emails are cleanly initialized without requiring build-time writes.

#### 4. `app/api/emails/send/route.ts`
- Added `export const dynamic = 'force-dynamic';`.

---

## 4. Test & Verification Results

### A. New Isolated Regression Suite (`tests/phase5_10_58_inbox_init_race.test.ts`)
Validates all 7 required criteria using subprocesses against isolated test databases:

| Test Case | Objective / Invariant | Result |
| :--- | :--- | :---: |
| **Test 1** | Importing `lib/email/inbox.ts` performs 0 writes to SQLite | **PASS** |
| **Test 2** | First-time explicit initialization populates exactly 3 seed emails | **PASS** |
| **Test 3** | Repeated sequential initialization is strictly idempotent (count remains 3) | **PASS** |
| **Test 4** | 5 concurrent worker processes simultaneously initializing complete with 0 errors | **PASS** |
| **Test 5** | Existing user-created emails are preserved and not overwritten | **PASS** |
| **Test 6** | Genuine database schema errors are NOT masked and throw cleanly | **PASS** |
| **Test 7a** | Importing `/api/emails/draft` route performs 0 build-time writes and exports `force-dynamic` | **PASS** |
| **Test 7b** | Invoking `POST /api/emails/draft` at runtime generates valid draft record with 200 OK | **PASS** |

**Summary:** 24 assertions passed, 0 failed.

### B. Maintenance Remediation Suite (`tests/phase5_8_6_maintenance_remediation.test.ts`)
- Suite 1 (LinkedIn Callback Maintenance Gate): Passed
- Suite 2 (Background Worker Lazy Initialization): Passed
- Suite 3 (Module Initializers Quiescence Under Maintenance): Passed
- Suite 4 (SQLite Backup & Lock Ordering Validation): Passed
- Suite 5 (Write Surface & Connection Points Reconciliation): Passed
**Summary:** 41 passed, 0 failed.

### C. Full Application Test Suite (`npm test`)
- Verified all 26 core test suites via `tests/run_all.ts`.
- **Summary:** All 26 suites passed with 0 defects.

### D. Production Next.js Build Verification (`npm run build`)
- Built esbuild migration bundle: `scripts/run_email_migration.mjs` (42,836 bytes).
- Ran bundle verification: passed.
- Turbopack compilation: passed in 118s.
- TypeScript validation: passed in 581ms.
- Page data collection using 3 workers: **PASSED** without error.
- Static page generation: **55/55 routes generated** in 1847ms.
- Exit code: **0**.

### E. Supervisor Lifecycle Test Suite (`tests/test_supervisor_identity_scenarios.sh`)
- Executed all 45 production supervisor discovery and shutdown scenarios.
- **Summary:** 45 passed, 0 failed (exit code 0).

---

## 5. Git Status & Commit Readiness Assessment

### Git Status
```text
On branch fix/inbox-init-build-race
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   app/api/emails/draft/route.ts
  modified:   app/api/emails/route.ts
  modified:   app/api/emails/send/route.ts
  modified:   lib/email/inbox.ts
  modified:   tsconfig.tsbuildinfo

Untracked files:
  tests/phase5_10_58_inbox_init_race.test.ts
  docs/deployment/PHASE5_10_58_INBOX_INITIALIZATION_RACE_FIX_REPORT.md
```

### Scope Discipline
- Strictly isolated to dedicated branch `fix/inbox-init-build-race`.
- No unstaged unintended changes; `tsconfig.tsbuildinfo` preserved.
- Zero commits created; zero pushes executed; zero merges performed.
- Zero Railway CLI access; zero live database modifications.
- Execution is strictly STOPPED after report creation awaiting review authorization.
