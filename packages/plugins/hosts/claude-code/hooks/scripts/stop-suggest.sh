#!/usr/bin/env bash
# Corivo Stop Hook - Context Push
# 在 Claude 回复完成后触发，推送相关内容
#
# 核心哲学（参考 Claude Code v2）：
# "预测用户会打什么，不是你觉得他们该做什么"

set -euo pipefail

# 读取 hook JSON 输入
INPUT=$(cat)

# 提取 Claude 最后的回复消息
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' )

# 如果没有消息，静默退出
if [ "$LAST_MESSAGE" = "empty" ] || [ -z "$LAST_MESSAGE" ]; then
  exit 0
fi

# 检查 corivo CLI 是否可用
if ! command -v corivo &>/dev/null; then
  exit 0
fi

# 获取建议内容
SUGGESTION=$(corivo suggest --context post-request --last-message "$LAST_MESSAGE" --no-password 2>/dev/null || true)

# 如果有建议内容，输出
if [ -n "$SUGGESTION" ]; then
  # 输出为 additionalContext
  jq -n \
    --arg suggestion "$SUGGESTION" \
    '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
