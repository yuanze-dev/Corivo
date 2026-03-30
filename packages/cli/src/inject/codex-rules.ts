import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const START_MARKER = '<!-- CORIVO CODEX START -->';
const END_MARKER = '<!-- CORIVO CODEX END -->';
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
corivo recall --prompt "<用户问题>" --format hook-text --no-password
\`\`\`

如果你采纳了这条来自 Corivo 的记忆，请在回答中明确说“根据 Corivo 的记忆”或“从 Corivo 中查到”。

### 答后 review

在给出一段 substantive answer 或做出决策后，运行：

\`\`\`bash
corivo review --last-message "<你的回答摘要>" --format hook-text --no-password
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
  const filePath = path.join(os.homedir(), '.codex', 'AGENTS.md');
  const result = await injectCodexRules(filePath);

  return {
    success: result.success,
    path: filePath,
    error: result.error,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
