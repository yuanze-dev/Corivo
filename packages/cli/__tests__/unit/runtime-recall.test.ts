import { describe, expect, it } from 'vitest';
import { AssociationDirection, AssociationType, type Association } from '../../src/models/association.js';
import type { Block } from '../../src/models/block.js';
import { createQueryPack } from '../../src/runtime/query-pack.js';
import { generateCarryOver } from '../../src/runtime/carry-over.js';
import { generateRecall } from '../../src/runtime/recall.js';

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

function createAssociation(overrides: Partial<Association>): Association {
  return {
    id: overrides.id ?? 'assoc_test',
    from_id: overrides.from_id ?? 'blk_from',
    to_id: overrides.to_id ?? 'blk_to',
    type: overrides.type ?? AssociationType.RELATED,
    direction: overrides.direction ?? AssociationDirection.ONE_WAY,
    confidence: overrides.confidence ?? 0.9,
    reason: overrides.reason,
    created_at: overrides.created_at ?? 1_700_000_000,
    context_tags: overrides.context_tags,
  };
}

function createDb(blocks: Block[], associations: Association[] = []): RuntimeDbStub {
  return {
    queryBlocks: () => blocks,
    searchBlocks: (query: string) =>
      blocks.filter((block) =>
        `${block.content} ${block.annotation}`.toLowerCase().includes(query.toLowerCase()),
      ),
    getBlockAssociations: (blockId: string) =>
      associations.filter((assoc) => assoc.from_id === blockId || assoc.to_id === blockId),
    getBlock: (id: string) => blocks.find((block) => block.id === id) ?? null,
  };
}

describe('generateCarryOver', () => {
  it('surfaces unfinished recent decisions first', () => {
    const carryBlock = createBlock({
      id: 'blk_carry',
      content: '日志归档策略还没定，待确认冷热分层方案。',
      annotation: '决策 · project · logging',
      updated_at: 1_710_000_000,
      created_at: 1_710_000_000,
    });

    const db = createDb([
      carryBlock,
      createBlock({
        id: 'blk_other',
        content: '团队习惯使用 2 空格缩进。',
        annotation: '指令 · self · style',
        updated_at: 1_700_000_000,
      }),
    ]);

    const result = generateCarryOver(db, { now: 1_710_000_500 });

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('carry_over');
    expect(result?.memoryIds).toEqual(['blk_carry']);
    expect(result?.claim).toContain('日志归档');
  });
});

describe('generateRecall', () => {
  it('returns recall mode for strong direct decision matches', () => {
    const db = createDb([
      createBlock({
        id: 'blk_pg',
        content: '我们决定继续使用 PostgreSQL 作为主库，理由是 JSON 支持和事务一致性。',
        annotation: '决策 · project · database',
      }),
    ]);

    const result = generateRecall(
      db,
      createQueryPack({
        prompt: 'Should we keep PostgreSQL for this database work?',
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('recall');
    expect(result?.confidence).toBe('high');
    expect(result?.memoryIds).toEqual(['blk_pg']);
  });

  it('returns uncertain mode for plausible but weak matches', () => {
    const db = createDb([
      createBlock({
        id: 'blk_auth',
        content: '之前讨论过权限模型和认证边界，需要保持角色权限简单。',
        annotation: '知识 · project · auth',
      }),
    ]);

    const result = generateRecall(
      db,
      createQueryPack({
        prompt: 'Can you think about our auth boundary here?',
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('uncertain');
    expect(result?.confidence).toBe('low');
  });

  it('returns challenge mode when the prompt appears to push against a stored decision', () => {
    const decision = createBlock({
      id: 'blk_cache',
      content: '我们之前决定继续使用 Redis 作为缓存层。',
      annotation: '决策 · project · cache',
    });
    const assoc = createAssociation({
      from_id: 'blk_cache',
      to_id: 'blk_cache_old',
      type: AssociationType.CONFLICTS,
    });
    const db = createDb([decision], [assoc]);

    const result = generateRecall(
      db,
      createQueryPack({
        prompt: 'Should we replace Redis with Memcached for cache?',
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('challenge');
    expect(result?.memoryIds).toEqual(['blk_cache']);
  });
});
