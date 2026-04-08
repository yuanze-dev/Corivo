import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

type ImportHit = {
  file: string;
  specifier: string;
};

describe('module boundaries baseline', () => {
  it('keeps module boundary doc present with required rules', () => {
    const docPath = path.join(repoRoot, 'docs/architecture/module-boundaries-2026-04.md');
    expect(existsSync(docPath)).toBe(true);

    const content = readFileSync(docPath, 'utf8');
    expect(content).toContain('cli -> application -> domain');
    expect(content).toContain('application -> infrastructure');
    expect(content).toContain('runtime -> application / domain / infrastructure');
    expect(content).toContain('infrastructure -> domain');
    expect(content).toContain('domain -> infrastructure');
    expect(content).toContain('domain -> cli');
    expect(content).toContain('application -> runtime');
    expect(content).toContain('engine/');
    expect(content).toContain('storage/');
    expect(content).toContain('`service/`');
    expect(content).toContain('`hosts/`');
    expect(content).toContain('`models/`');
    expect(content).toContain('`type/`');
    expect(content).toContain('都不应在顶层重新出现');
    expect(content).toContain('memory-pipeline/');
    expect(content).toContain('packages/plugins/*/hooks/scripts/*.sh');
  });

  it('keeps the de-monolith architecture spec present with the phase 1 baseline', () => {
    const docPath = path.join(repoRoot, 'docs/architecture/cli-de-monolith-layering-plan-2026-04.md');
    expect(existsSync(docPath)).toBe(true);

    const content = readFileSync(docPath, 'utf8');
    expect(content).toContain('Phase 1：建立唯一有效的层语义');
    expect(content).toContain('cli/');
    expect(content).toContain('application/');
    expect(content).toContain('domain/');
    expect(content).toContain('infrastructure/');
    expect(content).toContain('runtime/');
    expect(content).toContain('memory-pipeline/');
    expect(content).toContain('Layer Ownership Snapshot');
    expect(content).toContain('只保留');
  });

  it('keeps per-layer readmes present', () => {
    const layerReadmes = [
      'packages/cli/src/application/README.md',
      'packages/cli/src/domain/README.md',
      'packages/cli/src/infrastructure/README.md',
      'packages/cli/src/runtime/README.md',
    ];

    for (const relativePath of layerReadmes) {
      const absolutePath = path.join(repoRoot, relativePath);
      expect(existsSync(absolutePath)).toBe(true);
      const content = readFileSync(absolutePath, 'utf8');
      expect(content).toContain('负责什么');
      expect(content).toContain('不负责什么');
      expect(content).toContain('常见误放');
    }
  });

  it('forbids application imports from cli runtime modules', () => {
    const allowedCompositionRoots = new Set([
      'packages/cli/src/application/bootstrap/create-cli-app.ts',
    ]);
    const hits = collectImports(['packages/cli/src/application'])
      .filter((entry) => includesPathPair(entry.specifier, 'cli', 'runtime'))
      .filter((entry) => !allowedCompositionRoots.has(entry.file));

    expect(hits).toEqual([]);
  });

  it('forbids memory-pipeline imports from cli modules', () => {
    const hits = collectImports(['packages/cli/src/memory-pipeline']).filter((entry) =>
      includesPathSegment(entry.specifier, 'cli'),
    );

    expect(hits).toEqual([]);
  });

  it('enforces plugin hooks scripts to delegate through CLI only', () => {
    const scriptFiles = listShellScripts(path.join(repoRoot, 'packages/plugins'));
    expect(scriptFiles.length).toBeGreaterThan(0);

    for (const scriptPath of scriptFiles) {
      const source = readFileSync(scriptPath, 'utf8');
      const relativePath = path.relative(repoRoot, scriptPath);

      // Must delegate to corivo CLI.
      expect(source).toMatch(/\bcorivo\b/);

      // Hooks should not run internal source entrypoints directly.
      expect(source).not.toMatch(/\b(node|npm|pnpm|tsx|ts-node)\b[^\n]*\b(src|dist)\//);
      // Hooks should not directly encode SQL/business storage logic.
      expect(source).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|sqlite3?|better-sqlite3)\b/i);

      expect(relativePath).toMatch(/^packages\/plugins\/[^/]+\/hooks\/scripts\/.+\.sh$/);
    }
  });
});

function collectImports(targets: string[]): ImportHit[] {
  const files = targets.flatMap((target) => listTsFiles(path.join(repoRoot, target)));
  return files.flatMap(scanImports);
}

function listTsFiles(targetPath: string): string[] {
  if (!existsSync(targetPath)) {
    return [];
  }

  const stat = statSync(targetPath);
  if (stat.isFile()) {
    return isTsFile(targetPath) ? [targetPath] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(targetPath)) {
    files.push(...listTsFiles(path.join(targetPath, entry)));
  }

  return files;
}

function isTsFile(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts');
}

function scanImports(absoluteFilePath: string): ImportHit[] {
  const source = readFileSync(absoluteFilePath, 'utf8');
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const file = path.relative(repoRoot, absoluteFilePath);

  const hits: ImportHit[] = [];
  for (const match of source.matchAll(importRegex)) {
    hits.push({ file, specifier: match[1] });
  }
  for (const match of source.matchAll(dynamicImportRegex)) {
    hits.push({ file, specifier: match[1] });
  }

  return hits;
}

function includesPathSegment(specifier: string, segment: string): boolean {
  return splitSpecifierPath(specifier).includes(segment);
}

function includesPathPair(specifier: string, first: string, second: string): boolean {
  const segments = splitSpecifierPath(specifier);
  return segments.some((segment, index) => segment === first && segments[index + 1] === second);
}

function splitSpecifierPath(specifier: string): string[] {
  return specifier
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/^\.+$/, ''));
}

function listShellScripts(targetPath: string): string[] {
  if (!existsSync(targetPath)) {
    return [];
  }

  const stat = statSync(targetPath);
  if (stat.isFile()) {
    return targetPath.endsWith('.sh') ? [targetPath] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(targetPath)) {
    files.push(...listShellScripts(path.join(targetPath, entry)));
  }

  return files.filter((filePath) => filePath.includes('/hooks/scripts/'));
}

function uniqueImportHits(hits: ImportHit[]): ImportHit[] {
  const seen = new Set<string>();
  const uniqueHits: ImportHit[] = [];

  for (const hit of hits) {
    const key = `${hit.file}:${hit.specifier}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueHits.push(hit);
  }

  return uniqueHits;
}
