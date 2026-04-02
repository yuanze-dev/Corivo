#!/usr/bin/env bash
# Corivo Hook Script - 实时保存对话到记忆
#
# 输入：Claude Code hook 事件的 JSON（通过 stdin）
# 参数：$1 = "user" | "assistant"
#
# 事件类型：
# - UserPromptSubmit: 用户提交提示时触发，JSON 中有 .prompt 字段
# - Stop: 对话停止时触发，JSON 中有 .last_assistant_message 字段
#

set -euo pipefail

ROLE=${1:-unknown}
INPUT=$(cat)

# 日志文件（用于调试）
LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-claude-ingest.log"

# 记录原始输入（调试用，仅保留最近 100 行）
{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Role: $ROLE"
  echo "$INPUT" | head -c 500  # 限制日志大小
  echo ""
} >> "$LOG_FILE"

# 保持日志文件大小
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
          host: "claude-code",
          externalSessionId,
          externalMessageId: externalMessageId || undefined,
          role,
          content,
          projectIdentity: firstString(payload.cwd, payload.workspace, process.env.PROJECT_IDENTITY),
          ingestedFrom: role === "user" ? "claude-user-prompt-submit" : "claude-stop",
          ingestEventId: firstString(payload.event_id, payload.eventId) || undefined,
        }));
      } catch {
        process.stdout.write("");
      }
    });
  '
}

if [ "$ROLE" = "user" ]; then
  # UserPromptSubmit 事件: .prompt 字段包含用户输入
  CONTENT="$(extract_content)"

elif [ "$ROLE" = "assistant" ]; then
  # Stop 事件: .last_assistant_message 字段包含 Claude 最后的回复
  CONTENT="$(extract_content)"
else
  echo "Unknown role: $ROLE" >> "$LOG_FILE"
  exit 0
fi

# 内容验证：非空且长度大于 5 个字符
if [ -z "$CONTENT" ] || [ ${#CONTENT} -le 5 ]; then
  echo "Content too short or empty, skipping" >> "$LOG_FILE"
  exit 0
fi

# 检查 corivo CLI 是否可用
if ! command -v corivo &>/dev/null; then
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
