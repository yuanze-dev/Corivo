import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SESSION_INIT_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if ! command -v corivo &>/dev/null; then
  echo "[corivo] CLI not found. Run: npm install -g corivo && corivo init"
  exit 0
fi

STATUS=$(corivo status 2>&1) || true

if echo "$STATUS" | grep -q "未初始化"; then
  echo "[corivo] Database not initialized. Run: corivo init"
  exit 0
fi

TOTAL=$(echo "$STATUS" | grep -oP '总数:\\s*\\K\\d+' 2>/dev/null || echo "0")
ACTIVE=$(echo "$STATUS" | grep -oP '活跃:\\s*\\K\\d+' 2>/dev/null || echo "0")

if [ "$TOTAL" -gt 0 ]; then
  HEALTH=$((ACTIVE * 100 / TOTAL))
  echo "[corivo] \${TOTAL} blocks | \${HEALTH}% active"
else
  echo "[corivo] ready"
fi
`;

const INGEST_TURN_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

ROLE=\${1:-unknown}
INPUT=$(cat)

LOG_DIR="$HOME/.corivo/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hooks-claude-ingest.log"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Role: $ROLE"
  echo "$INPUT" | head -c 500
  echo ""
} >> "$LOG_FILE"

tail -n 100 "$LOG_FILE" > "\${LOG_FILE}.tmp" && mv "\${LOG_FILE}.tmp" "$LOG_FILE"

CONTENT=""
ANNOTATION=""

if [ "$ROLE" = "user" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")
  ANNOTATION="事实 · self · 对话"
elif [ "$ROLE" = "assistant" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")
  ANNOTATION="知识 · self · 回答"
else
  exit 0
fi

if [ -z "$CONTENT" ] || [ \${#CONTENT} -le 5 ]; then
  exit 0
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

corivo save --content "$CONTENT" --annotation "$ANNOTATION" --source "claude-code-hooks" >> "$LOG_FILE" 2>&1 || true
exit 0
`;

const SESSION_CARRY_OVER_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo carry-over --format hook-text 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  echo "$OUTPUT"
fi

exit 0
`;

const PROMPT_RECALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")

if [ -z "$PROMPT" ]; then
  exit 0
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo recall --prompt "$PROMPT" --format hook-text 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  jq -n --arg suggestion "$OUTPUT" '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
`;

const STOP_REVIEW_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")

if [ -z "$LAST_MESSAGE" ]; then
  exit 0
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo review --last-message "$LAST_MESSAGE" --format hook-text 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  jq -n --arg suggestion "$OUTPUT" '{"additionalContext": $suggestion}' 2>/dev/null || echo ""
fi

exit 0
`;

const SAVE_SKILL = `---
name: corivo-save
description: 保存记忆到 Corivo 数据库。当用户说"保存这个""记住""记下来""不要忘了"或提到需要长期保留的重要信息时，自动触发此技能。
---

# Corivo 保存记忆

将重要信息保存到 Corivo 记忆数据库，供未来对话检索使用。

## 使用时机

当用户说以下内容时，考虑保存记忆：
- "保存这个"
- "记住"
- "记下来"
- "不要忘了"
- 需要长期保留的重要信息

## 执行步骤

1. 检查 Corivo 是否已安装并初始化。
2. 用 \`corivo save --content ... --annotation ...\` 保存记忆。
3. 回复 \`[corivo] 已记录：...\`
`;

const QUERY_SKILL = `---
name: corivo-query
description: 从 Corivo 数据库查询记忆。当用户说"我之前说过""记得吗""我们之前决定""我的偏好"或涉及过去对话中的信息时，自动触发此技能。
---

# Corivo 查询记忆

从 Corivo 记忆数据库中检索相关信息，帮助 AI 更好地理解上下文。

## 查询方法

- \`corivo query "关键词" --limit 10\`
- 查询后向用户报告找到的记忆数量
- 如果结果为空，明确说明未找到相关记忆
`;

type ClaudeSettings = {
  hooks?: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>;
};

export async function injectGlobalClaudeCodeHost(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    const claudeDir = await resolveClaudeDir();
    const home = process.env.HOME || os.homedir();
    const hooksDir = path.join(home, '.corivo', 'hooks');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const skillsDir = path.join(claudeDir, 'skills');

    await installClaudeHookScripts(hooksDir);
    await installClaudeSkills(skillsDir);
    await installClaudeHookConfig(settingsPath, hooksDir);

    return {
      success: true,
      path: settingsPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveClaudeDir(): Promise<string> {
  const home = process.env.HOME || os.homedir();
  const candidates = [
    path.join(home, '.claude'),
    path.join(home, '.config', 'claude'),
    path.join(home, 'Library', 'Application Support', 'claude'),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  const fallback = candidates[0];
  await fs.mkdir(fallback, { recursive: true });
  return fallback;
}

async function installClaudeHookScripts(hooksDir: string): Promise<void> {
  await fs.mkdir(hooksDir, { recursive: true });

  const scripts: Array<[string, string]> = [
    ['session-init.sh', SESSION_INIT_SCRIPT],
    ['ingest-turn.sh', INGEST_TURN_SCRIPT],
    ['session-carry-over.sh', SESSION_CARRY_OVER_SCRIPT],
    ['prompt-recall.sh', PROMPT_RECALL_SCRIPT],
    ['stop-review.sh', STOP_REVIEW_SCRIPT],
  ];

  for (const [fileName, content] of scripts) {
    const filePath = path.join(hooksDir, fileName);
    await fs.writeFile(filePath, content, 'utf8');
    await fs.chmod(filePath, 0o755);
  }
}

async function installClaudeSkills(skillsDir: string): Promise<void> {
  const targets: Array<[string, string]> = [
    ['corivo-save/SKILL.md', SAVE_SKILL],
    ['corivo-query/SKILL.md', QUERY_SKILL],
  ];

  for (const [relativePath, content] of targets) {
    const filePath = path.join(skillsDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }
}

async function installClaudeHookConfig(settingsPath: string, hooksDir: string): Promise<void> {
  let settings: ClaudeSettings = {};

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    settings = JSON.parse(content) as ClaudeSettings;
  } catch {
    settings = {};
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  upsertClaudeHook(settings.hooks, 'SessionStart', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'session-init.sh')}`, timeout: 5 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'session-carry-over.sh')}`, timeout: 5 },
  ]);
  upsertClaudeHook(settings.hooks, 'UserPromptSubmit', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'ingest-turn.sh')} user`, timeout: 10 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'prompt-recall.sh')}`, timeout: 10 },
  ]);
  upsertClaudeHook(settings.hooks, 'Stop', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'ingest-turn.sh')} assistant`, timeout: 10 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'stop-review.sh')}`, timeout: 5 },
  ]);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function upsertClaudeHook(
  hooks: NonNullable<ClaudeSettings['hooks']>,
  event: string,
  commands: Array<{ type: string; command: string; timeout: number }>,
): void {
  const groups = hooks[event] ?? [{ hooks: [] }];
  const firstGroup = groups[0] ?? { hooks: [] };
  const existing = firstGroup.hooks ?? [];

  for (const command of commands) {
    if (!existing.some((hook) => hook.command === command.command)) {
      existing.push(command);
    }
  }

  firstGroup.hooks = existing;
  groups[0] = firstGroup;
  hooks[event] = groups;
}
