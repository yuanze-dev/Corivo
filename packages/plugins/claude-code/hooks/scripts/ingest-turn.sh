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
LOG_FILE="$LOG_DIR/hooks-ingest.log"

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
ANNOTATION=""

if [ "$ROLE" = "user" ]; then
  # UserPromptSubmit 事件: .prompt 字段包含用户输入
  CONTENT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")
  ANNOTATION="事实 · self · 对话"

elif [ "$ROLE" = "assistant" ]; then
  # Stop 事件: .last_assistant_message 字段包含 Claude 最后的回复
  CONTENT=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")
  ANNOTATION="知识 · self · 回答"
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

# 调用 corivo save 命令保存到记忆
# 使用 --no-password 避免交互式密码提示
# 使用 --source 标识来自 hooks 实时采集
if corivo save --content "$CONTENT" --annotation "$ANNOTATION" --source "claude-code-hooks" --no-password >> "$LOG_FILE" 2>&1; then
  echo "✓ Saved [$ROLE] turn to corivo (${#CONTENT} chars)" >> "$LOG_FILE"
else
  echo "✗ Failed to save [$ROLE] turn to corivo" >> "$LOG_FILE"
fi

exit 0
