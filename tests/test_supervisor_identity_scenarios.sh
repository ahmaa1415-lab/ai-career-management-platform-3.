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
# Test 7: Empty or Unreadable cmdline
# ------------------------------------------------------------------------------
echo "--- Scenario 7: Empty or Unreadable cmdline ---"
MOCK_PROC="${TEST_DIR}/proc7"
mkdir -p "${MOCK_PROC}"
create_proc_entry "${MOCK_PROC}" 21 1 1001 "node" ""

OUT7=$(
  cands=$(discover_supervisor_candidates "${MOCK_PROC}")
  [ -z "$cands" ] || { echo "FAIL: Empty cmdline accepted: $cands"; exit 1; }
  echo "PASS: Empty cmdline ignored"
)
assert_test "Scenario 7: Empty cmdline ignored" 0 "PASS: Empty cmdline ignored" "$?" "${OUT7}"

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

echo "================================================================================"
echo "Results: ${PASSED_TESTS} Passed, ${FAILED_TESTS} Failed"
echo "================================================================================"

if [ "${FAILED_TESTS}" -gt 0 ]; then
  exit 1
fi
exit 0
