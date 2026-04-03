/**
 * CLAUDE.md rule injection module
 *
 * Automatically inject Corivo rules into your project's CLAUDE.md file
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

const START_MARKER = '<!-- CORIVO START -->';
const END_MARKER = '<!-- CORIVO END -->';

/**
 * Standard rule template
 */
export const CORIVO_RULES = `
<!-- CORIVO START -->
## Corivo 记忆层

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

**答前 recall**：当用户问题可能涉及历史决策、偏好、上下文时，先调用：
\`\`\`bash
corivo recall --prompt "<用户问题>" --format text
\`\`\`

**答后 review**：在给出 substantive answer 或做出决策后，调用：
\`\`\`bash
corivo review --last-message "<你的回答摘要>" --format text
\`\`\`

**保存记忆**：当用户要求记住，或识别到重要决策/偏好/事实时，调用：
\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签"
\`\`\`

**检索信息**：当需要显式搜索记忆时，调用：
\`\`\`bash
corivo query "关键词"
\`\`\`

优先使用 Corivo 返回的 recall 结果；如果采纳了记忆，请明确说明“根据 Corivo 的记忆”或“从 Corivo 中查到”。

**annotation type**:
- \`事实\` - 关于你或他人的事实
- \`知识\` - 你学到的知识
- \`决策\` - 你做过的选择
- \`偏好\` - 你的习惯和喜好

<!-- CORIVO END -->
`.trim();

/**
 * Check if the file already contains Corivo rules
 */
export async function hasCorivoRules(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.includes(START_MARKER) && content.includes(END_MARKER);
  } catch {
    return false;
  }
}

/**
 * Inject rules into files
 */
export async function injectRules(
  filePath: string,
  options: { force?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    // Make sure the directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Check if the file exists
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File does not exist, create new file
    }

    // Check if the rule has been included
    const hasRules = await hasCorivoRules(filePath);

    if (hasRules && !options.force) {
      return { success: true };
    }

    if (hasRules && options.force) {
      // Replace existing rules
      const regex = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}`, 'g');
      content = content.replace(regex, CORIVO_RULES);
    } else {
      // Append rules
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + CORIVO_RULES + '\n';
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove rules from file
 */
export async function ejectRules(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
      return { success: true };
    }

    // Remove rule block
    const regex = new RegExp(`\\n?${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}\\n?`, 'g');
    const newContent = content.replace(regex, '\n');

    await fs.writeFile(filePath, newContent, 'utf-8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Inject into global CLAUDE.md
 */
export async function injectGlobalRules(options: {
  force?: boolean;
  homeDir?: string;
} = {}): Promise<{ success: boolean; path?: string; error?: string }> {
  const homeDir = options.homeDir || os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  const configDir = path.join(homeDir, '.config', 'claude');

  // Try two locations
  const paths = [
    path.join(claudeDir, 'CLAUDE.md'),
    path.join(configDir, 'CLAUDE.md'),
  ];

  for (const p of paths) {
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      const result = await injectRules(p, { force: options.force });
      if (result.success) {
        return { success: true, path: p };
      }
    } catch {
      continue;
    }
  }

  // All failed, create default location
  const defaultPath = path.join(claudeDir, 'CLAUDE.md');
  await fs.mkdir(claudeDir, { recursive: true });

  const result = await injectRules(defaultPath, { force: options.force });
  return {
    success: result.success,
    path: defaultPath,
    error: result.error,
  };
}

/**
 * Escape regular expression special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  hasCorivoRules,
  injectRules,
  ejectRules,
  injectGlobalRules,
};
