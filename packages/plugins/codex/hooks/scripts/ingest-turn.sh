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
NORMALIZED_PAYLOAD=""

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

extract_content() {
  printf '%s' "$INPUT" | ROLE="$ROLE" node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input || "{}");
        const role = process.env.ROLE;
        const firstString = (...values) => values.find((value) => typeof value === "string" && value.length > 0) || "";
        const content = role === "user"
          ? firstString(payload.prompt, payload.user_prompt, payload.message)
          : firstString(payload.last_assistant_message, payload.assistant_message, payload.message);
        process.stdout.write(content);
      } catch {
        process.stdout.write("");
      }
    });
  '
}

normalize_payload() {
  printf '%s' "$INPUT" | ROLE="$ROLE" PROJECT_IDENTITY="${PWD:-}" node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input || "{}");
        const role = process.env.ROLE;
        const firstString = (...values) => values.find((value) => typeof value === "string" && value.length > 0) || "";
        const content = role === "user"
          ? firstString(payload.prompt, payload.user_prompt, payload.message)
          : firstString(payload.last_assistant_message, payload.assistant_message, payload.message);
        const externalSessionId = firstString(
          payload.session_id,
          payload.sessionId,
          payload.conversation_id,
          payload.conversationId,
          payload.chat_id,
          payload.chatId
        );

        if (!externalSessionId || !content) {
          process.stdout.write("");
          return;
        }

        const externalMessageId = role === "user"
          ? firstString(payload.prompt_id, payload.message_id, payload.messageId, payload.event_id, payload.eventId)
          : firstString(payload.last_assistant_message_id, payload.message_id, payload.messageId, payload.event_id, payload.eventId);

        process.stdout.write(JSON.stringify({
          host: "codex",
          externalSessionId,
          externalMessageId: externalMessageId || undefined,
          role,
          content,
          projectIdentity: firstString(payload.cwd, payload.workspace, process.env.PROJECT_IDENTITY),
          ingestedFrom: role === "user" ? "codex-user-prompt-submit" : "codex-stop",
          ingestEventId: firstString(payload.event_id, payload.eventId) || undefined,
        }));
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
  CONTENT="$(extract_content)"
elif [ "$ROLE" = "assistant" ]; then
  CONTENT="$(extract_content)"
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

NORMALIZED_PAYLOAD="$(normalize_payload)"
if [ -z "$NORMALIZED_PAYLOAD" ]; then
  echo "Missing session metadata, skipping realtime ingest" >> "$LOG_FILE"
  exit 0
fi

if printf '%s' "$NORMALIZED_PAYLOAD" | corivo ingest-message >> "$LOG_FILE" 2>&1; then
  echo "✓ Ingested [$ROLE] turn into raw memory (${#CONTENT} chars)" >> "$LOG_FILE"
else
  echo "✗ Failed to ingest [$ROLE] turn into raw memory" >> "$LOG_FILE"
fi

exit 0
