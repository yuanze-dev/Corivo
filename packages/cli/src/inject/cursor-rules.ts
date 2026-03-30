import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SESSION_CARRY_OVER_SCRIPT = `
#!/usr/bin/env bash
set -euo pipefail

if ! command -v corivo &>/dev/null; then
  exit 0
fi

OUTPUT=$(corivo carry-over --format hook-text --no-password 2>/dev/null || true)

if [ -n "$OUTPUT" ]; then
  echo "$OUTPUT"
fi

exit 0
`.trimStart();

const PROMPT_RECALL_SCRIPT = `
#!/usr/bin/env bash
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
`.trimStart();

const STOP_REVIEW_SCRIPT = `
#!/usr/bin/env bash
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
`.trimStart();

const TEMPLATE_TEXT = `
---
description: Corivo active memory integration
alwaysApply: true
---

# Corivo 记忆层（Cursor）

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

## 开场 carry-over

在会话开始或开始一个新任务时，如果需要回忆上次没收尾的事项，运行：

\`\`\`bash
corivo carry-over --format text --no-password
\`\`\`

## 答前 recall

当用户问题可能涉及历史决策、偏好、上下文、项目约定时，先运行：

\`\`\`bash
corivo recall --prompt "<用户问题>" --format hook-text --no-password
\`\`\`

如果你采纳了这条来自 Corivo 的记忆，请在回答中明确说“根据 Corivo 的记忆”或“从 Corivo 中查到”。

## 答后 review

在给出一段 substantive answer 或做出决策后，运行：

\`\`\`bash
corivo review --last-message "<你的回答摘要>" --format hook-text --no-password
\`\`\`

## 保存记忆

当用户要求记住，或当你识别到重要决策、偏好、事实时，运行：

\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签" --no-password
\`\`\`
`.trim();

export async function injectGlobalCursorRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const cursorDir = path.join(home, '.cursor');
  const rulesDir = path.join(home, '.cursor', 'rules');
  const filePath = path.join(rulesDir, 'corivo.mdc');
  const cliConfigPath = path.join(cursorDir, 'cli-config.json');
  const settingsPath = path.join(cursorDir, 'settings.json');
  const adapterDir = path.join(cursorDir, 'corivo');

  try {
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(filePath, TEMPLATE_TEXT, 'utf8');
    await installCursorHookScripts(adapterDir);
    await ensureCursorCliPermissions(cliConfigPath);
    await ensureCursorHooks(settingsPath, adapterDir);
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const CURSOR_RULE_TEMPLATE = TEMPLATE_TEXT;

async function ensureCursorCliPermissions(cliConfigPath: string): Promise<void> {
  let config: {
    version?: number;
    permissions?: {
      allow?: string[];
      deny?: string[];
    };
    [key: string]: unknown;
  } = {};

  try {
    const content = await fs.readFile(cliConfigPath, 'utf8');
    config = JSON.parse(content);
  } catch {
    config = {
      version: 1,
      editor: {
        vimMode: false,
      },
      hasChangedDefaultModel: false,
    };
  }

  const allow = new Set(config.permissions?.allow ?? []);
  allow.add('Shell(corivo)');

  config.permissions = {
    allow: Array.from(allow),
    deny: config.permissions?.deny ?? [],
  };

  if (!('editor' in config) || typeof config.editor !== 'object' || config.editor === null) {
    config.editor = {
      vimMode: false,
    };
  }

  if (typeof (config.editor as { vimMode?: unknown }).vimMode !== 'boolean') {
    (config.editor as { vimMode: boolean }).vimMode = false;
  }

  if (typeof config.hasChangedDefaultModel !== 'boolean') {
    config.hasChangedDefaultModel = false;
  }

  await fs.mkdir(path.dirname(cliConfigPath), { recursive: true });
  await fs.writeFile(cliConfigPath, JSON.stringify(config, null, 2), 'utf8');
}

async function installCursorHookScripts(adapterDir: string): Promise<void> {
  await fs.mkdir(adapterDir, { recursive: true });

  const files: Array<[string, string]> = [
    ['session-carry-over.sh', SESSION_CARRY_OVER_SCRIPT],
    ['prompt-recall.sh', PROMPT_RECALL_SCRIPT],
    ['stop-review.sh', STOP_REVIEW_SCRIPT],
  ];

  for (const [fileName, content] of files) {
    const filePath = path.join(adapterDir, fileName);
    await fs.writeFile(filePath, content, 'utf8');
    await fs.chmod(filePath, 0o755);
  }
}

async function ensureCursorHooks(settingsPath: string, adapterDir: string): Promise<void> {
  let settings: {
    hooks?: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>;
    [key: string]: unknown;
  } = {};

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    settings = JSON.parse(content);
  } catch {
    settings = {};
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  upsertHookCommand(settings.hooks, 'SessionStart', `bash ${path.join(adapterDir, 'session-carry-over.sh')}`, 5);
  upsertHookCommand(settings.hooks, 'UserPromptSubmit', `bash ${path.join(adapterDir, 'prompt-recall.sh')}`, 10);
  upsertHookCommand(settings.hooks, 'Stop', `bash ${path.join(adapterDir, 'stop-review.sh')}`, 5);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function upsertHookCommand(
  hooks: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>,
  event: string,
  command: string,
  timeout: number,
): void {
  const groups = hooks[event] ?? [{ hooks: [] }];
  const firstGroup = groups[0] ?? { hooks: [] };
  const commands = firstGroup.hooks ?? [];

  if (!commands.some((hook) => hook.command === command)) {
    commands.push({
      type: 'command',
      command,
      timeout,
    });
  }

  firstGroup.hooks = commands;
  groups[0] = firstGroup;
  hooks[event] = groups;
}
