/**
 * Cursor 配置提取器
 * 提取 Cursor 的 AI 规则
 */

import { readFileSafe, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 提取 .cursorrules 文件
 */
async function extractCursorRules(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // 清理内容，移除敏感信息
  const lines = content.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    // 跳过可能的敏感内容
    if (
      line.includes('API_KEY') ||
      line.includes('SECRET') ||
      line.includes('PASSWORD') ||
      line.includes('TOKEN')
    ) {
      continue;
    }
    cleanLines.push(line);
  }

  const cleanContent = cleanLines.join('\n').trim();

  // 如果内容较短，保存完整内容
  if (cleanContent.length > 0 && cleanContent.length < 1000) {
    blocks.push(
      createBlock({
        content: cleanContent,
        annotation: '偏好 · AI · Cursor 规则',
        source: 'cursor',
        filePath,
        metadata: { ruleType: 'cursorrules' },
      })
    );
  } else if (cleanContent.length > 0) {
    // 内容较长，只保存摘要
    blocks.push(
      createBlock({
        content: '已配置 Cursor AI 规则',
        annotation: '知识 · 工具 · Cursor',
        source: 'cursor',
        filePath,
        metadata: { hasRules: true },
      })
    );
  }

  return blocks;
}

/**
 * 提取 Cursor .cursor/rules 目录下的规则文件
 */
async function extractCursorRuleFiles(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // 单个规则文件，通常是 .mdc 格式
  const cleanContent = content
    .split('\n')
    .filter(line => !line.includes('API_KEY') && !line.includes('SECRET'))
    .join('\n')
    .trim();

  if (cleanContent.length > 0 && cleanContent.length < 500) {
    blocks.push(
      createBlock({
        content: cleanContent,
        annotation: '偏好 · AI · Cursor 规则',
        source: 'cursor',
        filePath,
        metadata: { ruleType: 'cursor_mdc', ruleName: path.basename(filePath) },
      })
    );
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'cursor',
  path: async () => {
    const results: string[] = [];
    const cwd = process.cwd();

    // 检查 .cursorrules
    const cursorrulesPath = path.join(cwd, '.cursorrules');
    try {
      await fs.access(cursorrulesPath);
      results.push(cursorrulesPath);
    } catch {
      // ignore
    }

    // 检查 .cursor/rules 目录
    const rulesDir = path.join(cwd, '.cursor', 'rules');
    try {
      const files = await fs.readdir(rulesDir);
      const mdcFiles = files.filter(f => f.endsWith('.mdc'));
      for (const file of mdcFiles) {
        results.push(path.join(rulesDir, file));
      }
    } catch {
      // ignore
    }

    return results;
  },
  priority: 80,
  timeout: 1000,
  extractor: async (content: string, filePath: string) => {
    if (filePath.endsWith('.cursorrules')) {
      return extractCursorRules(content, filePath);
    } else if (filePath.endsWith('.mdc')) {
      return extractCursorRuleFiles(content, filePath);
    }
    return [];
  },
};

export default { source, extractCursorRules };
