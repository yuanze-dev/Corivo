import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const pluginsRoot = path.join(repoRoot, 'packages/plugins');
const pluginRoots = ['claude-code', 'codex', 'cursor', 'openclaw', 'opencode'];

describe('plugin package layout topology', () => {
  it('keeps plugin packages at packages/plugins/<plugin>', () => {
    for (const pluginRoot of pluginRoots) {
      expect(existsSync(path.join(pluginsRoot, pluginRoot))).toBe(true);
    }
  });

  it('does not depend on hosts/runtime top-level buckets', () => {
    expect(existsSync(path.join(pluginsRoot, 'hosts'))).toBe(false);
    expect(existsSync(path.join(pluginsRoot, 'runtime'))).toBe(false);
  });

  it('keeps root tsconfig project references free of deleted plugin paths', () => {
    const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
      references?: Array<{ path: string }>;
    };
    const references = (tsconfig.references ?? []).map((entry) => entry.path);

    for (const pluginRoot of pluginRoots) {
      expect(references).not.toContain(`./packages/plugins/${pluginRoot}`);
    }
  });

  it('keeps lockfile importers aligned with moved plugin layout', () => {
    const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
    const lockfile = readFileSync(lockfilePath, 'utf8');

    for (const importer of [
      'packages/plugins/claude-code',
      'packages/plugins/codex',
      'packages/plugins/cursor',
      'packages/plugins/openclaw',
      'packages/plugins/opencode',
    ]) {
      expect(lockfile).toMatch(new RegExp(`\\n  ${escapeForRegex(importer)}:`));
    }

    expect(lockfile).not.toMatch(/\n  packages\/plugins\/hosts\//);
    expect(lockfile).not.toMatch(/\n  packages\/plugins\/runtime\//);
  });
});

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
