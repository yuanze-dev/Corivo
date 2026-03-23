/**
 * Cold Scan 扫描框架
 * 首次安装时扫描用户本地环境，构建初始画像
 */

import { ScanSource, ScanConfig, DEFAULT_SCAN_CONFIG } from './types.js';
import { shouldSkipPath } from './utils.js';

// 导入所有提取器
import * as gitConfigExtractor from './extractors/git-config.js';
import * as packageJsonExtractor from './extractors/package-json.js';
import * as prettierConfigExtractor from './extractors/prettier-config.js';
import * as editorconfigExtractor from './extractors/editorconfig.js';
import * as dockerComposeExtractor from './extractors/docker-compose.js';
import * as currentProjectExtractor from './extractors/current-project.js';
import * as claudeCodeExtractor from './extractors/claude-code.js';
import * as cursorExtractor from './extractors/cursor.js';
import * as openclawExtractor from './extractors/openclaw.js';

/**
 * 所有扫描源注册表
 */
const SCAN_SOURCES: ScanSource[] = [
  // === 高优先级：当前项目 ===
  currentProjectExtractor.source,

  // === 身份信息 ===
  gitConfigExtractor.source,

  // === 技术偏好 ===
  prettierConfigExtractor.source,
  editorconfigExtractor.source,

  // === 技术栈 ===
  packageJsonExtractor.source,
  dockerComposeExtractor.source,

  // === AI 工具配置 ===
  claudeCodeExtractor.source,
  cursorExtractor.source,
  openclawExtractor.source,
  // 更多提取器待添加...
];

/**
 * 执行单个扫描源
 */
async function scanSource(
  source: ScanSource,
  config: ScanConfig
): Promise<{ blocks: Record<string, unknown>[]; success: boolean; error?: string }> {
  // 检查是否跳过
  if (config.skipSources.includes(source.name)) {
    if (config.verbose) {
      console.log(`  ⊝ 跳过: ${source.name}`);
    }
    return { blocks: [], success: true };
  }

  try {
    // 获取要扫描的文件路径
    const paths =
      typeof source.path === 'function'
        ? await source.path()
        : [source.path];

    const allBlocks: Record<string, unknown>[] = [];

    for (const filePath of paths) {
      // 安全检查
      if (shouldSkipPath(filePath)) {
        if (config.verbose) {
          console.log(`  ⊝ 跳过敏感文件: ${filePath}`);
        }
        continue;
      }

      // 读取文件内容
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8').catch(() => null);

      if (!content) continue;

      // 超时控制
      const timeoutPromise = new Promise<Record<string, unknown>[]>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), source.timeout);
      });

      // 执行提取
      const blocks = await Promise.race([
        source.extractor(content, filePath) as Promise<Record<string, unknown>[]>,
        timeoutPromise,
      ]);

      if (blocks) {
        allBlocks.push(...blocks);
      }
    }

    return { blocks: allBlocks, success: true };
  } catch (error) {
    return {
      blocks: [],
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 执行 Cold Scan
 */
export async function coldScan(config: Partial<ScanConfig> = {}): Promise<{
  blocks: Record<string, unknown>[];
  results: Array<{ source: string; count: number; success: boolean; error?: string }>;
  totalScanned: number;
  totalFound: number;
}> {
  const finalConfig = { ...DEFAULT_SCAN_CONFIG, ...config };
  const startTime = Date.now();

  console.log('[corivo] 正在扫描你的工作环境...');

  // 按优先级排序
  const sortedSources = [...SCAN_SOURCES].sort((a, b) => b.priority - a.priority);

  const allBlocks: Record<string, unknown>[] = [];
  const results: Array<{
    source: string;
    count: number;
    success: boolean;
    error?: string;
  }> = [];

  let totalScanned = 0;
  let totalFound = 0;

  for (const source of sortedSources) {
    // 检查总超时
    if (Date.now() - startTime > finalConfig.totalTimeout) {
      console.log(`[corivo] 扫描超时，已发现 ${totalFound} 条信息`);
      break;
    }

    const result = await scanSource(source, finalConfig);
    totalScanned++;

    if (result.success) {
      allBlocks.push(...result.blocks);
      totalFound += result.blocks.length;

      if (result.blocks.length > 0) {
        console.log(`  ✔ ${source.name}: 发现 ${result.blocks.length} 条信息`);
      }
    } else {
      console.log(`  ✖ ${source.name}: ${result.error || '失败'}`);
    }

    results.push({
      source: source.name,
      count: result.blocks.length,
      success: result.success,
      error: result.error,
    });
  }

  console.log(`[corivo] 扫描完成，共发现 ${totalFound} 条信息`);

  // 注意：数据库保存由调用方处理（如 init 命令）
  // 这里只返回扫描结果

  return {
    blocks: allBlocks,
    results,
    totalScanned,
    totalFound,
  };
}

/**
 * 获取所有已注册的扫描源
 */
export function getRegisteredSources(): ScanSource[] {
  return [...SCAN_SOURCES];
}

/**
 * 注册新的扫描源
 */
export function registerSource(source: ScanSource): void {
  SCAN_SOURCES.push(source);
}

// 导出类型和工具
export * from './types.js';
export * from './utils.js';
