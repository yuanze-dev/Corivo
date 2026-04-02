#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

if ! command -v corivo >/dev/null 2>&1; then
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "session-init: corivo missing" >> "$LOG_FILE"
  node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"[corivo] CLI not found. Install with: npm install -g corivo"}}))'
  exit 0
fi

STATUS="$(corivo status 2>&1 || true)"
printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "session-init" >> "$LOG_FILE"

if printf '%s' "$STATUS" | grep -qi "未初始化"; then
  node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"[corivo] Memory runtime not initialized yet. Run: corivo init"}}))'
  exit 0
fi

TOTAL="$(printf '%s' "$STATUS" | grep -oE '总数:[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -n 1 || true)"
ACTIVE="$(printf '%s' "$STATUS" | grep -oE '活跃:[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -n 1 || true)"

if [ -n "${TOTAL:-}" ] && [ -n "${ACTIVE:-}" ]; then
  MESSAGE="[corivo] ${TOTAL} blocks available, ${ACTIVE} active. Query Corivo before relying on memory."
else
  MESSAGE="[corivo] Memory runtime is ready."
fi

MESSAGE="$MESSAGE" node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.MESSAGE || ""}}))'
