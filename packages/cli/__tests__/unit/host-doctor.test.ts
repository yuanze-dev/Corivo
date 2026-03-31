import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installCodexHost,
  isCodexInstalled,
  uninstallCodexHost,
} from '../../src/inject/codex-rules.js';
import {
  installCursorHost,
  isCursorInstalled,
  uninstallCursorHost,
} from '../../src/inject/cursor-rules.js';
import {
  installOpencodeHost,
  isOpencodeInstalled,
  uninstallOpencodeHost,
} from '../../src/inject/opencode-plugin.js';
import {
  installClaudeCodeHost,
  isClaudeCodeInstalled,
  uninstallClaudeCodeHost,
} from '../../src/inject/claude-host.js';
import {
  installProjectClaudeHost,
  isProjectClaudeInstalled,
  uninstallProjectClaudeHost,
} from '../../src/inject/claude-rules.js';

function toCheckMap(checks: Array<{ label: string; ok: boolean }>): Record<string, boolean> {
  return Object.fromEntries(checks.map((item) => [item.label, item.ok]));
}

describe('host doctor reusable helpers', () => {
  let tempHome: string;
  let tempProject: string;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-doctor-home-'));
    tempProject = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-doctor-project-'));
    await fs.mkdir(path.join(tempHome, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempProject, { recursive: true, force: true });
  });

  it('covers Codex install/doctor/uninstall checks', async () => {
    const before = await isCodexInstalled(tempHome);
    const beforeChecks = toCheckMap(before.checks);
    expect(beforeChecks['AGENTS.md']).toBe(false);
    expect(beforeChecks['config.toml']).toBe(false);
    expect(beforeChecks['notify-review.sh']).toBe(false);

    const installResult = await installCodexHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isCodexInstalled(tempHome);
    const installChecks = toCheckMap(afterInstall.checks);
    expect(afterInstall.ok).toBe(true);
    expect(installChecks['AGENTS.md']).toBe(true);
    expect(installChecks['config.toml']).toBe(true);
    expect(installChecks['notify-review.sh']).toBe(true);

    const uninstallResult = await uninstallCodexHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isCodexInstalled(tempHome);
    const uninstallChecks = toCheckMap(afterUninstall.checks);
    expect(afterUninstall.ok).toBe(false);
    expect(uninstallChecks['AGENTS.md']).toBe(false);
    expect(uninstallChecks['config.toml']).toBe(false);
    expect(uninstallChecks['notify-review.sh']).toBe(false);
  });

  it('covers Cursor install/doctor/uninstall checks', async () => {
    const before = await isCursorInstalled(tempHome);
    const beforeChecks = toCheckMap(before.checks);
    expect(beforeChecks['corivo.mdc']).toBe(false);
    expect(beforeChecks['settings.json hooks']).toBe(false);
    expect(beforeChecks['cli-config.json permissions']).toBe(false);

    const installResult = await installCursorHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isCursorInstalled(tempHome);
    const installChecks = toCheckMap(afterInstall.checks);
    expect(afterInstall.ok).toBe(true);
    expect(installChecks['corivo.mdc']).toBe(true);
    expect(installChecks['settings.json hooks']).toBe(true);
    expect(installChecks['cli-config.json permissions']).toBe(true);

    const uninstallResult = await uninstallCursorHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isCursorInstalled(tempHome);
    const uninstallChecks = toCheckMap(afterUninstall.checks);
    expect(afterUninstall.ok).toBe(false);
    expect(uninstallChecks['corivo.mdc']).toBe(false);
    expect(uninstallChecks['settings.json hooks']).toBe(false);
    expect(uninstallChecks['cli-config.json permissions']).toBe(false);
  });

  it('covers OpenCode install/doctor/uninstall checks', async () => {
    const before = await isOpencodeInstalled(tempHome);
    expect(toCheckMap(before.checks)['corivo.ts']).toBe(false);

    const installResult = await installOpencodeHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isOpencodeInstalled(tempHome);
    expect(afterInstall.ok).toBe(true);
    expect(toCheckMap(afterInstall.checks)['corivo.ts']).toBe(true);

    const uninstallResult = await uninstallOpencodeHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isOpencodeInstalled(tempHome);
    expect(afterUninstall.ok).toBe(false);
    expect(toCheckMap(afterUninstall.checks)['corivo.ts']).toBe(false);
  });

  it('covers Claude Code install/doctor/uninstall checks', async () => {
    const before = await isClaudeCodeInstalled(tempHome);
    const beforeChecks = toCheckMap(before.checks);
    expect(beforeChecks.hooks).toBe(false);
    expect(beforeChecks.skills).toBe(false);
    expect(beforeChecks['settings.json hooks']).toBe(false);

    const installResult = await installClaudeCodeHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isClaudeCodeInstalled(tempHome);
    const installChecks = toCheckMap(afterInstall.checks);
    expect(afterInstall.ok).toBe(true);
    expect(installChecks.hooks).toBe(true);
    expect(installChecks.skills).toBe(true);
    expect(installChecks['settings.json hooks']).toBe(true);

    const uninstallResult = await uninstallClaudeCodeHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isClaudeCodeInstalled(tempHome);
    const uninstallChecks = toCheckMap(afterUninstall.checks);
    expect(afterUninstall.ok).toBe(false);
    expect(uninstallChecks.hooks).toBe(false);
    expect(uninstallChecks.skills).toBe(false);
    expect(uninstallChecks['settings.json hooks']).toBe(false);
  });

  it('covers project CLAUDE.md marker checks', async () => {
    const before = await isProjectClaudeInstalled(tempProject);
    expect(toCheckMap(before.checks)['CLAUDE.md']).toBe(false);

    const installResult = await installProjectClaudeHost(tempProject);
    expect(installResult.success).toBe(true);

    const afterInstall = await isProjectClaudeInstalled(tempProject);
    expect(afterInstall.ok).toBe(true);
    expect(toCheckMap(afterInstall.checks)['CLAUDE.md']).toBe(true);

    const uninstallResult = await uninstallProjectClaudeHost(tempProject);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isProjectClaudeInstalled(tempProject);
    expect(afterUninstall.ok).toBe(false);
    expect(toCheckMap(afterUninstall.checks)['CLAUDE.md']).toBe(false);
  });
});
