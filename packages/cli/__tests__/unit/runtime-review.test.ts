import { describe, expect, it } from 'vitest';
import type { Association } from '../../src/models/association.js';
import type { Block } from '../../src/models/block.js';
import { createQueryPack } from '../../src/runtime/query-pack.js';
import { generateReview } from '../../src/runtime/review.js';

interface RuntimeDbStub {
  queryBlocks: (filter?: Record<string, unknown>) => Block[];
  searchBlocks: (query: string, limit?: number) => Block[];
  getBlockAssociations: (blockId: string, minConfidence?: number) => Association[];
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

describe('generateReview', () => {
  it('returns review mode when the assistant message references an unresolved topic', () => {
    const db = createDb([
      createBlock({
        id: 'blk_logging',
        content: '日志归档策略还没收尾，需要确认归档周期。',
        annotation: '决策 · project · logging',
      }),
    ]);

    const result = generateReview(
      db,
      createQueryPack({
        assistantMessage: 'I will revisit the logging archive strategy next.',
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('review');
    expect(result?.memoryIds).toEqual(['blk_logging']);
  });

  it('returns null when no anchored memory exists', () => {
    const db = createDb([
      createBlock({
        id: 'blk_style',
        content: '团队喜欢简洁的提交信息。',
        annotation: '指令 · self · style',
      }),
    ]);

    const result = generateReview(
      db,
      createQueryPack({
        assistantMessage: 'I already fixed the failing snapshot tests.',
      }),
    );

    expect(result).toBeNull();
  });

  it('matches Chinese assistant text against Chinese unfinished memory', () => {
    const db = createDb([
      createBlock({
        id: 'blk_logging',
        content: '日志归档策略还没收尾，需要确认归档周期。',
        annotation: '决策 · project · logging',
      }),
    ]);

    const result = generateReview(
      db,
      createQueryPack({
        assistantMessage: '我会继续处理日志归档策略。',
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.memoryIds).toEqual(['blk_logging']);
  });

  it('does not treat an already-made decision with empty refs as unfinished by default', () => {
    const db = createDb([
      createBlock({
        id: 'blk_cache',
        content: '缓存方案已经确定：继续使用 Redis。',
        annotation: '决策 · project · cache',
        refs: [],
      }),
    ]);

    const result = generateReview(
      db,
      createQueryPack({
        assistantMessage: 'We should keep the Redis cache decision in place.',
      }),
    );

    expect(result).toBeNull();
  });
});
