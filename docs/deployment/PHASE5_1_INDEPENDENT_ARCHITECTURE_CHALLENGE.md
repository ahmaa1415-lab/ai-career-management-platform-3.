# Phase 5.1 — Independent Architecture Challenge: SQLite Coordination & Fencing

**Auditor:** Principal SQLite Internals Engineer & Distributed Systems Security Auditor  
**Document Under Review:** `docs/deployment/PHASE5_CRITICAL_REMEDIATION_DESIGN.md`  
**Target Environment:** Railway Staging (`/app/data/career_app.db`, `/app/data/.coordination.db`)  
**Target Migration:** `add_user_id_to_emails` (`lib/migrations.ts:runEmailUserIdMigration(db)`)  
**Audit Scope:** Independent Architectural Challenge & Empirical Verification  
**Date:** 2026-11-19  

---

## Executive Verdict

```
================================================================================
FINAL VERDICT: DESIGN REQUIRES REVISION
================================================================================
The Phase 5 remediation design introduces critical, necessary distributed
systems concepts—specifically moving away from purely advisory sidecar TTLs
and recognizing the necessity of primary database storage-level enforcement.

However, an adversarial SQLite internals challenge and reproducible
multi-process experiments reveal three fundamental design flaws that must be
corrected before implementation:

1. CRITICAL: WAL Snapshot Isolation Blinds Pre-Commit Checks and Triggers
   Under SQLite WAL mode, an open transaction's read mark locks in a point-in-
   time snapshot. A SELECT against _maintenance_fence inside an existing
   transaction CANNOT observe that maintenance was committed as ACTIVE by
   another process. Relying on trigger or pre-commit SELECTs to detect state
   transitions committed after transaction start is technically invalid.

2. HIGH: SQLite Triggers Provide Zero DDL or Schema-Level Protection
   SQLite triggers fire strictly on DML (INSERT/UPDATE/DELETE) on attached
   tables. Triggers cannot prevent DROP TRIGGER, DROP TABLE, ALTER TABLE,
   or direct manipulation of _maintenance_fence by any process with write
   permissions to career_app.db.

3. HIGH: Node.js Prototype Patching Does Not Cross Process Boundaries
   Patching Database.prototype in lib/db.ts affects only that specific Node.js
   V8 heap. Background workers (scripts/background_worker.mjs), backup managers
   (scripts/backup_manager.mjs), and supervisor scripts (scripts/start_all.mjs)
   import better-sqlite3 directly and remain completely unpatched.

Conversely, empirical multi-process testing proved that the NATIVE SQLite
WAL WRITE LOCK HANDSHAKE (BEGIN EXCLUSIVE) provides the exact mutual-exclusion
guarantee required, provided it is elevated to the primary authority.

Railway Staging, its persistent volume, and live databases remain UNTOUCHED.
================================================================================
```

---

## CHALLENGE 1 — SQLite WAL Locking Guarantees vs Rollback Journal

### 1.1 The Mechanics of WAL Locking
In SQLite WAL mode (`PRAGMA journal_mode = WAL`):
- Unlike rollback journal mode (where readers acquire shared locks that block writers, and writers acquire exclusive locks that block all readers), **WAL mode decouples readers from writers**.
- Readers read index frames from the shared-memory file (`-shm`) and data pages from the WAL file (`-wal`) using read marks. Readers **never block writers**, and writers **never block readers**.
- **Crucial Invariant:** *There can only ever be ONE writer at any given instant across all operating system processes.*
- When a writer executes `BEGIN IMMEDIATE` or `BEGIN EXCLUSIVE`, SQLite requests an exclusive lock on byte 120 of the `-shm` file (`WAL_WRITE_LOCK`).
- If another process already holds `WAL_WRITE_LOCK`, the incoming writer blocks until `busy_timeout` expires, and then throws `SQLITE_BUSY: database is locked`.

### 1.2 Multi-Process Verification Experiment
To test the exact locking guarantees under multi-process concurrency, an isolated synthetic test (`test_challenge_wal_multiprocess.mjs`) was executed using independent OS processes synchronized via signal files:

```text
=== MULTI-PROCESS WAL LOCK HANDSHAKE TEST (SYNCHRONIZED) ===
[COORDINATOR] Waiting for Child 1 to confirm lock acquisition...
[CHILD 1] Lock acquired and row inserted. Creating ready signal...
[COORDINATOR] Child 1 lock confirmed active.
[COORDINATOR] Attempting BEGIN EXCLUSIVE with 300ms timeout...
[COORDINATOR] SUCCESS: Correctly blocked while Child 1 held lock: database is locked
[COORDINATOR] Attempting BEGIN EXCLUSIVE with 5000ms timeout...
[CHILD 1] Committed write and released lock.
[COORDINATOR] SUCCESS: Acquired EXCLUSIVE after Child 1 committed!
[CHILD 2] SUCCESS: Write blocked while Coordinator held EXCLUSIVE: database is locked
=== MULTI-PROCESS TEST COMPLETED ===
```

### 1.3 Key Architectural Findings on WAL Locking
1. **Mutual Exclusion is Physical:** An existing writer holding a transaction physically blocks the maintenance coordinator from acquiring `BEGIN EXCLUSIVE`. The coordinator **CANNOT** enter `ACTIVE` maintenance while a writer is in-flight.
2. **Safe Drain Guarantee:** The coordinator's acquisition of `BEGIN EXCLUSIVE` on `career_app.db` is the only 100% authoritative proof that zero in-flight write transactions remain open.
3. **Stale Writer Rejection:** Once the coordinator holds `BEGIN EXCLUSIVE`, any other process (whether a new request or a resumed stale process) attempting `stmt.run()` or `BEGIN IMMEDIATE` is blocked by SQLite internals and raises `SQLITE_BUSY: database is locked`.

---

## CHALLENGE 2 — Trigger Security & Bypass Resistance

### 2.1 The Limits of SQLite Triggers
The Phase 5 design proposed `_maintenance_fence` and `BEFORE INSERT/UPDATE/DELETE` triggers as a storage-level fencing mechanism. 

An adversarial test (`test_challenge_triggers.mjs`) was conducted to evaluate the bypass resistance of SQLite triggers against a connection with write access:

```text
=== TEST 1: Normal INSERT while ACTIVE ===
PASS: Insert blocked by trigger: WRITE_FENCED_MAINTENANCE_ACTIVE

=== TEST 2: Bypass via DROP TRIGGER ===
BYPASS CONFIRMED: DROP TRIGGER succeeded, and subsequent INSERT succeeded!

=== TEST 3: Bypass via ALTER TABLE RENAME ===
BYPASS CONFIRMED: ALTER TABLE succeeded while maintenance is ACTIVE!

=== TEST 4: Bypass via DROP TABLE ===
BYPASS CONFIRMED: DROP TABLE succeeded while maintenance is ACTIVE!

=== TEST 5: Direct UPDATE to _maintenance_fence ===
BYPASS CONFIRMED: Any connection can directly UPDATE _maintenance_fence to INACTIVE!

=== TEST 6: New Table Creation (Unprotected) ===
BYPASS CONFIRMED: New tables have no triggers and accept writes while ACTIVE!
```

### 2.2 Trigger Bypass Matrix

| Bypass Attack Vector | Can SQLite Triggers Prevent This? | Mechanism / Reason | Required Architectural Defense |
|---|---|---|---|
| **DML on Protected Table** (`INSERT/UPDATE/DELETE`) | **YES** | VDBE evaluates `trg_fence_*` and calls `RAISE(ABORT)` | Tier 3 Triggers (Effective for standard DML) |
| **DROP TRIGGER** | **NO** | SQLite has no DDL triggers; `DROP TRIGGER` executes unchecked | SQLite file write lock (`BEGIN EXCLUSIVE`) |
| **ALTER TABLE / RENAME** | **NO** | DDL bypasses DML triggers | SQLite file write lock (`BEGIN EXCLUSIVE`) |
| **DROP TABLE** | **NO** | DDL bypasses DML triggers | SQLite file write lock (`BEGIN EXCLUSIVE`) |
| **Direct UPDATE of `_maintenance_fence`** | **NO** | Any writer connection can execute `UPDATE _maintenance_fence SET state='INACTIVE'` | OS process privilege separation |
| **Dynamic Table Creation** | **NO** | Newly created tables lack triggers | Driver prototype interception |
| **Direct SQLite C / CLI Access** | **NO** | Raw connections outside Node.js ignore JS application code | POSIX filesystem permissions (`chmod 444` / `flock`) |

### 2.3 Verdict on Triggers
**Triggers are Defense-in-Depth, NOT Primary Fencing.**  
SQLite triggers are valuable for stopping standard application queries (`INSERT INTO users`) executed by stale or unpatched JavaScript code, but they do **not** provide security against DDL, schema tampering, or direct fence modifications. The primary fencing authority must remain the **native SQLite exclusive lock**.

---

## CHALLENGE 3 — Prototype Patching Coverage Across OS Processes

### 3.1 The Process Boundary Illusion
The Phase 5 design states:
> *"lib/db.ts will patch Database.prototype to ensure all connections (new Database(...)) in start_all.mjs, background_worker.mjs, etc. are protected."*

**This claim is technically false under Node.js multi-process architecture.**
- Modifying `Database.prototype` in `lib/db.ts` mutates the prototype object in the V8 heap of the **calling process only** (e.g., the Next.js web server).
- In the Railway deployment architecture, `scripts/start_all.mjs`, `scripts/background_worker.mjs`, and `scripts/backup_manager.mjs` run as **distinct operating system processes** with independent V8 heaps.
- If a child process executes:
  ```javascript
  // scripts/background_worker.mjs
  import Database from 'better-sqlite3';
  const db = new Database('/app/data/career_app.db');
  ```
  That process imports `better-sqlite3` from disk without ever loading `lib/db.ts`. Its `Database.prototype` is **100% unpatched**.

### 3.2 Process Isolation Matrix

| Process Name | Execution Command | Imports `lib/db.ts`? | Prototype Patched? | Vulnerable to Driver Bypass? |
|---|---|---|---|---|
| **Next.js Web Server** | `next start` | **YES** | **YES** | Protected |
| **Supervisor** | `node scripts/start_all.mjs` | **NO** (Imports `better-sqlite3` directly) | **NO** | **VULNERABLE** |
| **Background Worker** | `node scripts/background_worker.mjs` | **NO** (Imports `better-sqlite3` directly) | **NO** | **VULNERABLE** |
| **Backup Manager** | `node scripts/backup_manager.mjs` | **NO** (Imports `better-sqlite3` directly) | **NO** | **VULNERABLE** |
| **Migration Runner** | `node scripts/run_email_migration.mjs` | **NO** (Bundled standalone CLI) | **NO** | Protected by explicit CLI role |
| **Admin Maintenance CLI**| `node scripts/maintenance_control.mjs` | **NO** (Imports `better-sqlite3` directly) | **NO** | Coordinator role |

### 3.3 Required Revision
To make prototype patching effective across processes, an explicit bootstrap module (e.g. `lib/sqlite-bootstrap.mjs`) must be loaded by all process entrypoints via Node's `--import` flag or as the first line of every script, OR connections must be instantiated via a centralized factory.

---

## CHALLENGE 4 — Transaction Safety & WAL Snapshot Isolation

### 4.1 The WAL Snapshot Isolation Blind Spot
The Phase 5 design proposed a pre-commit validation hook:
```typescript
const fence = db.prepare('SELECT state FROM _maintenance_fence WHERE id = 1').get();
if (fence.state !== 'INACTIVE') throw new MaintenanceActiveError(...);
```

#### The Critical Flaw:
In SQLite WAL mode, **a transaction's read mark isolates it from concurrent commits**:
1. Transaction T1 starts at $t_0$. Its first read establishes its point-in-time snapshot of the WAL index.
2. Coordinator commits `_maintenance_fence.state = 'ACTIVE'` at $t_1$ in an independent connection.
3. At $t_2$, Transaction T1 executes `SELECT state FROM _maintenance_fence WHERE id = 1`.
4. **Under WAL snapshot isolation, Transaction T1 still reads `state = 'INACTIVE'`!**

#### Empirical Verification:
In `test_challenge_wal.mjs`, when Tx1 read the fence table before and after the coordinator committed `ACTIVE`:
```text
1. Tx1 established read snapshot. Observed fence state: INACTIVE
2. Coordinator committed fence state = ACTIVE in independent connection.
3. Tx1 reads fence again inside existing transaction. Observed state: INACTIVE
```
Because Tx1 reads from its established WAL snapshot, **it cannot see that the coordinator changed the state to `ACTIVE`**.

### 4.2 How SQLite Actually Protects the System
While the pre-commit `SELECT` is blinded by snapshot isolation, SQLite's native locking provides the true guarantee:
1. **Deferred Transactions:** If Tx1 only performed reads and then attempts an `INSERT` after Coordinator committed `ACTIVE`, SQLite detects that the WAL has advanced and aborts Tx1 with `SQLITE_BUSY: database is locked`.
2. **Immediate Transactions (`BEGIN IMMEDIATE`):** If Tx1 began with `BEGIN IMMEDIATE`, it held the `WAL_WRITE_LOCK` from the start. As proven in Challenge 1, **the Coordinator is physically blocked from committing `ACTIVE` until Tx1 completes**.

**Architectural Revision:**  
Do not rely on in-transaction `SELECT state FROM _maintenance_fence` to detect concurrent maintenance activation. Instead:
- Require all application write transactions to start with `BEGIN IMMEDIATE`.
- The Coordinator's acquisition of `BEGIN EXCLUSIVE` on `career_app.db` is the true gatekeeper: it cannot succeed until all in-flight `IMMEDIATE` transactions have committed.

---

## CHALLENGE 5 — Recovery and Fail-Closed Matrix

| Failure Mode | Direct Consequence | System State | Fail-Closed Verdict |
|---|---|---|---|
| **Coordinator crashes while holding `BEGIN EXCLUSIVE`** | OS closes coordinator's file descriptor; SQLite releases lock; uncommitted DDL rolls back | Database reverts to clean pre-maintenance state; no corrupt half-applied DDL | **PASS (Fail-Closed & Safe)** |
| **Coordinator crashes after setting `ACTIVE`** | `_maintenance_fence` and `.coordination.db` remain `ACTIVE` | All application writes continue to be blocked; manual recovery required via `--disable` | **PASS (Fail-Closed)** |
| **Application process restarts during maintenance** | Next.js boots while state is `ACTIVE` | Boot reads `_maintenance_fence` or `.coordination.db`; rejects API writes immediately | **PASS (Fail-Closed)** |
| **SQLite Busy Timeout expires during drain** | Coordinator cannot acquire `BEGIN EXCLUSIVE` within 15s | Drain loop aborts cleanly to `INACTIVE`; maintenance is NOT declared `ACTIVE` | **PASS (Fail-Closed)** |
| **Disk-Full (`ENOSPC`) on `/app/data`** | SQLite fails with `SQLITE_FULL` | Writes abort immediately; rollback executes | **PASS (Fail-Closed)** |
| **Sidecar `.coordination.db` file corrupted** | `lib/coordination.ts:215` catches error | Catch block returns `{ state: 'ACTIVE' }`; all writes rejected | **PASS (Fail-Closed)** |
| **Primary database file corrupted** | SQLite fails integrity check | Migration runner preflight aborts before DDL execution | **PASS (Fail-Closed)** |

---

## REQUIRED DESIGN REVISIONS FOR PHASE 5

Before proceeding to implementation, the Phase 5 design document must be revised to incorporate these five necessary adjustments:

### Revision 1: Elevate SQLite WAL `BEGIN EXCLUSIVE` as Primary Authority
Replace the assumption that `_maintenance_fence` triggers are the primary fence. Document that **holding `BEGIN EXCLUSIVE` on `career_app.db` is the physical gatekeeper**:
1. Draining is complete *only* when the coordinator successfully acquires `BEGIN EXCLUSIVE` on `career_app.db`.
2. While `BEGIN EXCLUSIVE` is held, no other process can acquire a write lock or commit to WAL.

### Revision 2: Standardize on `BEGIN IMMEDIATE` for All Write Transactions
Because `BEGIN DEFERRED` transactions can take a read snapshot and attempt a write later, all mutating transactions across `lib/db.ts` and scripts must use `BEGIN IMMEDIATE` (`db.transaction(...).immediate()`). This guarantees that no transaction can write without holding the WAL lock from $t_0$, ensuring the coordinator's `BEGIN EXCLUSIVE` will never race with a hidden deferred writer.

### Revision 3: Universal Bootstrap Module for Prototype Patching
Replace the singleton patch with a standalone bootstrap script (`lib/db-bootstrap.mjs`) imported at the top of:
- `scripts/start_all.mjs`
- `scripts/background_worker.mjs`
- `scripts/backup_manager.mjs`
- `lib/db.ts`

### Revision 4: Recognize Trigger Snapshot Isolation Constraints
Acknowledge in the architecture documentation that triggers protect against *new* transactions started after `_maintenance_fence` is updated, but cannot protect an existing open transaction whose snapshot was established prior to the update (which is instead protected by the `WAL_WRITE_LOCK` handshake).

### Revision 5: Dedicated Fencing Cleanup & Retention Prune
Include explicit unit test assertions proving that `durable_audit_spool` retention pruning executes on every flush cycle without leaking memory or disk space.

---

## Final Verdict & Certification

```
================================================================================
FINAL VERDICT: DESIGN REQUIRES REVISION
================================================================================
The proposed Phase 5 remediation is fundamentally on the correct trajectory,
but requires the technical revisions specified above before code implementation.
In particular:
1. SQLite WAL `BEGIN EXCLUSIVE` must be recognized as the primary physical fence.
2. Write transactions must strictly use `BEGIN IMMEDIATE`.
3. Prototype patching must be unified across all Node.js OS processes.

Strict execution restrictions observed: DESIGN CHALLENGE & ISOLATED TESTS ONLY.
No application code modified, no migrations executed, Railway untouched.
================================================================================
```
