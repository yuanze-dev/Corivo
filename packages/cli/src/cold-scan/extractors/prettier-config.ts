/**
 * Prettier Config 提取器
 * 提取代码风格偏好
 */

import { readFileSafe, expandHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';

async function extractPrettierConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    // 可能是 JSON 或 JS 文件
    let config: Record<string, unknown> = {};

    if (filePath.endsWith('.js') || filePath.endsWith('.cjs')) {
      // JS 配置文件，尝试简单提取（不执行代码）
      // 提取常见的键值对
      const matches = content.match(/(\w+):\s*(['"`])(.+?)\2/g);
      if (matches) {
        for (const match of matches) {
          const [, key, , value] = match.match(/(\w+):\s*(['"`])(.+?)\2/) || [];
          if (key && value) {
            config[key] = value;
          }
        }
      }
    } else {
      // JSON 配置文件
      config = JSON.parse(content);
    }

    // 提取缩进风格
    if (config.tabWidth !== undefined) {
      const tabWidthStr =
        config.useTabs === true
          ? 'Tab 缩进'
          : `${config.tabWidth} 空格缩进`;
      blocks.push(
        createBlock({
          content: tabWidthStr,
          annotation: '偏好 · 代码风格 · 缩进',
          source: 'prettier-config',
          filePath,
          metadata: { tabWidth: config.tabWidth, useTabs: config.useTabs },
        })
      );
    }

    // 提取引号偏好
    if (config.singleQuote !== undefined) {
      const quoteStyle = config.singleQuote === true ? '单引号' : '双引号';
      blocks.push(
        createBlock({
          content: quoteStyle,
          annotation: '偏好 · 代码风格 · 引号',
          source: 'prettier-config',
          filePath,
          metadata: { singleQuote: config.singleQuote },
        })
      );
    }

    // 提取分号偏好
    if (config.semi !== undefined) {
      const semiStr = config.semi === true ? '使用分号' : '不使用分号';
      blocks.push(
        createBlock({
          content: semiStr,
          annotation: '偏好 · 代码风格 · 分号',
          source: 'prettier-config',
          filePath,
          metadata: { semi: config.semi },
        })
      );
    }

    // 提取尾随逗号
    if (config.trailingComma !== undefined && config.trailingComma !== 'none') {
      blocks.push(
        createBlock({
          content: `尾随逗号: ${config.trailingComma}`,
          annotation: '偏好 · 代码风格 · 尾随逗号',
          source: 'prettier-config',
          filePath,
          metadata: { trailingComma: config.trailingComma },
        })
      );
    }
  } catch {
    // 解析失败，跳过
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'prettier-config',
  path: async () => {
    // 查找多个可能的位置
    const paths = [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.yaml',
      '.prettierrc.yml',
      '.prettierrc.js',
      '.prettierrc.cjs',
      'prettier.config.js',
      'prettier.config.cjs',
    ];

    const results: string[] = [];

    // 先检查当前目录
    for (const p of paths) {
      try {
        const { existsSync } = await import('fs');
        if (existsSync(p)) {
          results.push(p);
        }
      } catch {
        continue;
      }
    }

    // 检查全局配置
    const globalConfig = `~/.prettierrc`;
    try {
      const { existsSync } = await import('fs');
      if (existsSync(expandHome(globalConfig))) {
        results.push(globalConfig);
      }
    } catch {
      // ignore
    }

    return results;
  },
  priority: 80,
  timeout: 500,
  extractor: async (content: string, filePath: string) => {
    if (!content) {
      content = (await readFileSafe(filePath)) || '';
    }
    return extractPrettierConfig(content, filePath);
  },
};

export default { source, extractPrettierConfig };
