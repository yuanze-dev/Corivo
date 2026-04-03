#!/usr/bin/env bash
# Corivo Session Init

set -euo pipefail

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo carry-over --format hook-text 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  echo "$OUTPUT"
fi
