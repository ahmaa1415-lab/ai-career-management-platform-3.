# PHASE 5.8 — COMMIT INTEGRITY & RAILWAY STAGING READINESS REVIEW

**Role:** Senior Release Manager, Database Reliability Engineer, and Application Security Auditor  
**Date:** November 20, 2026  
**Status:** APPROVED — STAGING PLAN READY FOR HUMAN REVIEW  
**Audited Commit:** `22ba99f12e5bec029a4d633738cfb5ee049267f4` (`22ba99f`)  
**Parent Commit:** `c1706ab496968fb0af398779b268a5138cf83578` (`c1706ab`)  
**Active Branch:** `main` (local)  
**Execution Modality:** Strictly Read-Only (Local Documentation Only)  

---

## 1. Executive Summary

Phase 5.8 delivers an independent release audit of the local QA remediation commit (`22ba99f`) and presents an approval-gated, production-grade deployment and migration plan for Railway Staging.

### Core Audit Conclusions:
1. **Commit Integrity Verified:**
   - Commit `22ba99f` is verified as a direct child of Phase 5.6 security baseline `c1706ab`.
   - Exactly **29 files** are present in the commit tree (`3031 insertions(+), 246 deletions(-)`).
   - Zero extraneous files, temporary SQLite databases, or build artifacts (`tsconfig.tsbuildinfo`) were included.
2. **Reconciliation of Category Count Discrepancy:**
   - The apparent mismatch between Phase 5.7.6 (13 test suites / 7 docs) and Phase 5.7.7 (12 test suites / 8 docs) has been forensically resolved.
   - The discrepancy was caused by an arithmetic section header typo in Phase 5.7.6 Section 4.4, which labeled 13 items as `(12 files)`. The 13th file was `tests/ui_pages_browser.test.ts`. The actual Git commit contains **13 test suites** and **7 audit documents**.
3. **Critical Infrastructure Disclaimers:**
   - **Local Rehearsal ≠ Live Railway Proof:** While `VACUUM INTO` and schema migration were validated locally against an isolated database snapshot, **no online backup or restore has yet been executed on the live Railway container filesystem**.
   - **Single-Replica Constraint:** The Railway staging architecture is constrained to a single container replica mounted to persistent volume `staging-data` (`/app/data`). Multi-replica scaling remains strictly prohibited.
4. **Final Verdict:**
   - **`APPROVED — STAGING PLAN READY FOR HUMAN REVIEW`**

---

## 2. Commit Integrity & Inventory Reconciliation

### 2.1. Git Identity Telemetry

```bash
$ git rev-parse HEAD
22ba99f12e5bec029a4d633738cfb5ee049267f4

$ git rev-parse HEAD^
c1706ab496968fb0af398779b268a5138cf83578

$ git branch --show-current
main

$ git show --stat --oneline HEAD
22ba99f fix(qa): close application regression and integration test gaps
 app/api/cv/essential-preferences/route.ts          |   7 +
 docs/deployment/PHASE5_7_1_CONTROLLED_REMEDIATION_REPORT.md    | 241 ++++++++++++++++
 docs/deployment/PHASE5_7_2_INTEGRATION_TEST_REMEDIATION_REPORT.md | 256 +++++++++++++++++
 docs/deployment/PHASE5_7_3_FINAL_VERIFICATION_AND_CHANGE_AUDIT.md | 311 +++++++++++++++++++++
 docs/deployment/PHASE5_7_4_POST_FIX_VERIFICATION_REPORT.md     | 257 +++++++++++++++++
 docs/deployment/PHASE5_7_5_GIT_INTEGRITY_AUDIT.md  | 273 ++++++++++++++++++
 docs/deployment/PHASE5_7_6_COMMIT_PREPARATION_REPORT.md        | 297 ++++++++++++++++++++
 docs/deployment/PHASE5_7_FULL_APPLICATION_REGRESSION_AUDIT.md  | 263 +++++++++++++++++
 lib/jobs/verifier.ts                               |  10 +-
 lib/maintenance.ts                                 |   4 +-
 lib/onboarding.ts                                  |   5 +-
 scripts/align_profile.ts                           |   3 +-
 scripts/run_email_migration.mjs                    |  16 +-
 scripts/run_isolated_http_tests.mjs                | 274 ++++++++++++++++++
 tests/api_comprehensive.test.ts                    | 271 +++++++++++++-----
 tests/autonomous_auto_apply.test.ts                |  50 ++--
 tests/chatbot_guide.test.ts                        |  32 ++-
 tests/company_portal_accounts.test.ts              |  64 ++++-
 tests/cv_first_workflow.test.ts                    |  14 +-
 tests/helpers/testAuth.ts                          |  56 ++++
 tests/job_intelligence_scenarios.test.ts           |   2 +-
 tests/linkedin_integration.test.ts                 |  18 +-
 tests/linkedin_post_parser.test.ts                 |  25 +-
 tests/notifications.test.ts                        |  72 +++--
 tests/real_resume_aya_hamouda.test.ts              |  65 +++--
 tests/resume_versioning_and_isolation.test.ts      |  66 ++++-
 tests/run_all.ts                                   | 293 +++++++++++++++++--
 tests/ten_modules_verification.test.ts             |  30 +-
 tests/ui_pages_browser.test.ts                     |   2 +-
 29 files changed, 3031 insertions(+), 246 deletions(-)
```

### 2.2. Forensic Resolution of the Apparent Category Discrepancy

The audit reconciled the apparent category difference between:
- **Phase 5.7.6 Preparation Report:** Noted 13 test suites and 7 audit documents.
- **Phase 5.7.7 Commit Report:** Stated in Section 3.1: 12 test suite fixes and 8 audit documents.

#### Forensic Analysis:
1. **Phase 5.7.6 Report Section 4.4 Header Typo:**  
   In Section 4.4 of [PHASE5_7_6_COMMIT_PREPARATION_REPORT.md](file:///f:/work%20Aya/docs/deployment/PHASE5_7_6_COMMIT_PREPARATION_REPORT.md#L112-L127), the section header stated:
   `### 4.4. Application Test Suites (12 files)`
   However, the list directly underneath contained **13 items**:
   - 10. `tests/api_comprehensive.test.ts`
   - 11. `tests/autonomous_auto_apply.test.ts`
   - 12. `tests/chatbot_guide.test.ts`
   - 13. `tests/company_portal_accounts.test.ts`
   - 14. `tests/cv_first_workflow.test.ts`
   - 15. `tests/job_intelligence_scenarios.test.ts`
   - 16. `tests/linkedin_integration.test.ts`
   - 17. `tests/linkedin_post_parser.test.ts`
   - 18. `tests/notifications.test.ts`
   - 19. `tests/real_resume_aya_hamouda.test.ts`
   - 20. `tests/resume_versioning_and_isolation.test.ts`
   - 21. `tests/ten_modules_verification.test.ts`
   - 22. `tests/ui_pages_browser.test.ts`  
   Because $22 - 10 + 1 = 13$, the header `(12 files)` was an inadvertent label typo. Item 22 (`tests/ui_pages_browser.test.ts`) was the 13th file.
2. **Phase 5.7.7 Commit Report Section 3.1 Transcription:**  
   The author of the commit report copied the category header `12` from Section 4.4, and then adjusted the documentation count to `8` under the mistaken expectation that `PHASE5_7_7_LOCAL_COMMIT_REPORT.md` was part of the commit. In reality, `PHASE5_7_7_LOCAL_COMMIT_REPORT.md` was authored post-commit and remains untracked in the working tree.
3. **Exact Ground-Truth Verification:**  
   Running `git diff-tree --no-commit-id --name-status -r HEAD` confirms that commit `22ba99f` contains:
   - **4 Production Fixes**
   - **2 Tooling/Migration Artifacts**
   - **3 Test Infrastructure Files**
   - **13 Application Test Suites** (including `tests/ui_pages_browser.test.ts`)
   - **7 Audit Documents** (`PHASE5_7_FULL_APPLICATION_REGRESSION_AUDIT.md`, `PHASE5_7_1`, `PHASE5_7_2`, `PHASE5_7_3`, `PHASE5_7_4`, `PHASE5_7_5`, `PHASE5_7_6`)  
   **Total: Exactly 29 files.** Every single path matches the Phase 5.7.6 specification 1:1.

---

## 3. Current Railway Staging Architecture

Based on existing audit documentation (`RAILWAY_STAGING_BACKUP_RESTORE_REHEARSAL.md` and `RAILWAY_STAGING_EMAIL_MIGRATION_PREFLIGHT.md`), the Railway Staging target environment is characterized by the following verified parameters:

| Architectural Component | Specification | Operational Constraint / Invariant |
| :--- | :--- | :--- |
| **Railway Project** | `career-platform-staging` | Isolated staging environment |
| **Environment** | `staging` | Dedicated staging branch / variables |
| **Service Name** | `career-web-staging` | Next.js 16.4.5 full-stack application |
| **Public Endpoint** | `https://career-web-staging-staging.up.railway.app` | HTTPS edge proxy routing |
| **Replica Count** | **1 (Single Replica)** | **MANDATORY CONSTRAINT:** Multi-replica crashes SQLite WAL |
| **Persistent Volume** | `staging-data` (`7dfbe596-22b0-4586-88fa-a7771f26dd2b`) | 500 MB capacity quota |
| **Volume Mount Path** | `/app/data` | Retains DB across deployments |
| **Live Database Path** | `/app/data/career_app.db` | SQLite 3 database file |
| **Coordination Path** | `/app/data/.coordination.db` | Cross-process maintenance lock & leases |
| **Journal Mode** | `WAL` (Write-Ahead Logging) | Concurrency: 1 writer, multiple concurrent readers |
| **Runtime Container User** | `nextjs:nodejs` (UID 1001) | Handled by `docker-entrypoint` volume chown |

> [!CAUTION]
> **Strict Operational Distinction:**  
> Previous backup and restore rehearsals were executed against a local snapshot in `F:\work Aya\data\staging_restore_rehearsal_isolated\`. **A local rehearsal proves procedural correctness, but it does NOT prove live Railway filesystem readiness.** A live backup verification must be executed directly on the Railway container volume prior to any schema migration.

---

## 4. Email Migration Readiness & Baseline Re-check

### 4.1. Historical Baseline Telemetry (Phase 5.5 Preflight)
- **Table:** `emails`
- **Total Rows:** **1,063 rows**
- **Linked Rows:** **2 rows** (`application_id IS NOT NULL`, linked to Alice and Bob)
- **Unlinked Rows:** **1,061 rows** (`application_id IS NULL`, legacy system emails)
- **Orphan / Ambiguous Links:** **0 rows** (100% clean attribution)
- **Target Column:** `emails.user_id` was confirmed **ABSENT**
- **Migration Tracking:** `schema_migrations` was **ABSENT**
- **Migration Status:** **NOT APPLIED**

### 4.2. Mandatory Pre-Migration Live Re-Check Checklist
Before running `scripts/run_email_migration.mjs` against Railway Staging, the operator must execute read-only checks inside the live container to verify:
1. **Row Count Drift:** Is `SELECT COUNT(*) FROM emails` still 1,063, or have new emails been generated by synthetic tests or staging users?
2. **Orphan Link Detection:** Run `SELECT COUNT(*) FROM emails WHERE application_id IS NOT NULL AND application_id NOT IN (SELECT id FROM applications)`. Must return 0.
3. **User Link Integrity:** Run `SELECT COUNT(*) FROM emails e JOIN applications a ON e.application_id = a.id WHERE a.user_id NOT IN (SELECT id FROM users)`. Must return 0.
4. **Column State:** Confirm `emails.user_id` does not exist via `PRAGMA table_info(emails)`.
5. **Schema Migrations Table:** Confirm whether `schema_migrations` exists and whether `add_user_id_to_emails` is recorded.
6. **Cross-Process Coordination:** Ensure `getCrossProcessState()` is `ACTIVE` (maintenance mode engaged) and `getActiveLeasesCount()` is `0` before starting.

---

## 5. Backup, Durability & Recovery Evaluation

| Requirement / Check | Status / Verification Method | Risk / Mitigation |
| :--- | :--- | :--- |
| **Fresh Volume Backup** | Execute `VACUUM INTO '/app/data/backups/backup_pre_migration_<ts>.db'` on live Railway volume. | Ensure volume has $\ge 30\text{ MB}$ free space before initiating. |
| **Checksum & Metadata** | Compute SHA-256 of backup file; log file size, page count, and timestamp. | Verify byte count matches expectation ($\sim 15\text{ MB}$). |
| **SQLite Integrity Check** | Run `PRAGMA integrity_check` on the fresh backup file. | Must return `ok`. Abort if any corruption detected. |
| **Foreign Key Check** | Run `PRAGMA foreign_key_check` on the fresh backup file. | Must return 0 violations. |
| **Isolated Restore Rehearsal** | Open the backup file in readonly mode from an isolated path; query table count (26 tables). | Guarantees backup is self-contained and opens without sidecars. |
| **Single-Replica Constraint** | Inspect Railway service replicas via CLI/Dashboard. | If replica count $> 1$, downscale immediately to 1. |
| **Volume Capacity & WAL** | Volume has $\sim 400\text{ MB}$ free out of 500 MB. | Migration and backup consume $\sim 31\text{ MB}$. Retention policy prunes old backups. |
| **Rollback Trigger Conditions** | Trigger rollback if: (1) Migration script exits non-zero, (2) `PRAGMA integrity_check` fails, (3) `emails.user_id` attribution fails, or (4) Application crashes on restart. | Rollback copies backup file over `/app/data/career_app.db` and removes WAL/SHM files. |

---

## 6. Staging Deployment & Migration Execution Plan

The deployment protocol is structured into **7 sequential, approval-gated stages**. No stage may proceed without satisfying all preconditions and receiving explicit human authorization.

```
┌────────────────┐      ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
│   STAGE A:     │      │   STAGE B:     │      │   STAGE C:     │      │   STAGE D:     │
│ Pre-Deployment ├─────►│  Maintenance   ├─────►│ Online Backup  ├─────►│   Migration    │
│ Baseline Gate  │      │ Engagement &   │      │ & Verification │      │   Execution    │
│                │      │ Writer Drain   │      │                │      │                │
└────────────────┘      └────────────────┘      └────────────────┘      └───────┬────────┘
                                                                                │
                                ┌────────────────┐      ┌────────────────┐      │
                                │   STAGE G:     │      │   STAGE E:     │      │
                                │ Rollback Plan  │◄─────┤ Post-Migration ├──────┘
                                │ (If Triggered) │      │ Verification   │
                                └────────────────┘      └───────┬────────┘
                                                                │
                                ┌────────────────┐              │
                                │   STAGE F:     │              │
                                │ Deactivate     │◄─────────────┘
                                │ Maintenance &  │
                                │ Smoke Tests    │
                                └────────────────┘
```

---

### Stage A: Pre-Deployment Baseline Gate
- **Action:** Verify Railway CLI authentication, target service identity, and current Git deployment SHA.
- **Preconditions:** Local commit `22ba99f` is ready. Operator is logged into Railway CLI.
- **Execution Commands (Reference Only):**
  ```bash
  railway whoami
  railway status
  ```
- **Expected Evidence:** Authenticated as authorized operator; active environment is `staging`; active service is `career-web-staging`.
- **Failure Condition:** Unauthenticated CLI, wrong project, or deployment not in `SUCCESS` state.
- **Human Approval Required:** **YES (Gate 1)**

---

### Stage B: Maintenance Engagement & Writer Drain
- **Action:** Deploy the new codebase (commit `22ba99f`) to Railway Staging. Once live, engage cross-process maintenance mode to drain writers.
- **Preconditions:** Gate 1 approved.
- **Execution Commands (Reference Only):**
  ```bash
  # 1. Deploy commit 22ba99f
  git push origin main  # Or railway up
  # 2. Wait for deployment to achieve HTTP 200 on /api/health
  # 3. Engage maintenance mode via container exec
  railway run node scripts/maintenance_control.mjs --enable --reason "Executing add_user_id_to_emails migration"
  ```
- **Expected Evidence:**
  - `GET /api/health` returns `200 OK` with `{"status":"healthy","maintenance":true}`.
  - `POST /api/applications/submit` returns `503 Service Unavailable` with `Retry-After: 300`.
  - `node scripts/maintenance_control.mjs --status` returns `Maintenance: ACTIVE`, `Active Leases: 0`.
- **Failure Condition:** Mutating routes accept writes; background worker continues active processing; health check fails.
- **Human Approval Required:** **YES (Gate 2)**

---

### Stage C: Online Backup & Recovery Verification
- **Action:** Create a fresh crash-consistent SQLite backup on persistent volume `/app/data/backups/` using `VACUUM INTO`.
- **Preconditions:** Maintenance is ACTIVE; active leases count is 0.
- **Execution Commands (Reference Only):**
  ```bash
  railway run node -e "
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    const dbPath = '/app/data/career_app.db';
    const backupDir = '/app/data/backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, 'backup_staging_' + timestamp + '.db');

    const db = new Database(dbPath);
    db.backup(backupPath).then(() => {
      db.close();
      const bytes = fs.readFileSync(backupPath);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const backupDb = new Database(backupPath, { readonly: true });
      const integrity = backupDb.prepare('PRAGMA integrity_check;').pluck().get();
      const fkCheck = backupDb.prepare('PRAGMA foreign_key_check;').all();
      backupDb.close();
      console.log(JSON.stringify({ backupPath, size: bytes.length, sha256, integrity, fkViolations: fkCheck.length }));
      if (integrity !== 'ok' || fkCheck.length > 0) process.exit(1);
    });
  "
  ```
- **Expected Evidence:** JSON output with `integrity: "ok"`, `fkViolations: 0`, file size $\sim 15\text{ MB}$, and non-empty SHA-256 hash.
- **Failure Condition:** Exit code non-zero, integrity check fails, disk space $< 30\text{ MB}$.
- **Human Approval Required:** **YES (Gate 3)**

---

### Stage D: Email Migration Execution
- **Action:** Execute the compiled, atomic migration bundle `scripts/run_email_migration.mjs` inside the Railway container.
- **Preconditions:** Gate 3 approved; fresh verified backup exists.
- **Execution Commands (Reference Only):**
  ```bash
  railway run node scripts/run_email_migration.mjs
  ```
- **Expected Evidence:**
  - Console logs confirm:
    1. Acquisition of `EXCLUSIVE` transaction lock.
    2. Column `emails.user_id` added successfully.
    3. Exactly 2 email rows attributed to valid candidate application owners.
    4. Exactly 1,061 legacy unlinked emails preserved as `user_id = NULL`.
    5. Partial index `idx_emails_user_id` created.
    6. Record added to `schema_migrations` (`id = 'add_user_id_to_emails'`).
    7. Exit code `0`.
- **Failure Condition:** Script throws error, rollback triggered, non-zero exit code.
- **Human Approval Required:** **YES (Gate 4)**

---

### Stage E: Post-Migration Telemetry & Verification
- **Action:** Execute comprehensive structural and foreign key checks against `/app/data/career_app.db`.
- **Preconditions:** Migration exited with code 0.
- **Execution Commands (Reference Only):**
  ```bash
  railway run node -e "
    const Database = require('better-sqlite3');
    const db = new Database('/app/data/career_app.db', { readonly: true });
    const integrity = db.prepare('PRAGMA integrity_check;').pluck().get();
    const fk = db.prepare('PRAGMA foreign_key_check;').all();
    const cols = db.prepare('PRAGMA table_info(emails);').all().map(c => c.name);
    const hasCol = cols.includes('user_id');
    const attributed = db.prepare('SELECT COUNT(*) as c FROM emails WHERE user_id IS NOT NULL;').get().c;
    const legacy = db.prepare('SELECT COUNT(*) as c FROM emails WHERE user_id IS NULL;').get().c;
    const migRecord = db.prepare(\"SELECT * FROM schema_migrations WHERE id = 'add_user_id_to_emails'\").get();
    console.log(JSON.stringify({ integrity, fkViolations: fk.length, hasCol, attributed, legacy, migrated: !!migRecord }));
    if (integrity !== 'ok' || fk.length > 0 || !hasCol || attributed !== 2 || legacy !== 1061 || !migRecord) process.exit(1);
  "
  ```
- **Expected Evidence:** `{ integrity: "ok", fkViolations: 0, hasCol: true, attributed: 2, legacy: 1061, migrated: true }`.
- **Failure Condition:** Any discrepancy in row counts, integrity, or missing column.
- **Human Approval Required:** **YES (Gate 5)**

---

### Stage F: Deactivate Maintenance & Smoke Tests
- **Action:** Deactivate maintenance mode, restore normal traffic, and execute tenant-isolation HTTP smoke tests.
- **Preconditions:** Gate 5 approved.
- **Execution Commands (Reference Only):**
  ```bash
  # 1. Deactivate maintenance
  railway run node scripts/maintenance_control.mjs --disable
  # 2. Run live two-user tenant isolation audit
  railway run node scripts/live_staging_two_user_audit.mjs
  ```
- **Expected Evidence:**
  - `GET /api/health` returns `200 OK` with `maintenance: false`.
  - Mutating endpoints accept requests.
  - Multi-tenant test proves User A cannot read or modify User B's emails or CV documents.
- **Failure Condition:** Maintenance fails to clear; tenant leak detected; HTTP 500 errors on core routes.
- **Human Approval Required:** **Final Sign-off**

---

### Stage G: Emergency Rollback & Recovery Procedure
*(Triggered ONLY if Stage D or Stage E fails).*
- **Rollback Precondition:** Migration failed, integrity check failed, or post-migration invariants violated.
- **Rollback Steps:**
  1. Keep maintenance mode engaged (`ACTIVE`).
  2. Identify the exact backup path from Stage C (e.g., `/app/data/backups/backup_staging_<ts>.db`).
  3. Close any active connections and restore the pre-migration database file:
     ```bash
     railway run node -e "
       const fs = require('fs');
       const backupPath = '<VERIFIED_BACKUP_PATH>';
       const livePath = '/app/data/career_app.db';
       // Remove active WAL/SHM sidecars
       if (fs.existsSync(livePath + '-wal')) fs.unlinkSync(livePath + '-wal');
       if (fs.existsSync(livePath + '-shm')) fs.unlinkSync(livePath + '-shm');
       fs.copyFileSync(backupPath, livePath);
       console.log('ROLLBACK_COMPLETE: Database restored from ' + backupPath);
     "
     ```
  4. Verify integrity of restored live database (`PRAGMA integrity_check` -> `ok`).
  5. Restart container to reset in-memory SQLite handles:
     ```bash
     railway service restart
     ```
  6. Deactivate maintenance mode once service is green.

---

## 7. Approval Gates Summary

| Gate ID | Stage | Description | Approver |
| :---: | :--- | :--- | :---: |
| **Gate 1** | Pre-Deployment Baseline | Authorize code push of commit `22ba99f` to Railway | Senior Release Lead |
| **Gate 2** | Maintenance Engagement | Confirm maintenance mode active and writers drained | System Administrator |
| **Gate 3** | Live Backup Verification | Verify fresh on-volume backup checksum & integrity | Database Reliability Engineer |
| **Gate 4** | Migration Execution | Authorize running `scripts/run_email_migration.mjs` | DevSecOps Lead |
| **Gate 5** | Schema Verification | Confirm 1,063 emails (2 linked, 1,061 legacy) | Database Reliability Engineer |
| **Final** | Traffic Restoration | Authorize disabling maintenance & restoring traffic | Product Owner / QA Lead |

---

## 8. Final Verdict

**`APPROVED — STAGING PLAN READY FOR HUMAN REVIEW`**

The repository is clean, commit `22ba99f` is verified, and the deployment plan is completely documented with rigorous safety boundaries and zero outstanding unmanaged risks.
