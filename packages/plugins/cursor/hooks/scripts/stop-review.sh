#!/usr/bin/env bash
# Corivo Cursor Stop Review Hook

set -euo pipefail

INPUT=$(cat)
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")

if [ -z "$LAST_MESSAGE" ]; then
  exit 0
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo review --last-message "$LAST_MESSAGE" --format hook-text --no-password 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  jq -n --arg suggestion "$OUTPUT" '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
