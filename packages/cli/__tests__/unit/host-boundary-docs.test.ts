import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('docs boundary consistency', () => {
  it('documents the host/runtime directory model in root docs', () => {
    const readme = readRepoFile('README.md');
    const agents = readRepoFile('AGENTS.md');

    expect(readme).toContain('packages/plugins/hosts/*');
    expect(readme).toContain('packages/plugins/runtime/*');
    expect(readme).toContain('Single Installation Path');

    expect(agents).toContain('packages/plugins/hosts/*');
    expect(agents).toContain('packages/plugins/runtime/*');
    expect(agents).toContain('安装入口保持单一路径');
  });

  it('keeps hosts/runtime index docs and RFC aligned on the OpenCode exception', () => {
    const hostsIndex = readRepoFile('packages/plugins/hosts/README.md');
    const runtimeIndex = readRepoFile('packages/plugins/runtime/README.md');
    const rfc = readRepoFile('docs/rfc/host-integration-asset-boundaries.md');

    expect(hostsIndex).toContain('not CLI asset-backed in this stage');
    expect(hostsIndex).toContain('packages/plugins/runtime/opencode/assets/corivo.ts');

    expect(runtimeIndex).toContain('executable runtime code plugins');
    expect(runtimeIndex).toContain('opencode');

    expect(rfc).toContain('packages/plugins/hosts/opencode');
    expect(rfc).toContain('not CLI asset-backed in this stage');
    expect(rfc).toContain('packages/plugins/runtime/opencode/assets/corivo.ts');
  });

  it('keeps host docs explicitly framed as host integration bundles', () => {
    for (const hostDoc of [
      'packages/plugins/hosts/codex/README.md',
      'packages/plugins/hosts/claude-code/README.md',
      'packages/plugins/hosts/cursor/README.md',
      'packages/plugins/hosts/opencode/README.md',
    ]) {
      const content = readRepoFile(hostDoc);
      expect(content).toContain('host integration bundle');
      expect(content).toContain('Not this package: executable runtime plugin code');
    }
  });

  it('keeps the OpenCode host README explicitly reserved and runtime-asset sourced', () => {
    const content = readRepoFile('packages/plugins/hosts/opencode/README.md');
    expect(content).toContain('not CLI asset-backed in this stage');
    expect(content).toContain('corivo host install opencode');
    expect(content).not.toContain('corivo inject --global --opencode');
    expect(content).toContain('packages/plugins/runtime/opencode/assets/corivo.ts');
  });

  it('keeps runtime docs explicitly framed as runtime plugins', () => {
    for (const runtimeDoc of [
      'packages/plugins/runtime/openclaw/README.md',
      'packages/plugins/runtime/opencode/README.md',
    ]) {
      const content = readRepoFile(runtimeDoc);
      expect(content).toContain('runtime plugin');
      expect(content).toContain('Not this package: host integration bundle assets');
    }
  });
});
