# Phase 5.2 — Revised SQLite Maintenance Architecture & Storage Fencing Specification

**Author:** Principal SQLite Internals Architect & Distributed Systems Reliability Engineer  
**Document Target:** `docs/deployment/PHASE5_2_REVISED_MAINTENANCE_ARCHITECTURE.md`  
**Foundation Documents:**
1. `docs/deployment/PHASE5_CRITICAL_REMEDIATION_DESIGN.md` (Design Baseline)
2. `docs/deployment/PHASE5_1_INDEPENDENT_ARCHITECTURE_CHALLENGE.md` (Empirical Challenge)  
**Target Environment:** Railway Staging (`/app/data/career_app.db`, `/app/data/.coordination.db`)  
**Target Migration:** `add_user_id_to_emails` (`lib/migrations.ts:runEmailUserIdMigration(db)`)  
**Status:** COMPLETE — REVISED DESIGN READY FOR INDEPENDENT REVIEW  
**Date:** 2026-11-19  

---

## Executive Summary & Foundational Invariants

Phase 5.1 experimentally proved two immutable SQLite internals facts:
1. **The Native WAL Write Lock is the Only Authoritative Fencing Boundary:** In SQLite WAL mode, acquiring `BEGIN IMMEDIATE` or `BEGIN EXCLUSIVE` on the primary database physically blocks all other writers via the shared memory index lock (`WAL_WRITE_LOCK` on byte 120 of `-shm`). A coordinator **cannot** acquire `BEGIN EXCLUSIVE` while an in-flight writer is active, and once acquired, **no other process can write**.
2. **Triggers and In-Transaction SELECTs Suffer from WAL Snapshot Isolation:** In SQLite WAL mode, an open transaction's read mark locks in a point-in-time snapshot. An existing transaction *cannot* observe that maintenance was committed as `ACTIVE` by another process. Furthermore, triggers fire strictly on DML (`INSERT/UPDATE/DELETE`) and cannot prevent DDL (`DROP TABLE`, `ALTER TABLE`, `DROP TRIGGER`) or direct fence manipulation.

### The Revised Architectural Principle
> **Core Architectural Principle:**  
> *The native SQLite WAL write-lock handshake (`BEGIN EXCLUSIVE` / `BEGIN IMMEDIATE`) on `/app/data/career_app.db` is the primary and sole authoritative gatekeeper for write quiescence and maintenance transitions. Application proxy barriers, process bootstrap prototype hooks, and SQLite database triggers operate strictly as outer defense-in-depth layers to fast-fail callers and prevent unnecessary engine contention.*

---

## 1. The Exact Maintenance State Machine

The maintenance lifecycle is governed by seven distinct states with deterministic, durable transitions:

```
               [Request Maintenance]
                         |
                         v
                   +-----------+
                   |  INACTIVE | <---------------------------------------+
                   +-----------+                                         |
                         |                                               |
                         | (Initiate Drain)                              |
                         v                                               |
                   +-----------+                                         |
                   |  DRAINING | ------(Drain Timeout / Abort)-----------+
                   +-----------+                                         |
                         |                                               |
                         | (Acquire WAL BEGIN EXCLUSIVE on career_app.db)|
                         v                                               |
                +-----------------+                                      |
                |  LOCK_ACQUIRED  |                                      |
                +-----------------+                                      |
                         |                                               |
                         | (Persist _maintenance_fence=ACTIVE & Commit)  |
                         v                                               |
                   +-----------+                                         |
                   |   ACTIVE  |                                         |
                   +-----------+                                         |
                         |                                               |
                         | (Start Migration Runner: BEGIN EXCLUSIVE)     |
                         v                                               |
                   +-----------+                                         |
                   | MIGRATING |                                         |
                   +-----------+                                         |
                     |       |                                           |
    (DDL Success)    |       | (DDL Error / Verification Fail)           |
          +----------+       +-------------------+                       |
          |                                      |                       |
          v                                      v                       |
    [Verify OK]                            +------------+                |
          |                                | RECOVERING |                |
          |                                +------------+                |
          |                                  |        |                  |
          |                  (Rollback OK)   |        | (Fatal Error)    |
          |                        +---------+        +-------+          |
          |                        |                          |          |
          v                        v                          v          |
    (Deactivate)              (Deactivate)            +---------------+  |
          |                        |                  | FAILED_CLOSED |  |
          +------------------------+                  +---------------+  |
                         |                                   |           |
                         v                                   |           |
               (Release Maintenance)                         |           |
                         +-----------------------------------+-----------+
```

### 1.1 State Transition Matrix

| State Name | Authoritative Store | Held Lock / Transaction | New Writers Permitted? | Transition Trigger | Crash at Transition Behavior |
|---|---|---|---|---|---|
| **`INACTIVE`** | `.coordination.db` + `.maintenance_lock` | None | **YES** | Initial state / maintenance completed | System runs normally |
| **`DRAINING`** | `.coordination.db` + `.maintenance_lock` | None on primary; write leases tracked | **NO** (Rejected at Proxy w/ 503 & Driver) | Operator / script executes `--enable` | Reverts to `INACTIVE` on timeout or cleanup |
| **`LOCK_ACQUIRED`** | **`career_app.db`** (Physical) | `BEGIN EXCLUSIVE` on `career_app.db` | **PHYSICALLY IMPOSSIBLE** (SQLite `SQLITE_BUSY`) | Coordinator successfully acquires exclusive lock | OS closes FD; lock auto-released; reverts to `DRAINING` |
| **`ACTIVE`** | `career_app.db` (`_maintenance_fence`) + `.coordination.db` | None (Fence table committed) | **NO** (Engine triggers abort DML; driver aborts) | Coordinator updates fence, commits, writes status | Remains `ACTIVE` (fail-closed); requires operator action |
| **`MIGRATING`** | `career_app.db` + `.coordination.db` | `BEGIN EXCLUSIVE` on `career_app.db` | **PHYSICALLY IMPOSSIBLE** (SQLite `SQLITE_BUSY`) | Migration runner starts DDL execution | Lock auto-released; uncommitted DDL rolled back; enters `RECOVERING` |
| **`RECOVERING`** | `.coordination.db` | None or rollback transaction | **NO** | Migration failure or verification check error | Remains `RECOVERING` / `FAILED_CLOSED` |
| **`FAILED_CLOSED`** | `.coordination.db` + `.maintenance_lock` | None | **NO** (All writes permanently blocked) | Schema corruption, fatal mismatch, or disk fault | Operator must manually inspect and resolve |

---

## 2. WAL Lock Lifecycle & Handshake Specification

### 2.1 SQLite WAL Concurrency Behavior Under the Hood
In SQLite WAL mode:
- **`BEGIN DEFERRED` (Default):** Starts transaction without acquiring write lock. Acquires a read mark. If it attempts to write later, it must upgrade to a write lock. If another writer committed in between, SQLite raises **`SQLITE_BUSY_SNAPSHOT: database is locked`**.
- **`BEGIN IMMEDIATE`:** Requests `WAL_WRITE_LOCK` immediately. Blocks all other writers. Guaranteed that no write upgrade conflict will occur.
- **`BEGIN EXCLUSIVE`:** Requests `WAL_WRITE_LOCK` immediately and blocks all other transactions from starting writes.
- **`COMMIT`:** Appends commit frame to WAL file, syncs if `synchronous = FULL/NORMAL`, and releases `WAL_WRITE_LOCK`.
- **`ROLLBACK`:** Reverts transaction state, releases `WAL_WRITE_LOCK`.
- **Ordinary Readers:** In WAL mode, `BEGIN EXCLUSIVE` **does not block readers**. Readers continue reading point-in-time snapshots concurrently.

### 2.2 Step-by-Step Maintenance Handshake Protocol

```
Step 1: REQUEST DRAIN
Coordinator sets `.coordination.db` state to `DRAINING` and writes `.maintenance_lock`.
Proxy intercepts incoming web requests: returns HTTP 503 (Retry-After: 300).
Universal bootstrap in application processes fast-fails new write transactions.

Step 2: WAIT FOR LEASES
Coordinator polls `active_leases` in `.coordination.db` until count == 0 or drain timeout.
Background workers complete their active job cycle and pause.

Step 3: PHYSICAL DRAIN VERIFICATION (THE EXCLUSIVE LOCK HANDSHAKE)
Coordinator connects to `career_app.db`:
  `coordDb = new Database('/app/data/career_app.db', { timeout: 15000 });`
Coordinator executes:
  `coordDb.exec('BEGIN EXCLUSIVE');`
  - IF an in-flight writer is still writing: SQLite blocks the coordinator.
  - IF writer does not finish within 15s: Coordinator receives SQLITE_BUSY. Drain aborts safely to INACTIVE.
  - IF writer finishes and commits: Coordinator acquires BEGIN EXCLUSIVE!
STATE TRANSITIONS TO `LOCK_ACQUIRED`.

Step 4: PERSIST FENCE STATE INSIDE PRIMARY DB
Inside the exclusive transaction, Coordinator executes:
  `coordDb.prepare("UPDATE _maintenance_fence SET state = 'ACTIVE', epoch = epoch + 1 WHERE id = 1").run();`
  `coordDb.exec('COMMIT');`
STATE TRANSITIONS TO `ACTIVE`.
Coordinator updates `.coordination.db` state to `ACTIVE`.

Step 5: HANDOFF TO MIGRATION RUNNER
Migration runner (`run_email_migration.mjs`) is invoked:
  Runner verifies maintenance is ACTIVE.
  Runner executes:
    `migDb = new Database('/app/data/career_app.db', { timeout: 15000 });`
    `migDb.exec('BEGIN EXCLUSIVE');`
STATE TRANSITIONS TO `MIGRATING`.
Runner executes DDL schema modifications, backfills records, and records tracker row.
Runner executes PRAGMA foreign_key_check and PRAGMA integrity_check.
Runner commits transaction.

Step 6: RELEASE MAINTENANCE
Coordinator connects to `career_app.db`:
  `coordDb.exec('BEGIN EXCLUSIVE');`
  `coordDb.prepare("UPDATE _maintenance_fence SET state = 'INACTIVE', epoch = epoch + 1 WHERE id = 1").run();`
  `coordDb.exec('COMMIT');`
Coordinator sets `.coordination.db` state to `INACTIVE` and unlinks `.maintenance_lock`.
STATE TRANSITIONS TO `INACTIVE`.
All processes resume normal operations.
```

### 2.3 Stale Reader Upgrade Protection
If a stale connection started a read transaction at $t_0$, and maintenance activates at $t_1$:
- If the stale reader attempts an `INSERT` at $t_2$:
  SQLite detects that the database WAL index was modified by the Coordinator at $t_1$.
  SQLite engine immediately raises **`SQLITE_BUSY_SNAPSHOT: database is locked`** (experimentally verified in Phase 5.1).
- The stale reader is physically prohibited from writing by SQLite internals.

---

## 3. Trustworthy Write Boundary & Process Inventory

Every process capable of opening a connection to `/app/data/career_app.db` is cataloged below:

| Process Identity | Operating System Process | Database Connection Location | Write Prevention During `ACTIVE` | Residual Risk |
|---|---|---|---|---|
| **Next.js Route Handlers** | `next start` (PID $X$) | `lib/db.ts` | Proxy (503) + Bootstrap Prototype + Engine Triggers | None (Triple-guarded) |
| **Server Actions** | `next start` (PID $X$) | `lib/db.ts` | Bootstrap Prototype + Engine Triggers | None |
| **Background Worker** | `node scripts/background_worker.mjs` (PID $Y$) | `scripts/background_worker.mjs:11` | Bootstrap Prototype + Status Poll + Engine Triggers | None |
| **Supervisor Process** | `node scripts/start_all.mjs` (PID $Z$) | `scripts/start_all.mjs:177,251` | Bootstrap Prototype + Durable Spool Redirection | None |
| **Backup Manager** | `node scripts/backup_manager.mjs` (PID $W$) | `scripts/backup_manager.mjs:13` | Opened with `{ readonly: true }` + Status Poll | None (Read-only FD) |
| **Migration Runner** | `node scripts/run_email_migration.mjs` (PID $M$) | `scripts/run_email_migration.ts:120` | Authoritative runner holding `BEGIN EXCLUSIVE` | Controlled execution |
| **Admin Maintenance CLI** | `node scripts/maintenance_control.mjs` | `scripts/maintenance_control.mjs:30` | Coordinator holding `BEGIN EXCLUSIVE` | Authoritative |
| **Raw SQLite CLI** | `sqlite3 /app/data/career_app.db` | Interactive shell | Engine Triggers + WAL Exclusive Lock | Blocked during lock |

### 3.1 Operating System & File-Level Boundary
In Railway production:
- All Node.js processes run under the dedicated non-root user `nextjs` (UID 1001, GID 1001).
- The persistent volume `/app/data` is mounted with permissions `0775` owned by `nextjs:nodejs`.
- **Residual Risk Disclosure:** Any process executing as UID 1001 has direct POSIX file write access to the `.db` and `-wal` files. SQLite cannot prevent a malicious or compromised process from directly executing `pwrite()` to the file descriptors or executing arbitrary DDL via a raw `sqlite3` binary. 
- **Security Boundary Definition:** SQLite locking and engine triggers guarantee safety against *concurrency anomalies, stale leaseholders, application logic, and race conditions* across well-behaved Node.js runtime processes. They do not constitute a cryptographic boundary against untrusted local root/UID 1001 code execution.

---

## 4. Trigger Architecture & Manifest Integrity

Triggers are implemented as an **engine-level secondary DML containment layer**.

### 4.1 Protected Tables Manifest
The following tables are registered in the Fencing Manifest and protected by triggers:
1. `users`
2. `emails` (Target migration table)
3. `profiles`
4. `jobs`
5. `applications`
6. `audit_logs`
7. `schema_migrations`
8. `worker_leases`

### 4.2 Standardized Trigger Definition
For every table $T$ in the manifest:
```sql
CREATE TRIGGER IF NOT EXISTS trg_fence_insert_{T} BEFORE INSERT ON {T}
BEGIN
  SELECT CASE
    WHEN (SELECT state FROM _maintenance_fence WHERE id = 1) != 'INACTIVE'
    THEN RAISE(ABORT, 'SQLITE_FENCE_ABORT: Writes blocked - Maintenance mode is ACTIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fence_update_{T} BEFORE UPDATE ON {T}
BEGIN
  SELECT CASE
    WHEN (SELECT state FROM _maintenance_fence WHERE id = 1) != 'INACTIVE'
    THEN RAISE(ABORT, 'SQLITE_FENCE_ABORT: Writes blocked - Maintenance mode is ACTIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fence_delete_{T} BEFORE DELETE ON {T}
BEGIN
  SELECT CASE
    WHEN (SELECT state FROM _maintenance_fence WHERE id = 1) != 'INACTIVE'
    THEN RAISE(ABORT, 'SQLITE_FENCE_ABORT: Writes blocked - Maintenance mode is ACTIVE')
  END;
END;
```

### 4.3 Trigger Manifest Verification & Anti-Tampering Check
Before executing the email migration, `scripts/run_email_migration.ts` executes an automated manifest integrity verification:
```sql
SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_fence_%';
```
- **Integrity Rule:** Exactly $3 \times N$ triggers must exist (where $N = 8$ manifest tables = 24 triggers).
- If any trigger has been dropped or is missing, preflight **fails closed immediately**, refusing migration execution.

---

## 5. Universal Process Bootstrap Specification

To resolve the limitation where prototype modifications do not cross OS process boundaries, a standalone bootstrap module is established:

### 5.1 Architecture: `lib/sqlite_bootstrap.mjs`
A zero-dependency, lightweight module imported at the entrypoint of all application scripts:
1. Patches `Database.prototype.prepare`: Wraps mutating statements (`!stmt.readonly`).
2. Patches `Database.prototype.transaction`: Enforces `BEGIN IMMEDIATE` for all mutating transactions.
3. Sets default connection pragmas:
   - `busy_timeout = 10000`
   - `foreign_keys = ON`
   - `journal_mode = WAL`

### 5.2 Mandatory Import Locations
The bootstrap module must be imported as line 1 in:
- `lib/db.ts`
- `scripts/start_all.mjs`
- `scripts/background_worker.mjs`
- `scripts/backup_manager.mjs`

---

## 6. Crash Recovery Matrix & Fail-Closed Behavior

| Failure Point | System State at Crash | Automatic Recovery Behavior | Final State |
|---|---|---|---|
| **Crash during `DRAINING`** (before WAL lock) | State in `.coordination.db` is `DRAINING` | Leases expire; timeout aborts cleanly to `INACTIVE` | `INACTIVE` (Safe) |
| **Crash during `LOCK_ACQUIRED`** | Coordinator holds `BEGIN EXCLUSIVE` | OS closes connection; SQLite automatically rolls back transaction | `DRAINING` / `INACTIVE` (Clean) |
| **Crash after persisting `ACTIVE`** | `_maintenance_fence` committed `ACTIVE` | All writes remain blocked by triggers and driver | `ACTIVE` (Fail-closed) |
| **Crash during migration DDL execution** | Migration runner holds `BEGIN EXCLUSIVE` | SQLite WAL rollback automatically discards uncommitted DDL | `ACTIVE` (Clean rollback) |
| **Crash during verification** | DDL committed, verification failed | Enters `RECOVERING` / `FAILED_CLOSED`; writes blocked | `FAILED_CLOSED` (Manual review) |
| **Sidecar `.coordination.db` corruption** | Database unreadable | `lib/coordination.ts` catch block returns `state: 'ACTIVE'` | `ACTIVE` (Fail-closed) |
| **Primary `career_app.db` disk full (`ENOSPC`)** | SQLite raises `SQLITE_FULL` | Transaction aborted and rolled back | Safe rollback |

---

## 7. Adversarial Synthetic Acceptance Test Plan

The implementation must pass twelve empirical acceptance tests in `tests/phase5_2_revised_architecture.test.ts`:

1. **TEST-01 (In-Flight Writer Mutual Exclusion):** Child OS process holding write transaction blocks Coordinator `BEGIN EXCLUSIVE` with `SQLITE_BUSY`.
2. **TEST-02 (Coordinator Lock Protection):** Coordinator holding `BEGIN EXCLUSIVE` blocks Child OS process from starting or committing writes.
3. **TEST-03 (Stale Reader Snapshot Upgrade Block):** Child process reading before maintenance attempts write after maintenance; rejected with `SQLITE_BUSY_SNAPSHOT`.
4. **TEST-04 (Engine Trigger DML Rejection):** Direct `INSERT INTO users` on fresh connection rejected with `SQLITE_FENCE_ABORT`.
5. **TEST-05 (Trigger Manifest Verification):** Migration runner refuses execution if any manifest trigger is dropped.
6. **TEST-06 (Bootstrap Multi-Process Coverage):** Background worker and supervisor processes proven protected by universal bootstrap.
7. **TEST-07 (Durable Outbox Bounded Retention):** Flushed events older than 7 days automatically pruned; pending events preserved.
8. **TEST-08 (Crash During DRAIN Recovery):** Process killed (`exit(137)`) during drain recovers cleanly without orphaned locks.
9. **TEST-09 (Crash During ACTIVE Recovery):** Process killed during `ACTIVE` leaves database in safe fail-closed state.
10. **TEST-10 (Full Migration Lifecycle E2E):** `INACTIVE` -> `DRAINING` -> `LOCK_ACQUIRED` -> `ACTIVE` -> `MIGRATING` -> Schema Verified -> `INACTIVE`.
11. **TEST-11 (Concurrent Coordinator Activation Race):** Two maintenance CLI instances racing serialize safely via WAL write lock.
12. **TEST-12 (Integrity and Foreign Key Zero Violation):** Post-migration `PRAGMA foreign_key_check` and `PRAGMA integrity_check` return 0 violations.

---

## 8. Implementation Stages with Review Gates

The revised architecture will be implemented in four distinct, independently reviewable stages:

- **Stage 1: Universal SQLite Bootstrap Module:** Author `lib/sqlite_bootstrap.mjs` and integrate across all four Node.js process entrypoints.
- **Stage 2: Primary Database Fencing & Trigger Manifest:** Author `lib/db_fence.ts` establishing `_maintenance_fence` table and 24 triggers with manifest verification.
- **Stage 3: State Machine & Coordinator Lock Handshake:** Implement 7-state lifecycle in `lib/coordination.ts` and `scripts/maintenance_control.mjs`, making `BEGIN EXCLUSIVE` the primary drain gate.
- **Stage 4: Outbox Retention & Adversarial Verification:** Add 7-day retention prune to `flushDurableAudits()`, run full synthetic test suite, and re-bundle migration CLI.

---

## 9. Final Verdict

```
================================================================================
FINAL VERDICT: REVISED DESIGN READY FOR INDEPENDENT REVIEW
================================================================================
The Phase 5.2 revised architecture resolves every empirical limitation
identified in Phase 5.1:
1. Elevates native SQLite WAL write lock (BEGIN EXCLUSIVE) to primary authority.
2. Standardizes on BEGIN IMMEDIATE to eliminate deferred snapshot races.
3. Formulates a complete 7-state maintenance lifecycle with physical verification.
4. Unifies process bootstrap across all Node.js entrypoints.
5. Explicitly documents trigger boundaries and POSIX file access residual risks.

Strict execution restrictions observed: DESIGN ONLY. Zero application code
modified, zero migrations run, Railway untouched, and zero git commits created.
================================================================================
```
