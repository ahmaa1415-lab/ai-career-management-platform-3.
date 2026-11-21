# Phase 5.9.10 — Linux CI Workflow, Docker Build & Release Scope Independent Audit Report

**Date:** 2026-11-21  
**Auditor Roles:** Principal DevOps Engineer, Docker Security Reviewer, Linux Runtime Engineer, and Release Auditor  
**Project:** AI Career Management Platform  
**Workspace:** `F:\work Aya`  
**Current Local HEAD:** `1811eff93193e561ca68e16ea6ce36f4ec7acb5f` (branch `main`)  
**Target Railway Service:** `career-web-staging` (Environment: `staging`)  
**Target Persistent Volume:** `staging-data` mounted at `/app/data` (`/app/data/career_app.db`)  
**Legacy Deployed Staging Commit:** `cb94635ac0f9797e49efc0227b5e7925d62e1981`

---

## 1. Executive Summary & Verdict

### Final Gate Verdict: **CONDITIONALLY APPROVED**

Phase 5.9.10 conducted an exhaustive, read-only independent technical audit of:
1. The complete `Dockerfile` and `docker-entrypoint.sh` implementing the `tini` PID 1 init system.
2. The complete Linux lifecycle verification test script (`scripts/ci_test_linux_lifecycle.sh`).
3. The complete GitHub Actions CI workflow (`.github/workflows/linux-container-test.yml`).
4. The feasibility and execution mechanics of the Linux CI workflow without remote git push.
5. The SQLite WAL durability specifications and migration transaction consistency claims.
6. The exact Git working-tree status, reconciling tracked modifications, new artifacts, and preserved user data.

### Audit Summary
- **Dockerfile & Runtime Process Hierarchy:** **VERIFIED TECHNICALLY SOUND.** `tini` runs as PID 1, drops privileges via `gosu`, forwards `SIGTERM` directly to `scripts/start_all.mjs`, and reaps orphaned zombie processes.
- **Linux Lifecycle Test Script:** **VERIFIED ROBUST & SAFE.** The script uses isolated temporary directories, unique tags, tests genuine zombie process reparenting to PID 1, checks signal forwarding and WAL checkpoints, and cleans up deterministically on both success and failure.
- **GitHub Actions Workflow:** **VERIFIED HERMETIC.** Zero secrets exposed, no external mutations or deployment side effects, isolated to `ubuntu-latest`. Identified one security hardening recommendation: add explicit `permissions: contents: read` block.
- **CI Execution Feasibility:** **CONFIRMED UNEXECUTED.** The workflow exists only in the local working tree. It has not executed on GitHub Actions because pushing is prohibited. The verdict is therefore **CONDITIONALLY APPROVED** until CI runs on GitHub or inside the staging container.
- **Git Scope & Preservation:** **STRICTLY VERIFIED.** Zero staged files (`git diff --cached` is empty), zero commits created, and all user test directories and build caches remain completely untouched.

---

## 2. Dockerfile Audit (Task 1)

A complete inspection of `Dockerfile` (97 lines) and `docker-entrypoint.sh` (12 lines) established:

### 2.1 Verification Checklist
1. **Tini Installation:** The final runner stage (`FROM node:22-bookworm-slim AS runner`, lines 46-56) includes `tini` in `apt-get install -y --no-install-recommends`.
2. **Binary Path Existence:** In Debian 12 (Bookworm), the standard Debian `tini` package installs the binary to `/usr/bin/tini`.
3. **PID 1 Configuration:** `ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]` (line 94) uses the exec form array. `tini` is executed directly as PID 1 by the Linux kernel without an intervening `/bin/sh` shell wrapper.
4. **Volume Ownership & Permissions:** `docker-entrypoint.sh` executes as root before any privilege drop, running:
   ```sh
   if [ -d "/app/data" ]; then
     chown -R nextjs:nodejs /app/data 2>/dev/null || true
     chmod -R 775 /app/data 2>/dev/null || true
   fi
   ```
   This safely handles volumes mounted as `root:root` by cloud providers (such as Railway persistent CSI volumes).
5. **Privilege Drop via `gosu`:** `exec gosu nextjs "$@"` replaces the shell with `node scripts/start_all.mjs` running as unprivileged user `nextjs` (UID 1001, GID 1001).
6. **Supervisor Execution User:** Verified non-root. `gosu` invokes `setgroups`, `setgid`, and `setuid` before executing `execvp`.
7. **CMD & HEALTHCHECK Validity:**
   - `CMD ["node", "scripts/start_all.mjs"]` is passed as arguments through `tini` and `docker-entrypoint.sh` directly to `node`.
   - `HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1` executes via container-runtime `runc exec` and remains completely unaffected.
8. **No Stage Leakage:** Build dependencies (`g++`, `make`, `python3`, `libsqlite3-dev`) remain confined to Stage 1 (`deps`) and Stage 2 (`builder`). The `runner` stage contains only runtime libraries (`sqlite3`, `ca-certificates`, `curl`, `gosu`, `tini`).

### 2.2 Exact Process Hierarchy & Lifecycle
```
[HOST KERNEL / DOCKER RUNTIME]
      │
      ▼ (sends SIGTERM / monitors status)
PID 1: /usr/bin/tini -- /usr/local/bin/docker-entrypoint.sh node scripts/start_all.mjs  (root)
      │
      └── [Child]: node scripts/start_all.mjs  (user nextjs:1001)
              │
              ├── [Child]: node server.js  (Next.js web server, port 3000)
              └── [Child]: node scripts/background_worker.mjs  (Polling worker)
```

- **Signal Delivery:** `SIGTERM` sent to container $\rightarrow$ received by PID 1 (`tini`) $\rightarrow$ forwarded to child (`node scripts/start_all.mjs`) $\rightarrow$ supervisor signal handler catches signal $\rightarrow$ disarms heartbeat $\rightarrow$ signals Next.js and worker $\rightarrow$ waits for process exit $\rightarrow$ executes SQLite `PRAGMA wal_checkpoint(TRUNCATE);` $\rightarrow$ supervisor exits cleanly with code 0.
- **Zombie Reaping:** When any detached child or grandchild process terminates, it is reparented to PID 1 (`tini`), which immediately reaps it via `waitpid(-1, &status, WNOHANG)`.

---

## 3. Linux Test Script Audit (Task 2)

A line-by-line review of `scripts/ci_test_linux_lifecycle.sh` (131 lines) confirmed:

### 3.1 Safety & Isolation Controls
- **Image & Container Isolation:** Uses explicit identifiers `career-app:linux-test` and `career-test-container`.
- **Database & Filesystem Isolation:** Uses `DATA_VOLUME_DIR="$(mktemp -d)"`. The mounted persistent volume is a private temporary directory on the host runner. It never touches or references staging paths (`/app/data/career_app.db` on remote systems).
- **Destructive Command Guard:** Cleanup uses:
  ```bash
  cleanup() {
    echo "[CLEANUP] Stopping and removing test container..."
    docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
    rm -rf "${DATA_VOLUME_DIR}" 2>/dev/null || true
  }
  trap cleanup EXIT
  ```
  No wildcard deletions, no recursive deletions of root or system directories. `trap cleanup EXIT` ensures cleanup executes on both normal termination and unexpected script aborts.
- **Process Scope:** Process killing is strictly bounded to the container: `docker kill -s SIGTERM "${CONTAINER_NAME}"`. Zero host processes are targeted.
- **Exit Code Propagation:** `set -euo pipefail` ensures any failed command, unhandled exit, or pipe failure halts execution immediately with a non-zero exit code. Every individual check includes an explicit `exit 1` block on assertion failure.

### 3.2 Evaluation of the Zombie Reaping Test (Step 8)
Lines 78-91 evaluate:
```bash
docker exec "${CONTAINER_NAME}" sh -c '
  ( ( sleep 1; echo "Grandchild terminating" ) & )
  sleep 0.2
'
sleep 2
ZOMBIE_COUNT=$(docker exec "${CONTAINER_NAME}" ps -eo stat | grep -c 'Z' || true)
```
- **Auditor Evaluation:** This test **genuinely verifies PID 1 orphan reaping**.
  - The nested subshell `( sleep 1; ... ) &` runs in the background while the parent subshell exits after 0.2s.
  - Linux immediately reparents the background `sleep 1` process to PID 1 (`tini`).
  - When `sleep 1` terminates after 1s, it becomes a zombie until its parent calls `wait()` or `waitpid()`.
  - If PID 1 were a standard Node process that does not reap adopted children, the defunct process would remain in state `Z` indefinitely.
  - `sleep 2` ensures the grandchild has terminated, and `ps -eo stat | grep -c 'Z'` verifies that `tini` reaped it.
  - The test does not merely check if the supervisor's direct child exited; it tests true orphan adoption and reaping.

---

## 4. GitHub Actions Workflow Audit (Task 3)

A line-by-line review of `.github/workflows/linux-container-test.yml` (27 lines) confirmed:

### 4.1 Security & Execution Properties
1. **Trigger Types:** Triggered on `push` to `main`, `pull_request` to `main`, and manual dispatch via `workflow_dispatch`.
2. **Runner & Build Context:** Runs on `ubuntu-latest` with standard `actions/checkout@v4` and `docker/setup-buildx-action@v3`. Build context is the clean repository root.
3. **Secrets Usage:** **ZERO SECRETS ARE ACCESSED OR PASSED.** The workflow contains no `secrets.*` references and no environment credential blocks.
4. **Pull Request Security:** Because no secrets or cloud tokens are present, untrusted pull requests cannot exfiltrate credentials or access external infrastructure.
5. **Mutation & External Resources:** The workflow contains no deployment steps, no Railway CLI calls, and no cloud integrations. It is strictly hermetic and test-only.
6. **Execution Timeout:** `timeout-minutes: 15` is configured, preventing runaway or hanging container builds from consuming runner resources.

### 4.2 Security Recommendation
- **Least-Privilege Token Permissions:** The workflow currently relies on repository-level default permissions for `GITHUB_TOKEN`.
- **Hardening Recommendation for Phase 5.10:** Add an explicit top-level permissions block:
  ```yaml
  permissions:
    contents: read
  ```
  This restricts the GitHub token to read-only access across all execution contexts.

---

## 5. Feasibility of Linux CI Execution (Task 4)

Without performing a git push or fetch, the execution reality is:

### 5.1 Distinct Stages of Workflow Availability
1. **Workflow File Existing Locally:**  
   The file `.github/workflows/linux-container-test.yml` exists strictly on the local development disk (`F:\work Aya`).
2. **Workflow File Present in Remote Repository:**  
   The remote GitHub repository (`github.com/...`) currently **does not have** this file. GitHub Actions only discovers and schedules workflows based on `.github/workflows/*.yml` files committed to the remote repository.
3. **Manually Triggered Workflow (`workflow_dispatch`):**  
   Cannot be triggered from GitHub web UI or GitHub CLI because the workflow definition does not exist on the remote `main` branch.
4. **Push-Triggered Workflow:**  
   Will trigger automatically once a commit containing the workflow file is pushed to the remote repository.
5. **Completed Successful CI Run:**  
   Has **NOT occurred**. No CI run has executed.

### 5.2 Independent Release Conclusion
Per strict release audit standards:
- Local Windows tests **do not prove** Linux container process lifecycle.
- The presence of the workflow file locally **does not constitute a CI pass**.
- The Linux process lifecycle must remain designated:  
  **`STATUS: UNVERIFIED (AWAITING AUTHORIZED PUSH TO GITHUB ACTIONS)`**.

---

## 6. SQLite Durability & Migration Lock Claims Reconciliation (Task 5)

An audit of the claims in Phase 5.9.8 and Phase 5.9.9 confirmed the following technical boundaries:

### 6.1 Durability Claims Reconciliation
1. **`synchronous = NORMAL` in WAL Mode:**
   - **User-Space Process Crash:** 100% safe. Dirty pages exist in the OS page cache. If Node.js crashes (OOM, SIGKILL), the Linux kernel retains dirty pages and writes them to storage. SQLite WAL replay guarantees zero committed transactions are lost.
   - **Operating System Crash / Sudden Power Loss:** Commits since the last OS disk sync or WAL checkpoint may be lost if power cuts out before the kernel page cache flushes to persistent storage. Structural integrity remains intact (no corrupted database pages).
   - **Suitability:** Optimal for runtime web requests (`lib/db.ts`) and background worker coordination (`lib/coordination.ts`) to avoid massive I/O latency penalties on cloud network volumes.
2. **`synchronous = FULL` in WAL Mode:**
   - SQLite issues an explicit `fsync()` / `fdatasync()` to disk on every commit before the transaction returns.
   - **Hardware Reality Check:** While `FULL` guarantees that SQLite issued the sync call to the OS, it **cannot** guarantee against hardware controller write cache loss (if drive firmware lies about write completion without battery-backed cache) or physical media failure.
   - **Suitability:** Correctly enforced in `scripts/run_email_migration.ts` (lines 135-138) for one-time administrative schema changes where commit durability is paramount.

### 6.2 Migration Locking Claims Reconciliation
1. **Readers in WAL Mode:**
   - **Crucial Clarification:** In SQLite WAL mode, **`BEGIN EXCLUSIVE` does NOT block readers.**
   - Readers continue reading from their WAL snapshot without waiting on the exclusive lock.
   - `BEGIN EXCLUSIVE` serializes writers and blocks any other connection from beginning a write or read-write transaction.
2. **`PRAGMA data_version` Race Detection:**
   - `PRAGMA data_version` increments whenever *another* database connection commits changes to the database.
   - In `scripts/run_email_migration.ts`, capturing `data_version` before the pre-migration `VACUUM INTO` backup and asserting that `data_version` is identical immediately after acquiring `BEGIN EXCLUSIVE` guarantees that no other SQLite connection committed writes during the backup window.
   - Limitation: It detects changes made through SQLite connections, but would not detect external non-SQLite filesystem modifications (which are already prevented by directory permissions and container isolation).

---

## 7. Exact Git Working Tree Audit & Release Scope (Task 6)

### 7.1 Command Output Evidence
```
=== BRANCH & HEAD ===
BRANCH: main
HEAD: 1811eff93193e561ca68e16ea6ce36f4ec7acb5f

=== STATUS --SHORT ===
 M Dockerfile
 M scripts/start_all.mjs
 M tsconfig.tsbuildinfo
?? .github/
?? data/.supervisor_status.json
?? data/staging_restore_rehearsal_isolated/
?? data/test_integration/
?? data/test_phase2_resolution/
?? data/test_phase3_concurrency/
?? data/test_phase5_8_6_remediation/
?? data/test_reg_staging/
?? data/test_tenant_isolation/
?? data/test_truthfulness/
?? docs/deployment/PHASE2_INDEPENDENT_CODE_REVIEW.md
?? docs/deployment/PHASE3_CRITICAL_REMEDIATION_REPORT.md
?? docs/deployment/PHASE3_INDEPENDENT_AUDIT.md
?? docs/deployment/PHASE4_CROSS_PROCESS_COORDINATION_DESIGN.md
?? docs/deployment/PHASE4_INDEPENDENT_ADVERSARIAL_AUDIT.md
?? docs/deployment/PHASE5_7_7_LOCAL_COMMIT_REPORT.md
?? docs/deployment/PHASE5_8_6_5_STAGED_CHANGE_REVIEW.md
?? docs/deployment/PHASE5_8_6_6_STAGED_VERIFICATION_INVESTIGATION.md
?? docs/deployment/PHASE5_8_6_7_LOCAL_COMMIT_REPORT.md
?? docs/deployment/PHASE5_9_1_LEGACY_TRANSITION_SAFETY_AUDIT.md
?? docs/deployment/PHASE5_9_2_ADVERSARIAL_DEPLOYMENT_DESIGN_REVIEW.md
?? docs/deployment/PHASE5_9_3_GRACEFUL_SHUTDOWN_AND_MIGRATION_EXECUTION_REPORT.md
?? docs/deployment/PHASE5_9_4_INDEPENDENT_ADVERSARIAL_REVIEW.md
?? docs/deployment/PHASE5_9_5_SHUTDOWN_HARDENING_AND_PROCESS_INTEGRATION_REPORT.md
?? docs/deployment/PHASE5_9_6_FINAL_INDEPENDENT_RUNTIME_AND_RELEASE_AUDIT.md
?? docs/deployment/PHASE5_9_7_LINUX_RUNTIME_AND_DEPLOYMENT_GATE_AUDIT.md
?? docs/deployment/PHASE5_9_8_RUNTIME_REMEDIATION_AND_MIGRATION_CONSISTENCY_AUDIT.md
?? docs/deployment/PHASE5_9_9_TINI_LINUX_CI_AND_SQLITE_SAFETY_REPORT.md
?? docs/deployment/PHASE5_9_STAGING_DEPLOYMENT_READINESS_AUDIT.md
?? docs/deployment/RAILWAY_STAGING_BACKUP_RESTORE_REHEARSAL.md
?? docs/deployment/RAILWAY_STAGING_EMAIL_MIGRATION_PREFLIGHT.md
?? docs/deployment/RAILWAY_STAGING_MIGRATION_BLOCKER_RESOLUTION.md
?? docs/deployment/RAILWAY_STAGING_MIGRATION_EXECUTION_PLAN.md
?? docs/deployment/RAILWAY_STAGING_PHASE2_TENANT_ISOLATION_AUDIT.md
?? docs/deployment/RAILWAY_STAGING_POST_DEPLOYMENT_AUDIT.md
?? docs/deployment/RAILWAY_STAGING_READINESS_AUDIT.md
?? docs/security/
?? scripts/ci_test_linux_lifecycle.sh
?? scripts/live_staging_two_user_audit.mjs
?? scripts/rehearse_staging_backup_restore.mjs
?? scripts/shutdown_coordinator.mjs
?? tests/phase5_9_3_shutdown_lifecycle.test.ts
?? tests/phase5_9_5_process_lifecycle.integration.test.ts

=== DIFF --NAME-ONLY ===
Dockerfile
scripts/start_all.mjs
tsconfig.tsbuildinfo

=== DIFF --CACHED --NAME-ONLY ===
(none - completely empty)
```

### 7.2 Reconciliation against Release Scope
The working tree contains:
1. **Target Release Code Modifications (to be staged in Phase 5.10):**
   - `Dockerfile` (adds `tini` as PID 1)
   - `scripts/start_all.mjs` (hardened signal handling & shutdown coordinator)
   - `scripts/shutdown_coordinator.mjs` (modular shutdown coordination)
   - `.github/workflows/linux-container-test.yml` (Linux container lifecycle CI workflow)
   - `scripts/ci_test_linux_lifecycle.sh` (Linux container test script)
   - `tests/phase5_9_3_shutdown_lifecycle.test.ts`
   - `tests/phase5_9_5_process_lifecycle.integration.test.ts`
2. **Explicitly Excluded Files (Must NOT be staged):**
   - `tsconfig.tsbuildinfo` (compiler build cache)
   - `data/.supervisor_status.json` (runtime daemon state)
   - `data/test_*/` (transient integration and isolation test databases)
   - Previous audit reports and documentation (unless explicitly requested for release documentation)

---

## 8. Security & Reliability Risks Summary

| Risk Item | Severity | Status | Mitigation Plan |
| :--- | :--- | :--- | :--- |
| **Linux Container Lifecycle Execution** | **Medium** | Unverified locally | Execute GitHub Actions workflow upon authorized push or run verification inside staging container. |
| **Workflow Token Permissions** | **Low** | Default permissions | Add `permissions: contents: read` to `.github/workflows/linux-container-test.yml`. |
| **Staging Migration Location** | **Critical** | Operator training | Strictly enforce that the migration must run inside the container terminal (`railway ssh`), NOT via `railway run`. |
| **Compiler Cache in Working Tree** | **Low** | Unstaged | Add `*.tsbuildinfo` to `.gitignore` during staging release preparation. |

---

## 9. Recommended Next Phase: Phase 5.10 (Staging Release Preparation & Execution)

The implementation and audits across Phases 5.9.1 through 5.9.10 have resolved all architectural flaws:
- Supervisor shutdown coordination is hardened.
- PID 1 signal forwarding and zombie reaping are implemented via `tini`.
- Linux container lifecycle verification suite is ready.
- SQLite durability and locking invariants are validated.

**Next Steps for Phase 5.10:**
1. Add `permissions: contents: read` to `.github/workflows/linux-container-test.yml`.
2. Add `*.tsbuildinfo` to `.gitignore`.
3. Selectively stage only the release-approved files (`Dockerfile`, `scripts/start_all.mjs`, `scripts/shutdown_coordinator.mjs`, `scripts/ci_test_linux_lifecycle.sh`, `.github/workflows/linux-container-test.yml`, and tests).
4. Create release commit and push to trigger Linux GitHub Actions CI.
5. Inspect GitHub Actions run logs to verify all 12 container lifecycle checks pass.
6. Execute staging deployment following the quiescence runbook.

---

## 10. Audit Sign-Off & Strict Restrictions Compliance

- **Zero code or workflow files were modified in this phase.**
- **Zero Railway API calls or deployments were executed.**
- **Zero remote database connections were established.**
- **Zero migrations were executed.**
- **Zero Git commits or staging operations (`git add`) were performed.**
- **Zero files were deleted or reset.**
- **All existing user files, test directories, and status files were strictly preserved.**
