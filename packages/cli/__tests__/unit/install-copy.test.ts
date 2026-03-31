import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstallTestEnv, installScriptPath } from './installTestUtils';

describe('installer copy', () => {
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
    PATH: `${tempEnv.binDir}:${process.env.PATH}`,
    ...overrides,
  });

  it('asks for language once and defaults unmatched locales to English', () => {
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
    expect(promptMatches).toHaveLength(1);
    expect(output).toContain('English (default)');
    expect(output).toContain('Language confirmed: English');
  });

  it('produces a structured diagnostic summary with STEP_ID and STEP_NAME metadata', async () => {
    const diagPath = path.join(tempEnv.tempHome, '.corivo', 'install-diagnostic.txt');
    const output = execFileSync(
      '/bin/bash',
      [installScriptPath, '--lang', 'en'],
      {
        cwd: installScriptPath ? tempEnv.tempDir : tempEnv.tempDir,
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
