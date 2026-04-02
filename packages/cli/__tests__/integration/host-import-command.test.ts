import { describe, expect, it, vi } from 'vitest';
import { createHostImportCommand } from '../../src/cli/commands/host-import.js';
import { hostCommand } from '../../src/cli/commands/host.js';

describe('host import command', () => {
  it('registers host import with --all, --since, --limit and --dry-run options', () => {
    const command = hostCommand.commands.find((item) => item.name() === 'import');
    expect(command).toBeDefined();
    expect(command?.options.map((item) => item.long)).toEqual(
      expect.arrayContaining(['--all', '--since', '--limit', '--dry-run', '--target']),
    );
  });

  it('parses import options and routes to use case executor', async () => {
    const executeImport = vi.fn(async () => ({
      success: true,
      host: 'codex',
      mode: 'incremental',
      importedSessionCount: 1,
      importedMessageCount: 2,
      summary: 'ok',
    }));
    const command = createHostImportCommand({
      executeImport,
      writeStdout: vi.fn(),
      writeStderr: vi.fn(),
    });

    await command.parseAsync(['codex', '--since', 'cursor-1', '--limit', '5', '--dry-run'], {
      from: 'user',
    });

    expect(executeImport).toHaveBeenCalledWith({
      host: 'codex',
      all: undefined,
      since: 'cursor-1',
      limit: 5,
      dryRun: true,
      target: undefined,
    });
  });

  it('rejects conflicting --all and --since options', async () => {
    const executeImport = vi.fn(async () => ({
      success: true,
      host: 'codex',
      mode: 'full',
      importedSessionCount: 0,
      importedMessageCount: 0,
      summary: 'ok',
    }));
    const command = createHostImportCommand({
      executeImport,
      writeStdout: vi.fn(),
      writeStderr: vi.fn(),
    });

    await expect(
      command.parseAsync(['codex', '--all', '--since', 'cursor-1'], {
        from: 'user',
      }),
    ).rejects.toThrow('Cannot use --all with --since.');
    expect(executeImport).not.toHaveBeenCalled();
  });

  it('rejects invalid --limit values', async () => {
    const executeImport = vi.fn(async () => ({
      success: true,
      host: 'codex',
      mode: 'full',
      importedSessionCount: 0,
      importedMessageCount: 0,
      summary: 'ok',
    }));
    const command = createHostImportCommand({
      executeImport,
      writeStdout: vi.fn(),
      writeStderr: vi.fn(),
    });

    await expect(command.parseAsync(['codex', '--limit', '0'], { from: 'user' })).rejects.toThrow(
      '--limit must be a positive integer.',
    );
    await expect(command.parseAsync(['codex', '--limit', '-3'], { from: 'user' })).rejects.toThrow(
      '--limit must be a positive integer.',
    );
    await expect(command.parseAsync(['codex', '--limit', 'abc'], { from: 'user' })).rejects.toThrow(
      '--limit must be a positive integer.',
    );
    expect(executeImport).not.toHaveBeenCalled();
  });

  it('writes error output and sets exit code when use case fails', async () => {
    const writeStderr = vi.fn();
    const command = createHostImportCommand({
      executeImport: vi.fn(async () => ({
        success: false,
        host: 'codex',
        mode: 'incremental',
        importedSessionCount: 0,
        importedMessageCount: 0,
        summary: 'failed',
        error: 'failed',
      })),
      writeStdout: vi.fn(),
      writeStderr,
    });
    process.exitCode = undefined;

    await command.parseAsync(['codex', '--since', 'cursor-1'], { from: 'user' });

    expect(writeStderr).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
