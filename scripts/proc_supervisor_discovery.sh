#!/usr/bin/env sh
# ==============================================================================
# scripts/proc_supervisor_discovery.sh
# Production Supervisor Discovery & Process Identity Library
#
# Shared between:
# - scripts/ci_test_linux_lifecycle.sh (executed inside Linux container via docker exec)
# - tests/test_supervisor_identity_scenarios.sh (executed with controlled /proc fixtures)
#
# POSIX-compliant (sh / dash / bash compatible)
# ==============================================================================

set -u

# ------------------------------------------------------------------------------
# 1. Discover Supervisor Candidates
# Scans $proc_dir/[0-9]*, excludes PID 1, requires comm==node, first_arg==node,
# and exact target script token (scripts/start_all.mjs, ./scripts/start_all.mjs, /app/scripts/start_all.mjs).
# Outputs space-separated candidate PIDs.
# ------------------------------------------------------------------------------
discover_supervisor_candidates() {
  proc_dir="${1:-/proc}"
  candidates=""
  for p in "$proc_dir"/[0-9]*; do
    [ -d "$p" ] || continue
    pid=$(basename "$p")
    [ "$pid" = "1" ] && continue

    # 1. Verify process comm identity is node
    comm=$(cat "$p/comm" 2>/dev/null || echo "")
    [ "$comm" = "node" ] || continue

    # 2. Verify cmdline is readable and non-empty
    [ -s "$p/cmdline" ] || continue

    # 3. Argument-boundary-aware check: split cmdline on NUL byte (\000) into tokens
    first_arg=""
    has_target_script=false
    idx=0
    for arg in $(tr '\000' '\n' < "$p/cmdline" 2>/dev/null); do
      if [ "$idx" -eq 0 ]; then
        first_arg="$arg"
      fi
      case "$arg" in
        "scripts/start_all.mjs"|"./scripts/start_all.mjs"|"/app/scripts/start_all.mjs")
          has_target_script=true
          ;;
      esac
      idx=$((idx + 1))
    done

    # 4. First token must have Node command identity
    case "$first_arg" in
      "node"|*/node) ;;
      *) continue ;;
    esac

    # 5. Target script must appear as an exact argument token
    [ "$has_target_script" = "true" ] || continue

    candidates="$candidates $pid"
  done
  echo $candidates
}

# ------------------------------------------------------------------------------
# 2. Verify Supervisor UID
# Checks that process status file has valid numeric UID == 1001 (nextjs).
# ------------------------------------------------------------------------------
verify_supervisor_uid() {
  pid="$1"
  proc_dir="${2:-/proc}"
  status_file="$proc_dir/$pid/status"

  if [ ! -f "$status_file" ]; then
    echo "FAIL: Supervisor process PID $pid disappeared or status file missing"
    return 1
  fi

  uid=$(awk '/^Uid:/ {print $2}' "$status_file" 2>/dev/null || echo "")
  if [ -z "$uid" ]; then
    echo "FAIL: Supervisor process PID $pid status file missing Uid field"
    return 1
  fi

  case "$uid" in
    ''|*[!0-9]*)
      echo "FAIL: Supervisor UID is not numeric: '$uid'"
      return 1
      ;;
  esac

  if [ "$uid" != "1001" ]; then
    echo "FAIL: Supervisor UID is '$uid', expected 1001 (nextjs)"
    return 1
  fi

  echo "PASS: Supervisor runs as unprivileged user nextjs (UID $uid)"
  return 0
}

# ------------------------------------------------------------------------------
# 3. Post-UID Churn Verification
# Rechecks that the process directory exists, comm is node, first_arg is node,
# and exact target script argument token is still present.
# ------------------------------------------------------------------------------
verify_supervisor_churn() {
  pid="$1"
  proc_dir="${2:-/proc}"
  p="$proc_dir/$pid"

  if [ ! -d "$p" ]; then
    echo "VANISHED"
    return 1
  fi

  comm=$(cat "$p/comm" 2>/dev/null || echo "")
  if [ "$comm" != "node" ]; then
    echo "COMM_CHANGED:$comm"
    return 1
  fi

  first_arg=""
  has_target=false
  idx=0
  for arg in $(tr '\000' '\n' < "$p/cmdline" 2>/dev/null); do
    if [ "$idx" -eq 0 ]; then
      first_arg="$arg"
    fi
    case "$arg" in
      "scripts/start_all.mjs"|"./scripts/start_all.mjs"|"/app/scripts/start_all.mjs")
        has_target=true
        ;;
    esac
    idx=$((idx + 1))
  done

  case "$first_arg" in
    "node"|*/node) ;;
    *)
      echo "FIRST_ARG_CHANGED:$first_arg"
      return 1
      ;;
  esac

  if [ "$has_target" = "true" ]; then
    echo "VALID"
    return 0
  else
    echo "CMD_CHANGED"
    return 1
  fi
}

# ------------------------------------------------------------------------------
# 4. Find Child Server Process
# Searches $proc_dir/[0-9]* for a process running next-server / node next start,
# excluding PID 1 and $supervisor_pid.
# Returns "$pid $ppid"
# ------------------------------------------------------------------------------
find_child_server() {
  supervisor_pid="$1"
  proc_dir="${2:-/proc}"

  for p in "$proc_dir"/[0-9]*; do
    [ -d "$p" ] || continue
    pid=$(basename "$p")
    [ "$pid" = "1" ] && continue
    [ "$pid" = "$supervisor_pid" ] && continue

    cmd=$(tr '\000' ' ' < "$p/cmdline" 2>/dev/null || true)
    [ -z "$cmd" ] && cmd=$(cat "$p/comm" 2>/dev/null || echo "")

    case "$cmd" in
      *"node"*"/next"*"start"*|*"next-server"*)
        ppid=$(awk '/^PPid:/ {print $2}' "$p/status" 2>/dev/null || echo "")
        echo "$pid $ppid"
        return 0
        ;;
    esac
  done
  return 1
}

# ------------------------------------------------------------------------------
# 5. Validate Child PPID
# Verifies child PID and PPID are non-empty, decimal integers, and PPID == supervisor_pid.
# ------------------------------------------------------------------------------
validate_child_ppid() {
  child_pid="$1"
  child_ppid="$2"
  supervisor_pid="$3"

  if [ -z "$child_pid" ] || [ -z "$child_ppid" ]; then
    echo "FAIL: Supervisor child process was not spawned or PPID is empty/missing"
    return 1
  fi

  case "$child_ppid" in
    ''|*[!0-9]*)
      echo "FAIL: Child PPID is not a valid decimal integer: '$child_ppid'"
      return 1
      ;;
  esac

  if [ "$child_ppid" != "$supervisor_pid" ]; then
    echo "FAIL: Child PPID ($child_ppid) does not match Supervisor PID ($supervisor_pid)"
    return 1
  fi

  echo "PASS: Next.js server (PID $child_pid) is a verified child of Supervisor (PPID $child_ppid == $supervisor_pid)"
  return 0
}

# ------------------------------------------------------------------------------
# 6. Find Background Worker Process (if standalone)
# Returns "$pid $ppid" if standalone background worker found.
# ------------------------------------------------------------------------------
find_background_worker() {
  proc_dir="${1:-/proc}"
  for p in "$proc_dir"/[0-9]*; do
    [ -d "$p" ] || continue
    cmd=$(tr '\000' ' ' < "$p/cmdline" 2>/dev/null || true)
    [ -z "$cmd" ] && cmd=$(cat "$p/comm" 2>/dev/null || echo "")
    case "$cmd" in
      *background_worker.mjs*)
        pid=$(basename "$p")
        ppid=$(awk '/^PPid:/ {print $2}' "$p/status" 2>/dev/null || echo "")
        echo "$pid $ppid"
        return 0
        ;;
    esac
  done
  return 1
}

# ------------------------------------------------------------------------------
# CLI Dispatcher
# ------------------------------------------------------------------------------
# If sourced in bash/zsh/sh, do not execute CLI dispatcher
if [ "${PROC_SUPERVISOR_SOURCED:-0}" = "1" ] || { [ -n "${BASH_SOURCE:-}" ] && [ "${BASH_SOURCE:-}" != "$0" ]; }; then
  return 0 2>/dev/null || exit 0
fi

case "${1:-}" in
  discover)
    discover_supervisor_candidates "${2:-/proc}"
    ;;
  verify-uid)
    if [ -z "${2:-}" ]; then
      echo "Error: verify-uid requires <pid> [proc_dir]" >&2
      exit 1
    fi
    verify_supervisor_uid "$2" "${3:-/proc}"
    ;;
  churn-check)
    if [ -z "${2:-}" ]; then
      echo "Error: churn-check requires <pid> [proc_dir]" >&2
      exit 1
    fi
    verify_supervisor_churn "$2" "${3:-/proc}"
    ;;
  find-child)
    if [ -z "${2:-}" ]; then
      echo "Error: find-child requires <supervisor_pid> [proc_dir]" >&2
      exit 1
    fi
    find_child_server "$2" "${3:-/proc}"
    ;;
  validate-child-ppid)
    if [ -z "${2:-}" ] || [ -z "${3:-}" ] || [ -z "${4:-}" ]; then
      echo "Error: validate-child-ppid requires <child_pid> <child_ppid> <supervisor_pid>" >&2
      exit 1
    fi
    validate_child_ppid "$2" "$3" "$4"
    ;;
  find-worker)
    find_background_worker "${2:-/proc}"
    ;;
  help|-h|--help)
    echo "Usage: $0 {discover|verify-uid|churn-check|find-child|validate-child-ppid|find-worker} [args...]"
    exit 0
    ;;
  *)
    echo "Error: Unknown or missing subcommand '${1:-}'. Available subcommands: discover, verify-uid, churn-check, find-child, validate-child-ppid, find-worker" >&2
    exit 1
    ;;
esac
