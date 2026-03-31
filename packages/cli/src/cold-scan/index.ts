/**
 * Cold Scan framework.
 * Scans the user's local environment on first install to build an initial profile.
 */

import { ScanSource, ScanConfig, DEFAULT_SCAN_CONFIG } from './types.js';
import { shouldSkipPath } from './utils.js';

// Import all extractors
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
 * Registry of all scan sources.
 */
const SCAN_SOURCES: ScanSource[] = [
  // === High priority: current project ===
  currentProjectExtractor.source,

  // === Identity information ===
  gitConfigExtractor.source,

  // === Technical preferences ===
  prettierConfigExtractor.source,
  editorconfigExtractor.source,

  // === Tech stack ===
  packageJsonExtractor.source,
  dockerComposeExtractor.source,

  // === AI tool configuration ===
  claudeCodeExtractor.source,
  cursorExtractor.source,
  openclawExtractor.source,
  // More extractors to be added...
];

/**
 * Runs a single scan source and returns its extracted blocks.
 */
async function scanSource(
  source: ScanSource,
  config: ScanConfig
): Promise<{ blocks: Record<string, unknown>[]; success: boolean; error?: string }> {
  // Skip this source if it is on the exclusion list
  if (config.skipSources.includes(source.name)) {
    if (config.verbose) {
      console.log(`  ⊝ 跳过: ${source.name}`);
    }
    return { blocks: [], success: true };
  }

  try {
    // Resolve the file path(s) to scan
    const paths =
      typeof source.path === 'function'
        ? await source.path()
        : [source.path];

    const allBlocks: Record<string, unknown>[] = [];

    for (const filePath of paths) {
      // Security check — skip sensitive paths
      if (shouldSkipPath(filePath)) {
        if (config.verbose) {
          console.log(`  ⊝ 跳过敏感文件: ${filePath}`);
        }
        continue;
      }

      // Read the file contents
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8').catch(() => null);

      if (!content) continue;

      // Enforce per-source timeout
      const timeoutPromise = new Promise<Record<string, unknown>[]>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), source.timeout);
      });

      // Run the extractor, racing against the timeout
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
 * Runs a full cold scan across all registered sources.
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

  // Sort sources by descending priority so higher-priority sources run first
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
    // Abort remaining sources if the total timeout has been exceeded
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

  // Note: persisting blocks to the database is the caller's responsibility (e.g. the init command).
  // This function only returns the raw scan results.

  return {
    blocks: allBlocks,
    results,
    totalScanned,
    totalFound,
  };
}

/**
 * Returns a copy of all registered scan sources.
 */
export function getRegisteredSources(): ScanSource[] {
  return [...SCAN_SOURCES];
}

/**
 * Registers a new scan source.
 */
export function registerSource(source: ScanSource): void {
  SCAN_SOURCES.push(source);
}

// Export types and utilities
export * from './types.js';
export * from './utils.js';
