/**
 * CLAUDE.md 规则注入模块
 *
 * 自动将 Corivo 规则注入到项目的 CLAUDE.md 文件
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

const START_MARKER = '<!-- CORIVO START -->';
const END_MARKER = '<!-- CORIVO END -->';

/**
 * 标准规则模板
 */
export const CORIVO_RULES = `
<!-- CORIVO START -->
## Corivo 记忆层

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

**采集**：当用户说"记住..."或做出重要决策时，调用：
\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签"
\`\`\`

**查询**：当用户问"我之前说过..."或需要历史上下文时，调用：
\`\`\`bash
corivo query "关键词"
\`\`\`

**推送**：每次对话开始时，静默执行 \`corivo context\` 获取相关记忆。
如果有匹配的记忆，以 \`[corivo]\` 前缀自然地融入回复。

**annotation 类型**：
- \`事实\` - 关于你或他人的事实
- \`知识\` - 你学到的知识
- \`决策\` - 你做过的选择
- \`偏好\` - 你的习惯和喜好

<!-- CORIVO END -->
`.trim();

/**
 * 检查文件是否已包含 Corivo 规则
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
 * 注入规则到文件
 */
export async function injectRules(
  filePath: string,
  options: { force?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // 检查文件是否存在
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      // 文件不存在，创建新文件
    }

    // 检查是否已包含规则
    const hasRules = await hasCorivoRules(filePath);

    if (hasRules && !options.force) {
      return { success: true };
    }

    if (hasRules && options.force) {
      // 替换现有规则
      const regex = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}`, 'g');
      content = content.replace(regex, CORIVO_RULES);
    } else {
      // 追加规则
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
 * 移除规则从文件
 */
export async function ejectRules(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
      return { success: true };
    }

    // 移除规则块
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
 * 注入到全局 CLAUDE.md
 */
export async function injectGlobalRules(): Promise<{ success: boolean; path?: string; error?: string }> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const configDir = path.join(os.homedir(), '.config', 'claude');

  // 尝试两个位置
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

  // 都失败了，创建默认位置
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
 * 注入到当前项目 CLAUDE.md
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
 * 转义正则表达式特殊字符
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
