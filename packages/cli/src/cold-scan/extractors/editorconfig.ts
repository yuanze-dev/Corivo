/**
 * EditorConfig 提取器
 * 提取编辑器配置偏好
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

    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 检测 section
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // 只处理全局配置 (*) 和特定语言配置
    if (currentSection === '*' || currentSection.startsWith('*.')) {
      // 提取缩进风格
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

      // 提取缩进大小
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

      // 提取换行符
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

      // 提取编码
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

      // 提取尾随空格
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
