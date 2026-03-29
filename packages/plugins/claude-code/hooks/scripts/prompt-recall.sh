#!/usr/bin/env bash
# Corivo Prompt Recall Hook

set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")

if [ -z "$PROMPT" ]; then
  exit 0
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo recall --prompt "$PROMPT" --format hook-text --no-password 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  jq -n --arg suggestion "$OUTPUT" '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
