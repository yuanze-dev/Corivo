import { describe, expect, it, vi } from 'vitest';
import type { Block, BlockFilter } from '../../src/models/block.js';
import {
  BlockWorkItem,
  ClaudeSessionSource,
  DatabaseStaleBlockSource,
  NoopModelProcessor,
  StubClaudeSessionSource,
} from '../../src/memory-pipeline/index.js';

type BlockWithExtras = Omit<Block, 'created_at' | 'updated_at'> & {
  created_at?: number;
  updated_at?: number;
  metadata?: Record<string, unknown>;
  freshnessToken?: string;
};

const createBlockRow = (overrides: Partial<BlockWithExtras> = {}): BlockWithExtras => {
  const base: BlockWithExtras = {
    id: 'blk_test',
    content: 'test content',
    annotation: '事实 · stage · test',
    refs: [],
    source: 'test-source',
    vitality: 50,
    status: 'cooling',
    access_count: 0,
    last_accessed: null,
    created_at: 1,
    updated_at: 2,
  };

  return {
    ...base,
    ...overrides,
  };
};

describe('memory pipeline extension points', () => {
  it('provides a no-op model processor for skeleton stages', async () => {
    const processor = new NoopModelProcessor();
    const result = await processor.process(['hello']);
    expect(result.outputs).toEqual(['hello']);
  });

  it('maps stale block rows into block work items and forwards filters', async () => {
    const filter: BlockFilter = { source: 'test-source', limit: 5 };
    const blockRow = createBlockRow({
      id: 'blk_001',
      source: 'test-source',
      metadata: { reason: 'test' },
      freshnessToken: 'fresh-token-123',
    });
    const queryBlocks = vi.fn(async (incoming?: BlockFilter) => {
      return [blockRow];
    });

    const source = new DatabaseStaleBlockSource({
      db: { queryBlocks },
      filter,
    });

    const items: BlockWorkItem[] = await source.collect();

    expect(queryBlocks).toHaveBeenCalledWith(filter);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.id).toBe(blockRow.id);
    expect(item.sourceRef).toBe(blockRow.source);
    expect(item.freshnessToken).toBe(blockRow.freshnessToken);
    expect(item.metadata).toEqual(blockRow.metadata);
  });

  it('derives freshness token from updated_at/created_at when missing', async () => {
    const fallbackRow = createBlockRow({
      id: 'blk_002',
      source: 'fallback-source',
      freshnessToken: undefined,
      updated_at: undefined,
      created_at: 10,
    });
    const queryBlocks = vi.fn(() => [fallbackRow]);
    const source = new DatabaseStaleBlockSource({
      db: { queryBlocks },
      filter: { limit: 1 },
    });

    const fallbackItems: BlockWorkItem[] = await source.collect();
    const [item] = fallbackItems;
    expect(item).toBeDefined();
    expect(item?.freshnessToken).toBe('10');
  });

  it('exercises the Claude session source export from the barrel', async () => {
    const sessionSource: ClaudeSessionSource = new StubClaudeSessionSource();
    await expect(sessionSource.collect()).resolves.toEqual([]);
  });
});
