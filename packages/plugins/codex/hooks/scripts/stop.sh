#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

if ! command -v corivo >/dev/null 2>&1; then
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "stop: corivo missing" >> "$LOG_FILE"
  exit 0
fi

PAYLOAD="$(cat || true)"

MESSAGE="$(
  printf '%s' "$PAYLOAD" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input || "{}");
        process.stdout.write(typeof payload.last_assistant_message === "string" ? payload.last_assistant_message : "");
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

if [ -z "$MESSAGE" ]; then
  exit 0
fi

printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "stop" "$(printf '%s' "$MESSAGE" | head -c 200)" >> "$LOG_FILE"

RESULTS="$(corivo review --last-message "$MESSAGE" --format hook-text 2>/dev/null || true)"

if [ -z "$RESULTS" ]; then
  exit 0
fi

RESULTS="$RESULTS" node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"Stop",additionalContext:process.env.RESULTS || ""}}))'
