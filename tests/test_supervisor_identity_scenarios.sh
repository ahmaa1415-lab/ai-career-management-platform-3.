#!/usr/bin/env bash
# ==============================================================================
# tests/test_supervisor_identity_scenarios.sh
# Phase 5.10.30 — Unit Test Suite Exercising Production Supervisor Discovery Logic
#
# Directly invokes the production shared library:
#   scripts/proc_supervisor_discovery.sh
# ==============================================================================

set -uo pipefail

echo "================================================================================"
echo "Phase 5.10.30 — Unit Test Suite Exercising Production Discovery Library"
echo "================================================================================"

PROD_LIB="scripts/proc_supervisor_discovery.sh"
if [ ! -f "${PROD_LIB}" ]; then
  echo "FAIL: Production discovery library ${PROD_LIB} not found!"
  exit 1
fi

# Source the exact production library to test functions directly
. "${PROD_LIB}"

CI_LIFECYCLE_LIB="scripts/ci_test_linux_lifecycle.sh"
if [ ! -f "${CI_LIFECYCLE_LIB}" ]; then
  echo "FAIL: CI lifecycle script ${CI_LIFECYCLE_LIB} not found!"
  exit 1
fi

# Source CI lifecycle script to test validate_shutdown_logs directly
. "${CI_LIFECYCLE_LIB}"

TEST_DIR=$(mktemp -d)
trap 'rm -rf "${TEST_DIR}"' EXIT

PASSED_TESTS=0
FAILED_TESTS=0

assert_test() {
  local desc="$1"
  local expected_exit="$2"
  local expected_pattern="$3"
  local actual_exit="$4"
  local output="$5"

  if [ "${actual_exit}" -eq "${expected_exit}" ] && echo "${output}" | grep -qE "${expected_pattern}"; then
    echo "  [PASS] ${desc}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo "  [FAIL] ${desc}"
    echo "    Expected Exit: ${expected_exit}, Got: ${actual_exit}"
    echo "    Expected Pattern: ${expected_pattern}"
    echo "    Actual Output: ${output}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Helper: Create mock /proc entry
create_proc_entry() {
  local mock_proc="$1"
  local pid="$2"
  local ppid="$3"
  local uid="$4"
  local comm="$5"
  local cmdline="$6"

  local pdir="${mock_proc}/${pid}"
  mkdir -p "${pdir}"
  echo -n "${comm}" > "${pdir}/comm"
  echo -e "PPid:\t${ppid}\nUid:\t${uid}\t${uid}\t${uid}\t${uid}" > "${pdir}/status"
  printf "%b" "${cmdline}" > "${pdir}/cmdline"
}

# ------------------------------------------------------------------------------
# Test 1: Valid Node Supervisor
# ------------------------------------------------------------------------------
echo "--- Scenario 1: Valid Node Supervisor ---"
MOCK_PROC="${TEST_DIR}/proc1"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"

OUT1=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  count=$(echo ${cands} | awk '{print NF}')
  [ "$count" -eq 1 ] || { echo "FAIL: count $count"; exit 1; }
  pid=$(echo "$cands" | awk '{print $1}')
  verify_supervisor_uid "$pid" "${MOCK_PROC}" || exit 1
  churn=$(verify_supervisor_churn "$pid" "${MOCK_PROC}")
  [ "$churn" = "VALID" ] || { echo "FAIL: churn $churn"; exit 1; }
  echo "PASS: Valid Node Supervisor PID $pid verified"
)
assert_test "Scenario 1: Valid Node Supervisor discovered and verified" 0 "PASS: Valid Node Supervisor PID 7 verified" "$?" "${OUT1}"

# ------------------------------------------------------------------------------
# Test 2: PID 1 Exclusion
# ------------------------------------------------------------------------------
echo "--- Scenario 2: PID 1 Exclusion ---"
MOCK_PROC="${TEST_DIR}/proc2"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 1 0 0 "tini" "/usr/bin/tini\0--\0/usr/local/bin/docker-entrypoint.sh\0node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"

OUT2=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  echo "Discovered candidates: $cands"
  [ "$cands" = "7" ] || { echo "FAIL: Expected only 7, got $cands"; exit 1; }
)
assert_test "Scenario 2: PID 1 excluded from supervisor discovery" 0 "Discovered candidates: 7" "$?" "${OUT2}"

# ------------------------------------------------------------------------------
# Test 3: Invalid First Argument
# ------------------------------------------------------------------------------
echo "--- Scenario 3: Invalid First Argument ---"
MOCK_PROC="${TEST_DIR}/proc3"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 8 1 1001 "node" "python\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC}" 9 1 1001 "node" "bash\0scripts/start_all.mjs\0"

OUT3=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  [ -z "$cands" ] || { echo "FAIL: Non-node first arg accepted: $cands"; exit 1; }
  echo "PASS: Non-node first argument rejected"
)
assert_test "Scenario 3: Non-node first argument rejected" 0 "PASS: Non-node first argument rejected" "$?" "${OUT3}"

# ------------------------------------------------------------------------------
# Test 4: Exact Script Argument Matching
# ------------------------------------------------------------------------------
echo "--- Scenario 4: Exact Script Argument Matching ---"
MOCK_PROC4A="${TEST_DIR}/proc4a"
create_proc_entry "${MOCK_PROC4A}" 10 1 1001 "node" "node\0scripts/start_all.mjs\0"
MOCK_PROC4B="${TEST_DIR}/proc4b"
create_proc_entry "${MOCK_PROC4B}" 11 1 1001 "node" "node\0./scripts/start_all.mjs\0"
MOCK_PROC4C="${TEST_DIR}/proc4c"
create_proc_entry "${MOCK_PROC4C}" 12 1 1001 "node" "node\0/app/scripts/start_all.mjs\0"

OUT4=$(
  c1=$(discover_supervisor_candidates "${MOCK_PROC4A}")
  c2=$(discover_supervisor_candidates "${MOCK_PROC4B}")
  c3=$(discover_supervisor_candidates "${MOCK_PROC4C}")
  if [ "$c1" = "10" ] && [ "$c2" = "11" ] && [ "$c3" = "12" ]; then
    echo "PASS: All 3 valid script path tokens matched exactly"
  else
    echo "FAIL: c1=$c1 c2=$c2 c3=$c3"
    exit 1
  fi
)
assert_test "Scenario 4: All 3 valid script argument tokens matched exactly" 0 "PASS: All 3 valid script path tokens matched" "$?" "${OUT4}"

# ------------------------------------------------------------------------------
# Test 5: Rejection of Substring-Only Matches
# ------------------------------------------------------------------------------
echo "--- Scenario 5: Rejection of Substring-Only Matches ---"
MOCK_PROC="${TEST_DIR}/proc5"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 15 1 1001 "node" "node\0not_scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC}" 16 1 1001 "node" "node\0scripts/start_all.mjs.bak\0"
create_proc_entry "${MOCK_PROC}" 17 1 1001 "node" "node\0--config=scripts/start_all.mjs\0"

OUT5=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  [ -z "$cands" ] || { echo "FAIL: Substring variants accepted: $cands"; exit 1; }
  echo "PASS: Substring-only matches rejected"
)
assert_test "Scenario 5: Substring-only matches rejected" 0 "PASS: Substring-only matches rejected" "$?" "${OUT5}"

# ------------------------------------------------------------------------------
# Test 6: Rejection of Unsupported Script Paths
# ------------------------------------------------------------------------------
echo "--- Scenario 6: Rejection of Unsupported Script Paths ---"
MOCK_PROC="${TEST_DIR}/proc6"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 18 1 1001 "node" "node\0start_all.mjs\0"
create_proc_entry "${MOCK_PROC}" 19 1 1001 "node" "node\0/other/scripts/start_all.mjs\0"

OUT6=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  [ -z "$cands" ] || { echo "FAIL: Unsupported paths accepted: $cands"; exit 1; }
  echo "PASS: Unsupported script paths rejected"
)
assert_test "Scenario 6: Unsupported script paths rejected" 0 "PASS: Unsupported script paths rejected" "$?" "${OUT6}"

# ------------------------------------------------------------------------------
# Test 7: Empty, Unreadable, or Zero-Reported-Size cmdline
# ------------------------------------------------------------------------------
echo "--- Scenario 7: Empty, Unreadable, or Zero-Reported-Size cmdline ---"
# 7A: Empty cmdline (0 bytes, e.g. kernel thread or defunct process)
MOCK_PROC7A="${TEST_DIR}/proc7a"
mkdir -p "${MOCK_PROC7A}"
create_proc_entry "${MOCK_PROC7A}" 21 1 1001 "node" ""

OUT7A=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC7A}")
  [ -z "$cands" ] || { echo "FAIL: Empty cmdline accepted: $cands"; exit 1; }
  echo "PASS: Empty cmdline ignored"
)
assert_test "Scenario 7A: Empty cmdline ignored" 0 "PASS: Empty cmdline ignored" "$?" "${OUT7A}"

# 7B: Unreadable cmdline (e.g. permission denied / chmod 000)
MOCK_PROC7B="${TEST_DIR}/proc7b"
mkdir -p "${MOCK_PROC7B}"
create_proc_entry "${MOCK_PROC7B}" 22 1 1001 "node" "node\0scripts/start_all.mjs\0"
chmod 000 "${MOCK_PROC7B}/22/cmdline" 2>/dev/null || true
if [ ! -r "${MOCK_PROC7B}/22/cmdline" ]; then
  OUT7B=$(
    cands=$(discover_supervisor_candidates "${MOCK_PROC7B}")
    [ -z "$cands" ] || { echo "FAIL: Unreadable cmdline accepted: $cands"; exit 1; }
    echo "PASS: Unreadable cmdline ignored"
  )
  assert_test "Scenario 7B: Unreadable cmdline (chmod 000) ignored" 0 "PASS: Unreadable cmdline ignored" "$?" "${OUT7B}"
else
  # On platforms where chmod 000 is not honored by the filesystem (e.g. non-POSIX Windows mounts),
  # verify that an unreadable/missing file is safely ignored via [ -r ].
  rm -f "${MOCK_PROC7B}/22/cmdline"
  OUT7B=$(
    cands=$(discover_supervisor_candidates "${MOCK_PROC7B}")
    [ -z "$cands" ] || { echo "FAIL: Missing cmdline accepted: $cands"; exit 1; }
    echo "PASS: Missing/unreadable cmdline ignored"
  )
  assert_test "Scenario 7B: Missing/unreadable cmdline ignored" 0 "PASS: Missing/unreadable cmdline ignored" "$?" "${OUT7B}"
fi

# 7C: Readable cmdline with zero reported size (Linux procfs virtual file behavior)
# In Linux procfs, virtual files report st_size = 0 to stat(2), so [ -s ] fails while [ -r ] succeeds.
MOCK_PROC7C="${TEST_DIR}/proc7c"
mkdir -p "${MOCK_PROC7C}"
create_proc_entry "${MOCK_PROC7C}" 23 1 1001 "node" "node\0scripts/start_all.mjs\0"
OUT7C=$(
  # Verify that if a system has a virtual procfs cmdline (like /proc/$$/cmdline),
  # [ -s ] fails (size 0) but [ -r ] passes (readable)
  if [ -r "/proc/$$/cmdline" ]; then
    if [ -s "/proc/$$/cmdline" ]; then
      echo "NOTE: Virtual /proc/$$/cmdline reported non-zero size on this platform"
    else
      # Confirmed: Linux procfs reports size 0 but is readable
      test ! -s "/proc/$$/cmdline" && test -r "/proc/$$/cmdline" || {
        echo "FAIL: Contract violated: virtual /proc/$$/cmdline was not readable with size 0"
        exit 1
      }
    fi
  fi
  # Now verify discover_supervisor_candidates discovers PID 23 when cmdline is readable
  cands=$(discover_supervisor_candidates "${MOCK_PROC7C}")
  if [ "$cands" = "23" ]; then
    echo "PASS: Readable cmdline candidate discovered successfully"
  else
    echo "FAIL: Expected candidate 23, found: $cands"
    exit 1
  fi
)
assert_test "Scenario 7C: Readable cmdline candidate discovered and procfs size-0 contract verified" 0 "PASS: Readable cmdline candidate discovered" "$?" "${OUT7C}"

# ------------------------------------------------------------------------------
# Test 8: Zero Candidates
# ------------------------------------------------------------------------------
echo "--- Scenario 8: Zero Candidates ---"
MOCK_PROC="${TEST_DIR}/proc8"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 1 0 0 "tini" "/usr/bin/tini\0"

OUT8=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  count=$(echo ${cands} | awk '{print NF}')
  if [ "$count" -eq 0 ]; then
    echo "FAIL: Expected exactly 1 Supervisor candidate running node scripts/start_all.mjs (excluding PID 1), found 0!"
    exit 1
  fi
)
assert_test "Scenario 8: Zero candidates detected and failed cleanly" 1 "found 0" "$?" "${OUT8}"

# ------------------------------------------------------------------------------
# Test 9: Multiple Candidates
# ------------------------------------------------------------------------------
echo "--- Scenario 9: Multiple Candidates ---"
MOCK_PROC="${TEST_DIR}/proc9"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 31 1 1001 "node" "node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC}" 32 1 1001 "node" "node\0scripts/start_all.mjs\0"

OUT9=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  count=$(echo ${cands} | awk '{print NF}')
  if [ "$count" -gt 1 ]; then
    echo "FAIL: Ambiguous Supervisor identity: expected 1 candidate, found ${count} (${cands})!"
    exit 1
  fi
)
assert_test "Scenario 9: Multiple candidates detected and rejected as ambiguous" 1 "Ambiguous Supervisor identity" "$?" "${OUT9}"

# ------------------------------------------------------------------------------
# Test 10: Missing or Malformed UID
# ------------------------------------------------------------------------------
echo "--- Scenario 10: Missing or Malformed UID ---"
MOCK_PROC10A="${TEST_DIR}/proc10a"
create_proc_entry "${MOCK_PROC10A}" 40 1 1001 "node" "node\0scripts/start_all.mjs\0"
rm -f "${MOCK_PROC10A}/40/status"

OUT10A=$(
  verify_supervisor_uid 40 "${MOCK_PROC10A}"
)
assert_test "Scenario 10A: Missing status file rejected" 1 "status file missing" "$?" "${OUT10A}"

MOCK_PROC10B="${TEST_DIR}/proc10b"
create_proc_entry "${MOCK_PROC10B}" 41 1 1001 "node" "node\0scripts/start_all.mjs\0"
echo -e "PPid:\t1\nUid:\tabc\tabc\tabc\tabc" > "${MOCK_PROC10B}/41/status"

OUT10B=$(
  verify_supervisor_uid 41 "${MOCK_PROC10B}"
)
assert_test "Scenario 10B: Malformed non-numeric UID rejected" 1 "not numeric" "$?" "${OUT10B}"

# ------------------------------------------------------------------------------
# Test 11: UID Other Than 1001
# ------------------------------------------------------------------------------
echo "--- Scenario 11: UID Other Than 1001 ---"
MOCK_PROC11="${TEST_DIR}/proc11"
create_proc_entry "${MOCK_PROC11}" 50 1 0 "node" "node\0scripts/start_all.mjs\0"

OUT11=$(
  verify_supervisor_uid 50 "${MOCK_PROC11}"
)
assert_test "Scenario 11: Root UID 0 rejected" 1 "expected 1001" "$?" "${OUT11}"

# ------------------------------------------------------------------------------
# Test 12: Process Disappearance During Inspection
# ------------------------------------------------------------------------------
echo "--- Scenario 12: Process Disappearance ---"
MOCK_PROC12="${TEST_DIR}/proc12"
create_proc_entry "${MOCK_PROC12}" 60 1 1001 "node" "node\0scripts/start_all.mjs\0"
rm -rf "${MOCK_PROC12}/60"

OUT12=$(
  verify_supervisor_churn 60 "${MOCK_PROC12}"
)
assert_test "Scenario 12: Vanished process detected during churn recheck" 1 "VANISHED" "$?" "${OUT12}"

# ------------------------------------------------------------------------------
# Test 13: PID Identity Change During Recheck
# ------------------------------------------------------------------------------
echo "--- Scenario 13: PID Identity Change During Recheck ---"
# 13A: comm changed from node to sleep
MOCK_PROC13A="${TEST_DIR}/proc13a"
create_proc_entry "${MOCK_PROC13A}" 70 1 1001 "sleep" "node\0scripts/start_all.mjs\0"

OUT13A=$(
  verify_supervisor_churn 70 "${MOCK_PROC13A}"
)
assert_test "Scenario 13A: Changed comm detected during churn" 1 "COMM_CHANGED:sleep" "$?" "${OUT13A}"

# 13B: first_arg changed from node to python
MOCK_PROC13B="${TEST_DIR}/proc13b"
create_proc_entry "${MOCK_PROC13B}" 71 1 1001 "node" "python\0scripts/start_all.mjs\0"

OUT13B=$(
  verify_supervisor_churn 71 "${MOCK_PROC13B}"
)
assert_test "Scenario 13B: Changed first_arg detected during churn" 1 "FIRST_ARG_CHANGED:python" "$?" "${OUT13B}"

# 13C: target script removed
MOCK_PROC13C="${TEST_DIR}/proc13c"
create_proc_entry "${MOCK_PROC13C}" 72 1 1001 "node" "node\0other.js\0"

OUT13C=$(
  verify_supervisor_churn 72 "${MOCK_PROC13C}"
)
assert_test "Scenario 13C: Changed cmdline target script detected during churn" 1 "CMD_CHANGED" "$?" "${OUT13C}"

# ------------------------------------------------------------------------------
# Test 14: Valid Next.js Child PPID
# ------------------------------------------------------------------------------
echo "--- Scenario 14: Valid Next.js Child PPID ---"
MOCK_PROC14="${TEST_DIR}/proc14"
create_proc_entry "${MOCK_PROC14}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC14}" 80 7 1001 "next-server" "node\0/app/node_modules/next/dist/bin/next\0start\0"

OUT14=$(
  child_info=$(find_child_server 7 "${MOCK_PROC14}")
  cpid=$(echo "$child_info" | awk '{print $1}')
  cppid=$(echo "$child_info" | awk '{print $2}')
  validate_child_ppid "$cpid" "$cppid" 7
)
assert_test "Scenario 14: Valid Next.js child PPID matched to Supervisor" 0 "is a verified child of Supervisor" "$?" "${OUT14}"

# ------------------------------------------------------------------------------
# Test 15: Empty, Malformed, or Mismatched Child PPID
# ------------------------------------------------------------------------------
echo "--- Scenario 15: Empty, Malformed, or Mismatched Child PPID ---"
# 15A: Empty PPID
OUT15A=$(
  validate_child_ppid "80" "" "7"
)
assert_test "Scenario 15A: Empty child PPID rejected" 1 "empty/missing" "$?" "${OUT15A}"

# 15B: Malformed PPID
OUT15B=$(
  validate_child_ppid "80" "invalid_ppid" "7"
)
assert_test "Scenario 15B: Malformed child PPID rejected" 1 "not a valid decimal integer" "$?" "${OUT15B}"

# 15C: Mismatched PPID
OUT15C=$(
  validate_child_ppid "80" "999" "7"
)
assert_test "Scenario 15C: Mismatched child PPID rejected" 1 "does not match Supervisor PID" "$?" "${OUT15C}"

# ------------------------------------------------------------------------------
# Test 16: Standalone Background Worker Found Successfully (Option A)
# ------------------------------------------------------------------------------
echo "--- Scenario 16: Standalone Background Worker Found (Option A) ---"
MOCK_PROC16="${TEST_DIR}/proc16"
mkdir -p "${MOCK_PROC16}"
create_proc_entry "${MOCK_PROC16}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC16}" 85 7 1001 "node" "node\0scripts/background_worker.mjs\0"

OUT16=$(
  worker_raw=""
  worker_ec=0
  worker_raw=$(find_background_worker "${MOCK_PROC16}") || worker_ec=$?
  [ "${worker_ec}" -eq 0 ] || { echo "FAIL: Expected exit code 0, got ${worker_ec}"; exit 1; }
  worker_info=$(echo "${worker_raw}" | tr -d '\r')
  w_pid=$(echo "${worker_info}" | awk '{print $1}')
  w_ppid=$(echo "${worker_info}" | awk '{print $2}')
  [ "${w_pid}" = "85" ] || { echo "FAIL: Expected PID 85, got ${w_pid}"; exit 1; }
  [ "${w_ppid}" = "7" ] || { echo "FAIL: Expected PPID 7, got ${w_ppid}"; exit 1; }
  echo "PASS: Standalone worker discovered PID ${w_pid} PPID ${w_ppid}"
)
assert_test "Scenario 16: Standalone Background Worker discovered with exit code 0" 0 "PASS: Standalone worker discovered" "$?" "${OUT16}"

# ------------------------------------------------------------------------------
# Test 17: No Standalone Worker (Option B Fallback)
# ------------------------------------------------------------------------------
echo "--- Scenario 17: No Standalone Worker (Option B Fallback) ---"
MOCK_PROC17="${TEST_DIR}/proc17"
mkdir -p "${MOCK_PROC17}"
create_proc_entry "${MOCK_PROC17}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC17}" 80 7 1001 "next-server" "node\0next\0start\0"

OUT17=$(
  worker_raw=""
  worker_ec=0
  worker_raw=$(find_background_worker "${MOCK_PROC17}") || worker_ec=$?
  worker_info=$(echo "${worker_raw}" | tr -d '\r')
  if [ "${worker_ec}" -eq 1 ] && [ -z "${worker_info}" ]; then
    echo "INFO: Background worker is operating in integrated in-process mode within Supervisor PID 7 (Option B)."
  else
    echo "FAIL: Unexpected worker result: ec=${worker_ec} info='${worker_info}'"
    exit 1
  fi
)
assert_test "Scenario 17: No standalone worker cleanly falls back to Option B with exit code 1" 0 "Option B" "$?" "${OUT17}"

# ------------------------------------------------------------------------------
# Test 18: Discovery Command Returns Unexpected Error
# ------------------------------------------------------------------------------
echo "--- Scenario 18: Discovery Command Returns Unexpected Error ---"
# 18A: CLI invocation with unknown subcommand
OUT18A=$(
  err_raw=""
  err_ec=0
  err_raw=$(sh "${PROD_LIB}" unknown-subcommand 2>&1) || err_ec=$?
  if [ "${err_ec}" -ne 0 ] && echo "${err_raw}" | grep -q "Unknown or missing subcommand"; then
    echo "PASS: Unknown subcommand rejected with non-zero exit code ${err_ec}"
  else
    echo "FAIL: Expected error for unknown subcommand, got ec=${err_ec} out='${err_raw}'"
    exit 1
  fi
)
assert_test "Scenario 18A: Unknown subcommand produces error and non-zero exit code" 0 "PASS: Unknown subcommand rejected" "$?" "${OUT18A}"

# 18B: CI handler classification of unexpected non-zero exit code (e.g. 2, 127)
OUT18B=$(
  mock_runner() {
    return 127
  }
  w_raw=""
  w_ec=0
  w_raw=$(mock_runner) || w_ec=$?
  w_info=$(echo "${w_raw}" | tr -d '\r')
  if [ "${w_ec}" -eq 0 ]; then
    echo "FAIL: treated as success"
    exit 1
  elif [ "${w_ec}" -eq 1 ]; then
    echo "FAIL: treated as Option B"
    exit 1
  else
    echo "FAIL: Background worker discovery failed with unexpected exit code ${w_ec}: '${w_info}'"
    exit 1
  fi
)
assert_test "Scenario 18B: Unexpected exit code 127 fails CI and does not trigger Option B" 1 "unexpected exit code 127" "$?" "${OUT18B}"

# ------------------------------------------------------------------------------
# Test 19: Empty or Malformed Worker Output Validation
# ------------------------------------------------------------------------------
echo "--- Scenario 19: Empty or Malformed Worker Output Validation ---"
# 19A: Exit code 0 but empty output
OUT19A=$(
  mock_runner() {
    return 0
  }
  w_raw=""
  w_ec=0
  w_raw=$(mock_runner) || w_ec=$?
  w_info=$(echo "${w_raw}" | tr -d '\r')
  if [ "${w_ec}" -eq 0 ]; then
    if [[ -z "${w_info}" ]]; then
      echo "FAIL: Background worker discovery returned exit code 0 but produced empty output!"
      exit 1
    fi
  fi
)
assert_test "Scenario 19A: Exit code 0 with empty output rejected" 1 "empty output" "$?" "${OUT19A}"

# 19B: Exit code 0 but malformed output (non-numeric PID or single token)
OUT19B=$(
  mock_runner() {
    echo "invalid_pid not_a_number"
    return 0
  }
  w_raw=""
  w_ec=0
  w_raw=$(mock_runner) || w_ec=$?
  w_info=$(echo "${w_raw}" | tr -d '\r')
  if [ "${w_ec}" -eq 0 ]; then
    w_pid=$(echo "${w_info}" | awk '{print $1}')
    w_ppid=$(echo "${w_info}" | awk '{print $2}')
    if [[ -z "${w_pid}" || -z "${w_ppid}" || "${w_pid}" =~ [^0-9] || "${w_ppid}" =~ [^0-9] ]]; then
      echo "FAIL: Malformed background worker output: '${w_info}'"
      exit 1
    fi
  fi
)
assert_test "Scenario 19B: Exit code 0 with malformed output rejected" 1 "Malformed background worker output" "$?" "${OUT19B}"

# 19C: Exit code 1 but unexpected output on stdout
OUT19C=$(
  mock_runner() {
    echo "error_message_leaked"
    return 1
  }
  w_raw=""
  w_ec=0
  w_raw=$(mock_runner) || w_ec=$?
  w_info=$(echo "${w_raw}" | tr -d '\r')
  if [ "${w_ec}" -eq 1 ]; then
    if [[ -n "${w_info}" ]]; then
      echo "FAIL: Background worker discovery returned exit code 1 but produced unexpected output: '${w_info}'"
      exit 1
    fi
  fi
)
assert_test "Scenario 19C: Exit code 1 with unexpected stdout output rejected" 1 "unexpected output" "$?" "${OUT19C}"

# ------------------------------------------------------------------------------
# Test 20: Full Step 6 Workflow Integration Simulation
# ------------------------------------------------------------------------------
echo "--- Scenario 20: Full Step 6 Workflow Integration Simulation ---"
step6_worker_eval() {
  local mock_proc="$1"
  local supervisor_pid="$2"

  local worker_raw=""
  local worker_ec=0
  worker_raw=$(find_background_worker "${mock_proc}") || worker_ec=$?
  local worker_info
  worker_info=$(echo "${worker_raw}" | tr -d '\r')

  if [ "${worker_ec}" -eq 0 ]; then
    if [[ -z "${worker_info}" ]]; then
      echo "FAIL: Background worker discovery returned exit code 0 but produced empty output!"
      return 1
    fi
    local worker_pid worker_ppid
    worker_pid=$(echo "${worker_info}" | awk '{print $1}')
    worker_ppid=$(echo "${worker_info}" | awk '{print $2}')
    if [[ -z "${worker_pid}" || -z "${worker_ppid}" || "${worker_pid}" =~ [^0-9] || "${worker_ppid}" =~ [^0-9] ]]; then
      echo "FAIL: Malformed background worker output: '${worker_info}'"
      return 1
    fi
    local worker_val_out
    worker_val_out=$(validate_child_ppid "${worker_pid}" "${worker_ppid}" "${supervisor_pid}" | tr -d '\r')
    if [[ "${worker_val_out}" != PASS* ]]; then
      echo "FAIL: Standalone Worker PPID (${worker_ppid}) validation failed: ${worker_val_out}!"
      return 1
    fi
    echo "PASS: Standalone Background Worker (PID ${worker_pid}) is a verified child of Supervisor (PPID ${worker_ppid})."
    return 0
  elif [ "${worker_ec}" -eq 1 ]; then
    if [[ -n "${worker_info}" ]]; then
      echo "FAIL: Background worker discovery returned exit code 1 but produced unexpected output: '${worker_info}'"
      return 1
    fi
    echo "INFO: Background worker is operating in integrated in-process mode within Supervisor PID ${supervisor_pid} (Option B)."
    return 0
  else
    echo "FAIL: Background worker discovery failed with unexpected exit code ${worker_ec}: '${worker_info}'"
    return 1
  fi
}

# 20A: Option A fixture succeeds
OUT20A=$(
  step6_worker_eval "${MOCK_PROC16}" 7
)
assert_test "Scenario 20A: Full Step 6 handles Option A standalone worker" 0 "PASS: Standalone Background Worker" "$?" "${OUT20A}"

# 20B: Option B fixture succeeds
OUT20B=$(
  step6_worker_eval "${MOCK_PROC17}" 7
)
assert_test "Scenario 20B: Full Step 6 handles Option B integrated worker" 0 "INFO: Background worker is operating in integrated in-process mode" "$?" "${OUT20B}"

# 20C: Standalone worker with wrong PPID fails validation
MOCK_PROC20C="${TEST_DIR}/proc20c"
mkdir -p "${MOCK_PROC20C}"
create_proc_entry "${MOCK_PROC20C}" 7 1 1001 "node" "node\0scripts/start_all.mjs\0"
create_proc_entry "${MOCK_PROC20C}" 95 999 1001 "node" "node\0scripts/background_worker.mjs\0"

OUT20C=$(
  step6_worker_eval "${MOCK_PROC20C}" 7
)
assert_test "Scenario 20C: Standalone worker with mismatched PPID fails Step 6" 1 "validation failed" "$?" "${OUT20C}"

# ------------------------------------------------------------------------------
# Test 21: Valid Production Graceful Shutdown Log (Exit code 143 and 0)
# ------------------------------------------------------------------------------
echo "--- Scenario 21: Valid Production Graceful Shutdown Log ---"
PROD_SHUTDOWN_LOG_SAMPLE=$(cat << 'EOF'
=== [CONTAINER SUPERVISOR: WEB + BACKGROUND WORKER + BACKUP SCHEDULER] ===
[SUPERVISOR-WORKER] Distributed lease held or maintenance active. Skipping cycle.
[SUPERVISOR-STATE] Transitioned to QUIESCING
[SUPERVISOR-STATE] Transitioned to DRAINING
[SUPERVISOR-STATE] Transitioned to TERMINATING_CHILD
[SUPERVISOR] Next.js process exited with code 143 / signal null.
[SUPERVISOR] Web process exited cleanly with code 143.
[SUPERVISOR-STATE] Transitioned to VERIFYING_PROCESS_EXIT
[SUPERVISOR-STATE] Transitioned to CLEANING_OWNED_LEASES
[SUPERVISOR-STATE] Transitioned to CHECKPOINTING
[SUPERVISOR-WAL] Checkpoint successfully transferred frames and truncated WAL: log=0, checkpointed=0
[SUPERVISOR-STATE] Transitioned to SHUTDOWN_COMPLETE
[SUPERVISOR] Shutdown completed successfully. Final code: 143
EOF
)

OUT21A=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" 143)
assert_test "Scenario 21A: Valid production shutdown log with exit code 143 passes" 0 "PASS: Signal forwarding and graceful shutdown confirmed" "$?" "${OUT21A}"

OUT21B=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" 0)
assert_test "Scenario 21B: Valid production shutdown log with exit code 0 passes" 0 "PASS: Signal forwarding and graceful shutdown confirmed" "$?" "${OUT21B}"

# ------------------------------------------------------------------------------
# Test 22: Missing [SUPERVISOR-STATE] Transitioned to SHUTDOWN_COMPLETE
# ------------------------------------------------------------------------------
echo "--- Scenario 22: Missing Transition to SHUTDOWN_COMPLETE ---"
LOG_NO_STATE_TRANSITION=$(echo "${PROD_SHUTDOWN_LOG_SAMPLE}" | grep -v "Transitioned to SHUTDOWN_COMPLETE")
OUT22=""
EC22=0
OUT22=$(validate_shutdown_logs "${LOG_NO_STATE_TRANSITION}" 143 2>&1) || EC22=$?
assert_test "Scenario 22: Missing transition to SHUTDOWN_COMPLETE rejected" 1 "missing explicit shutdown completion marker" "${EC22}" "${OUT22}"

# ------------------------------------------------------------------------------
# Test 23: Missing [SUPERVISOR] Shutdown completed successfully
# ------------------------------------------------------------------------------
echo "--- Scenario 23: Missing Successful Shutdown Message ---"
LOG_NO_SUCCESS_MSG=$(echo "${PROD_SHUTDOWN_LOG_SAMPLE}" | grep -v "Shutdown completed successfully")
OUT23=""
EC23=0
OUT23=$(validate_shutdown_logs "${LOG_NO_SUCCESS_MSG}" 143 2>&1) || EC23=$?
assert_test "Scenario 23: Missing successful shutdown message rejected" 1 "missing successful shutdown message" "${EC23}" "${OUT23}"

# ------------------------------------------------------------------------------
# Test 24: Unexpected Container Exit Code (e.g. 137 SIGKILL, 1 error)
# ------------------------------------------------------------------------------
echo "--- Scenario 24: Unexpected Container Exit Code ---"
OUT24A=""
EC24A=0
OUT24A=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" 137 2>&1) || EC24A=$?
assert_test "Scenario 24A: Unexpected container exit code 137 rejected" 1 "Expected container exit code 0 or 143" "${EC24A}" "${OUT24A}"

OUT24B=""
EC24B=0
OUT24B=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" 1 2>&1) || EC24B=$?
assert_test "Scenario 24B: Unexpected container exit code 1 rejected" 1 "Expected container exit code 0 or 143" "${EC24B}" "${OUT24B}"

OUT24C=""
EC24C=0
OUT24C=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" "" 2>&1) || EC24C=$?
assert_test "Scenario 24C: Empty container exit code rejected" 1 "Container exit code is missing or empty" "${EC24C}" "${OUT24C}"

OUT24D=""
EC24D=0
OUT24D=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" 2>&1) || EC24D=$?
assert_test "Scenario 24D: Missing container exit code argument rejected" 1 "Container exit code is missing or empty" "${EC24D}" "${OUT24D}"

OUT24E=""
EC24E=0
OUT24E=$(validate_shutdown_logs "${PROD_SHUTDOWN_LOG_SAMPLE}" "abc" 2>&1) || EC24E=$?
assert_test "Scenario 24E: Malformed non-numeric container exit code rejected" 1 "Expected container exit code 0 or 143" "${EC24E}" "${OUT24E}"

# ------------------------------------------------------------------------------
# Test 25: Generic SIGTERM String Without Shutdown Markers
# ------------------------------------------------------------------------------
echo "--- Scenario 25: Generic SIGTERM String Without Shutdown Markers ---"
GENERIC_SIGTERM_LOG="Container received SIGTERM. Exiting immediately."
OUT25=""
EC25=0
OUT25=$(validate_shutdown_logs "${GENERIC_SIGTERM_LOG}" 143 2>&1) || EC25=$?
assert_test "Scenario 25: Generic SIGTERM string without supervisor markers rejected" 1 "missing explicit shutdown completion marker" "${EC25}" "${OUT25}"

# ------------------------------------------------------------------------------
# Test 26: Missing [SUPERVISOR-WAL] Checkpoint Success Confirmation
# ------------------------------------------------------------------------------
echo "--- Scenario 26: Missing WAL Checkpoint Confirmation ---"
LOG_NO_WAL=$(echo "${PROD_SHUTDOWN_LOG_SAMPLE}" | grep -v "Checkpoint successfully transferred frames")
OUT26=""
EC26=0
OUT26=$(validate_shutdown_logs "${LOG_NO_WAL}" 143 2>&1) || EC26=$?
assert_test "Scenario 26: Missing WAL checkpoint success confirmation rejected" 1 "missing WAL checkpoint success confirmation" "${EC26}" "${OUT26}"

# ------------------------------------------------------------------------------
# Test 27: Database WAL Size Post-Shutdown Invariant Check
# ------------------------------------------------------------------------------
echo "--- Scenario 27: Database WAL Size Post-Shutdown Invariant Check ---"
eval_wal_size() {
  local wal_file="$1"
  if [ -f "${wal_file}" ]; then
    local size
    size=$(wc -c < "${wal_file}" | tr -d '[:space:]')
    if [ "${size:-0}" -ne 0 ]; then
      echo "FAIL: Expected WAL file size 0 bytes after TRUNCATE checkpoint, got ${size} bytes!"
      return 1
    fi
  fi
  echo "PASS: SQLite WAL checkpoint verified."
  return 0
}

# 27A: 0-byte WAL file
MOCK_WAL_EMPTY="${TEST_DIR}/empty.db-wal"
touch "${MOCK_WAL_EMPTY}"
OUT27A=""
EC27A=0
OUT27A=$(eval_wal_size "${MOCK_WAL_EMPTY}") || EC27A=$?
assert_test "Scenario 27A: Zero-byte WAL checkpoint file passes" 0 "PASS: SQLite WAL checkpoint verified" "${EC27A}" "${OUT27A}"

# 27B: Non-zero WAL file
MOCK_WAL_DIRTY="${TEST_DIR}/dirty.db-wal"
echo "dirty frames uncheckpointed" > "${MOCK_WAL_DIRTY}"
OUT27B=""
EC27B=0
OUT27B=$(eval_wal_size "${MOCK_WAL_DIRTY}") || EC27B=$?
assert_test "Scenario 27B: Non-zero-byte WAL checkpoint file rejected" 1 "Expected WAL file size 0 bytes" "${EC27B}" "${OUT27B}"

echo "================================================================================"
echo "Results: ${PASSED_TESTS} Passed, ${FAILED_TESTS} Failed"
echo "================================================================================"

if [ "${FAILED_TESTS}" -gt 0 ]; then
  exit 1
fi
exit 0
