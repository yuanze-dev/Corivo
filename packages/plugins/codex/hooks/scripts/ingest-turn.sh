#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-unknown}"
INPUT="$(cat || true)"

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Role: $ROLE"
  printf '%s' "$INPUT" | head -c 500
  echo ""
} >> "$LOG_FILE"

tail -n 100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"

CONTENT=""
ANNOTATION=""

extract_field() {
  local field_name="$1"
  printf '%s' "$INPUT" | FIELD_NAME="$field_name" node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input || "{}");
        const field = process.env.FIELD_NAME;
        process.stdout.write(typeof payload[field] === "string" ? payload[field] : "");
      } catch {
        process.stdout.write("");
      }
    });
  '
}

should_skip_test_input() {
  local text="$1"
  local trimmed
  trimmed="$(printf '%s' "$text" | tr '\n' ' ' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"

  if [ -z "$trimmed" ] || [ "${#trimmed}" -le 5 ]; then
    return 0
  fi

  if printf '%s' "$trimmed" | grep -Eqi '^(hi|hello|test|测试|1234|6666|ping|pong|ok|好的|在吗)[[:space:][:punct:]]*$'; then
    return 0
  fi

  if printf '%s' "$trimmed" | grep -Eq '^[0-9]+$'; then
    return 0
  fi

  return 1
}

if [ "$ROLE" = "user" ]; then
  CONTENT="$(extract_field "prompt")"
  ANNOTATION="事实 · self · 对话"
elif [ "$ROLE" = "assistant" ]; then
  CONTENT="$(extract_field "last_assistant_message")"
  ANNOTATION="知识 · self · 回答"
else
  echo "Unknown role: $ROLE" >> "$LOG_FILE"
  exit 0
fi

if [ -z "$CONTENT" ] || [ "${#CONTENT}" -le 5 ]; then
  echo "Content too short or empty, skipping" >> "$LOG_FILE"
  exit 0
fi

if [ "$ROLE" = "user" ] && should_skip_test_input "$CONTENT"; then
  echo "User content looks like test input, skipping" >> "$LOG_FILE"
  exit 0
fi

if ! command -v corivo >/dev/null 2>&1; then
  echo "Corivo CLI not found, skipping" >> "$LOG_FILE"
  exit 0
fi

if corivo save --content "$CONTENT" --annotation "$ANNOTATION" --source "codex-hooks" --no-password >> "$LOG_FILE" 2>&1; then
  echo "✓ Saved [$ROLE] turn to corivo (${#CONTENT} chars)" >> "$LOG_FILE"
else
  echo "✗ Failed to save [$ROLE] turn to corivo" >> "$LOG_FILE"
fi

exit 0
