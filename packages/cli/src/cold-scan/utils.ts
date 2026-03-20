/**
 * Cold Scan 工具函数
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * 展开路径中的 ~ 为用户主目录
 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取文件内容（忽略不存在的文件）
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const expanded = expandHome(filePath);
    return await fs.readFile(expanded, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 读取 JSON 文件（忽略解析错误）
 */
export async function readJsonSafe<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await readFileSafe(filePath);
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * 在当前目录及上级目录查找文件
 */
export async function findFileInParents(
  fileName: string,
  maxLevels = 5
): Promise<string | null> {
  let currentDir = process.cwd();

  for (let i = 0; i < maxLevels; i++) {
    const filePath = path.join(currentDir, fileName);
    if (await fileExists(filePath)) {
      return filePath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // 到达根目录
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * 查找用户主目录下的文件（支持多个位置）
 */
export async function findFilesInHome(patterns: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const pattern of patterns) {
    const expanded = expandHome(pattern);
    if (await fileExists(expanded)) {
      results.push(expanded);
    }
  }

  return results;
}

/**
 * 使用 glob 查找文件
 */
export async function globFiles(
  pattern: string,
  options: { cwd?: string; maxResults?: number } = {}
): Promise<string[]> {
  const { cwd: cwdPath = os.homedir(), maxResults = 100 } = options;

  try {
    // 简单实现：使用 find 命令（macOS/Linux）
    const results = execSync(
      `find "${cwdPath}" -name "${pattern}" -type f 2>/dev/null | head -n ${maxResults}`,
      { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
    );

    return results
      .split('\n')
      .filter(Boolean)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

/**
 * 获取最近修改的 Git 项目
 */
export async function getRecentGitProjects(maxCount = 10): Promise<string[]> {
  const projects: string[] = [];

  try {
    // 尝试从常见的开发目录查找
    const devDirs = [
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Projects'),
      path.join(os.homedir(), 'Workspace'),
      path.join(os.homedir(), 'src'),
      path.join(os.homedir(), 'code'),
    ];

    for (const devDir of devDirs) {
      try {
        if (!(await fileExists(devDir))) continue;

        const results = execSync(
          `find "${devDir}" -maxdepth 3 -name '.git' -type d 2>/dev/null | head -n ${maxCount}`,
          { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
        );

        for (const line of results.split('\n').filter(Boolean)) {
          const projectDir = path.dirname(line);
          projects.push(projectDir);
        }
      } catch {
        continue;
      }

      if (projects.length >= maxCount) break;
    }
  } catch {
    // 忽略错误
  }

  return projects.slice(0, maxCount);
}

/**
 * 安全路径：永不扫描的敏感文件路径
 */
export const NEVER_SCAN_PATTERNS = [
  // 通用敏感文件
  '**/.ssh/id_*',
  '**/.ssh/keys/*',
  '**/.aws/credentials',
  '**/.aws/config',
  '**/.env*',
  '**/.secrets',
  '**/.vault*',
  '**/node_modules/**',
  '**/.git/objects/**',
  '**/.git/config', // 可能包含凭证
  '**/secret*',
  '**/password*',
  '**/token*',
  '**/*key*.pem',
  '**/*key*.key',
  '**/*.p12',
  '**/*.pfx',

  // AI 工具凭证
  '**/.claude/.credentials.json',
  '**/.config/claude/.credentials.json',
  '**/.claude/sessions/**',
  '**/.config/claude/sessions/**',
  '**/.claude/projects/**',
  '**/.config/claude/projects/**',
  '**/.codex/auth.json',
  '**/.codex/sessions/**',
  '**/.openai/auth.json',

  // 其他敏感配置
  '**/.npmrc',
  '**/.yarnrc',
  '**/.netrc',
  '**/.s3cfg',
];

/**
 * 检查路径是否应该被跳过
 */
export function shouldSkipPath(filePath: string): boolean {
  const expanded = expandHome(filePath);

  // 简单模式匹配（不支持 **）
  const skipPatterns = NEVER_SCAN_PATTERNS.filter(p => !p.includes('**'));

  for (const pattern of skipPatterns) {
    const regexPattern = pattern
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    const regex = new RegExp(regexPattern);

    if (regex.test(expanded) || regex.test(path.basename(expanded))) {
      return true;
    }
  }

  return false;
}

/**
 * 创建 block 的辅助函数
 */
export interface CreateBlockOptions {
  content: string;
  annotation: string;
  source?: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}

export function createBlock(options: CreateBlockOptions) {
  const { content, annotation, source, filePath, metadata = {} } = options;

  // 简化的 block 对象，在保存时会补全完整字段
  return {
    content,
    annotation,
    source: source || 'cold-scan',
    vitality: 1.0,
    status: 'pending',
    metadata: {
      ...metadata,
      scan_source: source,
      scan_path: filePath,
      scanned_at: new Date().toISOString(),
    },
  };
}
