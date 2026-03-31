/**
 * Cold Scan utility function
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Expand ~ in the path to the user’s home directory
 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Check if the file exists
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
 * Read file contents (ignoring non-existent files)
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
 * Read JSON file (ignoring parsing errors)
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
 * Find files in the current directory and the parent directory
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
      break; // Reach root directory
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Find files in the user's home directory (multiple locations supported)
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
 * Find files using glob
 */
export async function globFiles(
  pattern: string,
  options: { cwd?: string; maxResults?: number } = {}
): Promise<string[]> {
  const { cwd: cwdPath = os.homedir(), maxResults = 100 } = options;

  try {
    // Simple implementation: use find command (macOS/Linux)
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
 * Get recently modified Git projects
 */
export async function getRecentGitProjects(maxCount = 10): Promise<string[]> {
  const projects: string[] = [];

  try {
    // Try looking from common development directories
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
    // ignore errors
  }

  return projects.slice(0, maxCount);
}

/**
 * Safe paths: Sensitive file paths that are never scanned
 */
export const NEVER_SCAN_PATTERNS = [
  // Common sensitive documents
  '**/.ssh/id_*',
  '**/.ssh/keys/*',
  '**/.aws/credentials',
  '**/.aws/config',
  '**/.env*',
  '**/.secrets',
  '**/.vault*',
  '**/node_modules/**',
  '**/.git/objects/**',
  '**/.git/config', // May contain credentials
  '**/secret*',
  '**/password*',
  '**/token*',
  '**/*key*.pem',
  '**/*key*.key',
  '**/*.p12',
  '**/*.pfx',

  // AI Tool Credentials
  '**/.claude/.credentials.json',
  '**/.config/claude/.credentials.json',
  '**/.claude/sessions/**',
  '**/.config/claude/sessions/**',
  '**/.claude/projects/**',
  '**/.config/claude/projects/**',
  '**/.codex/auth.json',
  '**/.codex/sessions/**',
  '**/.openai/auth.json',

  // Other sensitive configuration
  '**/.npmrc',
  '**/.yarnrc',
  '**/.netrc',
  '**/.s3cfg',
];

/**
 * Check if path should be skipped
 */
export function shouldSkipPath(filePath: string): boolean {
  const expanded = expandHome(filePath);

  // Simple pattern matching (not supported **)
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
 * Helper functions for creating blocks
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

  // Simplified block object with complete fields completed on save
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
