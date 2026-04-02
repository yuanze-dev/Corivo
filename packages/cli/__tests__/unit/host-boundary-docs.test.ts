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
  it('documents the plugin-root directory model in root docs', () => {
    const readme = readRepoFile('README.md');
    const agents = readRepoFile('AGENTS.md');

    expect(readme).toContain('packages/plugins/<plugin>');
    expect(readme).toContain('Single Installation Path');

    expect(agents).toContain('packages/plugins/<plugin>');
    expect(agents).toContain('安装入口保持单一路径');
  });

  it('keeps plugin docs and RFC aligned on the OpenCode install asset path', () => {
    const pluginsIndex = readRepoFile('packages/plugins/README.md');
    const opencodeReadme = readRepoFile('packages/plugins/opencode/README.md');
    const rfc = readRepoFile('docs/rfc/host-integration-asset-boundaries.md');

    expect(pluginsIndex).toContain('packages/plugins/opencode');
    expect(pluginsIndex).toContain('assets/corivo.ts');

    expect(opencodeReadme).toContain('packages/plugins/opencode/assets/corivo.ts');
    expect(opencodeReadme).toContain('plugin root');

    expect(rfc).toContain('packages/plugins/<plugin>');
    expect(rfc).toContain('packages/plugins/opencode/assets/corivo.ts');
  });

  it('keeps asset-oriented plugin docs explicitly framed as plugin roots', () => {
    for (const hostDoc of [
      'packages/plugins/codex/README.md',
      'packages/plugins/claude-code/README.md',
      'packages/plugins/cursor/README.md',
    ]) {
      const content = readRepoFile(hostDoc);
      expect(content).toContain('Plugin root');
      expect(content).toContain('Internal scope');
    }
  });

  it('keeps the OpenCode plugin README explicitly mixed and install-asset sourced', () => {
    const content = readRepoFile('packages/plugins/opencode/README.md');
    expect(content).toContain('corivo host install opencode');
    expect(content).toContain('packages/plugins/opencode/assets/corivo.ts');
    expect(content).toContain('src/');
  });

  it('keeps code-oriented plugin docs explicitly framed as runtime code holders', () => {
    for (const runtimeDoc of [
      'packages/plugins/openclaw/README.md',
      'packages/plugins/opencode/README.md',
    ]) {
      const content = readRepoFile(runtimeDoc);
      expect(content).toContain('Plugin root');
      expect(content).toContain('runtime');
    }
  });
});
