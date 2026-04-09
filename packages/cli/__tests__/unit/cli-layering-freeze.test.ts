import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const cliSrcRoot = path.join(repoRoot, 'packages/cli/src');

type ImportHit = {
  file: string;
  specifier: string;
};

const ALLOWED_STORAGE_HELPER_FACADE_IMPORTS = new Set<string>([
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts:@/infrastructure/storage/facade/database',
]);

const ALLOWED_DIRECT_DATABASE_SINGLETON_CALLERS = new Set<string>([
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts',
  'packages/cli/src/infrastructure/storage/lifecycle/database.ts',
]);

const APPROVED_TOP_LEVEL_DIRECTORIES = [
  'application',
  'cli',
  'domain',
  'infrastructure',
  'runtime',
] as const;

const FROZEN_DIRECTORIES: string[] = [];

const ALLOWED_CROSS_LAYER_IMPORTS = new Set<string>([
  'packages/cli/src/domain/memory/models/index.ts:@/runtime/types.js',
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts:@/infrastructure/storage/facade/database',
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts:@/runtime/memory-index.js',
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts:@/runtime/runtime-support.js',
  'packages/cli/src/domain/memory/providers/local-memory-provider.ts:@/runtime/conflict-detection.js',
  'packages/cli/src/domain/memory/providers/supermemory-provider.ts:@/runtime/types.js',
  'packages/cli/src/domain/memory/providers/types.ts:@/runtime/types.js',
  'packages/cli/src/domain/memory/services/follow-up.ts:@/runtime/follow-up-retrieval.js',
  'packages/cli/src/domain/memory/services/follow-up.ts:@/runtime/follow-up-render.js',
  'packages/cli/src/domain/memory/services/query-history.ts:@/runtime/query-pack.js',
  'packages/cli/src/domain/memory/services/query-history.ts:@/runtime/query-history-policy.js',
  'packages/cli/src/domain/memory/services/query-history.ts:@/runtime/query-history-store.js',
  'packages/cli/src/domain/memory/services/trigger-decision.ts:@/runtime/trigger-decision.js',
  'packages/cli/src/domain/memory/services/trigger-decision.ts:@/runtime/trigger-decision-render.js',
  'packages/cli/src/domain/memory/services/trigger-decision.ts:@/runtime/scoring.js',
  'packages/cli/src/application/bootstrap/query-execution.ts:@/runtime/query-history.js',
  'packages/cli/src/application/bootstrap/query-execution.ts:@/cli/presenters/query-renderer.js',
  'packages/cli/src/application/bootstrap/query-execution.ts:@/runtime/runtime-support',
  'packages/cli/src/application/carry-over/run-carry-over.ts:@/runtime/types.js',
  'packages/cli/src/application/carry-over/run-carry-over.ts:@/runtime/scoring.js',
  'packages/cli/src/application/hosts/bridge-host-event.ts:../../runtime/host-bridge-policy.js',
  'packages/cli/src/application/query/generate-raw-recall.ts:@/runtime/types.js',
  'packages/cli/src/application/query/generate-recall.ts:@/runtime/memory-index.js',
  'packages/cli/src/application/query/generate-recall.ts:@/runtime/types.js',
  'packages/cli/src/application/query/generate-recall.ts:@/runtime/scoring.js',
  'packages/cli/src/application/query/provider-recall.ts:@/runtime/types.js',
  'packages/cli/src/application/review/heartbeat-first-run.ts:@/runtime/daemon/heartbeat.js',
  'packages/cli/src/application/review/run-review.ts:@/runtime/types.js',
  'packages/cli/src/application/review/run-review.ts:@/runtime/scoring.js',
]);

describe('cli layering freeze baseline', () => {
  it('keeps the current top-level src directories on the approved list', () => {
    const actual = readdirSync(cliSrcRoot)
      .filter((entry) => statSync(path.join(cliSrcRoot, entry)).isDirectory())
      .sort();

    expect(actual).toEqual([...APPROVED_TOP_LEVEL_DIRECTORIES]);
  });

  it('keeps the frozen bucket directories present for migration only', () => {
    for (const directory of FROZEN_DIRECTORIES) {
      expect(existsSync(path.join(cliSrcRoot, directory))).toBe(true);
    }
  });

  it('does not introduce new forbidden cross-layer imports outside the allowlist', () => {
    const actualHits = [
      ...collectForbiddenImports('domain', ['cli', 'runtime', 'infrastructure']),
      ...collectForbiddenImports('application', ['cli', 'runtime']).filter(
        (entry) => !entry.file.endsWith('application/bootstrap/create-cli-app.ts'),
      ),
      ...collectForbiddenImports('infrastructure', ['cli']),
    ];

    const normalizedHits = uniqueImportHits(actualHits)
      .map((entry) => `${entry.file}:${entry.specifier}`)
      .sort();

    expect(normalizedHits).toEqual([...ALLOWED_CROSS_LAYER_IMPORTS].sort());
  });

  it('keeps storage path helpers imported from infrastructure lifecycle modules instead of the legacy storage facade', () => {
    const sourceFiles = listTsFiles(cliSrcRoot).filter(
      (filePath) => path.relative(cliSrcRoot, filePath) !== 'storage/database.ts',
    );

    const helperImports = sourceFiles.flatMap((filePath) =>
      scanImports(filePath).filter((entry) => {
        if (!entry.specifier.includes('storage/facade/database')) {
          return false;
        }

        const source = readFileSync(path.join(repoRoot, entry.file), 'utf8');
        return new RegExp(
          `import\\s+\\{[^}]*\\b(getConfigDir|getDefaultDatabasePath|getPidFilePath)\\b[^}]*\\}\\s+from\\s+['"]${escapeForRegex(entry.specifier)}['"]`,
          'm',
        ).test(source);
      }),
    );

    const normalizedHelperHits = uniqueImportHits(helperImports).map(
      (entry) => `${entry.file}:${entry.specifier}`,
    );

    expect(normalizedHelperHits).toEqual([...ALLOWED_STORAGE_HELPER_FACADE_IMPORTS]);
  });

  it('keeps direct CorivoDatabase singleton access behind the lifecycle module', () => {
    const directCallers = listTsFiles(cliSrcRoot)
      .filter((filePath) => readFileSync(filePath, 'utf8').includes('CorivoDatabase.getInstance('))
      .map((filePath) => path.relative(repoRoot, filePath))
      .sort();

    expect(directCallers).toEqual([...ALLOWED_DIRECT_DATABASE_SINGLETON_CALLERS].sort());
  });
});

function collectForbiddenImports(
  layer: 'domain' | 'application' | 'infrastructure',
  blockedSegments: string[],
): ImportHit[] {
  const files = listTsFiles(path.join(cliSrcRoot, layer));
  return files.flatMap((filePath) =>
    scanImports(filePath).filter((entry) =>
      blockedSegments.some((segment) => includesPathSegment(entry.specifier, segment)),
    ),
  );
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

function splitSpecifierPath(specifier: string): string[] {
  return specifier
    .split('/')
    .filter(Boolean)
    .map((pathSegment) => pathSegment.replace(/^\.+$/, ''));
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

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
