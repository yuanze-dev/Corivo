import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstallTestEnv, installScriptPath } from './installTestUtils';

describe('install.sh entrypoint', () => {
  let tempEnv: Awaited<ReturnType<typeof createInstallTestEnv>>;

  beforeEach(async () => {
    tempEnv = await createInstallTestEnv();
  });

  afterEach(async () => {
    await tempEnv.cleanup();
  });

  const baseEnv = (overrides: Record<string, string> = {}) => ({
    ...process.env,
    HOME: tempEnv.tempHome,
    PATH: `${tempEnv.binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
    ...overrides,
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
        cwd: path.dirname(installScriptPath),
        env: baseEnv({ CORIVO_LOG: tempEnv.corivoLogPath }),
        encoding: 'utf8',
      },
    );
    const corivoLog = await fs.readFile(tempEnv.corivoLogPath, 'utf8');

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

  it('promises the guided journey with the stage flow, warm-up consent, and activation ending', async () => {
    const output = execFileSync(
      'bash',
      [installScriptPath, '--lang', 'en'],
      {
        cwd: path.dirname(installScriptPath),
        env: baseEnv({ CORIVO_LOG: tempEnv.corivoLogPath }),
        input: '1\n',
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Preparing your machine');
    expect(output).toContain('Connecting your AI tools');
    expect(output).toContain('Starting Corivo');
    expect(output).toContain('Warming up with local context');
    expect(output).toContain('This stays on your device');
    expect(output).toContain('Corivo is ready to work with you.');
    expect(output).toContain('Corivo can get ready faster by learning from your recent local context');
    expect(output).toContain('Continue');
    expect(output).toContain('Skip for now');
  });

  it('diverges when the user continues or skips the warm-up consent', async () => {
    const runWithChoice = (choice: number) => execFileSync(
      'bash',
      [installScriptPath, '--lang', 'en'],
      {
        cwd: path.dirname(installScriptPath),
        env: baseEnv({ CORIVO_LOG: tempEnv.corivoLogPath }),
        input: `1\n${choice}\n`,
        encoding: 'utf8',
      },
    );

    const continueOutput = runWithChoice(1);
    const skipOutput = runWithChoice(2);

    expect(continueOutput).toContain('Warming up with local context');
    expect(skipOutput).toContain('Warm-up skipped');
    expect(skipOutput).toContain('You can always warm up later');
  });
});
