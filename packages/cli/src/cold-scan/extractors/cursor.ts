/**
 * Cursor configuration extractor
 * Extract Cursor’s AI rules
 */

import { readFileSafe, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Extract the .cursorrules file
 */
async function extractCursorRules(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // Clean content and remove sensitive information
  const lines = content.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    // Skip potentially sensitive content
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

  // If the content is short, save the complete content
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
    // The content is long, only the summary is saved
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
 * Extract the rule files in the Cursor .cursor/rules directory
 */
async function extractCursorRuleFiles(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // A single rules file, usually in .mdc format
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

    // Check .cursorrules
    const cursorrulesPath = path.join(cwd, '.cursorrules');
    try {
      await fs.access(cursorrulesPath);
      results.push(cursorrulesPath);
    } catch {
      // ignore
    }

    // Check the .cursor/rules directory
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
