import { beforeEach, describe, expect, it, vi } from 'vitest';

const installClaudeCodeHost = vi.fn();
const isClaudeCodeInstalled = vi.fn();
const uninstallClaudeCodeHost = vi.fn();

const installCodexHost = vi.fn();
const isCodexInstalled = vi.fn();
const uninstallCodexHost = vi.fn();

const installCursorHost = vi.fn();
const isCursorInstalled = vi.fn();
const uninstallCursorHost = vi.fn();

const installOpencodeHost = vi.fn();
const isOpencodeInstalled = vi.fn();
const uninstallOpencodeHost = vi.fn();

const installProjectClaudeHost = vi.fn();
const isProjectClaudeInstalled = vi.fn();
const getProjectClaudeDoctorResult = vi.fn();
const uninstallProjectClaudeHost = vi.fn();

vi.mock('../../src/inject/claude-host.js', () => ({
  installClaudeCodeHost,
  isClaudeCodeInstalled,
  uninstallClaudeCodeHost,
}));

vi.mock('../../src/inject/codex-rules.js', () => ({
  installCodexHost,
  isCodexInstalled,
  uninstallCodexHost,
}));

vi.mock('../../src/inject/cursor-rules.js', () => ({
  installCursorHost,
  isCursorInstalled,
  uninstallCursorHost,
}));

vi.mock('../../src/inject/opencode-plugin.js', () => ({
  installOpencodeHost,
  isOpencodeInstalled,
  uninstallOpencodeHost,
}));

vi.mock('../../src/inject/claude-rules.js', () => ({
  installProjectClaudeHost,
  isProjectClaudeInstalled,
  getProjectClaudeDoctorResult,
  uninstallProjectClaudeHost,
}));

const { getAllHostAdapters, getHostAdapter } = await import('../../src/hosts/registry.js');

beforeEach(() => {
  vi.clearAllMocks();

  installClaudeCodeHost.mockResolvedValue({
    success: true,
    host: 'claude-code',
    summary: 'Claude Code host installed',
  });
  isClaudeCodeInstalled.mockResolvedValue({
    ok: true,
    host: 'claude-code',
    checks: [{ label: 'hooks', ok: true, detail: '/tmp/claude/hooks' }],
  });
  uninstallClaudeCodeHost.mockResolvedValue({
    success: true,
    host: 'claude-code',
    summary: 'Claude Code host uninstalled',
  });

  installCodexHost.mockResolvedValue({
    success: true,
    host: 'codex',
    summary: 'Codex host installed',
  });
  isCodexInstalled.mockResolvedValue({
    ok: true,
    host: 'codex',
    checks: [{ label: 'AGENTS.md', ok: true, detail: '/tmp/codex/AGENTS.md' }],
  });
  uninstallCodexHost.mockResolvedValue({
    success: true,
    host: 'codex',
    summary: 'Codex host uninstalled',
  });

  installCursorHost.mockResolvedValue({
    success: true,
    host: 'cursor',
    summary: 'Cursor host installed',
  });
  isCursorInstalled.mockResolvedValue({
    ok: true,
    host: 'cursor',
    checks: [{ label: 'corivo.mdc', ok: true, detail: '/tmp/cursor/corivo.mdc' }],
  });
  uninstallCursorHost.mockResolvedValue({
    success: true,
    host: 'cursor',
    summary: 'Cursor host uninstalled',
  });

  installOpencodeHost.mockResolvedValue({
    success: true,
    host: 'opencode',
    summary: 'OpenCode host installed',
  });
  isOpencodeInstalled.mockResolvedValue({
    ok: true,
    host: 'opencode',
    checks: [{ label: 'corivo.ts', ok: true, detail: '/tmp/opencode/corivo.ts' }],
  });
  uninstallOpencodeHost.mockResolvedValue({
    success: true,
    host: 'opencode',
    summary: 'OpenCode host uninstalled',
  });

  installProjectClaudeHost.mockResolvedValue({
    success: true,
    host: 'project-claude',
    summary: 'Project Claude rules installed',
  });
  isProjectClaudeInstalled.mockResolvedValue({
    ok: true,
    host: 'project-claude',
    checks: [{ label: 'CLAUDE.md', ok: true, detail: '/tmp/project/CLAUDE.md' }],
  });
  getProjectClaudeDoctorResult.mockResolvedValue({
    ok: true,
    host: 'project-claude',
    checks: [{ label: 'CLAUDE.md', ok: true, detail: '/tmp/project/CLAUDE.md' }],
  });
  uninstallProjectClaudeHost.mockResolvedValue({
    success: true,
    host: 'project-claude',
    summary: 'Project Claude rules uninstalled',
  });
});

describe('host registry', () => {
  it('exposes builtin host adapters by stable id', () => {
    const adapters = getAllHostAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'opencode',
      'project-claude',
    ]);
  });

  it('returns a single adapter by id', () => {
    expect(getHostAdapter('codex')?.id).toBe('codex');
    expect(getHostAdapter('missing')).toBeNull();
  });

  it('exposes adapters with stable display names and capabilities', () => {
    const adapters = getAllHostAdapters();

    for (const adapter of adapters) {
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
    }

    expect(getHostAdapter('project-claude')?.capabilities).toEqual([
      'project-install',
      'rules',
      'doctor',
    ]);
  });

  it('delegates to inject helpers and returns unified install/doctor shape', async () => {
    const target = '/tmp/corivo-host-target';

    for (const adapter of getAllHostAdapters()) {
      const installResult = await adapter.install({ target });
      const doctorResult = await adapter.doctor({ target });

      expect(installResult).toMatchObject({
        success: expect.any(Boolean),
        host: adapter.id,
        summary: expect.any(String),
      });
      expect(doctorResult).toMatchObject({
        ok: expect.any(Boolean),
        host: adapter.id,
        checks: expect.any(Array),
      });
      expect(doctorResult.checks.length).toBeGreaterThan(0);
    }

    expect(installClaudeCodeHost).toHaveBeenCalledWith(target);
    expect(isClaudeCodeInstalled).toHaveBeenCalledWith(target);
    expect(installCodexHost).toHaveBeenCalledWith(target);
    expect(isCodexInstalled).toHaveBeenCalledWith(target);
    expect(installCursorHost).toHaveBeenCalledWith(target);
    expect(isCursorInstalled).toHaveBeenCalledWith(target);
    expect(installOpencodeHost).toHaveBeenCalledWith(target);
    expect(isOpencodeInstalled).toHaveBeenCalledWith(target);
    expect(installProjectClaudeHost).toHaveBeenCalledWith(target);
    expect(isProjectClaudeInstalled).toHaveBeenCalledWith(target);
    expect(getProjectClaudeDoctorResult).not.toHaveBeenCalled();
  });

  it('keeps project-claude scoped to project install capability only', () => {
    const projectClaude = getHostAdapter('project-claude');

    expect(projectClaude).not.toBeNull();
    expect(projectClaude!.capabilities.includes('project-install')).toBe(true);
    expect(projectClaude!.capabilities.includes('global-install')).toBe(false);
  });
});
