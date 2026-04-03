#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

if ! command -v corivo >/dev/null 2>&1; then
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "session-init: corivo missing" >> "$LOG_FILE"
  exit 0
fi

printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "session-init" >> "$LOG_FILE"
RESULTS="$(corivo carry-over --format hook-text 2>/dev/null || true)"

if [ -z "$RESULTS" ]; then
  exit 0
fi

RESULTS="$RESULTS" node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.RESULTS || ""}}))'
