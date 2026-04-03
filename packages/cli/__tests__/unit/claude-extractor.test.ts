import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExtractionInput,
  ExtractionResult,
  ExtractionStatus,
} from '../../src/extraction/types.js';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

function createSpawnProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  const process = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };
    kill: ReturnType<typeof vi.fn>;
  };

  process.stdout = stdout;
  process.stderr = stderr;
  process.stdin = stdin;
  process.kill = vi.fn();

  return process;
}

function mockSpawnSuccess(stdoutText: string) {
  spawnMock.mockImplementationOnce(() => {
    const child = createSpawnProcess();

    queueMicrotask(() => {
      child.stdout.emit('data', stdoutText);
      child.emit('close', 0);
    });

    return child;
  });
}

function mockSpawnFailure(stderrText: string, exitCode = 1) {
  spawnMock.mockImplementationOnce(() => {
    const child = createSpawnProcess();

    queueMicrotask(() => {
      child.stderr.emit('data', stderrText);
      child.emit('close', exitCode);
    });

    return child;
  });
}

function mockSpawnTimeout() {
  spawnMock.mockImplementationOnce(() => {
    const child = createSpawnProcess();
    child.kill.mockImplementation(() => {
      child.emit('close', null);
      return true;
    });
    return child;
  });
}

const extractionModule = await import('../../src/extraction/index.js');
const {
  extractWithClaude,
  extractWithCodex,
  extractWithProvider,
  normalizePrompt,
} = extractionModule;

describe('extraction public contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defines a stable result status union', () => {
    const statuses: ExtractionStatus[] = ['success', 'error', 'timeout'];
    expect(statuses).toEqual(['success', 'error', 'timeout']);
  });

  it('accepts an explicit provider and string or string[] prompts', () => {
    const single: ExtractionInput = { provider: 'claude', prompt: 'hello' };
    const multi: ExtractionInput = { provider: 'codex', prompt: ['a', 'b'] };

    expect(single.prompt).toBe('hello');
    expect(multi.prompt).toEqual(['a', 'b']);
    expect(single.provider).toBe('claude');
    expect(multi.provider).toBe('codex');
  });

  it('uses provider-tagged nullable result text in the output shape', () => {
    const output: ExtractionResult = { provider: 'claude', status: 'success', result: 'ok' };
    expect(output.result).toBe('ok');
    expect(output.provider).toBe('claude');
  });
});

describe('normalizePrompt', () => {
  it('trims a single string prompt', () => {
    expect(normalizePrompt('  hello  ')).toBe('hello');
  });

  it('joins prompt parts with blank lines', () => {
    expect(normalizePrompt([' first ', '', 'second', '   '])).toBe('first\n\nsecond');
  });

  it('returns an empty string when prompt content is blank', () => {
    expect(normalizePrompt([' ', '\n'])).toBe('');
  });
});

describe('package exports', () => {
  it('exports provider helpers from the package entrypoint', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.extractWithClaude).toBe('function');
    expect(typeof mod.extractWithCodex).toBe('function');
    expect(typeof mod.extractWithProvider).toBe('function');
  });
});

describe('extractWithProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with result content when using claude provider', async () => {
    mockSpawnSuccess('claude-result\n');

    const result = await extractWithProvider({ provider: 'claude', prompt: 'hello' });

    expect(result).toEqual({
      provider: 'claude',
      status: 'success',
      result: 'claude-result',
    });
  });

  it('returns success with result content when using codex provider', async () => {
    spawnMock.mockImplementationOnce((_command, args) => {
      const child = createSpawnProcess();

      queueMicrotask(async () => {
        const outputIndex = Array.isArray(args) ? args.indexOf('--output-last-message') : -1;
        const outputPath =
          outputIndex >= 0 && Array.isArray(args) ? String(args[outputIndex + 1]) : undefined;
        if (outputPath) {
          await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, 'codex-result\n', 'utf8'));
        }
        child.emit('close', 0);
      });

      return child;
    });

    const result = await extractWithProvider({ provider: 'codex', prompt: 'hello' });

    expect(result).toEqual({
      provider: 'codex',
      status: 'success',
      result: 'codex-result',
    });
  });

  it('returns error when normalized prompt is empty', async () => {
    const result = await extractWithProvider({ provider: 'claude', prompt: [' ', ''] });

    expect(result).toEqual({
      provider: 'claude',
      status: 'error',
      result: null,
      error: expect.stringContaining('empty'),
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns error when claude exits with a non-zero code', async () => {
    mockSpawnFailure('command failed', 2);

    const result = await extractWithProvider({ provider: 'claude', prompt: 'hello' });

    expect(result).toEqual({
      provider: 'claude',
      status: 'error',
      result: null,
      error: 'command failed',
    });
  });

  it('returns error when stdout is empty', async () => {
    mockSpawnSuccess('   ');

    const result = await extractWithProvider({ provider: 'claude', prompt: 'hello' });

    expect(result).toEqual({
      provider: 'claude',
      status: 'error',
      result: null,
      error: 'claude returned empty output',
    });
  });

  it('passes the normalized prompt to the claude runner', async () => {
    mockSpawnSuccess('done');

    await extractWithProvider({ provider: 'claude', prompt: ['first', 'second'] });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['first\n\nsecond']),
      expect.objectContaining({
        stdio: expect.any(Array),
      }),
    );
  });

  it('passes the normalized prompt to the codex runner', async () => {
    spawnMock.mockImplementationOnce((_command, args) => {
      const child = createSpawnProcess();

      queueMicrotask(async () => {
        const outputIndex = Array.isArray(args) ? args.indexOf('--output-last-message') : -1;
        const outputPath =
          outputIndex >= 0 && Array.isArray(args) ? String(args[outputIndex + 1]) : undefined;
        if (outputPath) {
          await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, 'done\n', 'utf8'));
        }
        child.emit('close', 0);
      });

      return child;
    });

    await extractWithProvider({ provider: 'codex', prompt: ['first', 'second'] });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--skip-git-repo-check', '--output-last-message']),
      expect.objectContaining({
        stdio: expect.any(Array),
      }),
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain('first\n\nsecond');
    const child = spawnMock.mock.results[0]?.value;
    expect(child.stdin.write).toHaveBeenCalledWith('first\n\nsecond');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('returns timeout when the claude process exceeds timeoutMs', async () => {
    mockSpawnTimeout();

    const result = await extractWithProvider({ provider: 'claude', prompt: 'hello', timeoutMs: 5 });

    expect(result).toEqual({
      provider: 'claude',
      status: 'timeout',
      result: null,
      error: 'claude extraction timed out',
    });
  });
});

describe('provider-specific wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps extractWithClaude as a compatibility wrapper', async () => {
    mockSpawnSuccess('done');

    const result = await extractWithClaude({ prompt: 'hello' });

    expect(result.provider).toBe('claude');
    expect(result.status).toBe('success');
    expect(result.result).toBe('done');
  });

  it('exposes extractWithCodex directly', async () => {
    spawnMock.mockImplementationOnce((_command, args) => {
      const child = createSpawnProcess();

      queueMicrotask(async () => {
        const outputIndex = Array.isArray(args) ? args.indexOf('--output-last-message') : -1;
        const outputPath =
          outputIndex >= 0 && Array.isArray(args) ? String(args[outputIndex + 1]) : undefined;
        if (outputPath) {
          await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, 'done\n', 'utf8'));
        }
        child.emit('close', 0);
      });

      return child;
    });

    const result = await extractWithCodex({ prompt: 'hello' });

    expect(result.provider).toBe('codex');
    expect(result.status).toBe('success');
    expect(result.result).toBe('done');
  });

  it('returns an error when codex succeeds but does not write the last-message output file', async () => {
    mockSpawnSuccess('hook noise only');

    const result = await extractWithCodex({ prompt: 'hello' });

    expect(result).toEqual({
      provider: 'codex',
      status: 'error',
      result: null,
      error: expect.stringContaining('last-message'),
    });
  });
});
