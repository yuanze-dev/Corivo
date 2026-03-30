#!/usr/bin/env bash
# Corivo Codex notify adapter

set -euo pipefail

CODEX_EVENT=${1:-}
INPUT=""

if [ ! -t 0 ]; then
  INPUT=$(cat)
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

SUMMARY=$(printf '%s' "$INPUT" | jq -r '.transcript_summary // .summary // empty' 2>/dev/null || echo "")

if [ "$CODEX_EVENT" = "session-start" ]; then
  corivo carry-over --format text --no-password >/dev/null 2>&1 || true
  exit 0
fi

if [ -n "$SUMMARY" ]; then
  corivo review --last-message "$SUMMARY" --format text --no-password >/dev/null 2>&1 || true
fi

exit 0
