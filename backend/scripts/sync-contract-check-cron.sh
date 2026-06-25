#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
LOG_DIR="${HOME}/.hermes/logs/strawmoneybook-autocoder"
LOG_FILE="${SYNC_CONTRACT_ALERT_LOG_PATH:-$LOG_DIR/SMB-253.log}"

mkdir -p "$LOG_DIR"
{
  echo
  echo "[cron] $(date -Is) sync-contract-check start"
} >>"$LOG_FILE"

cd "$BACKEND_DIR"
if ! node scripts/sync-contract-check-run.mjs >>"$LOG_FILE" 2>&1; then
  echo "[cron] $(date -Is) sync-contract-check failed" >>"$LOG_FILE"
  exit 1
fi

echo "[cron] $(date -Is) sync-contract-check ok" >>"$LOG_FILE"
