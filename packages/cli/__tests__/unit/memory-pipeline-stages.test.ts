import { describe, expect, it, vi } from 'vitest';
import type { Block, BlockFilter } from '../../src/models/block.js';
import type {
  ArtifactDescriptor,
  ArtifactWriteInput,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
} from '../../src/memory-pipeline/types.js';
import {
  AppendDetailRecordsStage,
  BlockWorkItem,
  ClaudeSessionSource,
  CollectClaudeSessionsStage,
  CollectStaleBlocksStage,
  ConsolidateSessionSummariesStage,
  DatabaseStaleBlockSource,
  NoopModelProcessor,
  RebuildMemoryIndexStage,
  RefreshMemoryIndexStage,
  StubClaudeSessionSource,
  SummarizeBlockBatchStage,
  SummarizeSessionBatchStage,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
} from '../../src/memory-pipeline/index.js';
import type { StaleBlockSource } from '../../src/memory-pipeline/stages/collect-stale-blocks.js';

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

class RecordingArtifactStore implements MemoryPipelineArtifactStore {
  readonly writes: ArtifactWriteInput[] = [];
  readonly descriptors: ArtifactDescriptor[] = [];

  async writeArtifact(input: ArtifactWriteInput): Promise<ArtifactDescriptor> {
    this.writes.push(input);
    const descriptor: ArtifactDescriptor = {
      id: `test-artifact-${this.writes.length}`,
      kind: input.kind,
      version: 1,
      path: `${input.kind}-${this.writes.length}.json`,
      source: input.source,
      createdAt: Date.now(),
      upstreamIds: input.upstreamIds,
      metadata: input.metadata,
    };
    this.descriptors.push(descriptor);
    return descriptor;
  }

  async persistDescriptor(_descriptor: ArtifactDescriptor): Promise<void> {
    // noop
  }

  async getDescriptor(_id: string): Promise<ArtifactDescriptor | undefined> {
    return undefined;
  }
}

const createContext = (
  artifactStore: MemoryPipelineArtifactStore,
  runId = 'run-test',
): MemoryPipelineContext => ({
  runId,
  trigger: { type: 'manual', runAt: Date.now() },
  artifactStore,
});

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

  it('configures init pipeline with the expected stage order', () => {
    const pipeline = createInitMemoryPipeline({
      sessionSource: new StubClaudeSessionSource(),
    });
    const ids = pipeline.stages.map((stage) => stage.id);
    expect(ids).toEqual([
      'collect-claude-sessions',
      'summarize-session-batch',
      'consolidate-session-summaries',
      'append-detail-records',
      'rebuild-memory-index',
    ]);
  });

  it('configures scheduled pipeline with the expected stage order', () => {
    const pipeline = createScheduledMemoryPipeline({
      staleBlockSource: new DatabaseStaleBlockSource({
        db: { queryBlocks: async () => [] },
      }),
    });
    const ids = pipeline.stages.map((stage) => stage.id);
    expect(ids).toEqual([
      'collect-stale-blocks',
      'summarize-block-batch',
      'append-detail-records',
      'refresh-memory-index',
    ]);
  });

  it('enforces StaleBlockSource when building scheduled pipeline', () => {
    expect(() => createScheduledMemoryPipeline({} as any)).toThrow(
      'StaleBlockSource is required to build scheduled memory pipeline',
    );
    expect(() => new CollectStaleBlocksStage(undefined as any)).toThrow(
      'StaleBlockSource is required',
    );
  });

  it('runs collect claude sessions stage with the provided source', async () => {
    const workItems = [
      { id: 'session-1', kind: 'session', sourceRef: 'test-source' },
    ];
    const sessionSource: ClaudeSessionSource = {
      collect: vi.fn(async () => workItems),
    };
    const store = new RecordingArtifactStore();
    const stage = new CollectClaudeSessionsStage(sessionSource);
    const context = createContext(store, 'run-collect');

    const result = await stage.run(context);

    expect(sessionSource.collect).toHaveBeenCalled();
    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-collect',
      kind: 'work-item',
      source: stage.id,
      body: JSON.stringify(workItems),
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: workItems.length,
      outputCount: workItems.length,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('enforces ClaudeSessionSource when building init pipeline', () => {
    expect(() => createInitMemoryPipeline({} as any)).toThrow(
      'ClaudeSessionSource is required to build init memory pipeline',
    );
    expect(() => new CollectClaudeSessionsStage(undefined as any)).toThrow(
      'ClaudeSessionSource is required',
    );
  });

  it('appends detail records and reports a detail-record artifact', async () => {
    const store = new RecordingArtifactStore();
    const stage = new AppendDetailRecordsStage();
    const context = createContext(store, 'run-detail');

    const result = await stage.run(context);

    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-detail',
      kind: 'detail-record',
      source: stage.id,
      body: '[]',
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('runs collect stale blocks stage with its source dependency', async () => {
    const blocks: BlockWorkItem[] = [
      { id: 'blk-1', kind: 'block', sourceRef: 'db' },
    ];
    const staleSource: StaleBlockSource = {
      collect: vi.fn(async () => blocks),
    };
    const store = new RecordingArtifactStore();
    const stage = new CollectStaleBlocksStage(staleSource);
    const context = createContext(store, 'run-stale');

    const result = await stage.run(context);

    expect(staleSource.collect).toHaveBeenCalled();
    expect(store.writes[0]).toMatchObject({
      runId: 'run-stale',
      kind: 'work-item',
      source: stage.id,
      body: JSON.stringify(blocks),
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: blocks.length,
      outputCount: blocks.length,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('runs summarize session batch stage and emits a contextual summary', async () => {
    const store = new RecordingArtifactStore();
    const stage = new SummarizeSessionBatchStage();
    const context = createContext(store, 'run-summary-session');

    const result = await stage.run(context);

    expect(result.stageId).toBe(stage.id);
    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-summary-session',
      kind: 'summary',
      source: stage.id,
    });
    expect(JSON.parse(write.body)).toEqual({
      runId: 'run-summary-session',
      stage: stage.id,
      items: [],
    });
    expect(result).toMatchObject({
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('runs consolidate session summaries stage', async () => {
    const store = new RecordingArtifactStore();
    const stage = new ConsolidateSessionSummariesStage();
    const context = createContext(store, 'run-consolidate');

    const result = await stage.run(context);

    expect(store.writes[0].kind).toBe('summary');
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-consolidate',
      stage: stage.id,
      consolidated: [],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('runs summarize block batch stage', async () => {
    const store = new RecordingArtifactStore();
    const stage = new SummarizeBlockBatchStage();
    const context = createContext(store, 'run-summary-block');

    const result = await stage.run(context);

    expect(store.writes[0].kind).toBe('summary');
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-summary-block',
      stage: stage.id,
      blocks: [],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('runs refresh memory index stage and writes index artifact', async () => {
    const store = new RecordingArtifactStore();
    const stage = new RefreshMemoryIndexStage();
    const context = createContext(store, 'run-refresh');

    const result = await stage.run(context);

    expect(store.writes[0]).toMatchObject({
      runId: 'run-refresh',
      kind: 'memory-index',
      source: stage.id,
    });
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-refresh',
      stage: stage.id,
      status: 'refreshed',
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('writes a rebuild index artifact with the correct metadata', async () => {
    const store = new RecordingArtifactStore();
    const stage = new RebuildMemoryIndexStage();
    const context = createContext(store, 'run-index');

    const result = await stage.run(context);

    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-index',
      kind: 'memory-index',
      source: stage.id,
    });
    expect(JSON.parse(write.body)).toEqual({
      runId: 'run-index',
      stage: stage.id,
      status: 'rebuilt',
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });
});
