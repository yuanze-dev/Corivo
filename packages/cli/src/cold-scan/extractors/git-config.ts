/**
 * Git Config 提取器
 * 提取用户姓名、邮箱等身份信息
 */

import { readFileSafe, expandHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';

async function extractGitConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // 提取 user.name
  const nameMatch = content.match(/^\s*name\s*=\s*(.+)$/m);
  if (nameMatch) {
    blocks.push(
      createBlock({
        content: `用户名为 ${nameMatch[1].trim()}`,
        annotation: '事实 · 身份 · 姓名',
        source: 'git-config',
        filePath,
        metadata: { name: nameMatch[1].trim() },
      })
    );
  }

  // 提取 user.email
  const emailMatch = content.match(/^\s*email\s*=\s*(.+)$/m);
  if (emailMatch) {
    blocks.push(
      createBlock({
        content: `邮箱为 ${emailMatch[1].trim()}`,
        annotation: '事实 · 身份 · 邮箱',
        source: 'git-config',
        filePath,
        metadata: { email: emailMatch[1].trim() },
      })
    );
  }

  // 提取常用别名（来自 [alias] 段落）
  const aliasMatches = content.match(/^\s*(\w+)\s*=\s*(.+)$/gm);
  if (aliasMatches && aliasMatches.length > 0) {
    const aliases = aliasMatches
      .map(line => line.match(/^\s*(\w+)\s*=\s*(.+)$/))
      .filter(Boolean)
      .map((m) => (m ? m[1] : null))
      .filter(Boolean)
      .slice(0, 10); // 最多记录 10 个

    if (aliases.length > 0) {
      blocks.push(
        createBlock({
          content: `常用 Git 别名: ${aliases.join(', ')}`,
          annotation: '偏好 · 工具 · Git 别名',
          source: 'git-config',
          filePath,
          metadata: { aliases },
        })
      );
    }
  }

  // 提取默认分支名
  const defaultBranchMatch = content.match(/^\s*init\.defaultBranch\s*=\s*(.+)$/m);
  if (defaultBranchMatch) {
    blocks.push(
      createBlock({
        content: `默认分支为 ${defaultBranchMatch[1].trim()}`,
        annotation: '偏好 · 工具 · Git 默认分支',
        source: 'git-config',
        filePath,
        metadata: { defaultBranch: defaultBranchMatch[1].trim() },
      })
    );
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'git-config',
  path: '~/.gitconfig',
  priority: 100,
  timeout: 500,
  extractor: async (content: string, filePath: string) => {
    if (!content) {
      content = (await readFileSafe('~/.gitconfig')) || '';
    }
    return extractGitConfig(content, filePath);
  },
};

export default { source, extractGitConfig };
