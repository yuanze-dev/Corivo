import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const START_MARKER = '<!-- CORIVO CODEX START -->';
const END_MARKER = '<!-- CORIVO CODEX END -->';
const REVIEW_SCRIPT_NAME = 'notify-review.sh';
const DISPATCH_SCRIPT_NAME = 'notify-dispatch.sh';
const TEMPLATE_TEXT = `
## Corivo 记忆层（Codex）

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

### 开场 carry-over

在会话开始或开始一个新任务时，如果需要回忆上次没收尾的事项，运行：

\`\`\`bash
corivo carry-over --format text --no-password
\`\`\`

### 答前 recall

当用户问题可能涉及历史决策、偏好、上下文、项目约定时，先运行：

\`\`\`bash
corivo recall --prompt "<用户问题>" --format text --no-password
\`\`\`

如果你采纳了这条来自 Corivo 的记忆，请在回答中明确说“根据 Corivo 的记忆”或“从 Corivo 中查到”。

### 答后 review

在给出一段 substantive answer 或做出决策后，运行：

\`\`\`bash
corivo review --last-message "<你的回答摘要>" --format text --no-password
\`\`\`

### 保存记忆

当用户要求记住，或当你识别到重要决策、偏好、事实时，运行：

\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签" --no-password
\`\`\`
`.trim();

export const CODEX_RULES = `
${START_MARKER}
${TEMPLATE_TEXT}
${END_MARKER}
`.trim();

export async function injectCodexRules(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      // ignore
    }

    if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
      const regex = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}`, 'g');
      content = content.replace(regex, CODEX_RULES);
    } else {
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += `\n${CODEX_RULES}\n`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function injectGlobalCodexRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const codexDir = path.join(home, '.codex');
  const filePath = path.join(codexDir, 'AGENTS.md');
  const configPath = path.join(codexDir, 'config.toml');
  const adapterDir = path.join(codexDir, 'corivo');
  const dispatchPath = path.join(adapterDir, DISPATCH_SCRIPT_NAME);
  const reviewPath = path.join(adapterDir, REVIEW_SCRIPT_NAME);

  try {
    await fs.mkdir(adapterDir, { recursive: true });

    const existingConfig = await readFileIfExists(configPath);
    const existingNotify = extractNotifyCommand(existingConfig);
    const wrappedNotify = shouldWrapNotify(existingNotify, dispatchPath) ? existingNotify : null;

    await fs.writeFile(reviewPath, REVIEW_SCRIPT_TEXT, 'utf8');
    await fs.chmod(reviewPath, 0o755);

    await fs.writeFile(dispatchPath, buildDispatchScript(wrappedNotify), 'utf8');
    await fs.chmod(dispatchPath, 0o755);

    let updatedConfig = upsertNotifyCommand(existingConfig, ['bash', dispatchPath]);
    updatedConfig = upsertSandboxWritableRoot(updatedConfig, path.join(home, '.corivo'));
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(configPath, updatedConfig, 'utf8');

    const result = await injectCodexRules(filePath);

    return {
      success: result.success,
      path: filePath,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function extractNotifyCommand(content: string): string[] | null {
  const match = content.match(/notify\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) {
    return null;
  }

  const values = Array.from(match[1].matchAll(/"((?:\\"|[^"])*)"/g)).map((item) =>
    item[1].replace(/\\"/g, '"'),
  );

  return values.length > 0 ? values : null;
}

function shouldWrapNotify(command: string[] | null, dispatchPath: string): command is string[] {
  return Boolean(command && command.length > 0 && !command.includes(dispatchPath));
}

function upsertNotifyCommand(content: string, command: string[]): string {
  const notifyLine = `notify = [ ${command.map((value) => `"${value}"`).join(', ')} ]`;

  if (!content.trim()) {
    return `${notifyLine}\n`;
  }

  if (/notify\s*=\s*\[[\s\S]*?\]/m.test(content)) {
    return content.replace(/notify\s*=\s*\[[\s\S]*?\]/m, notifyLine);
  }

  return content.endsWith('\n') ? `${content}${notifyLine}\n` : `${content}\n${notifyLine}\n`;
}

function upsertSandboxWritableRoot(content: string, rootPath: string): string {
  const line = `writable_roots = [ "${rootPath}" ]`;
  const sectionRegex = /\[sandbox_workspace_write\]([\s\S]*?)(?=\n\[|$)/m;
  const sectionMatch = content.match(sectionRegex);

  if (!sectionMatch) {
    const block = `[sandbox_workspace_write]\n${line}\n`;
    return content.endsWith('\n') ? `${content}${block}` : `${content}\n${block}`;
  }

  const section = sectionMatch[0];
  const rootsMatch = section.match(/writable_roots\s*=\s*\[([\s\S]*?)\]/m);

  if (!rootsMatch) {
    const updatedSection = `${section.trimEnd()}\n${line}\n`;
    return content.replace(sectionRegex, updatedSection);
  }

  const roots = Array.from(rootsMatch[1].matchAll(/"((?:\\"|[^"])*)"/g)).map((item) =>
    item[1].replace(/\\"/g, '"'),
  );

  if (!roots.includes(rootPath)) {
    roots.push(rootPath);
  }

  const updatedRootsLine = `writable_roots = [ ${roots.map((value) => `"${value}"`).join(', ')} ]`;
  const updatedSection = section.replace(/writable_roots\s*=\s*\[[\s\S]*?\]/m, updatedRootsLine);
  return content.replace(sectionRegex, updatedSection);
}

function buildDispatchScript(existingNotify: string[] | null): string {
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'INPUT=""',
    'if [ ! -t 0 ]; then',
    '  INPUT="$(cat)"',
    'fi',
  ];

  if (existingNotify && existingNotify.length > 0) {
    const quoted = existingNotify.map((value) => shellQuote(value)).join(' ');
    lines.push(
      `printf '%s' "$INPUT" | ${quoted} || true`,
    );
  }

  lines.push(
    'if [ -x "$HOME/.codex/corivo/notify-review.sh" ]; then',
    '  printf \'%s\' "$INPUT" | bash "$HOME/.codex/corivo/notify-review.sh" || true',
    'fi',
    '',
  );

  return lines.join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const REVIEW_SCRIPT_TEXT = `
#!/usr/bin/env bash
set -euo pipefail

INPUT=""

if [ ! -t 0 ]; then
  INPUT="$(cat)"
fi

if ! command -v corivo &>/dev/null; then
  exit 0
fi

SUMMARY=$(printf '%s' "$INPUT" | jq -r '.transcript_summary // .summary // empty' 2>/dev/null || echo "")

if [ -n "$SUMMARY" ]; then
  OUTPUT=$(corivo review --last-message "$SUMMARY" --format hook-text --no-password 2>/dev/null || true)
  if [ -n "$OUTPUT" ]; then
    printf '%s\n' "$OUTPUT"
  fi
fi

exit 0
`.trimStart();
