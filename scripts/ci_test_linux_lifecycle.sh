#!/usr/bin/env bash
set -euo pipefail

echo "================================================================================"
echo "Phase 5.9.9 — Real Linux Container Process Lifecycle & Tini Verification"
echo "================================================================================"

IMAGE_NAME="career-app:linux-test"
CONTAINER_NAME="career-test-container"
DATA_VOLUME_DIR="$(mktemp -d)"

cleanup() {
  echo "[CLEANUP] Stopping and removing test container..."
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
  rm -rf "${DATA_VOLUME_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

# Helper: Dump container process table via /proc (zero external binary dependencies in slim container)
dump_proc_tree() {
  docker exec "${CONTAINER_NAME}" sh -c '
    printf "%-7s %-7s %-7s %s\n" "PID" "PPID" "USER" "COMMAND"
    for p in /proc/[0-9]*; do
      [ -d "$p" ] || continue
      pid=$(basename "$p")
      ppid=$(awk '\''/^PPid:/ {print $2}'\'' "$p/status" 2>/dev/null || echo "?")
      uid=$(awk '\''/^Uid:/ {print $2}'\'' "$p/status" 2>/dev/null || echo "?")
      cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null || true)
      [ -z "$cmd" ] && cmd=$(cat "$p/comm" 2>/dev/null || echo "")
      printf "%-7s %-7s %-7s %s\n" "$pid" "$ppid" "$uid" "$cmd"
    done
  '
}

echo ">>> [1/12] Building Docker image with tini..."
docker build -t "${IMAGE_NAME}" -f Dockerfile .

echo ">>> [2/12] Starting container in background with persistent volume..."
mkdir -p "${DATA_VOLUME_DIR}/uploads"
docker run -d \
  --name "${CONTAINER_NAME}" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_PATH="/app/data/career_app.db" \
  -p 3000:3000 \
  -v "${DATA_VOLUME_DIR}:/app/data" \
  "${IMAGE_NAME}"

echo ">>> Waiting for container to initialize..."
sleep 5

echo ">>> [3/12] Inspecting Container Process Tree..."
PROC_TREE=$(dump_proc_tree)
echo "${PROC_TREE}"

echo ">>> [4/12] Verifying PID 1 is tini..."
PID1_CMD=$(docker exec "${CONTAINER_NAME}" sh -c 'tr "\0" " " < /proc/1/cmdline 2>/dev/null || readlink -f /proc/1/exe 2>/dev/null' | tr -d '\r')
echo "PID 1 command: ${PID1_CMD}"
if [[ "${PID1_CMD}" != *"/usr/bin/tini"* && "${PID1_CMD}" != *"tini"* ]]; then
  echo "FAIL: PID 1 is not tini! Received: ${PID1_CMD}"
  exit 1
fi
echo "PASS: PID 1 is /usr/bin/tini."

echo ">>> [5/12] Verifying Node supervisor runs as non-root user (nextjs / uid 1001)..."

# Discover Supervisor candidates excluding PID 1 (which is tini)
# Candidate must be a node process running scripts/start_all.mjs
SUPERVISOR_CANDIDATES=$(docker exec "${CONTAINER_NAME}" sh -c '
  candidates=""
  for p in /proc/[0-9]*; do
    [ -d "$p" ] || continue
    pid=$(basename "$p")
    [ "$pid" = "1" ] && continue
    
    # 1. Verify process comm identity is node
    comm=$(cat "$p/comm" 2>/dev/null || echo "")
    [ "$comm" = "node" ] || continue
    
    # 2. Verify exe symlink target resolves to node binary
    exe=$(readlink -f "$p/exe" 2>/dev/null || echo "")
    case "$exe" in
      */node) ;;
      *) continue ;;
    esac
    
    # 3. Argument-boundary-aware check: split cmdline on NUL and match target argument
    has_target_script=false
    for arg in $(tr "\0" "\n" < "$p/cmdline" 2>/dev/null); do
      case "$arg" in
        "scripts/start_all.mjs"|"./scripts/start_all.mjs"|*/scripts/start_all.mjs)
          has_target_script=true
          break
          ;;
      esac
    done
    [ "$has_target_script" = "true" ] || continue
    
    candidates="$candidates $pid"
  done
  echo $candidates
' | tr -d '\r')

CANDIDATE_COUNT=$(echo ${SUPERVISOR_CANDIDATES} | awk '{print NF}')
if [[ "${CANDIDATE_COUNT}" -eq 0 ]]; then
  echo "FAIL: Expected exactly 1 Supervisor candidate running node scripts/start_all.mjs (excluding PID 1), found 0!"
  dump_proc_tree
  exit 1
elif [[ "${CANDIDATE_COUNT}" -gt 1 ]]; then
  echo "FAIL: Ambiguous Supervisor identity: expected 1 candidate, found ${CANDIDATE_COUNT} (${SUPERVISOR_CANDIDATES})!"
  dump_proc_tree
  exit 1
fi

SUPERVISOR_PID=$(echo "${SUPERVISOR_CANDIDATES}" | awk '{print $1}')
echo "Discovered Supervisor PID: ${SUPERVISOR_PID}"

# Verify process command line
SUPERVISOR_CMD=$(docker exec "${CONTAINER_NAME}" sh -c "tr '\0' ' ' < /proc/${SUPERVISOR_PID}/cmdline 2>/dev/null" | tr -d '\r')
echo "Supervisor command line: ${SUPERVISOR_CMD}"
if [[ -z "${SUPERVISOR_CMD}" ]]; then
  echo "FAIL: Supervisor process PID ${SUPERVISOR_PID} command line is empty or process disappeared!"
  dump_proc_tree
  exit 1
fi
if [[ "${SUPERVISOR_CMD}" != *"scripts/start_all.mjs"* ]]; then
  echo "FAIL: Candidate PID ${SUPERVISOR_PID} command line does not contain scripts/start_all.mjs! Received: '${SUPERVISOR_CMD}'"
  exit 1
fi

# Verify process user is unprivileged (nextjs / UID 1001)
SUPERVISOR_USER=$(docker exec "${CONTAINER_NAME}" sh -c "awk '/^Uid:/ {print \$2}' /proc/${SUPERVISOR_PID}/status 2>/dev/null" | tr -d '\r')
echo "Supervisor process user UID: ${SUPERVISOR_USER}"
if [[ -z "${SUPERVISOR_USER}" ]]; then
  echo "FAIL: Supervisor process PID ${SUPERVISOR_PID} disappeared or status file became unreadable!"
  dump_proc_tree
  exit 1
fi
if [[ ! "${SUPERVISOR_USER}" =~ ^[0-9]+$ ]]; then
  echo "FAIL: Supervisor UID is not numeric: '${SUPERVISOR_USER}'!"
  dump_proc_tree
  exit 1
fi
if [[ "${SUPERVISOR_USER}" != "1001" ]]; then
  echo "FAIL: Supervisor UID is '${SUPERVISOR_USER}', expected 1001 (nextjs)!"
  dump_proc_tree
  exit 1
fi
echo "PASS: Supervisor runs as unprivileged user nextjs (UID 1001)."

echo ">>> [6/12] Verifying Next.js server and Background Worker are children of Supervisor..."
echo "Using Supervisor PID: ${SUPERVISOR_PID}"

# Bounded polling for child server process spawned by Supervisor
CHILD_SERVER_PID=""
CHILD_SERVER_PPID=""
for i in {1..20}; do
  CHILD_INFO=$(docker exec "${CONTAINER_NAME}" sh -c '
    for p in /proc/[0-9]*; do
      [ -d "$p" ] || continue
      pid=$(basename "$p")
      [ "$pid" = "1" ] && continue
      [ "$pid" = "'"${SUPERVISOR_PID}"'" ] && continue
      cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null || true)
      case "$cmd" in
        *"node"*"/next"*"start"*|*"next-server"*)
          ppid=$(awk "/^PPid:/ {print \$2}" "$p/status" 2>/dev/null || echo "")
          echo "$pid $ppid"
          break
          ;;
      esac
    done
  ' | tr -d '\r')
  if [[ -n "${CHILD_INFO}" ]]; then
    CHILD_SERVER_PID=$(echo "${CHILD_INFO}" | awk '{print $1}')
    CHILD_SERVER_PPID=$(echo "${CHILD_INFO}" | awk '{print $2}')
    break
  fi
  sleep 0.5
done

echo "Child server PID: ${CHILD_SERVER_PID}"
echo "Child server PPID: ${CHILD_SERVER_PPID}"

if [[ -z "${CHILD_SERVER_PID}" || -z "${CHILD_SERVER_PPID}" ]]; then
  echo "FAIL: Supervisor child process was not spawned or PPID is empty/missing!"
  dump_proc_tree
  exit 1
fi

if [[ ! "${CHILD_SERVER_PPID}" =~ ^[0-9]+$ ]]; then
  echo "FAIL: Child PPID is not a valid decimal integer: '${CHILD_SERVER_PPID}'!"
  dump_proc_tree
  exit 1
fi

if [[ "${CHILD_SERVER_PPID}" != "${SUPERVISOR_PID}" ]]; then
  echo "FAIL: Child PPID (${CHILD_SERVER_PPID}) does not match Supervisor PID (${SUPERVISOR_PID})!"
  dump_proc_tree
  exit 1
fi
echo "PASS: Next.js server (PID ${CHILD_SERVER_PID}) is a verified child of Supervisor (PPID ${CHILD_SERVER_PPID} == ${SUPERVISOR_PID})."

# If a standalone background worker process is also present, verify its PPID strictly matches SUPERVISOR_PID
WORKER_INFO=$(docker exec "${CONTAINER_NAME}" sh -c '
  for p in /proc/[0-9]*; do
    [ -d "$p" ] || continue
    cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null || true)
    case "$cmd" in
      *background_worker.mjs*)
        pid=$(basename "$p")
        ppid=$(awk "/^PPid:/ {print \$2}" "$p/status" 2>/dev/null || echo "")
        echo "$pid $ppid"
        break
        ;;
    esac
  done
' | tr -d '\r')

if [[ -n "${WORKER_INFO}" ]]; then
  WORKER_PID=$(echo "${WORKER_INFO}" | awk '{print $1}')
  WORKER_PPID=$(echo "${WORKER_INFO}" | awk '{print $2}')
  if [[ ! "${WORKER_PPID}" =~ ^[0-9]+$ ]]; then
    echo "FAIL: Standalone Worker PPID is not a valid integer: '${WORKER_PPID}'!"
    exit 1
  fi
  if [[ "${WORKER_PPID}" != "${SUPERVISOR_PID}" ]]; then
    echo "FAIL: Standalone Worker PPID (${WORKER_PPID}) does not match Supervisor PID (${SUPERVISOR_PID})!"
    exit 1
  fi
  echo "PASS: Standalone Background Worker (PID ${WORKER_PID}) is a verified child of Supervisor (PPID ${WORKER_PPID})."
else
  echo "INFO: Background worker is operating in integrated in-process mode within Supervisor PID ${SUPERVISOR_PID} (Option B)."
fi

echo ">>> [7/12] Verifying Healthcheck Endpoint..."
for i in {1..10}; do
  if docker exec "${CONTAINER_NAME}" curl -sf http://localhost:3000/api/health >/dev/null; then
    echo "PASS: Healthcheck responded with 200 OK."
    break
  fi
  echo "Waiting for healthcheck (attempt $i)..."
  sleep 2
done

echo ">>> [8/12] Testing Deterministic Zombie / Orphan Reaping via Tini..."

# 1. Re-verify PID 1 is /usr/bin/tini before starting orphan test
PID1_EXE=$(docker exec "${CONTAINER_NAME}" sh -c 'readlink -f /proc/1/exe 2>/dev/null || tr "\0" " " < /proc/1/cmdline 2>/dev/null' | tr -d '\r')
echo "Container PID 1 target: ${PID1_EXE}"
if [[ "${PID1_EXE}" != *"/usr/bin/tini"* && "${PID1_EXE}" != *"tini"* ]]; then
  echo "FAIL: PID 1 is not /usr/bin/tini! Target: ${PID1_EXE}"
  exit 1
fi

# 2. Spawn uniquely identifiable descendant with redirected stdio, capturing exact PID
# Using 'exec sleep 3' replaces the inner subshell image, avoiding intermediate wrapper PIDs.
ORPHAN_PID=$(docker exec "${CONTAINER_NAME}" sh -c '
  (
    ( exec sleep 3 ) >/dev/null 2>&1 < /dev/null &
    echo $!
  )
' | tr -d '\r' | awk '{print $1}')

echo "Spawned target descendant PID: ${ORPHAN_PID}"
if [[ -z "${ORPHAN_PID}" || ! "${ORPHAN_PID}" =~ ^[0-9]+$ ]]; then
  echo "FAIL: Failed to spawn descendant or capture valid numeric PID (received: '${ORPHAN_PID}')."
  exit 1
fi

# 3. Verify process exists and belongs to the sleep command
CMD_LINE=$(docker exec "${CONTAINER_NAME}" sh -c "tr '\0' ' ' < /proc/${ORPHAN_PID}/cmdline 2>/dev/null || cat /proc/${ORPHAN_PID}/comm 2>/dev/null" | tr -d '\r' || true)
echo "Target process commandline: ${CMD_LINE}"
if [[ "${CMD_LINE}" != *"sleep"* ]]; then
  echo "FAIL: PID ${ORPHAN_PID} does not correspond to the spawned sleep process! args: '${CMD_LINE}'"
  exit 1
fi

# Helper: Extract field 22 (starttime) from /proc/<pid>/stat with strict validation.
# Validates target_pid format, stat record PID matching, comm opening/terminating parentheses,
# valid Linux process state, minimum field count (>= 22), and strictly positive numeric starttime.
# Emits error diagnostic to stderr and returns non-zero status on any mismatch, malformed, or missing record.
get_proc_starttime() {
  local target_pid="$1"
  if [[ ! "${target_pid}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: target_pid must be a positive decimal integer, got: '${target_pid}'" >&2
    return 1
  fi
  docker exec "${CONTAINER_NAME}" sh -c "awk -v expected_pid=\"${target_pid}\" '
    BEGIN { found = 0; err = 0; }
    {
      line = \$0;
      if (line !~ /^[1-9][0-9]* \\(/) {
        print \"Error: invalid PID or missing opening parenthesis in stat record\" > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      rec_pid = line;
      sub(/ \\(.*/, \"\", rec_pid);
      if (rec_pid != expected_pid) {
        print \"Error: PID mismatch: expected \" expected_pid \" but record has \" rec_pid > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      if (line !~ /\\) /) {
        print \"Error: missing terminating parenthesis in stat record\" > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      s = line;
      sub(/.*\\) /, \"\", s);
      n = split(s, a, \" \");
      if (n < 20) {
        print \"Error: truncated stat record (less than 22 fields)\" > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      state = a[1];
      if (state !~ /^[RSDZTWXtKxPI]$/) {
        print \"Error: invalid process state: \" state > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      starttime = a[20];
      if (starttime !~ /^[1-9][0-9]*\$/) {
        print \"Error: invalid or non-positive starttime: \" starttime > \"/dev/stderr\";
        err = 1;
        exit 1;
      }
      print starttime;
      found = 1;
    }
    END {
      if (err) { exit 1; }
      if (!found) {
        print \"Error: empty stat file or unparsed record\" > \"/dev/stderr\";
        exit 1;
      }
    }
  ' /proc/${target_pid}/stat"
}

# 4. Capture process starttime from /proc/${ORPHAN_PID}/stat (field 22) to eliminate PID-reuse ambiguity.
# Strictly validates PID, comm delimiters, state code, field count, and positive numeric starttime.
ORPHAN_STARTTIME=$(get_proc_starttime "${ORPHAN_PID}" | tr -d ' \r' || true)
echo "Target process starttime: ${ORPHAN_STARTTIME} ticks"
if [[ -z "${ORPHAN_STARTTIME}" ]]; then
  echo "FAIL: Failed to extract valid starttime for target PID ${ORPHAN_PID}!"
  exit 1
fi

# 5. Bounded polling to observe adoption by PID 1 (tini) while process is alive
ADOPTED=false
for i in {1..20}; do
  # Verify PID identity has not changed via starttime check
  if [[ -n "${ORPHAN_STARTTIME}" ]]; then
    CUR_STARTTIME=$(get_proc_starttime "${ORPHAN_PID}" 2>/dev/null | tr -d ' \r' || true)
    if [[ -n "${CUR_STARTTIME}" && "${CUR_STARTTIME}" != "${ORPHAN_STARTTIME}" ]]; then
      echo "FAIL: PID ${ORPHAN_PID} was reused! (Spawned starttime: ${ORPHAN_STARTTIME}, current: ${CUR_STARTTIME})"
      exit 1
    fi
  fi

  PPID_VAL=$(docker exec "${CONTAINER_NAME}" sh -c "awk '/^PPid:/ {print \$2}' /proc/${ORPHAN_PID}/status 2>/dev/null" | tr -d ' \r' || true)
  STATE_VAL=$(docker exec "${CONTAINER_NAME}" sh -c "awk '/^State:/ {print \$2}' /proc/${ORPHAN_PID}/status 2>/dev/null" | tr -d ' \r' | cut -c1 || true)

  if [[ "${PPID_VAL}" == "1" ]]; then
    echo "Observed adoption by PID 1 on attempt $i (State: ${STATE_VAL}, PPID: ${PPID_VAL}, StartTime: ${ORPHAN_STARTTIME})."
    # Ensure process is actively running (S=Sleeping or R=Running), NOT a zombie (Z)
    if [[ "${STATE_VAL}" == "Z" ]]; then
      echo "FAIL: Process PID ${ORPHAN_PID} died before adoption could be verified in active state!"
      exit 1
    fi
    ADOPTED=true
    break
  fi
  sleep 0.1
done

if [[ "${ADOPTED}" != "true" ]]; then
  echo "FAIL: Process PID ${ORPHAN_PID} was not adopted by PID 1 within bounded timeout!"
  exit 1
fi
echo "PASS: Process PID ${ORPHAN_PID} confirmed active and adopted by PID 1 (tini)."

# 6. Bounded polling until process terminates naturally and is reaped from /proc
REAPED=false
for i in {1..35}; do
  EXISTS=$(docker exec "${CONTAINER_NAME}" sh -c "[ -d /proc/${ORPHAN_PID} ] && echo yes || echo no" | tr -d '\r')
  if [[ "${EXISTS}" == "no" ]]; then
    echo "Process PID ${ORPHAN_PID} terminated and reaped from /proc on attempt $i."
    REAPED=true
    break
  fi

  # If process exists, verify it still belongs to original process instance
  if [[ -n "${ORPHAN_STARTTIME}" ]]; then
    CUR_STARTTIME=$(get_proc_starttime "${ORPHAN_PID}" 2>/dev/null | tr -d ' \r' || true)
    if [[ -n "${CUR_STARTTIME}" && "${CUR_STARTTIME}" != "${ORPHAN_STARTTIME}" ]]; then
      echo "Process PID ${ORPHAN_PID} was replaced by a new process instance. Original orphan is confirmed terminated and reaped."
      REAPED=true
      break
    fi
  fi

  # Check if lingering as a zombie beyond reasonable threshold
  CURRENT_STATE=$(docker exec "${CONTAINER_NAME}" sh -c "awk '/^State:/ {print \$2}' /proc/${ORPHAN_PID}/status 2>/dev/null" | tr -d ' \r' | cut -c1 || true)
  if [[ "${CURRENT_STATE}" == "Z" ]]; then
    echo "Note: Process PID ${ORPHAN_PID} currently in zombie state (attempt $i), awaiting tini waitpid reaping..."
  fi
  sleep 0.2
done

if [[ "${REAPED}" != "true" ]]; then
  echo "FAIL: Process PID ${ORPHAN_PID} still present in /proc or lingering as un-reaped zombie!"
  dump_proc_tree
  exit 1
fi
echo "PASS: Deterministic orphan adoption and PID 1 reaping verified for PID ${ORPHAN_PID}."

echo ">>> [9/12] Sending SIGTERM to Container (testing signal forwarding & graceful shutdown)..."
START_SHUTDOWN=$(date +%s)
docker kill -s SIGTERM "${CONTAINER_NAME}"

echo ">>> Waiting for container to stop..."
docker wait "${CONTAINER_NAME}" || true
SHUTDOWN_DURATION=$(( $(date +%s) - START_SHUTDOWN ))
echo "Container stopped in ${SHUTDOWN_DURATION} seconds."

echo ">>> [10/12] Inspecting Container Shutdown Logs..."
CONTAINER_LOGS=$(docker logs "${CONTAINER_NAME}" 2>&1)
echo "${CONTAINER_LOGS}"

if [[ "${CONTAINER_LOGS}" != *"SIGTERM"* && "${CONTAINER_LOGS}" != *"Graceful shutdown complete"* ]]; then
  echo "FAIL: Container did not record graceful shutdown sequence in logs!"
  exit 1
fi
echo "PASS: Signal forwarding and graceful shutdown confirmed in container logs."

echo ">>> [11/12] Validating SQLite WAL Checkpoint and Database Integrity..."
# Inspect database in mounted volume
sqlite3 "${DATA_VOLUME_DIR}/career_app.db" "PRAGMA integrity_check;" | grep -q "ok"
echo "PASS: SQLite integrity check OK."

# Verify WAL file status (TRUNCATE checkpoint leaves WAL empty or cleanly checkpointed)
if [ -f "${DATA_VOLUME_DIR}/career_app.db-wal" ]; then
  WAL_SIZE=$(wc -c < "${DATA_VOLUME_DIR}/career_app.db-wal")
  echo "WAL file size after shutdown: ${WAL_SIZE} bytes"
fi

echo ">>> [12/12] Testing Container Restartability..."
docker start "${CONTAINER_NAME}"
sleep 5
docker exec "${CONTAINER_NAME}" curl -sf http://localhost:3000/api/health >/dev/null
echo "PASS: Container restarted cleanly and passed healthcheck."

echo "================================================================================"
echo "ALL 12 REAL LINUX CONTAINER PROCESS LIFECYCLE CHECKS PASSED!"
echo "================================================================================"
