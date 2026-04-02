import { describe, expect, it, vi } from 'vitest';
import { createHostInstallUseCase } from '../../src/application/hosts/install-host.js';
import type { HostAdapter, HostId, HostImportResult, HostInstallResult } from '../../src/hosts/types.js';

describe('install host use case', () => {
  function createInstallResult(host: HostId): HostInstallResult {
    return {
      success: true,
      host,
      summary: `${host} installed`,
    };
  }

  function createImportResult(host: HostId): HostImportResult {
    return {
      success: true,
      host,
      mode: 'full',
      importedSessionCount: 3,
      importedMessageCount: 12,
      summary: 'Imported 3 sessions.',
    };
  }

  function createAdapter(host: HostId, capabilities: HostAdapter['capabilities']): HostAdapter {
    return {
      id: host,
      displayName: host,
      capabilities,
      install: vi.fn(async () => createInstallResult(host)),
      doctor: vi.fn(async () => ({
        ok: true,
        host,
        checks: [],
      })),
    };
  }

  it('can prompt for optional history import when the adapter advertises history-import', async () => {
    const install = vi.fn(async () => createInstallResult('cursor'));
    const confirmImport = vi.fn(async () => false);
    const getAdapter = vi.fn(() => createAdapter('cursor', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
    });

    const result = await run({ host: 'cursor', target: '/tmp/cursor-home' });

    expect(result).toMatchObject({
      success: true,
      host: 'cursor',
      summary: 'cursor installed',
    });
    expect(confirmImport).toHaveBeenCalledWith(
      'Import existing conversation history now?',
    );
  });

  it('calls host import with full-import options after confirmation when the adapter advertises history-import', async () => {
    const install = vi.fn(async () => createInstallResult('cursor'));
    const confirmImport = vi.fn(async () => true);
    const importHistory = vi.fn(async () => createImportResult('cursor'));
    const getAdapter = vi.fn(() => createAdapter('cursor', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
      importHistory,
    });

    await run({ host: 'cursor', target: '/tmp/cursor-project' });

    expect(importHistory).toHaveBeenCalledWith({
      host: 'cursor',
      all: true,
      target: '/tmp/cursor-project',
    });
  });

  it('skips the import prompt for unsupported hosts', async () => {
    const install = vi.fn(async () => createInstallResult('cursor'));
    const confirmImport = vi.fn(async () => true);
    const importHistory = vi.fn(async () => createImportResult('cursor'));
    const getAdapter = vi.fn(() => createAdapter('cursor', ['hooks']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
      importHistory,
    });

    const result = await run({ host: 'cursor', target: '/tmp/cursor' });

    expect(result).toMatchObject({
      success: true,
      host: 'cursor',
      summary: 'cursor installed',
    });
    expect(confirmImport).not.toHaveBeenCalled();
    expect(importHistory).not.toHaveBeenCalled();
  });

  it('defaults to skipping the prompt in non-tty environments', async () => {
    const install = vi.fn(async () => createInstallResult('codex'));
    const confirmImport = vi.fn(async () => {
      throw new Error('prompt should not run');
    });
    const importHistory = vi.fn(async () => createImportResult('codex'));
    const getAdapter = vi.fn(() => createAdapter('codex', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => false,
      importHistory,
    });

    const result = await run({ host: 'codex', target: '/tmp/codex-home' });

    expect(result).toMatchObject({
      success: true,
      host: 'codex',
      summary: 'codex installed',
    });
    expect(confirmImport).not.toHaveBeenCalled();
    expect(importHistory).not.toHaveBeenCalled();
  });

  it('keeps install successful when history import fails and appends the import error', async () => {
    const install = vi.fn(async () => createInstallResult('claude-code'));
    const confirmImport = vi.fn(async () => true);
    const importHistory = vi.fn(async () => ({
      success: false,
      host: 'claude-code',
      mode: 'full',
      importedSessionCount: 0,
      importedMessageCount: 0,
      summary: 'Import failed.',
      error: 'History source unavailable.',
    }));
    const getAdapter = vi.fn(() => createAdapter('claude-code', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
      importHistory,
    });

    const result = await run({ host: 'claude-code', target: '/tmp/claude-project' });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('claude-code installed');
    expect(result.summary).toContain('Import failed.');
    expect(result.error).toContain('History source unavailable.');
  });

  it('does not prompt or import when install fails', async () => {
    const install = vi.fn(async () => ({
      success: false,
      host: 'codex' as const,
      summary: 'install failed',
      error: 'permission denied',
    }));
    const confirmImport = vi.fn(async () => true);
    const importHistory = vi.fn(async () => createImportResult('codex'));
    const getAdapter = vi.fn(() => createAdapter('codex', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
      importHistory,
    });

    const result = await run({ host: 'codex', target: '/tmp/codex-home' });

    expect(result).toMatchObject({
      success: false,
      host: 'codex',
      summary: 'install failed',
      error: 'permission denied',
    });
    expect(confirmImport).not.toHaveBeenCalled();
    expect(importHistory).not.toHaveBeenCalled();
  });

  it('keeps install successful when importHistory throws and appends failure feedback', async () => {
    const install = vi.fn(async () => createInstallResult('claude-code'));
    const confirmImport = vi.fn(async () => true);
    const importHistory = vi.fn(async () => {
      throw new Error('History command crashed.');
    });
    const getAdapter = vi.fn(() => createAdapter('claude-code', ['history-import']));

    const run = createHostInstallUseCase({
      install,
      getAdapter,
      confirmImport,
      isInteractive: () => true,
      importHistory,
    });

    const result = await run({ host: 'claude-code', target: '/tmp/claude-project' });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('claude-code installed');
    expect(result.summary).toContain('History import failed.');
    expect(result.error).toContain('History command crashed.');
  });
});
