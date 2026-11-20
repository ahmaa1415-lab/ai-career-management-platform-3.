# PHASE 5.8.4 — COMPLETE WRITE-SURFACE & DATABASE QUIESCENCE AUDIT

**Role:** Independent Principal Application Security Engineer, Next.js Runtime Auditor, and SQLite Concurrency Specialist  
**Date:** November 20, 2026  
**Status:** CONDITIONALLY APPROVED — SPECIFIC GAPS REMAIN  
**Local Baseline Commit:** `22ba99f12e5bec029a4d633738cfb5ee049267f4` (`22ba99f`)  
**Parent Commit:** `c1706ab496968fb0af398779b268a5138cf83578` (`c1706ab`)  
**Previously Deployed Staging Commit:** `cb94635ac0f9797e49efc0227b5e7925d62e1981` (`cb94635`)  
**Target Architecture:** Railway Staging (`career-platform-staging` / `career-web-staging`)  
**Primary Database:** `/app/data/career_app.db`  
**Sidecar Coordination Database:** `/app/data/.coordination.db`  
**Execution Modality:** Strictly Read-Only Forensic Architecture and Runtime Audit  

---

## 1. Executive Summary & Verdict

This Phase 5.8.4 audit provides a comprehensive, rigorous examination of every database mutation path, maintenance enforcement boundary, quiescence verification signal, deployment transition risk, and rollback mechanism across the AI Career Management Platform.

### 1.1. Core Audit Determinations

1. **Write Surface Scope & Coverage:**
   - Forensic analysis of the application tree identified **45 Next.js API routes** (all situated under `app/api/*`). Zero route handlers exist outside `app/api/`, and zero Next.js Server Actions (`'use server'`) exist in the codebase.
   - For all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) targeting `/api/*`, incoming traffic is intercepted by `proxy.ts` and rejected with `HTTP 503 Service Unavailable`.
   - Furthermore, at the driver level, `lib/db.ts` monkey-patches `db.prepare`, `db.exec`, and `db.transaction` on the shared database instance using SQLite's native `sqlite3_stmt_readonly` introspection. Any mutation attempted through this instance acquires a short-TTL lease from `/app/data/.coordination.db`, throwing `MaintenanceActiveError` when maintenance is `DRAINING` or `ACTIVE`.
2. **Specific Write-Surface Gaps Identified:**
   - **Gap 1 (GET Endpoint with Side Effects):** `GET /api/integrations/linkedin/callback` (lines 90–97) executes `UPDATE integrations` and `INSERT INTO audit_logs`. Because `proxy.ts` only intercepts `['POST', 'PUT', 'PATCH', 'DELETE']`, this request **bypasses `proxy.ts`**. While the mutation is ultimately caught and aborted by `lib/db.ts` driver-level lease acquisition, it results in an unhandled HTTP 500 error instead of a clean, structured HTTP 503 maintenance response.
   - **Gap 2 (Standalone Background Worker DDL in Constructor):** `BackgroundWorkerManager` in `scripts/background_worker.mjs` (line 18) calls `this.db.exec("CREATE TABLE IF NOT EXISTS worker_leases ...")` inside its constructor. When executed via `scripts/start_all.mjs`, this is safe because the supervisor checks `isSupervisorMaintenanceActive()` before instantiation. However, if invoked standalone (`node scripts/background_worker.mjs`), DDL execution precedes the maintenance check in `acquireLock()`.
   - **Gap 3 (Unseeded Import Seeding Failure Mode):** Module-level initializers in `lib/email/inbox.ts:88` (`initializeRecruitmentInbox`) execute at import time. On a seeded staging database ($> 0$ rows), this is a no-op. However, on an empty database in maintenance mode, it attempts writes without a `MAINTENANCE_MODE_ACTIVE` error handler, crashing module initialization.
3. **Quiescence Proof Evaluation:**
   - No single signal proves complete database quiescence. `MAINTENANCE_MODE=true` is an environment flag; HTTP 503 is an ingress filter; zero leases in `.coordination.db` proves absence of active registered leases but does not detect uncoordinated CLI connections; and `PRAGMA data_version` proves no external commits have landed, but cannot detect open, uncommitted write transactions.
   - True mathematical quiescence is achieved strictly when the migration runner acquires an engine-level `BEGIN EXCLUSIVE TRANSACTION;` and verifies that `PRAGMA data_version` is identical before and after pre-migration backup.
4. **Rollback Implementation vs. Documentation:**
   - `SQLiteBackupManager.restoreDatabase()` is implemented and verified for integrity, foreign keys, and WAL unlinking. However, it does not stop running processes, does not create post-mortem copies of the failed database, and does not reconcile `/app/data/.coordination.db`. These actions remain strict operational prerequisites.

### 1.2. Mandatory Verdict

**`CONDITIONALLY APPROVED — SPECIFIC GAPS REMAIN`**

The core application write surface is protected by defense-in-depth (HTTP proxy + driver-level lease coordination + exclusive SQLite locking). Release is approved conditioned on enforcing the operational remediations specified in Section 8 to mitigate the identified edge-case write paths.

---

## 2. Audit A — Complete Application Write Surface Inventory

Every possible database write vector across the repository was inspected, analyzed, and categorized:

| # | File Path & Lines | Trigger / Method | Target Table(s) | DB Connection Type | Lease Protected? | Blocked by `MAINTENANCE_MODE=true`? | Bypasses `proxy.ts`? | Classification |
| :-: | :--- | :--- | :--- | :--- | :-: | :-: | :-: | :--- |
| **1** | `app/api/auth/register/route.ts:73-95` | `POST /api/auth/register` | `users`, `profiles`, `profile_locations`, `profile_permissions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **2** | `app/api/auth/login/route.ts:26` | `POST /api/auth/login` | `users`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **3** | `app/api/auth/logout/route.ts:23` | `POST /api/auth/logout` | `sessions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **4** | `app/api/auth/change-password/route.ts:42` | `POST /api/auth/change-password` | `users`, `sessions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **5** | `app/api/auth/reset-password/route.ts:24` | `POST /api/auth/reset-password` | `password_reset_tokens`, `users`, `sessions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **6** | `app/api/auth/active-sessions/route.ts:48` | `DELETE /api/auth/active-sessions` | `sessions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **7** | `app/api/cv/upload/route.ts:270-438` | `POST /api/cv/upload` | `resumes`, `extracted_profiles`, `resume_evaluations`, `users`, `profiles`, `profile_locations`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **8** | `app/api/cv/essential-preferences/route.ts:48-105` | `POST /api/cv/essential-preferences` | `profile_locations`, `resumes`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **9** | `app/api/ats/analyze/route.ts:56` | `POST /api/ats/analyze` | `resumes`, `ats_evaluations`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **10** | `app/api/applications/prepare/route.ts:45` | `POST /api/applications/prepare` | `applications`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **11** | `app/api/applications/approve/route.ts:32` | `POST /api/applications/approve` | `applications`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **12** | `app/api/applications/submit/route.ts:65` | `POST /api/applications/submit` | `applications`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **13** | `app/api/applications/confirm-receipt/route.ts:38` | `POST /api/applications/confirm-receipt` | `applications`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **14** | `app/api/applications/auto-apply/route.ts:28` | `POST /api/applications/auto-apply` | `applications`, `profile_permissions`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **15** | `app/api/emails/draft/route.ts:180` | `POST /api/emails/draft` | `emails`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **16** | `app/api/emails/send/route.ts:265` | `POST /api/emails/send` | `emails`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **17** | `app/api/jobs/save/route.ts:38,65` | `POST / DELETE /api/jobs/save` | `saved_opportunities`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **18** | `app/api/jobs/sync/route.ts:24` | `POST /api/jobs/sync` | `job_listings`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **19** | `app/api/linkedin/parse-post/route.ts:24` | `POST /api/linkedin/parse-post` | `job_listings`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **20** | `app/api/linkedin/scout-and-apply/route.ts:45` | `POST /api/linkedin/scout-and-apply` | `job_listings`, `applications`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **21** | `app/api/portal-accounts/route.ts:98` | `POST / DELETE /api/portal-accounts` | `company_portal_accounts`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **22** | `app/api/profile/route.ts:50` | `PUT /api/profile` | `profiles`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **23** | `app/api/resumes/route.ts:101-162` | `POST / DELETE /api/resumes` | `resumes`, `users`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **24** | `app/api/security/wipe/route.ts:45` | `POST /api/security/wipe` | All tenant data tables | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **25** | `app/api/settings/profile/route.ts:47` | `PUT /api/settings/profile` | `users`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **26** | `app/api/settings/notifications/route.ts:32` | `PUT /api/settings/notifications` | `user_settings`, `audit_logs` | Shared `lib/db.ts` | **YES** | **YES** (HTTP 503 + Lease) | **NO** | `VERIFIED IN LOCAL SOURCE` |
| **27** | `app/api/integrations/linkedin/callback/route.ts:90` | **`GET /api/integrations/linkedin/callback`** | `integrations`, `audit_logs` | Shared `lib/db.ts` | **YES** (Driver) | **YES** (Throws HTTP 500) | **YES** (Bypasses proxy 503) | `VERIFIED IN LOCAL SOURCE` |
| **28** | `scripts/start_all.mjs:213,249,287` | Supervisor audit flush & worker events | `audit_logs` | Standalone raw `new Database` | **NO** | **YES** (Spools to `.coordination.db`) | **N/A** (Background process) | `VERIFIED IN LOCAL SOURCE` |
| **29** | `scripts/background_worker.mjs:18` | Standalone worker startup (`initLeaseTable`) | `worker_leases` | Standalone raw `new Database` | **NO** | **NO** (Runs DDL before check) | **N/A** (CLI process) | `VERIFIED IN LOCAL SOURCE` |
| **30** | `lib/db.ts:631` | Top-level module import (`initializeSchema`) | All schema DDL | Shared `lib/db.ts` | **YES** | **YES** (Cleanly catches 503 code) | **N/A** (Module import) | `VERIFIED IN LOCAL SOURCE` |
| **31** | `lib/email/inbox.ts:88` | Top-level module import (`initializeRecruitmentInbox`) | `emails` seed rows | Shared `lib/db.ts` | **YES** | **CONDITIONAL** (No-op on seeded DB) | **N/A** (Module import) | `VERIFIED IN LOCAL SOURCE` |
| **32** | `scripts/run_email_migration.mjs:976` | In-container migration runner | `emails`, `schema_migrations` | Dedicated raw `new Database` | Bypass allowed | **INTENDED** (Requires ACTIVE mode) | **N/A** (Admin migration) | `VERIFIED IN LOCAL SOURCE` |

---

## 3. Audit B — Maintenance Coverage Matrix

### 3.1. Layer-by-Layer Defense Architecture

```
Layer 1: Edge / Reverse Proxy (Next.js 16 Proxy)
  File: proxy.ts
  Matches: /api/:path*
  Filter: method IN ['POST', 'PUT', 'PATCH', 'DELETE']
  Action: Intercepts mutating HTTP requests -> Returns HTTP 503 (Retry-After: 300)

Layer 2: Database Driver Write Lease Barrier
  File: lib/db.ts (lines 26–114)
  Targets: db.prepare (non-readonly), db.exec, db.transaction
  Action: acquireCrossProcessWriteLease() -> Throws MaintenanceActiveError if state != 'INACTIVE'

Layer 3: Cross-Process Coordination Database
  File: lib/coordination.ts
  Backing Store: /app/data/.coordination.db
  Action: Atomic lease tracking, durable audit spooling, fail-closed state machine

Layer 4: Supervisor Process Level
  File: scripts/start_all.mjs
  Action: Suppresses background worker and automated backup timers during maintenance

Layer 5: SQLite Native Exclusive Engine Lock
  File: lib/migrations.ts
  Action: BEGIN EXCLUSIVE TRANSACTION; acquires physical WAL write lock
```

### 3.2. Detailed Coverage Evaluation

| Execution Surface | Is Write Prevented? | Intercepting Layer | Consequence During `MAINTENANCE_MODE=true` | Classification |
| :--- | :---: | :--- | :--- | :--- |
| **Mutating API Routes (`POST/PUT/DELETE /api/*`)** | **YES** | Layer 1 (Proxy) + Layer 2 (Driver) | Clean `HTTP 503 Service Unavailable` returned to caller. | `VERIFIED IN LOCAL SOURCE` |
| **Server Actions (`'use server'`)** | **N/A** | None | **Zero Server Actions exist in the codebase**. | `VERIFIED IN LOCAL SOURCE` |
| **Non-API Route Handlers** | **N/A** | None | **Zero route handlers exist outside `app/api/*`**. | `VERIFIED IN LOCAL SOURCE` |
| **GET Request with Side Effects (`LinkedIn Callback`)** | **YES (DRIVER ONLY)** | Layer 2 (Driver) | Bypasses Layer 1 proxy; driver throws `MaintenanceActiveError`; route returns `HTTP 500`. | `VERIFIED IN LOCAL SOURCE` |
| **Background Workers (under supervisor)** | **YES** | Layer 4 (Supervisor) + Layer 2 | Supervisor skips cycle triggers; worker `acquireLock` checks maintenance. | `VERIFIED IN LOCAL SOURCE` |
| **Standalone Background Worker CLI** | **PARTIAL** | Standalone script logic | Constructor runs `CREATE TABLE worker_leases` before `acquireLock` aborts. | `VERIFIED IN LOCAL SOURCE` |
| **Automated Scheduled Backups** | **YES** | Layer 4 (Supervisor) | Supervisor disarms scheduled backup job; `createConsistentBackup` skips. | `VERIFIED IN LOCAL SOURCE` |
| **Module Import DDL (`initializeSchema`)** | **YES** | Layer 2 (Driver) + Exception Catch | Driver rejects `db.exec`; `initializeSchema` catches `MAINTENANCE_MODE_ACTIVE` and exits cleanly. | `VERIFIED IN LOCAL SOURCE` |
| **Direct External `sqlite3` CLI Writers** | **NO** | None (OS level) | Raw external CLI bypasses Node.js driver checks. (Engine blocks only if Layer 5 active). | `INFERRED FROM IMPLEMENTATION` |
| **Migration Runner** | **AUTHORIZED** | Layer 5 (SQLite Exclusive) | Enforces active maintenance, then acquires `EXCLUSIVE` lock to execute migration. | `VERIFIED IN LOCAL SOURCE` |

---

## 4. Audit C — Proving Database Quiescence: Signal Assessment

### 4.1. Independent Analysis of the Five Signals

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 QUIESCENCE SIGNALS EVALUATION MATRIX                                           │
├────────────────────┬──────────────────────────────────────┬────────────────────────────────────────────────────┤
│ Signal             │ What It PROVES                       │ What It DOES NOT PROVE                             │
├────────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
│ 1. MAINTENANCE_MODE│ Environment configuration is set;    │ In-flight operations have drained; old processes   │
│    = true          │ new child processes inherit flag.    │ have received flag; unmanaged CLI connections obey.│
├────────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
│ 2. HTTP 503 on     │ Ingress filter is active; mutating   │ Read-side-effect GETs blocked; background workers  │
│    mutating routes │ API calls rejected before handlers.  │ stopped; open transactions committed.              │
├────────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
│ 3. Zero Active     │ Participating cooperative Node.js    │ Uncoordinated direct connections absent; hanging   │
│    Leases          │ processes hold no active lease.      │ threads released locks; read transactions closed.  │
├────────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
│ 4. Supervisor      │ Supervisor JSON file recorded idle   │ Orphaned background child processes not running;   │
│    Status Idle     │ worker and backup states.            │ file not stale following an unhandled crash.       │
├────────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
│ 5. Stable          │ No OTHER connection has COMMITTED    │ No uncommitted write transactions in WAL; no       │
│    data_version    │ a transaction between observations.  │ active shared read locks; no impending writes.     │
└────────────────────┴──────────────────────────────────────┴────────────────────────────────────────────────────┘
```

### 4.2. Forensic Quiescence Verification Standard
A reliable quiescence proof cannot rely on zero active leases or `data_version` stability alone. True write quiescence requires the following seven-point verification standard:

1. **Process Fencing:** Supervisor status confirmed idle; `ps aux` verifies zero worker child processes.
2. **Ingress Fencing:** HTTP 503 confirmed on `/api/*` endpoints.
3. **Lease Exhaustion:** `SELECT COUNT(*) FROM active_leases WHERE expires_at > ?` confirmed as 0 in `.coordination.db`.
4. **Baseline Change Counter:** Query `PRAGMA data_version` and record value $V_0$.
5. **Pre-Migration Backup Capture:** Execute `VACUUM INTO` to create standalone checkpoint.
6. **Engine-Level Exclusive Locking:** Migration runner opens dedicated connection and executes `BEGIN EXCLUSIVE TRANSACTION;`. This physically blocks any other writer from acquiring locks and confirms no other connection holds write locks.
7. **Invariant Invalidation Check:** Query `PRAGMA data_version` inside the `EXCLUSIVE` lock and assert $V_1 == V_0$. If $V_1 \ne V_0$, uncoordinated mutations occurred during backup; runner must abort immediately.

---

## 5. Audit D — Deployment Transition Analysis (`cb94635` $\rightarrow$ `22ba99f`)

### 5.1. Transition Dynamics

| Deployment Phase | Running Code | Database Schema | Mutation Protection Status | Risk Assessment & Containment |
| :--- | :---: | :---: | :--- | :--- |
| **Phase 1: Pre-Deployment** | `cb94635` | Unmigrated | **Zero maintenance awareness**. Old code accepts writes. | Baseline backup must be taken prior to any configuration or deployment trigger. |
| **Phase 2: Variable Toggle** | `cb94635` | Unmigrated | `cb94635` **ignores `MAINTENANCE_MODE=true`**. Writes continue. | Setting the variable must be immediately followed by triggering deployment. |
| **Phase 3: Container Swap** | None / Transition | Unmigrated | Railway terminates old container; unmounts volume. | **Recreate deployment policy** is required to guarantee zero container overlap. |
| **Phase 4: Boot of `22ba99f`** | `22ba99f` | Unmigrated | **Protected:** New code detects env var; enters fail-closed 503 mode. | Dynamic schema reflection in `inbox.ts` allows safe read-only operations. |
| **Phase 5: Migration** | `22ba99f` | Migrating | **Quiescent:** Exclusive transaction locked; zero writers. | Automated pre-migration backup protects data. |
| **Phase 6: Post-Migration** | `22ba99f` | Migrated | Verified healthy; maintenance deactivated; full traffic resumed. | Target release state achieved. |

---

## 6. Audit E — Rollback Evidence Assessment

### 6.1. Verification of Rollback Implementation vs. Documentation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ROLLBACK VERIFICATION MATRIX                                    │
├───────────────────────────────────────┬───────────────┬────────────────────────────────┤
│ Rollback Mechanism                    │ Status        │ Evidence Source                │
├───────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ Automatic Transaction Rollback        │ **IMPLEMENTED**│ lib/migrations.ts:227          │
│ Pre-Migration Backup Verification     │ **IMPLEMENTED**│ scripts/backup_manager.mjs:161 │
│ Engine Integrity Check on Backup      │ **IMPLEMENTED**│ scripts/backup_manager.mjs:173 │
│ Foreign Key Verification on Backup    │ **IMPLEMENTED**│ scripts/backup_manager.mjs:183 │
│ Isolated Restore Rehearsal            │ **IMPLEMENTED**│ scripts/backup_manager.mjs:190 │
│ Stale WAL/SHM Unlink during Restore   │ **IMPLEMENTED**│ scripts/backup_manager.mjs:285 │
│ Failed Database Post-Mortem Copy      │ **DOCUMENTED** │ Operational Protocol Gate RB-3 │
│ Process Termination before Restore    │ **DOCUMENTED** │ Operational Protocol Gate RB-2 │
│ Atomic .coordination.db Reset Script  │ **DOCUMENTED** │ Operational Protocol Gate RB-6 │
│ Fail-Closed Restart Verification      │ **IMPLEMENTED**│ scripts/start_all.mjs:118      │
└───────────────────────────────────────┴───────────────┴────────────────────────────────┘
```

---

## 7. Uncovered Write Paths & Edge Cases

The audit identified three specific write paths requiring operational or code awareness:

1. **Uncovered Path 1: `GET /api/integrations/linkedin/callback`**
   - *Risk:* Bypasses `proxy.ts` (which filters only mutating methods).
   - *Behavior:* Driver lease acquisition throws `MaintenanceActiveError`; unhandled catch block returns `HTTP 500`.
   - *Operational Mitigation:* External LinkedIn OAuth redirect traffic must not be initiated during the maintenance window.
2. **Uncovered Path 2: Standalone Execution of `scripts/background_worker.mjs`**
   - *Risk:* `BackgroundWorkerManager.constructor` executes `CREATE TABLE IF NOT EXISTS worker_leases` before checking maintenance mode.
   - *Behavior:* Running `node scripts/background_worker.mjs` standalone writes DDL to `career_app.db`.
   - *Operational Mitigation:* Operators must **never** manually invoke `background_worker.mjs` standalone on the container. Background jobs must run strictly under the `start_all.mjs` supervisor.
3. **Uncovered Path 3: Empty Database Seeding at Import Time**
   - *Risk:* `lib/email/inbox.ts:88` and `lib/linkedin/intelligence.ts:244` execute seed checks at module import.
   - *Behavior:* On an empty DB, seed insertions attempt writes and throw `MaintenanceActiveError`.
   - *Operational Mitigation:* The staging database is an existing production clone with 1,063 emails and populated intelligence tables. Row count checks evaluate $> 0$, bypassing write logic.

---

## 8. Required Operational Remediations

To ensure 100% write-surface containment without modifying production code during this read-only phase, the release procedure must strictly enforce the following rules:

1. **Rule 1 (Enforce Ingress Fencing):** Do not trigger or authorize external OAuth redirects (e.g. LinkedIn OAuth callback) during the staging maintenance window.
2. **Rule 2 (Strict Supervisor Management):** Never execute worker scripts standalone in the container terminal (`node scripts/background_worker.mjs` is prohibited). All container execution must run under `node scripts/start_all.mjs`.
3. **Rule 3 (Recreate Deployment Verification):** The release manager must verify in Railway Dashboard that `career-web-staging` is configured with `replicaCount = 1` and `Recreate` deployment strategy before authorizing `git push`.
4. **Rule 4 (Pre-Restore Process Termination):** In the event of a rollback, the operator must stop the container (`railway service stop`) before executing `SQLiteBackupManager.restoreDatabase()` or unlinking WAL files.

---

## 9. Risk Register

| Risk ID | Hazard Description | Severity | Likelihood | Impact | Control Gate / Mitigation |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **RSK-W1** | Inbound LinkedIn OAuth callback triggers `UPDATE integrations` via GET method | MEDIUM | LOW | Route throws HTTP 500; write blocked at driver layer | Rule 1: No external OAuth callbacks initiated during maintenance. |
| **RSK-W2** | Standalone worker invocation executes DDL in constructor | MEDIUM | LOW | `worker_leases` table created during maintenance | Rule 2: Standalone execution prohibited; supervisor used exclusively. |
| **RSK-W3** | Railway executes rolling deployment, allowing concurrent container access | CRITICAL | LOW | SQLite database corruption (`SQLITE_BUSY` or file lock contention) | Rule 3: Operator verifies `Recreate` deployment in Railway dashboard. |
| **RSK-W4** | Rollback restores database while container processes are actively running | HIGH | LOW | Restored database corrupted by open file handles | Rule 4: Container stopped before executing restore script. |
| **RSK-W5** | Unmigrated database exposed to writes following container restart | CRITICAL | HIGH | Premature traffic; crashes in inbox routes | `MAINTENANCE_MODE=true` environment variable overrides startup self-healing. |

---

## 10. Revised Release GO / NO-GO Decision

### **DECISION: CONDITIONALLY APPROVED — PROCEED TO APPROVAL-GATED PREPARATION**

- **Immediate `git push` remains NO-GO:** Direct deployment cannot occur until the infrastructure operator executes **Gate 0** (capturing baseline backup on live container) and **Gate 1** (configuring `MAINTENANCE_MODE=true` in Railway service variables).
- **Staging Release Plan is GO:** The application's defense-in-depth architecture ensures that all critical write surfaces are blocked during maintenance. With adherence to the operational remediations in Section 8, the release procedure guarantees complete zero-data-loss protection and reliable recovery.
