/**
 * EditorConfig Extractor
 * Extract editor configuration preferences
 */

import { readFileSafe, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';

async function extractEditorconfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  const lines = content.split('\n');
  let currentSection = '*';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Detect section
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Only handles global configuration (*) and language-specific configuration
    if (currentSection === '*' || currentSection.startsWith('*.')) {
      // Extract indent style
      if (trimmed.startsWith('indent_style=')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value) {
          const style = value === 'tab' ? 'Tab 缩进' : '空格缩进';
          blocks.push(
            createBlock({
              content: style,
              annotation: '偏好 · 代码风格 · 缩进',
              source: 'editorconfig',
              filePath,
              metadata: { indent_style: value },
            })
          );
        }
      }

      // Extract indent size
      if (trimmed.startsWith('indent_size=')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value && value !== 'tab') {
          blocks.push(
            createBlock({
              content: `${value} 空格缩进`,
              annotation: '偏好 · 代码风格 · 缩进',
              source: 'editorconfig',
              filePath,
              metadata: { indent_size: value },
            })
          );
        }
      }

      // Extract newline characters
      if (trimmed.startsWith('end_of_line=')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value) {
          const eol =
            value === 'lf'
              ? 'LF 换行符'
              : value === 'crlf'
              ? 'CRLF 换行符'
              : value;
          blocks.push(
            createBlock({
              content: eol,
              annotation: '偏好 · 代码风格 · 换行符',
              source: 'editorconfig',
              filePath,
              metadata: { end_of_line: value },
            })
          );
        }
      }

      // Extract encoding
      if (trimmed.startsWith('charset=')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value) {
          blocks.push(
            createBlock({
              content: `文件编码: ${value}`,
              annotation: '偏好 · 代码风格 · 编码',
              source: 'editorconfig',
              filePath,
              metadata: { charset: value },
            })
          );
        }
      }

      // Extract trailing spaces
      if (trimmed.startsWith('trim_trailing_whitespace=')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value === 'true') {
          blocks.push(
            createBlock({
              content: '删除尾随空格',
              annotation: '偏好 · 代码风格 · 格式',
              source: 'editorconfig',
              filePath,
              metadata: { trim_trailing_whitespace: true },
            })
          );
        }
      }
    }
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'editorconfig',
  path: '.editorconfig',
  priority: 70,
  timeout: 500,
  extractor: async (content: string, filePath: string) => {
    if (!content) {
      content = (await readFileSafe('.editorconfig')) || '';
    }
    return extractEditorconfig(content, filePath);
  },
};

export default { source, extractEditorconfig };
