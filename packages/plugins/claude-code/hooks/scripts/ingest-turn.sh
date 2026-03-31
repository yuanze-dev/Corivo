#!/usr/bin/env bash
# Corivo Hook Script - Save conversations to memory in real time
#
# Input: JSON of Claude Code hook events (via stdin)
# Parameters: $1 = "user" | "assistant"
#
# Event type:
# - UserPromptSubmit: Triggered when the user submits a prompt, there is a .prompt field in JSON
# - Stop: Triggered when the conversation stops, there is a .last_assistant_message field in JSON
#

set -euo pipefail

ROLE=${1:-unknown}
INPUT=$(cat)

# Log file (for debugging)
LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-claude-ingest.log"

# Record raw input (for debugging, only keep the last 100 lines)
{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Role: $ROLE"
  echo "$INPUT" | head -c 500  # 限制日志大小
  echo ""
} >> "$LOG_FILE"

# Keep log file size
tail -n 100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"

CONTENT=""
ANNOTATION=""

if [ "$ROLE" = "user" ]; then
  # UserPromptSubmit event: .prompt field contains user input
  CONTENT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")
  ANNOTATION="事实 · self · 对话"

elif [ "$ROLE" = "assistant" ]; then
  # Stop event: The .last_assistant_message field contains Claude's last reply
  CONTENT=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")
  ANNOTATION="知识 · self · 回答"
else
  echo "Unknown role: $ROLE" >> "$LOG_FILE"
  exit 0
fi

# Content validation: not empty and longer than 5 characters
if [ -z "$CONTENT" ] || [ ${#CONTENT} -le 5 ]; then
  echo "Content too short or empty, skipping" >> "$LOG_FILE"
  exit 0
fi

# Check if Corivo CLI is available
if ! command -v corivo &>/dev/null; then
  echo "Corivo CLI not found, skipping" >> "$LOG_FILE"
  exit 0
fi

# Call the corivo save command to save to memory
# Use --no-password to avoid interactive password prompts
# Use the --source flag to collect real-time data from hooks
if corivo save --content "$CONTENT" --annotation "$ANNOTATION" --source "claude-code-hooks" --no-password >> "$LOG_FILE" 2>&1; then
  echo "✓ Saved [$ROLE] turn to corivo (${#CONTENT} chars)" >> "$LOG_FILE"
else
  echo "✗ Failed to save [$ROLE] turn to corivo" >> "$LOG_FILE"
fi

exit 0
