#!/usr/bin/env bash
# Corivo Session Init
# Runs at session start — checks CLI availability and reports memory status.

set -euo pipefail

if ! command -v corivo &>/dev/null; then
  echo "[corivo] CLI not found. Run: npm install -g corivo && corivo init"
  exit 0
fi

STATUS=$(corivo status --no-password 2>&1) || true

if echo "$STATUS" | grep -q "未初始化"; then
  echo "[corivo] Database not initialized. Run: corivo init"
  exit 0
fi

TOTAL=$(echo "$STATUS" | grep -oP '总数:\s*\K\d+' 2>/dev/null || echo "0")
ACTIVE=$(echo "$STATUS" | grep -oP '活跃:\s*\K\d+' 2>/dev/null || echo "0")

if [ "$TOTAL" -gt 0 ]; then
  HEALTH=$((ACTIVE * 100 / TOTAL))
  echo "[corivo] ${TOTAL} blocks | ${HEALTH}% active"
else
  echo "[corivo] ready"
fi
