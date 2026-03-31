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
    expect(beforeChecks['notify-dispatch.sh']).toBe(false);

    const installResult = await installCodexHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isCodexInstalled(tempHome);
    const installChecks = toCheckMap(afterInstall.checks);
    expect(afterInstall.ok).toBe(true);
    expect(installChecks['AGENTS.md']).toBe(true);
    expect(installChecks['config.toml']).toBe(true);
    expect(installChecks['notify-review.sh']).toBe(true);
    expect(installChecks['notify-dispatch.sh']).toBe(true);

    const uninstallResult = await uninstallCodexHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isCodexInstalled(tempHome);
    const uninstallChecks = toCheckMap(afterUninstall.checks);
    expect(afterUninstall.ok).toBe(false);
    expect(uninstallChecks['AGENTS.md']).toBe(false);
    expect(uninstallChecks['config.toml']).toBe(false);
    expect(uninstallChecks['notify-review.sh']).toBe(false);
    expect(uninstallChecks['notify-dispatch.sh']).toBe(false);
  });

  it('marks Codex doctor unhealthy when notify-dispatch.sh is missing', async () => {
    const installResult = await installCodexHost(tempHome);
    expect(installResult.success).toBe(true);

    await fs.rm(path.join(tempHome, '.codex', 'corivo', 'notify-dispatch.sh'), { force: true });

    const doctor = await isCodexInstalled(tempHome);
    expect(doctor.ok).toBe(false);
    expect(toCheckMap(doctor.checks)['notify-dispatch.sh']).toBe(false);
  });

  it('marks Codex doctor unhealthy when sandbox section exists without Corivo writable root', async () => {
    const installResult = await installCodexHost(tempHome);
    expect(installResult.success).toBe(true);

    const configPath = path.join(tempHome, '.codex', 'config.toml');
    const config = await fs.readFile(configPath, 'utf8');
    const updatedConfig = config.replace(
      /writable_roots\s*=\s*\[[\s\S]*?\]/m,
      'writable_roots = [ "/tmp/not-corivo" ]',
    );
    await fs.writeFile(configPath, updatedConfig, 'utf8');

    const doctor = await isCodexInstalled(tempHome);
    expect(doctor.ok).toBe(false);
    expect(toCheckMap(doctor.checks)['config.toml']).toBe(false);
  });

  it('preserves pre-existing Codex notify command after uninstall', async () => {
    const configPath = path.join(tempHome, '.codex', 'config.toml');
    const originalNotifyCommand = '/tmp/existing-notify.sh';
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      `notify = [ "bash", "${originalNotifyCommand}" ]\n`,
      'utf8',
    );

    const installResult = await installCodexHost(tempHome);
    expect(installResult.success).toBe(true);

    const installedConfig = await fs.readFile(configPath, 'utf8');
    expect(installedConfig).toContain('notify-dispatch.sh');

    const uninstallResult = await uninstallCodexHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const restoredConfig = await fs.readFile(configPath, 'utf8');
    expect(restoredConfig).toContain(originalNotifyCommand);
    expect(restoredConfig).not.toContain('notify-dispatch.sh');
    expect(restoredConfig).not.toContain(path.join(tempHome, '.corivo'));
  });

  it('covers Cursor install/doctor/uninstall checks', async () => {
    const before = await isCursorInstalled(tempHome);
    const beforeChecks = toCheckMap(before.checks);
    expect(beforeChecks['corivo.mdc']).toBe(false);
    expect(beforeChecks['settings.json hooks']).toBe(false);
    expect(beforeChecks['cli-config.json permissions']).toBe(false);
    expect(beforeChecks['adapter scripts']).toBe(false);

    const installResult = await installCursorHost(tempHome);
    expect(installResult.success).toBe(true);

    const afterInstall = await isCursorInstalled(tempHome);
    const installChecks = toCheckMap(afterInstall.checks);
    expect(afterInstall.ok).toBe(true);
    expect(installChecks['corivo.mdc']).toBe(true);
    expect(installChecks['settings.json hooks']).toBe(true);
    expect(installChecks['cli-config.json permissions']).toBe(true);
    expect(installChecks['adapter scripts']).toBe(true);

    const uninstallResult = await uninstallCursorHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    const afterUninstall = await isCursorInstalled(tempHome);
    const uninstallChecks = toCheckMap(afterUninstall.checks);
    expect(afterUninstall.ok).toBe(false);
    expect(uninstallChecks['corivo.mdc']).toBe(false);
    expect(uninstallChecks['settings.json hooks']).toBe(false);
    expect(uninstallChecks['cli-config.json permissions']).toBe(false);
    expect(uninstallChecks['adapter scripts']).toBe(false);
  });

  it('marks Cursor doctor unhealthy when adapter script is missing', async () => {
    const installResult = await installCursorHost(tempHome);
    expect(installResult.success).toBe(true);

    await fs.rm(path.join(tempHome, '.cursor', 'corivo', 'prompt-recall.sh'), { force: true });

    const doctor = await isCursorInstalled(tempHome);
    expect(doctor.ok).toBe(false);
    expect(toCheckMap(doctor.checks)['adapter scripts']).toBe(false);
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

  it('uninstalls only Claude-owned hook files from shared hooks directory', async () => {
    const installResult = await installClaudeCodeHost(tempHome);
    expect(installResult.success).toBe(true);

    const hooksDir = path.join(tempHome, '.corivo', 'hooks');
    const unrelatedHook = path.join(hooksDir, 'custom-hook.sh');
    await fs.writeFile(unrelatedHook, '#!/usr/bin/env bash\necho custom\n', 'utf8');

    const uninstallResult = await uninstallClaudeCodeHost(tempHome);
    expect(uninstallResult.success).toBe(true);

    await expect(fs.stat(hooksDir)).resolves.toBeTruthy();
    await expect(fs.readFile(unrelatedHook, 'utf8')).resolves.toContain('custom');
    await expect(fs.readFile(path.join(hooksDir, 'session-init.sh'), 'utf8')).rejects.toThrow();
    await expect(fs.readFile(path.join(hooksDir, 'ingest-turn.sh'), 'utf8')).rejects.toThrow();
    await expect(fs.readFile(path.join(hooksDir, 'session-carry-over.sh'), 'utf8')).rejects.toThrow();
    await expect(fs.readFile(path.join(hooksDir, 'prompt-recall.sh'), 'utf8')).rejects.toThrow();
    await expect(fs.readFile(path.join(hooksDir, 'stop-review.sh'), 'utf8')).rejects.toThrow();
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
