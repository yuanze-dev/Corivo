import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../../src/models/block.js';
import { runCarryOverCommand } from '../../src/cli/commands/carry-over.js';
import { runPromptQueryCommand } from '../../src/cli/commands/query.js';
import { runReviewCommand } from '../../src/cli/commands/review.js';
import { runSuggestCommand } from '../../src/cli/commands/suggest.js';

const { loadRuntimeDb } = vi.hoisted(() => ({
  loadRuntimeDb: vi.fn(),
}));

vi.mock('../../src/cli/commands/runtime-support.js', () => ({
  loadRuntimeDb,
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
  beforeEach(() => {
    loadRuntimeDb.mockReset();
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
