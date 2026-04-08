/**
 * Git Config Extractor
 * Extract user name, email and other identity information
 */

import { readFileSafe, expandHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';

async function extractGitConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // Extract user.name
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

  // Extract user.email
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

  // Extract common aliases (from [alias] paragraph)
  const aliasMatches = content.match(/^\s*(\w+)\s*=\s*(.+)$/gm);
  if (aliasMatches && aliasMatches.length > 0) {
    const aliases = aliasMatches
      .map(line => line.match(/^\s*(\w+)\s*=\s*(.+)$/))
      .filter(Boolean)
      .map((m) => (m ? m[1] : null))
      .filter(Boolean)
      .slice(0, 10); // Maximum of 10 records

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

  // Extract default branch name
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
