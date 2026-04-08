import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../../src/domain/memory/models/block.js';
import { runCarryOverCommand } from '../../src/cli/commands/carry-over.js';
import { runPromptQueryCommand, runSearchQueryCommand } from '../../src/application/bootstrap/query-execution.js';
import { runReviewCommand } from '../../src/cli/commands/review.js';
import { runSuggestCommand } from '../../src/cli/commands/suggest.js';
import { createLocalMemoryProvider } from '../../src/domain/memory/providers/local-memory-provider.js';
import { MemoryProviderUnavailableError } from '../../src/domain/memory/providers/types.js';
import { ConfigError } from '../../src/domain/errors/index.js';

const { loadRuntimeDb, resolveMemoryProvider } = vi.hoisted(() => ({
  loadRuntimeDb: vi.fn(),
  resolveMemoryProvider: vi.fn(),
}));

vi.mock('../../src/runtime/runtime-support.js', () => ({
  loadRuntimeDb,
}));

vi.mock('../../src/domain/memory/providers/resolve-memory-provider.js', () => ({
  resolveMemoryProvider,
}));

interface RuntimeDbStub {
  queryBlocks: (filter?: Record<string, unknown>) => Block[];
  searchBlocks: (query: string, limit?: number) => Block[];
  getBlockAssociations: () => [];
  getBlock: (id: string) => Block | null;
}

function createBlock(overrides: Partial<Block>): Block {
  return {
    id: overrides.id ?? 'blk_test',
    content: overrides.content ?? 'default content',
    annotation: overrides.annotation ?? '事实 · project · general',
    refs: overrides.refs ?? [],
    source: overrides.source ?? 'test',
    vitality: overrides.vitality ?? 90,
    status: overrides.status ?? 'active',
    access_count: overrides.access_count ?? 0,
    last_accessed: overrides.last_accessed ?? null,
    pattern: overrides.pattern,
    created_at: overrides.created_at ?? 1_700_000_000,
    updated_at: overrides.updated_at ?? 1_700_000_000,
  };
}

function createDb(blocks: Block[]): RuntimeDbStub {
  return {
    queryBlocks: () => blocks,
    searchBlocks: (query: string) =>
      blocks.filter((block) =>
        `${block.content} ${block.annotation}`.toLowerCase().includes(query.toLowerCase()),
      ),
    getBlockAssociations: () => [],
    getBlock: (id: string) => blocks.find((block) => block.id === id) ?? null,
  };
}

describe('runtime CLI command helpers', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    loadRuntimeDb.mockReset();
    resolveMemoryProvider.mockReset();
    resolveMemoryProvider.mockImplementation(() => createLocalMemoryProvider());
  });

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-runtime-cli-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('returns text output for carry-over', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        content: '日志归档策略还没定，待确认冷热分层方案。',
        annotation: '决策 · project · logging',
      }),
    ]));

    const output = await runCarryOverCommand({ password: false, format: 'text' });

    expect(output).toContain('[corivo]');
    expect(output).toContain('日志归档');
  });

  it('returns structured json output for query --prompt', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_pg',
        content: '我们决定继续使用 PostgreSQL 作为主库，理由是 JSON 支持和事务一致性。',
        annotation: '决策 · project · database',
      }),
    ]));

    const output = await runPromptQueryCommand({
      password: false,
      format: 'json',
      prompt: 'Should we keep PostgreSQL for this database work?',
    });

    expect(JSON.parse(output)).toMatchObject({
      mode: 'recall',
      confidence: 'high',
    });
  });

  it('falls back to local recall when provider is explicitly unavailable', async () => {
    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => {
        throw new MemoryProviderUnavailableError('Supermemory provider is not implemented yet.');
      }),
      search: vi.fn(async () => []),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: false, provider: 'supermemory', message: 'not implemented' })),
    });

    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_local_only',
        content: 'Prefer small, reviewable pull requests by default.',
        annotation: '指令 · self · style',
      }),
    ]));

    const output = await runPromptQueryCommand({
      password: false,
      format: 'text',
      prompt: 'What do I prefer about pull requests?',
    });

    expect(resolveMemoryProvider).toHaveBeenCalledTimes(1);
    expect(output).toContain('[corivo]');
    expect(output).toContain('Prefer small, reviewable pull requests by default.');
  });

  it('falls back to local when a non-local provider returns a successful empty recall (provider miss)', async () => {
    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => null),
      search: vi.fn(async () => []),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    });

    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_local_only',
        content: 'Prefer small, reviewable pull requests by default.',
        annotation: '指令 · self · style',
      }),
    ]));

    const output = await runPromptQueryCommand({
      password: false,
      format: 'text',
      prompt: 'What do I prefer about pull requests?',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('Prefer small, reviewable pull requests by default.');
  });

  it('falls back to local when a non-local provider returns a successful empty search (provider miss)', async () => {
    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => null),
      search: vi.fn(async () => []),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    });

    const writeOutput = vi.fn();
    await runSearchQueryCommand(
      {
        query: 'pull requests',
        options: { format: 'json' },
      },
      {
        loadDb: async () =>
          createDb([
            createBlock({
              id: 'blk_local_match',
              content: 'Prefer small, reviewable pull requests by default.',
              annotation: '指令 · self · style',
            }),
          ]),
        writeOutput,
      },
    );

    const combined = writeOutput.mock.calls.map((call) => String(call[0])).join('\n');
    const parsed = JSON.parse(combined);
    expect(parsed.mode).toBe('search');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].content).toContain('Prefer small, reviewable pull requests');
  });

  it('falls back to local search when provider search is explicitly unavailable', async () => {
    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => null),
      search: vi.fn(async () => {
        throw new MemoryProviderUnavailableError('supermemory down');
      }),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: false, provider: 'supermemory', message: 'down' })),
    });

    const writeOutput = vi.fn();
    await runSearchQueryCommand(
      {
        query: 'pull requests',
        options: { format: 'json' },
      },
      {
        loadDb: async () =>
          createDb([
            createBlock({
              id: 'blk_local_match',
              content: 'Prefer small, reviewable pull requests by default.',
              annotation: '指令 · self · style',
            }),
          ]),
        writeOutput,
      },
    );

    const combined = writeOutput.mock.calls.map((call) => String(call[0])).join('\n');
    const parsed = JSON.parse(combined);
    expect(parsed.mode).toBe('search');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].content).toContain('Prefer small, reviewable pull requests');
  });

  it('surfaces a config error when config file exists but is invalid (no silent local downgrade)', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: { provider: 'supermemory', supermemory: { apiKey: '' } },
      }),
    );

    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_pg',
        content: 'We should keep PostgreSQL.',
        annotation: '决策 · project · database',
      }),
    ]));

    await expect(
      runPromptQueryCommand({
        password: false,
        format: 'text',
        prompt: 'Should we keep PostgreSQL?',
      }),
    ).rejects.toThrow(ConfigError);
  });

  it('surfaces a config error for invalid existing config even when runtime DB is unavailable', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: { provider: 'supermemory', supermemory: { apiKey: '' } },
      }),
    );

    loadRuntimeDb.mockResolvedValue(null);

    await expect(
      runPromptQueryCommand({
        password: false,
        format: 'text',
        prompt: 'Should we keep PostgreSQL?',
      }),
    ).rejects.toThrow(ConfigError);
  });

  it('falls back to local search when provider is explicitly unavailable', async () => {
    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => null),
      search: vi.fn(async () => {
        throw new MemoryProviderUnavailableError('Supermemory provider is not implemented yet.');
      }),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: false, provider: 'supermemory', message: 'not implemented' })),
    });

    const writeOutput = vi.fn();
    await runSearchQueryCommand(
      {
        query: 'pull requests',
        options: { format: 'json' },
      },
      {
        loadDb: async () =>
          createDb([
            createBlock({
              id: 'blk_local_match',
              content: 'Prefer small, reviewable pull requests by default.',
              annotation: '指令 · self · style',
            }),
          ]),
        writeOutput,
      },
    );

    const combined = writeOutput.mock.calls.map((call) => String(call[0])).join('\n');
    const parsed = JSON.parse(combined);
    expect(parsed.mode).toBe('search');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].content).toContain('Prefer small, reviewable pull requests');
  });

  it('surfaces a config error for invalid existing config on the search path (no masking as uninitialized)', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: { provider: 'supermemory', supermemory: { apiKey: '' } },
      }),
    );

    const loadDb = vi.fn(async () => null);
    await expect(
      runSearchQueryCommand(
        { query: 'anything', options: { format: 'json' } },
        { loadDb, writeOutput: vi.fn() },
      ),
    ).rejects.toThrow(ConfigError);
    await expect(
      runSearchQueryCommand(
        { query: 'anything', options: { format: 'json' } },
        { loadDb, writeOutput: vi.fn() },
      ),
    ).rejects.toThrow('Corivo config is invalid');
  });

  it('invokes non-local provider recall even when local runtime DB is unavailable', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: { provider: 'supermemory', supermemory: { apiKey: 'sm_test', containerTag: 'project.test' } },
      }),
    );

    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => ({
        mode: 'recall',
        confidence: 'high',
        whyNow: 'remote hit',
        claim: 'REMOTE: keep PRs small',
        evidence: ['supermemory:1'],
        memoryIds: ['sm:1'],
      })),
      search: vi.fn(async () => []),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    });

    loadRuntimeDb.mockResolvedValue(null);

    const output = await runPromptQueryCommand({
      password: false,
      format: 'text',
      prompt: 'What do I prefer about pull requests?',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('REMOTE: keep PRs small');
  });

  it('invokes non-local provider search even when local runtime DB is unavailable', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: { provider: 'supermemory', supermemory: { apiKey: 'sm_test', containerTag: 'project.test' } },
      }),
    );

    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      recall: vi.fn(async () => null),
      search: vi.fn(async () => [
        createBlock({
          id: 'blk_remote',
          content: 'REMOTE: prefer small reviewable PRs',
          annotation: '指令 · self · style',
        }),
      ]),
      save: vi.fn(async () => {
        throw new Error('not implemented');
      }),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    });

    const writeOutput = vi.fn();
    await runSearchQueryCommand(
      { query: 'pull requests', options: { format: 'json' } },
      { loadDb: async () => null, writeOutput },
    );

    const combined = writeOutput.mock.calls.map((call) => String(call[0])).join('\n');
    const parsed = JSON.parse(combined);
    expect(parsed.mode).toBe('search');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].content).toContain('REMOTE: prefer small reviewable PRs');
  });

  it('prefers markdown memory index for query --prompt when available', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo', 'memory', 'final', 'private'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'memory', 'final', 'private', 'MEMORY.md'),
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable pull requests are the default expectation.\n',
    );
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'memory', 'final', 'private', 'user-short-prs.md'),
      `---
name: User prefers short PRs
description: Canonical preference for small reviewable pull requests
type: user
scope: private
merged_from: [session-001]
---

Prefer small, reviewable pull requests by default.
`,
    );
    loadRuntimeDb.mockResolvedValue(createDb([]));

    const output = await runPromptQueryCommand({
      password: false,
      format: 'text',
      prompt: 'Keep small reviewable pull requests',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('Prefer small, reviewable pull requests by default.');
  });

  it('falls back to raw transcript recall when markdown memory index misses', async () => {
    loadRuntimeDb.mockResolvedValue({
      ...createDb([]),
      listRawSessions: () => [{ sessionKey: 'codex:session-1' }],
      getRawTranscript: () => ({
        session: { sessionKey: 'codex:session-1' },
        messages: [
          {
            content: 'Remember that I prefer small reviewable pull requests.',
          },
        ],
      }),
    });

    const output = await runPromptQueryCommand({
      password: false,
      format: 'text',
      prompt: 'What do I prefer about pull requests?',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('small reviewable pull requests');
  });

  it('returns hook-text output for query --prompt with explicit Corivo attribution guidance', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_pg',
        content: '我们决定继续使用 PostgreSQL 作为主库，理由是 JSON 支持和事务一致性。',
        annotation: '决策 · project · database',
      }),
    ]));

    const output = await runPromptQueryCommand({
      password: false,
      format: 'hook-text',
      prompt: 'Should we keep PostgreSQL for this database work?',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('根据 Corivo 的记忆');
    expect(output).toContain('如果你采纳了');
  });

  it('returns empty output when review finds no anchored memory', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_style',
        content: '团队喜欢简洁的提交信息。',
        annotation: '指令 · self · style',
      }),
    ]));

    const output = await runReviewCommand({
      password: false,
      format: 'text',
      lastMessage: 'I already fixed the failing snapshot tests.',
    });

    expect(output).toBe('');
  });

  it('keeps suggest compatible with post-request review behavior', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_logging',
        content: '日志归档策略还没收尾，需要确认归档周期。',
        annotation: '决策 · project · logging',
      }),
    ]));

    const output = await runSuggestCommand({
      password: false,
      context: 'post-request',
      format: 'text',
      lastMessage: 'I will revisit the logging archive strategy next.',
    });

    expect(output).toContain('[corivo]');
    expect(output).toContain('日志归档');
  });

  it('keeps suggest post-request empty when Claude already gave an obvious next step', async () => {
    loadRuntimeDb.mockResolvedValue(createDb([
      createBlock({
        id: 'blk_logging',
        content: '日志归档策略还没收尾，需要确认归档周期。',
        annotation: '决策 · project · logging',
      }),
    ]));

    const output = await runSuggestCommand({
      password: false,
      context: 'post-request',
      format: 'text',
      lastMessage: 'done, implemented and tests pass',
    });

    expect(output).toBe('');
  });
});
