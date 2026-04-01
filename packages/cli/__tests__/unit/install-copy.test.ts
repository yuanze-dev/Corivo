import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstallTestEnv, installScriptPath, repoRoot } from './installTestUtils';

describe('installer copy', () => {
  let tempEnv: Awaited<ReturnType<typeof createInstallTestEnv>>;
  const installLibPath = path.join(repoRoot, 'scripts', 'install-lib.sh');

  beforeEach(async () => {
    tempEnv = await createInstallTestEnv();
  });

  afterEach(async () => {
    await tempEnv.cleanup();
  });

  const baseEnv = (overrides: Record<string, string> = {}) => ({
    ...process.env,
    HOME: tempEnv.tempHome,
    PATH: `${tempEnv.binDir}:${process.env.PATH}`,
    ...overrides,
  });

  const getMessage = (key: string, lang: string) => execFileSync(
    '/bin/bash',
    ['-lc', `source "${installLibPath}"; get_message "${key}" "${lang}"`],
    {
      cwd: path.dirname(installScriptPath),
      env: baseEnv(),
      encoding: 'utf8',
    },
  ).trim();

  it('defaults unmatched locales to English without prompting in non-interactive mode', () => {
    const output = execFileSync(
      '/bin/bash',
      [installScriptPath],
      {
        cwd: path.dirname(installScriptPath),
        env: baseEnv({ LANG: 'fr_FR.UTF-8' }),
        input: '\n',
        encoding: 'utf8',
      },
    );

    const promptMatches = output.match(/Choose your language/g) ?? [];
    expect(promptMatches).toHaveLength(0);
    expect(output).toContain('Corivo Installer');
  });

  it('exposes staged copy and warm-up safety messaging', () => {
    expect(getMessage('stage_prepare', 'en')).toBe('Preparing your machine');
    expect(getMessage('stage_warmup', 'en')).toBe('Warming up with local context');
    expect(getMessage('status_attention', 'en')).toBe('Needs attention');
    expect(getMessage('warmup_safety', 'en')).toContain('stays on your device');
  });

  it('produces a structured diagnostic summary with STEP_ID and STEP_NAME metadata', async () => {
    const diagPath = path.join(tempEnv.tempHome, '.corivo', 'install-diagnostic.txt');
    const output = execFileSync(
      '/bin/bash',
      [installScriptPath, '--lang', 'en'],
      {
        cwd: path.dirname(installScriptPath),
        env: baseEnv(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Diagnostic summary:');
    const diagnostic = await fs.readFile(diagPath, 'utf8');
    expect(diagnostic).toContain('STEP_ID=');
    expect(diagnostic).toContain('STEP_NAME=');
    expect(diagnostic).toContain('RAW_ERROR=');
  });
});
