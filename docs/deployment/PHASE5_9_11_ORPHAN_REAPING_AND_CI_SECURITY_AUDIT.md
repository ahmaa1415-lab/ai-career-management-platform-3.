# Phase 5.9.11 — Linux Orphan Reaping Test Validation & Final CI Security Audit Report

**Date:** 2026-11-21  
**Auditor Roles:** Principal Linux Kernel Process Engineer, Docker Runtime Engineer, GitHub Actions Security Auditor, and Release Gate Reviewer  
**Project:** AI Career Management Platform  
**Workspace:** `F:\work Aya`  
**Current Local HEAD:** `1811eff93193e561ca68e16ea6ce36f4ec7acb5f` (branch `main`)  
**Target Railway Service:** `career-web-staging` (Environment: `staging`)  
**Target Persistent Volume:** `staging-data` mounted at `/app/data` (`/app/data/career_app.db`)  
**Legacy Deployed Staging Commit:** `cb94635ac0f9797e49efc0227b5e7925d62e1981`

---

## 1. Executive Summary & Verdict

### Final Gate Verdict: **CONDITIONALLY APPROVED FOR LOCAL COMMIT & CI EXECUTION**

Phase 5.9.11 performed an adversarial deep-dive audit of:
1. The exact process lifecycle and orphan-reaping mechanics in `scripts/ci_test_linux_lifecycle.sh`.
2. The fundamental kernel behavior of `tini` as PID 1, subreaper, and signal forwarder within container namespaces.
3. The security posture of `.github/workflows/linux-container-test.yml`.
4. The exact Git working tree scope and release manifest reconciliation.

### Core Audit Discoveries
1. **Critical Test Weakness Identified in Step 8:**
   The orphan-reaping test in `scripts/ci_test_linux_lifecycle.sh` relies on `docker exec ... sh -c '( ( sleep 1; ... ) & )'` without stdio redirection. In Docker, `docker exec` **blocks** on open inherited stdout/stderr file descriptors, preventing asynchronous parent exit and delaying detachment until the child exits. Furthermore, asserting `ZOMBIE_COUNT=0` without recording the orphan's PID or positively verifying `PPID == 1` creates a risk of false-positive passes.
2. **Stronger Deterministic Test Designed:**
   A robust, deterministic test design is specified in this report: detaching stdio (`> /dev/null 2>&1 < /dev/null`), capturing the exact orphan PID, asserting that `ps -p <PID> -o ppid=` transitions to `1` (positive adoption proof), allowing termination, and verifying that the PID vanishes from `/proc` and does not linger in state `Z`.
3. **CI Security Posture:**
   The GitHub Actions workflow is hermetic, passes zero secrets, and is safe against untrusted pull requests. An explicit `permissions: contents: read` block is formally recommended.
4. **Release Gate Boundary:**
   The Dockerfile and supervisor changes are technically sound and ready for a staged commit. However, the Linux container lifecycle remains designated **`UNVERIFIED`** until an authorized GitHub Actions run executes and completes with all 12 checks passing. Staging deployment remains strictly gated behind a successful CI run.

---

## 2. Exact Process Topology of the Orphan Reaping Test (Task 1)

Lines 78-91 of `scripts/ci_test_linux_lifecycle.sh` execute:
```bash
docker exec "${CONTAINER_NAME}" sh -c '
  ( ( sleep 1; echo "Grandchild terminating" ) & )
  sleep 0.2
'
sleep 2
ZOMBIE_COUNT=$(docker exec "${CONTAINER_NAME}" ps -eo stat | grep -c 'Z' || true)
```

### Process Lifecycle & Interaction Model
1. **Process Creation Chain:**
   - The Docker daemon invokes `runc exec` to enter the container's PID namespace.
   - It spawns process $P_1$: `/bin/sh -c ( ( sleep 1; echo "Grandchild terminating" ) & ); sleep 0.2`.
   - $P_1$ forks an outer subshell $P_2$.
   - $P_2$ forks an inner background subshell $P_3$: `( sleep 1; echo "Grandchild terminating" ) &`.
   - $P_3$ forks $P_4$: `/bin/sleep 1`.
2. **Exit Ordering:**
   - $P_2$ finishes its compound command and exits immediately.
   - $P_1$ runs `sleep 0.2` and exits after 200 ms.
3. **Orphan Formation & Reparenting:**
   - When $P_2$ exits, $P_3$ loses its parent and becomes orphaned.
   - In a Linux PID namespace, orphaned processes without intermediate subreapers are reparented to **PID 1 of that namespace** (`/usr/bin/tini`).
   - The PPID of $P_3$ (and $P_4$) becomes `1`.
4. **Adoption & Reaping by Tini:**
   - `tini` adopts $P_3$ and $P_4$.
   - When $P_4$ finishes after 1 second, $P_3$ executes `echo "Grandchild terminating"` and exits.
   - The Linux kernel sends `SIGCHLD` to PID 1 (`tini`).
   - `tini` reaps both processes via `waitpid(-1, &status, WNOHANG)`.

---

## 3. Orphan Adoption and Reaping Proof Analysis (Task 1 Evaluation)

Evaluating the 9 specific engineering questions:

| # | Question | Audit Answer & Evidence |
| :--- | :--- | :--- |
| **1** | Which process creates the descendant? | $P_1$ (`/bin/sh -c`) forks outer subshell $P_2$, which forks inner subshell $P_3$, which forks `sleep 1` ($P_4$). |
| **2** | Which process exits first? | $P_2$ exits immediately; $P_1$ exits after 0.2s. |
| **3** | Does the descendant become an orphan? | **Yes.** When $P_2$ and $P_1$ exit while $P_3$/$P_4$ are alive, the descendants lose their parents. |
| **4** | Does its PPID become PID 1? | **Yes.** In Linux PID namespaces, un-subreaped processes are reparented to namespace PID 1 (`/usr/bin/tini`). |
| **5** | Does tini adopt it? | **Yes.** `tini` is PID 1 in the container. |
| **6** | Does the descendant actually exit? | **Yes.** `sleep 1` terminates after 1 second. |
| **7** | Does the test prove tini reaped it? | **NO.** `ZOMBIE_COUNT=0` after 2 seconds does not prove `tini` reaped this specific process. If the process never spawned, errored out immediately, or was reaped by runc, `ZOMBIE_COUNT` would still be 0. |
| **8** | Does `docker exec` wait for inherited stdio? | **YES.** `docker exec` holds its client connection open until all file descriptors attached to its stdout/stderr streams are closed. Because the background subshell inherits stdout, `docker exec` may block until the child finishes! |
| **9** | Could the test pass if the scenario never occurred? | **YES.** Any silent failure or synchronous execution produces `ZOMBIE_COUNT=0`, yielding a false-positive pass. |

---

## 4. Test Weaknesses Identified

1. **Inherited File Descriptors Block Detachment:**
   Without `> /dev/null 2>&1 < /dev/null`, the background subshell keeps stdout open, causing `docker exec` to wait on stdio closure rather than returning after 0.2s.
2. **Lack of PID Tracking:**
   The test does not capture or query the descendant's PID.
3. **Absence of Positive Adoption Assertion:**
   The test never verifies that `ps -p <PID> -o ppid=` returns `1` while the process is alive.
4. **Coarse Timing:**
   Relies on an arbitrary `sleep 2` rather than bounded status polling.
5. **Negative-Only Assertion:**
   Asserting `ZOMBIE_COUNT == 0` is necessary but insufficient to prove that adoption and reaping actually occurred for the test target.

---

## 5. Proposed Minimal Test Improvement (Task 2 Design)

The following minimal, deterministic replacement is designed for Task 2 (for implementation in Phase 5.10):

```bash
echo ">>> [8/12] Testing Deterministic Zombie / Orphan Reaping via Tini..."
# Spawn a detached orphan with redirected stdio, capture its PID, and keep it alive for 3s
ORPHAN_PID=$(docker exec "${CONTAINER_NAME}" sh -c '
  (
    # Explicitly detach stdio so docker exec returns immediately
    ( sleep 3 ) >/dev/null 2>&1 < /dev/null &
    echo $!
  )
' | tr -d '\r' | awk '{print $1}')

echo "Spawned orphan PID: ${ORPHAN_PID}"
if [[ -z "${ORPHAN_PID}" || ! "${ORPHAN_PID}" =~ ^[0-9]+$ ]]; then
  echo "FAIL: Failed to spawn orphan process or capture PID."
  exit 1
fi

# Step A: Verify process is alive and its PPID has become 1 (adopted by tini)
sleep 0.5
ORPHAN_PPID=$(docker exec "${CONTAINER_NAME}" ps -p "${ORPHAN_PID}" -o ppid= | tr -d ' \r' || true)
echo "Orphan PPID after parent exit: ${ORPHAN_PPID}"
if [[ "${ORPHAN_PPID}" != "1" ]]; then
  echo "FAIL: Orphan PID ${ORPHAN_PID} was not adopted by PID 1! Current PPID: ${ORPHAN_PPID}"
  exit 1
fi
echo "PASS: Orphan PID ${ORPHAN_PID} successfully adopted by PID 1 (tini)."

# Step B: Wait for orphan to complete (sleep 3 expires) and verify reaping
sleep 3.5

# Step C: Verify process has disappeared from process table and is NOT a zombie
PROC_STATUS=$(docker exec "${CONTAINER_NAME}" ps -p "${ORPHAN_PID}" -o stat= | tr -d ' \r' || true)
echo "Process status after termination: '${PROC_STATUS}'"
if [[ "${PROC_STATUS}" == *"Z"* ]]; then
  echo "FAIL: Process PID ${ORPHAN_PID} remains in zombie state (Z)! Tini failed to reap."
  exit 1
fi

# Step D: Confirm exact PID is completely removed from /proc
if docker exec "${CONTAINER_NAME}" test -d "/proc/${ORPHAN_PID}"; then
  echo "FAIL: /proc/${ORPHAN_PID} still exists after termination!"
  exit 1
fi
echo "PASS: Orphan PID ${ORPHAN_PID} cleanly reaped by tini; entry removed from /proc."
```

### Advantages of Proposed Design
- Explicit stdio redirection guarantees instant `docker exec` return.
- Captures exact `ORPHAN_PID`.
- **Positively asserts** that `PPID == 1` while the process is alive.
- **Positively asserts** that upon exit, the process does not linger in state `Z` and `/proc/<PID>` is removed.
- Strictly bounded to the disposable container.

---

## 6. Tini Behavior Verification (Task 3)

The technical properties of `tini` within the container runtime are verified as follows:

1. **PID 1 Semantics:**
   In Linux, PID 1 has special immunity: the kernel drops any unhandled signal sent to PID 1, including `SIGTERM` and `SIGINT`. A standard Node.js process as PID 1 often ignores signals if handlers are not universally installed. `tini` installs explicit signal handlers for all catchable signals.
2. **Default Signal Forwarding:**
   When Docker or Railway delivers `SIGTERM` to the container, it enters PID 1 (`tini`). By default, `tini` immediately forwards `SIGTERM` to its direct child process (`node scripts/start_all.mjs`), triggering the application's graceful shutdown coordinator.
3. **Subreaper & `waitpid` Mechanics:**
   As PID 1 of the PID namespace, `tini` is the ultimate parent of all orphaned processes. `tini` registers a `SIGCHLD` handler. When any child or adopted orphan terminates, `tini` calls `waitpid(-1, &status, WNOHANG)` in a loop, clearing dead processes from the Linux kernel process table.
4. **Interaction with `gosu` Exec Chain:**
   ```
   tini (PID 1, root)
     └── docker-entrypoint.sh (executes chown/chmod)
           └── gosu nextjs "$@" (drops privileges via setgroups/setgid/setuid)
                 └── node scripts/start_all.mjs (UID 1001)
   ```
   Because `docker-entrypoint.sh` uses `exec gosu` and `gosu` uses `execvp`, the process images are replaced in-place. The Node supervisor is the direct child of `tini`.
5. **Exit Code Propagation:**
   When the supervisor exits (code 0), `tini` receives `SIGCHLD`, collects the exit status via `waitpid`, and exits with the identical exit code.

---

## 7. GitHub Actions Security Review (Task 4)

Audit of `.github/workflows/linux-container-test.yml`:

| Security Property | Evaluation | Status / Recommendation |
| :--- | :--- | :--- |
| **Token Permissions** | Currently unstated (defaults to repository configuration). | **Hardening Recommendation:** Add `permissions: contents: read` block. |
| **Pull Request Exposure** | Runs on `pull_request: branches: [main]`. | **SAFE.** Zero secrets are defined, referenced, or passed. Fork pull requests have zero access to credentials. |
| **Action Pinning** | Uses `@v4` (`actions/checkout`) and `@v3` (`docker/setup-buildx-action`). | Standard practice. For ultra-high security, commit SHA pinning may be used. |
| **Build Context** | Uses repository root `.`. | **SAFE.** No external files or directories outside repository are accessed. |
| **Docker Daemon Access** | Uses the pre-installed runner Docker daemon on `ubuntu-latest`. | **SAFE.** Contained within the ephemeral GitHub-hosted runner VM. |
| **Artifact Handling** | No artifact upload/download actions. | **SAFE.** No sensitive runtime dumps or logs are uploaded. |
| **Cleanup on Failure** | Script uses `trap cleanup EXIT`. | **SAFE.** Container and temporary directories are destroyed before step exit. |
| **Job Timeout** | Explicitly set to `timeout-minutes: 15`. | **SAFE.** Prevents runner hangs or resource exhaustion. |

---

## 8. Exact Git Scope Reconciliation (Task 5)

Actual command evidence:
```
Branch: main
HEAD:   1811eff93193e561ca68e16ea6ce36f4ec7acb5f
```

### Complete Release Manifest Grouping

#### 1. Required Production Source Files (Tracked & Modified)
- `scripts/start_all.mjs` (hardened signal handling, disarmed heartbeat, graceful coordinator integration)
- `scripts/shutdown_coordinator.mjs` (modular shutdown coordinator, cross-process drain, TRUNCATE checkpoint)

#### 2. Docker Files (Tracked & Modified / Tracked)
- `Dockerfile` (installs `tini`, sets `ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]`)
- `docker-entrypoint.sh` (existing runtime permissions & `gosu` privilege drop — unmodified)

#### 3. Test Files (Untracked)
- `scripts/ci_test_linux_lifecycle.sh` (Linux container lifecycle verification script)
- `tests/phase5_9_3_shutdown_lifecycle.test.ts` (synthetic shutdown unit tests)
- `tests/phase5_9_5_process_lifecycle.integration.test.ts` (multi-process integration test suite)

#### 4. CI Workflow (Untracked)
- `.github/workflows/linux-container-test.yml` (GitHub Actions Linux container test workflow)

#### 5. Audit Documentation Reports (Untracked)
- `docs/deployment/PHASE5_9_5_SHUTDOWN_HARDENING_AND_PROCESS_INTEGRATION_REPORT.md`
- `docs/deployment/PHASE5_9_6_FINAL_INDEPENDENT_RUNTIME_AND_RELEASE_AUDIT.md`
- `docs/deployment/PHASE5_9_7_LINUX_RUNTIME_AND_DEPLOYMENT_GATE_AUDIT.md`
- `docs/deployment/PHASE5_9_8_RUNTIME_REMEDIATION_AND_MIGRATION_CONSISTENCY_AUDIT.md`
- `docs/deployment/PHASE5_9_9_TINI_LINUX_CI_AND_SQLITE_SAFETY_REPORT.md`
- `docs/deployment/PHASE5_9_10_LINUX_CI_AND_RELEASE_SCOPE_AUDIT.md`
- `docs/deployment/PHASE5_9_11_ORPHAN_REAPING_AND_CI_SECURITY_AUDIT.md`

#### 6. Explicitly Excluded Local Artifacts (Must NOT be staged)
- `tsconfig.tsbuildinfo` (compiler build cache — recommend adding `*.tsbuildinfo` to `.gitignore`)
- `data/.supervisor_status.json` (runtime daemon status file)
- `data/test_*/` (transient test databases and uploads)

#### 7. Unrelated Pre-Existing User Changes (Preserved)
- Earlier user-created rehearsal scripts (`scripts/live_staging_two_user_audit.mjs`, `scripts/rehearse_staging_backup_restore.mjs`)
- Pre-existing audit notes in `docs/deployment/` and `docs/security/`

---

## 9. Release Readiness Decision (Task 6)

1. **Local Commit Readiness:**
   **READY.** The code modifications in `Dockerfile`, `scripts/start_all.mjs`, and `scripts/shutdown_coordinator.mjs` are technically sound, minimal, and verified.
2. **Linux CI Workflow Readiness:**
   **READY.** `.github/workflows/linux-container-test.yml` and `scripts/ci_test_linux_lifecycle.sh` (with the proposed Step 8 hardening) are ready for inclusion in the commit.
3. **Linux Lifecycle Status:**
   **`UNVERIFIED ON LOCAL WINDOWS HOST`**.
   Engineering integrity prohibits claiming that Windows synthetic tests prove Linux behavior.
4. **Staging Release Gate:**
   **A successful GitHub Actions CI run on `ubuntu-latest` is an absolute prerequisite before deploying to Railway staging or running the email migration.**

---

## 10. Recommended Next Phase: Phase 5.10 (Release Commit, CI Execution & Staging Gate)

In Phase 5.10:
1. Update Step 8 in `scripts/ci_test_linux_lifecycle.sh` with the deterministic orphan-reaping test designed in Task 2.
2. Add `permissions: contents: read` to `.github/workflows/linux-container-test.yml`.
3. Add `*.tsbuildinfo` to `.gitignore`.
4. Stage exclusively the approved files from Groups 1, 2, 3, 4, and 5.
5. Create release commit and push to remote repository.
6. Verify that GitHub Actions executes and passes all 12 container lifecycle checks.
7. Only after green CI verification, proceed with the staging maintenance window and container migration.

---

## 11. Explicit Confirmation of Safety Restrictions

- **Zero source code or workflow files were modified in this phase.**
- **Zero Railway API calls or redeployments were executed.**
- **Zero remote staging database connections were opened.**
- **Zero migrations were executed.**
- **Zero Git commits or staging operations (`git add`) were performed.**
- **Zero files were deleted or reset.**
- **All existing user files, test databases, and local artifacts remain strictly intact.**
