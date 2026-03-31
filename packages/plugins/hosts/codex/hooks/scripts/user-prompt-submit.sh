#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-codex-ingest.log"

if ! command -v corivo >/dev/null 2>&1; then
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "user-prompt-submit: corivo missing" >> "$LOG_FILE"
  exit 0
fi

PAYLOAD="$(cat || true)"

PROMPT="$(
  printf '%s' "$PAYLOAD" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(input || "{}");
        process.stdout.write(typeof payload.prompt === "string" ? payload.prompt : "");
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

if [ -z "$PROMPT" ]; then
  exit 0
fi

printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "user-prompt-submit" "$(printf '%s' "$PROMPT" | head -c 200)" >> "$LOG_FILE"

STATUS="$(corivo status 2>&1 || true)"
if printf '%s' "$STATUS" | grep -qi "未初始化"; then
  exit 0
fi

RESULTS=""

if printf '%s' "$PROMPT" | grep -Eqi '喜欢.*什么|爱喝|爱吃|偏好|口味|记得吗|之前说过|我喜欢'; then
  FACTS_JSON="$(corivo list --annotation 事实 --limit 20 --json 2>/dev/null || true)"
  RESULTS="$(
    FACTS_JSON="$FACTS_JSON" PROMPT="$PROMPT" node - <<'EOF'
const facts = JSON.parse(process.env.FACTS_JSON || '[]');
const prompt = process.env.PROMPT || '';

const preferenceRegex = /喜欢|偏好|爱喝|爱吃|口味|习惯|规则/;
const selfFacts = facts.filter((block) =>
  typeof block?.annotation === 'string' &&
  block.annotation.includes('self') &&
  typeof block?.content === 'string'
);

let preferred = selfFacts.filter((block) => preferenceRegex.test(block.content));
if (preferred.length === 0) preferred = selfFacts;

const unique = [];
const seen = new Set();
for (const block of preferred) {
  const key = `${block.annotation}::${block.content}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(block);
}

const top = unique.slice(0, 5);
if (top.length === 0) {
  process.stdout.write('');
  process.exit(0);
}

const lines = top.map((block) => `• ${block.content} [${block.annotation}]`);
process.stdout.write(`[corivo recall]\nPrompt: ${prompt}\n` + lines.join('\n'));
EOF
  )"
fi

if [ -z "$RESULTS" ]; then
  RESULTS="$(corivo query "$PROMPT" --limit 3 2>/dev/null || true)"
fi

if [ -z "$RESULTS" ]; then
  exit 0
fi

RESULTS="$RESULTS" node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:process.env.RESULTS || ""}}))'
