import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIConnectionError } from 'supermemory';
import { MemoryProviderUnavailableError } from '../../src/domain/memory/providers/types.js';
import { createSupermemoryMemoryProvider } from '../../src/domain/memory/providers/supermemory-provider.js';
import { resolveMemoryProvider } from '../../src/domain/memory/providers/resolve-memory-provider.js';
import { ConfigError } from '../../src/domain/errors/index.js';

const {
  SupermemoryCtor,
  documentsAdd,
  searchMemories,
  profile,
} = vi.hoisted(() => {
  const documentsAdd = vi.fn();
  const searchMemories = vi.fn();
  const profile = vi.fn();

  const SupermemoryCtor = vi.fn().mockImplementation((_opts: unknown) => ({
    documents: { add: documentsAdd },
    search: { memories: searchMemories },
    profile,
  }));

  return { SupermemoryCtor, documentsAdd, searchMemories, profile };
});

vi.mock('supermemory', async () => {
  const actual = await vi.importActual<any>('supermemory');
  return { ...actual, default: SupermemoryCtor };
});

describe('Supermemory provider', () => {
  beforeEach(() => {
    SupermemoryCtor.mockClear();
    documentsAdd.mockReset();
    searchMemories.mockReset();
    profile.mockReset();
  });

  it('builds the SDK client with apiKey', async () => {
    createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });

    expect(SupermemoryCtor).toHaveBeenCalledTimes(1);
    expect(SupermemoryCtor).toHaveBeenCalledWith({ apiKey: 'sm_test' });
  });

  it('save sends containerTag and minimal metadata', async () => {
    documentsAdd.mockResolvedValue({ id: 'doc_1', status: 'queued' });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await provider.save({
      content: 'hello world',
      annotation: '事实 · project · general',
      source: 'test',
      host: 'codex',
      cwd: '/tmp',
      sessionId: 'sess_1',
      memoryType: 'block',
      createdAt: 1_700_000_000_000,
    } as any);

    expect(documentsAdd).toHaveBeenCalledWith(expect.objectContaining({
      content: 'hello world',
      containerTag: 'project.test',
      metadata: expect.objectContaining({
        annotation: '事实 · project · general',
        source: 'test',
        host: 'codex',
        cwd: '/tmp',
        sessionId: 'sess_1',
        memoryType: 'block',
        createdAt: 1_700_000_000_000,
      }),
    }));
  });

  it('recall sends containerTag and normalizes the top hit', async () => {
    searchMemories.mockResolvedValue({
      results: [
        {
          id: 'mem_1',
          memory: 'Prefer small, reviewable pull requests by default.',
          similarity: 0.92,
          updatedAt: '2026-01-01T00:00:00.000Z',
          metadata: { annotation: '指令 · self · style', source: 'test' },
        },
      ],
      timing: 1,
      total: 1,
    });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    const item = await provider.recall({ prompt: 'What do I prefer about PRs?' });

    expect(searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      q: 'What do I prefer about PRs?',
      containerTag: 'project.test',
    }));
    expect(item?.mode).toBe('recall');
    expect(item?.claim).toContain('Prefer small, reviewable pull requests');
    expect(item?.memoryIds).toContain('mem_1');
  });

  it('search sends containerTag and returns Block-shaped results', async () => {
    searchMemories.mockResolvedValue({
      results: [
        {
          id: 'mem_1',
          memory: 'Prefer small, reviewable pull requests by default.',
          similarity: 0.81,
          updatedAt: '2026-01-01T00:00:00.000Z',
          metadata: { annotation: '指令 · self · style', source: 'test' },
        },
      ],
      timing: 1,
      total: 1,
    });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    const results = await provider.search({ query: 'pull requests', limit: 10 });

    expect(searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      q: 'pull requests',
      containerTag: 'project.test',
      limit: 10,
    }));
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Prefer small, reviewable pull requests');
    expect(results[0].annotation).toBe('指令 · self · style');
  });

  it('returns null / [] on empty results without throwing', async () => {
    searchMemories.mockResolvedValue({ results: [], timing: 1, total: 0 });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.recall({ prompt: 'nothing' })).resolves.toBeNull();
    await expect(provider.search({ query: 'nothing', limit: 10 })).resolves.toEqual([]);
  });

  it('wraps SDK/network failures as provider-unavailable errors', async () => {
    searchMemories.mockRejectedValue(new APIConnectionError({ message: 'network down' } as any));
    documentsAdd.mockRejectedValue(new APIConnectionError({ message: 'network down' } as any));

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.recall({ prompt: 'x' })).rejects.toBeInstanceOf(MemoryProviderUnavailableError);
    await expect(provider.search({ query: 'x', limit: 10 })).rejects.toBeInstanceOf(MemoryProviderUnavailableError);
    await expect(provider.save({ content: 'x', annotation: '事实 · project · general', source: 'test' })).rejects.toBeInstanceOf(
      MemoryProviderUnavailableError,
    );
  });

  it('does not wrap malformed payload normalization failures as provider-unavailable', async () => {
    searchMemories.mockResolvedValue({
      results: [
        {
          // id must be a string; this indicates an upstream contract mismatch or our assumptions are wrong.
          id: 123,
          memory: 'Prefer small, reviewable pull requests by default.',
          similarity: 0.92,
          updatedAt: '2026-01-01T00:00:00.000Z',
          metadata: null,
        },
      ],
      timing: 1,
      total: 1,
    });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.recall({ prompt: 'x' })).rejects.not.toBeInstanceOf(MemoryProviderUnavailableError);
  });

  it('throws a normal error on malformed top-level results (regression)', async () => {
    searchMemories.mockResolvedValue({
      results: 'not-an-array',
      timing: 1,
      total: 1,
    } as any);

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.recall({ prompt: 'x' })).rejects.not.toBeInstanceOf(MemoryProviderUnavailableError);
  });

  it('healthcheck returns ok=true when profile succeeds', async () => {
    profile.mockResolvedValue({ profile: { dynamic: [], static: [] } });

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.healthcheck()).resolves.toMatchObject({ ok: true, provider: 'supermemory' });
    expect(profile).toHaveBeenCalledWith({ containerTag: 'project.test' });
  });

  it('healthcheck returns ok=false when profile fails (no throw)', async () => {
    profile.mockRejectedValue(new Error('boom'));

    const provider = createSupermemoryMemoryProvider({ apiKey: 'sm_test', containerTag: 'project.test' });
    await expect(provider.healthcheck()).resolves.toMatchObject({ ok: false, provider: 'supermemory' });
  });
});

describe('resolveMemoryProvider supermemory config validation', () => {
  it('rejects invalid-but-non-empty containerTag values', () => {
    expect(() =>
      resolveMemoryProvider({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: {
            apiKey: 'sm_test',
            containerTag: 'project test', // invalid: whitespace
          },
        },
      } as any),
    ).toThrow(ConfigError);
  });

  it('rejects non-empty containerTag with disallowed characters (:)', () => {
    expect(() =>
      resolveMemoryProvider({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: {
            apiKey: 'sm_test',
            containerTag: 'project:test', // invalid per SDK contract
          },
        },
      } as any),
    ).toThrow(ConfigError);
  });
});
