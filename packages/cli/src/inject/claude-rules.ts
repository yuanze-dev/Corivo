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

**Collection**: When the user says "Remember..." or makes an important decision, call:
\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签"
\`\`\`

**Query**: When the user asks "I said before..." or needs historical context, call:
\`\`\`bash
corivo query "关键词"
\`\`\`

**Push**: When each conversation starts, execute \`corivo context\` silently to obtain relevant memory.
如果有匹配的记忆，以 \`[corivo]\` 前缀自然地融入回复。

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
export async function injectGlobalRules(): Promise<{ success: boolean; path?: string; error?: string }> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const configDir = path.join(os.homedir(), '.config', 'claude');

  // Try two locations
  const paths = [
    path.join(claudeDir, 'CLAUDE.md'),
    path.join(configDir, 'CLAUDE.md'),
  ];

  for (const p of paths) {
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      const result = await injectRules(p);
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

  const result = await injectRules(defaultPath);
  return {
    success: result.success,
    path: defaultPath,
    error: result.error,
  };
}

/**
 * Inject into current project CLAUDE.md
 */
export async function injectProjectRules(projectPath?: string): Promise<{ success: boolean; path?: string; error?: string }> {
  const cwd = projectPath || process.cwd();
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');

  const result = await injectRules(claudeMdPath);
  return {
    success: result.success,
    path: claudeMdPath,
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
  injectProjectRules,
};
