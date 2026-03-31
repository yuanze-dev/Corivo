import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const pluginsRoot = path.join(repoRoot, 'packages/plugins');
const oldPluginPaths = [
  'packages/plugins/claude-code',
  'packages/plugins/codex',
  'packages/plugins/cursor',
  'packages/plugins/openclaw',
  'packages/plugins/opencode',
];

describe('plugin package layout topology', () => {
  it('keeps host asset directories under packages/plugins/hosts', () => {
    const hostsRoot = path.join(pluginsRoot, 'hosts');
    expect(existsSync(hostsRoot)).toBe(true);

    for (const host of ['claude-code', 'codex', 'cursor', 'opencode']) {
      expect(existsSync(path.join(hostsRoot, host))).toBe(true);
    }
  });

  it('keeps runtime code plugins under packages/plugins/runtime', () => {
    const runtimeRoot = path.join(pluginsRoot, 'runtime');
    expect(existsSync(runtimeRoot)).toBe(true);

    for (const runtimePlugin of ['openclaw', 'opencode']) {
      expect(existsSync(path.join(runtimeRoot, runtimePlugin))).toBe(true);
    }
  });

  it('does not keep runtime code plugins at packages/plugins top-level', () => {
    for (const runtimePlugin of ['openclaw', 'opencode']) {
      expect(existsSync(path.join(pluginsRoot, runtimePlugin))).toBe(false);
    }
  });

  it('keeps root tsconfig project references free of deleted plugin paths', () => {
    const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
      references?: Array<{ path: string }>;
    };
    const references = (tsconfig.references ?? []).map((entry) => entry.path);

    for (const oldPath of oldPluginPaths) {
      expect(references).not.toContain(`./${oldPath}`);
    }
  });

  it('keeps lockfile importers aligned with moved plugin layout', () => {
    const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
    const lockfile = readFileSync(lockfilePath, 'utf8');

    for (const importer of [
      'packages/plugins/hosts/claude-code',
      'packages/plugins/hosts/codex',
      'packages/plugins/hosts/cursor',
      'packages/plugins/runtime/openclaw',
      'packages/plugins/runtime/opencode',
    ]) {
      expect(lockfile).toMatch(new RegExp(`\\n  ${escapeForRegex(importer)}:`));
    }

    for (const oldPath of oldPluginPaths) {
      expect(lockfile).not.toMatch(new RegExp(`\\n  ${escapeForRegex(oldPath)}:`));
    }
  });
});

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
