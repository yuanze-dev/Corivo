#!/usr/bin/env bash
# Corivo Stop Hook - Context Push
# Triggered after Claude finishes a reply to push relevant follow-up context
#
# Core philosophy (inspired by Claude Code v2):
# "Predict what the user will type, not what you think they should do."

set -euo pipefail

# Read hook JSON input
INPUT=$(cat)

# Extract Claude's last reply message
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' )

# If there is no message, exit silently
if [ "$LAST_MESSAGE" = "empty" ] || [ -z "$LAST_MESSAGE" ]; then
  exit 0
fi

# Check if Corivo CLI is available
if ! command -v corivo &>/dev/null; then
  exit 0
fi

# Get suggested content
SUGGESTION=$(corivo suggest --context post-request --last-message "$LAST_MESSAGE" 2>/dev/null || true)

# Output the suggestion when one is available
if [ -n "$SUGGESTION" ]; then
  # The output is additionalContext
  jq -n \
    --arg suggestion "$SUGGESTION" \
    '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
