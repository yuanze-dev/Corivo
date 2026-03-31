import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const installScriptPath = path.join(repoRoot, 'scripts', 'install.sh');

describe('install.sh entrypoint', () => {
  let tempDir: string;
  let tempHome: string;
  let binDir: string;
  let corivoLogPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-install-entrypoint-'));
    tempHome = path.join(tempDir, 'home');
    binDir = path.join(tempDir, 'bin');
    corivoLogPath = path.join(tempDir, 'corivo.log');

    await fs.mkdir(tempHome, { recursive: true });
    await fs.mkdir(path.join(tempHome, '.cursor'), { recursive: true });
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(path.join(tempHome, '.corivo', 'corivo.db'), '', 'utf8');
    await fs.mkdir(binDir, { recursive: true });

    await fs.writeFile(
      path.join(binDir, 'node'),
      '#!/usr/bin/env bash\necho "v22.0.0"\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(binDir, 'npm'),
      [
        '#!/usr/bin/env bash',
        'set -e',
        'if [ "${1:-}" = "install" ] && [ "${2:-}" = "-g" ]; then',
        '  exit 0',
        'fi',
        'if [ "${1:-}" = "root" ] && [ "${2:-}" = "-g" ]; then',
        '  printf "%s\\n" "$HOME/.npm-global/lib/node_modules"',
        '  exit 0',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(binDir, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.writeFile(path.join(binDir, 'gcc'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.writeFile(path.join(binDir, 'pgrep'), '#!/usr/bin/env bash\nexit 1\n', 'utf8');
    await fs.writeFile(path.join(binDir, 'codex'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.writeFile(
      path.join(binDir, 'cursor'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "agent" ] && [ "${2:-}" = "status" ]; then',
        '  echo "Not logged in"',
        '  exit 0',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(binDir, 'opencode'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "models" ]; then',
        '  exit 1',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(binDir, 'corivo'),
      [
        '#!/usr/bin/env bash',
        'set -e',
        'if [ -n "${CORIVO_LOG:-}" ]; then',
        '  printf "%s\\n" "$*" >> "$CORIVO_LOG"',
        'fi',
        'if [ "${1:-}" = "--version" ]; then',
        '  echo "0.0.0-test"',
        '  exit 0',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
      'utf8',
    );

    const bins = ['node', 'npm', 'python3', 'gcc', 'pgrep', 'codex', 'cursor', 'opencode', 'corivo'];
    await Promise.all(bins.map((name) => fs.chmod(path.join(binDir, name), 0o755)));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not keep host-specific installer helper functions', async () => {
    const content = await fs.readFile(installScriptPath, 'utf8');
    const forbidden = [
      // legacy Claude/Codex manual installers
      'find_claude_dir',
      'install_skills',
      'install_hook_scripts',
      'install_hooks_config',
      'install_codex_plugin_files',
      'install_codex_marketplace',
      'enable_codex_plugins_feature',
      'install_codex_hooks_config',
      'install_codex_plugin',
      // cursor/opencode host-specific manual installers should not exist either
      'install_cursor_host',
      'install_cursor_plugin',
      'install_cursor_hooks',
      'install_opencode_host',
      'install_opencode_plugin',
      'install_opencode_hooks',
    ];

    for (const fnName of forbidden) {
      expect(content).not.toMatch(new RegExp(`\\n${fnName}\\(\\) \\{`));
    }
  });

  it('keeps host detection and inject-driven installation flow', async () => {
    const content = await fs.readFile(installScriptPath, 'utf8');

    expect(content).toContain('detect_hosts');
    expect(content).toContain('corivo inject --global --claude-code');
    expect(content).toContain('corivo inject --global --codex');
    expect(content).toContain('corivo inject --global --cursor');
    expect(content).toContain('corivo inject --global --opencode');
  });

  it('runs CLI flow with detection, inject calls, and summary output', async () => {
    const output = execFileSync(
      'bash',
      [installScriptPath, '--lang', 'en'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: tempHome,
          PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
          CORIVO_LOG: corivoLogPath,
        },
        encoding: 'utf8',
      },
    );
    const corivoLog = await fs.readFile(corivoLogPath, 'utf8');

    expect(output).toContain('[corivo] Installation summary');
    expect(output).toContain('- Codex: ready');
    expect(output).toContain('Codex will now use Corivo active memory automatically');
    expect(output).toContain('- Claude Code: skipped');
    expect(output).toContain('- Cursor: installed, but attention is required');
    expect(output).toContain('Next steps: cursor agent login');
    expect(output).toContain('- OpenCode: installed, but attention is required');
    expect(output).toContain('OpenCode plugin is installed, but you should verify the default provider configuration');
    expect(corivoLog).toContain('inject --global --codex');
    expect(corivoLog).toContain('inject --global --cursor');
    expect(corivoLog).toContain('inject --global --opencode');
    expect(corivoLog).not.toContain('inject --global --claude-code');
  });
});
