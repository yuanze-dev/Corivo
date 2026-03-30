import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = '/Users/liuzhengyanshuo/workspace/yuanze/02 研发管理/15-corivo/Corivo';
const installLibPath = path.join(repoRoot, 'scripts', 'install-lib.sh');
const installScriptPath = path.join(repoRoot, 'scripts', 'install.sh');

function bashEval(script: string, env: NodeJS.ProcessEnv = {}) {
  return execFileSync('bash', ['-lc', `source "${installLibPath}"; ${script}`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  }).trim();
}

describe('install-lib', () => {
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-install-lib-'));
  });

  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('prefers explicit language flags over locale', () => {
    const output = bashEval(
      'parse_install_args --lang en; resolve_install_lang; printf "%s" "$INSTALL_LANG"',
      {
        HOME: tempHome,
        LANG: 'zh_CN.UTF-8',
      },
    );

    expect(output).toBe('en');
  });

  it('falls back to locale when no explicit language is provided', () => {
    const output = bashEval(
      'parse_install_args; resolve_install_lang; printf "%s" "$INSTALL_LANG"',
      {
        HOME: tempHome,
        LC_ALL: '',
        LANG: 'en_US.UTF-8',
      },
    );

    expect(output).toBe('en');
  });

  it('detects hosts from commands and config directories', async () => {
    await fs.mkdir(path.join(tempHome, '.claude'), { recursive: true });
    await fs.mkdir(path.join(tempHome, '.cursor'), { recursive: true });

    const binDir = path.join(tempHome, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(path.join(binDir, 'codex'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.writeFile(path.join(binDir, 'opencode'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.chmod(path.join(binDir, 'codex'), 0o755);
    await fs.chmod(path.join(binDir, 'opencode'), 0o755);

    const output = bashEval(
      'detect_hosts; printf "%s" "${DETECTED_HOSTS[*]}"',
      {
        HOME: tempHome,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(output).toContain('claude-code');
    expect(output).toContain('codex');
    expect(output).toContain('cursor');
    expect(output).toContain('opencode');
  });

  it('documents bash as the public installer entrypoint', async () => {
    const content = await fs.readFile(installScriptPath, 'utf8');

    expect(content).toContain('curl -fsSL https://i.corivo.ai/install.sh | bash');
    expect(content).not.toContain('curl -fsSL https://i.corivo.ai/install.sh | sh');
  });
});
