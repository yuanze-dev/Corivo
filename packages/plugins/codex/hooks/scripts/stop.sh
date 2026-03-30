#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

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

printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "stop" "$(printf '%s' "$MESSAGE" | head -c 200)" >> "$LOG_FILE"

if printf '%s' "$MESSAGE" | grep -Eqi '\[corivo\]'; then
  printf '%s\n' '{"continue":true}'
  exit 0
fi

if printf '%s' "$MESSAGE" | grep -Eqi "I('| wi)ll remember|记住这个|我会记住|不要忘了"; then
  printf '%s\n' '{"decision":"block","reason":"You promised to remember something. If it should persist, save it to Corivo now or explain why it should not be stored."}'
  exit 0
fi

printf '%s\n' '{"continue":true}'
