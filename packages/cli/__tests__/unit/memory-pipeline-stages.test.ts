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
  CompleteRawSessionJobsStage,
  CollectClaudeSessionsStage,
  CollectRawSessionJobsStage,
  CollectStaleBlocksStage,
  ConsolidateSessionSummariesStage,
  DatabaseRawSessionJobSource,
  DatabaseStaleBlockSource,
  ExtractRawMemoriesStage,
  ExtractionBackedModelProcessor,
  ModelProcessor,
  NoopModelProcessor,
  RebuildMemoryIndexStage,
  RefreshMemoryIndexStage,
  StubClaudeSessionSource,
  SummarizeBlockBatchStage,
  SummarizeSessionBatchStage,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
} from '../../src/memory-pipeline/index.js';
import type { RawSessionJobSource } from '../../src/memory-pipeline/sources/raw-session-job-source.js';
import { DatabaseClaudeSessionSource } from '../../src/memory-pipeline/sources/claude-session-source.js';
import type { StaleBlockSource } from '../../src/memory-pipeline/stages/collect-stale-blocks.js';
import {
  RAW_SESSION_JOBS_STATE_KEY,
  RAW_SESSION_JOB_SOURCE_STATE_KEY,
} from '../../src/memory-pipeline/pipeline-state.js';

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
  readonly bodies = new Map<string, string>();

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
    this.bodies.set(descriptor.id, input.body);
    return descriptor;
  }

  async persistDescriptor(_descriptor: ArtifactDescriptor): Promise<void> {
    // noop
  }

  async getDescriptor(_id: string): Promise<ArtifactDescriptor | undefined> {
    return undefined;
  }

  async readArtifact(id: string): Promise<string> {
    const body = this.bodies.get(id);
    if (!body) {
      throw new Error(`artifact not found: ${id}`);
    }
    return body;
  }

  async listArtifacts(query?: { runId?: string; source?: string; kind?: string }): Promise<ArtifactDescriptor[]> {
    return this.descriptors.filter((descriptor, index) => {
      const write = this.writes[index];
      if (!write) {
        return false;
      }

      if (query?.runId && write.runId !== query.runId) {
        return false;
      }

      if (query?.source && descriptor.source !== query.source) {
        return false;
      }

      if (query?.kind && descriptor.kind !== query.kind) {
        return false;
      }

      return true;
    });
  }
}

const createContext = (
  artifactStore: MemoryPipelineArtifactStore,
  runId = 'run-test',
): MemoryPipelineContext => ({
  runId,
  trigger: { type: 'manual', runAt: Date.now() },
  artifactStore,
  state: new Map(),
});

describe('memory pipeline extension points', () => {
  it('provides a no-op model processor for skeleton stages', async () => {
    const processor = new NoopModelProcessor();
    const result = await processor.process(['hello']);
    expect(result.outputs).toEqual(['hello']);
  });

  it('maps extraction success into processor outputs', async () => {
    const mockExtract = vi.fn().mockResolvedValue({
      provider: 'claude',
      status: 'success',
      result: 'summary',
    });

    const processor = new ExtractionBackedModelProcessor({
      provider: 'claude',
      extract: mockExtract,
    });

    const result = await processor.process(['hello']);

    expect(mockExtract).toHaveBeenCalled();
    expect(result.outputs).toEqual(['summary']);
    expect(result.metadata).toMatchObject({ provider: 'claude', status: 'success' });
  });

  it('maps extraction error and timeout metadata without outputs', async () => {
    const errorExtract = vi.fn().mockResolvedValue({
      provider: 'claude',
      status: 'error',
      result: null,
      error: 'provider down',
    });
    const timeoutExtract = vi.fn().mockResolvedValue({
      provider: 'claude',
      status: 'timeout',
      result: null,
      error: 'timed out',
    });

    const errorProcessor = new ExtractionBackedModelProcessor({
      provider: 'claude',
      extract: errorExtract,
    });
    const timeoutProcessor = new ExtractionBackedModelProcessor({
      provider: 'claude',
      extract: timeoutExtract,
    });

    await expect(errorProcessor.process(['hello'])).resolves.toMatchObject({
      outputs: [],
      metadata: {
        provider: 'claude',
        status: 'error',
        error: 'provider down',
      },
    });
    await expect(timeoutProcessor.process(['hello'])).resolves.toMatchObject({
      outputs: [],
      metadata: {
        provider: 'claude',
        status: 'timeout',
        error: 'timed out',
      },
    });
  });

  it('maps thrown extractor failures into processor error metadata', async () => {
    const processor = new ExtractionBackedModelProcessor({
      provider: 'claude',
      extract: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(processor.process(['hello'])).resolves.toMatchObject({
      outputs: [],
      metadata: {
        provider: 'claude',
        status: 'error',
        error: 'boom',
      },
    });
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
      'extract-raw-memories',
      'summarize-session-batch',
      'consolidate-session-summaries',
      'append-detail-records',
      'rebuild-memory-index',
    ]);
  });

  it('configures scheduled pipeline with the expected stage order', () => {
    const pipeline = createScheduledMemoryPipeline({
      rawSessionJobSource: new DatabaseRawSessionJobSource({
        queue: { claimNext: () => null, markSucceeded: () => {}, markFailed: () => {} } as any,
        repository: { getTranscript: () => null } as any,
      }),
    });
    const ids = pipeline.stages.map((stage) => stage.id);
    expect(ids).toEqual([
      'collect-raw-session-jobs',
      'summarize-block-batch',
      'append-detail-records',
      'refresh-memory-index',
      'complete-raw-session-jobs',
    ]);
  });

  it('enforces RawSessionJobSource when building scheduled pipeline', () => {
    expect(() => createScheduledMemoryPipeline({} as any)).toThrow(
      'RawSessionJobSource is required to build scheduled memory pipeline',
    );
    expect(() => new CollectRawSessionJobsStage(undefined as any)).toThrow(
      'RawSessionJobSource is required',
    );
    expect(() => new CollectStaleBlocksStage(undefined as any)).toThrow(
      'StaleBlockSource is required',
    );
  });

  it('runs collect claude sessions stage with the provided source', async () => {
    const sessionSource: ClaudeSessionSource = new DatabaseClaudeSessionSource({
      repository: {
        querySessionRecords: vi.fn(async () => [
          {
            id: 'session-1',
            sessionId: 'session-1',
            kind: 'claude-session',
            host: 'claude',
            sourceRef: 'claude://session-1',
            updatedAt: 42,
            startedAt: 40,
            messages: [
              {
                id: 'message-1',
                role: 'user',
                content: 'Summarize this chat.',
                sequence: 1,
                createdAt: 41,
              },
            ],
          },
        ]),
      },
      mode: 'full',
    });
    const store = new RecordingArtifactStore();
    const stage = new CollectClaudeSessionsStage(sessionSource);
    const context = createContext(store, 'run-collect');

    const result = await stage.run(context);

    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-collect',
      kind: 'work-item',
      source: stage.id,
      body: JSON.stringify([
        {
          id: 'session-1',
          kind: 'session',
          sourceRef: 'claude://session-1',
          freshnessToken: '42',
          metadata: {
            session: {
              id: 'session-1',
              sessionId: 'session-1',
              kind: 'claude-session',
              host: 'claude',
              sourceRef: 'claude://session-1',
              updatedAt: 42,
              startedAt: 40,
              messages: [
                {
                  id: 'message-1',
                  role: 'user',
                  content: 'Summarize this chat.',
                  sequence: 1,
                  createdAt: 41,
                },
              ],
            },
          },
        },
      ]),
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('rejects non-claude session work items before writing artifacts', async () => {
    const sessionSource: ClaudeSessionSource = {
      collect: vi.fn(async () => [
        {
          id: 'cursor-1',
          kind: 'session',
          sourceRef: 'cursor://session-1',
          freshnessToken: '10',
          metadata: {
            session: {
              id: 'cursor-1',
              sessionId: 'cursor-1',
              kind: 'cursor-session',
              host: 'cursor',
              sourceRef: 'cursor://session-1',
              messages: [],
            },
          },
        },
      ]),
    };
    const store = new RecordingArtifactStore();
    const stage = new CollectClaudeSessionsStage(sessionSource);
    const context = createContext(store, 'run-reject');

    await expect(stage.run(context)).rejects.toThrow(
      'CollectClaudeSessionsStage only accepts claude-session work items',
    );
    expect(store.writes).toEqual([]);
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

  it('runs collect raw session jobs stage with its source dependency', async () => {
    const jobs = [
      {
        id: 'job-1',
        kind: 'session-job' as const,
        sourceRef: 'claude-code:sess-1',
        host: 'claude-code' as const,
        sessionKey: 'claude-code:sess-1',
        session: {
          id: 'raw-session-1',
          host: 'claude-code' as const,
          externalSessionId: 'sess-1',
          sessionKey: 'claude-code:sess-1',
          sourceType: 'history-import' as const,
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [{ id: 'msg-1', role: 'user' as const, content: 'hello', ordinal: 1 }],
        job: {
          id: 'job-1',
          host: 'claude-code' as const,
          sessionKey: 'claude-code:sess-1',
          jobType: 'extract-session' as const,
          status: 'running' as const,
          dedupeKey: 'extract-session:claude-code:sess-1',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];
    const source: RawSessionJobSource = {
      collect: vi.fn(async () => jobs),
      markSucceeded: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const store = new RecordingArtifactStore();
    const stage = new CollectRawSessionJobsStage(source);
    const context = createContext(store, 'run-session-jobs');

    const result = await stage.run(context);

    expect(source.collect).toHaveBeenCalled();
    expect(store.writes[0]).toMatchObject({
      runId: 'run-session-jobs',
      kind: 'work-item',
      source: stage.id,
      body: JSON.stringify(jobs),
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: jobs.length,
      outputCount: jobs.length,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
    expect(context.state.get(RAW_SESSION_JOBS_STATE_KEY)).toEqual(jobs);
    expect(context.state.get(RAW_SESSION_JOB_SOURCE_STATE_KEY)).toBe(source);
  });

  it('summarizes transcript-derived content from collected raw session jobs', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async (inputs: string[]) => ({
        outputs: inputs.map((text) => `summary: ${text}`),
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = new SummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary');
    context.state.set(RAW_SESSION_JOBS_STATE_KEY, [
      {
        id: 'job-1',
        kind: 'session-job',
        sourceRef: 'claude-code:sess-1',
        host: 'claude-code',
        sessionKey: 'claude-code:sess-1',
        session: {
          id: 'raw-session-1',
          host: 'claude-code',
          externalSessionId: 'sess-1',
          sessionKey: 'claude-code:sess-1',
          sourceType: 'history-import',
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [
          {
            id: 'msg-1',
            sessionKey: 'claude-code:sess-1',
            role: 'user',
            content: 'remember this',
            ordinal: 1,
            ingestedFrom: 'host-import',
            createdDbAt: 1,
            updatedDbAt: 1,
          },
          {
            id: 'msg-2',
            sessionKey: 'claude-code:sess-1',
            role: 'assistant',
            content: 'noted',
            ordinal: 2,
            ingestedFrom: 'host-import',
            createdDbAt: 2,
            updatedDbAt: 2,
          },
        ],
        job: {
          id: 'job-1',
          host: 'claude-code',
          sessionKey: 'claude-code:sess-1',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:claude-code:sess-1',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledWith([
      'user: remember this\nassistant: noted',
    ]);
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-session-job-summary',
      stage: stage.id,
      blocks: ['user: remember this\nassistant: noted'],
      summaries: ['summary: user: remember this\nassistant: noted'],
      metadata: { provider: 'claude', status: 'success' },
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
  });

  it('processes transcript-derived raw session jobs one-by-one to preserve per-job output cardinality', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async (inputs: string[]) => ({
        outputs: [`summary: ${inputs[0]}`],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = new SummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-multi');
    context.state.set(RAW_SESSION_JOBS_STATE_KEY, [
      {
        id: 'job-1',
        kind: 'session-job',
        sourceRef: 'claude-code:sess-1',
        host: 'claude-code',
        sessionKey: 'claude-code:sess-1',
        session: {
          id: 'raw-session-1',
          host: 'claude-code',
          externalSessionId: 'sess-1',
          sessionKey: 'claude-code:sess-1',
          sourceType: 'history-import',
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [
          {
            id: 'msg-1',
            sessionKey: 'claude-code:sess-1',
            role: 'user',
            content: 'first',
            ordinal: 1,
            ingestedFrom: 'host-import',
            createdDbAt: 1,
            updatedDbAt: 1,
          },
        ],
        job: {
          id: 'job-1',
          host: 'claude-code',
          sessionKey: 'claude-code:sess-1',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:claude-code:sess-1',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        id: 'job-2',
        kind: 'session-job',
        sourceRef: 'claude-code:sess-2',
        host: 'claude-code',
        sessionKey: 'claude-code:sess-2',
        session: {
          id: 'raw-session-2',
          host: 'claude-code',
          externalSessionId: 'sess-2',
          sessionKey: 'claude-code:sess-2',
          sourceType: 'history-import',
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [
          {
            id: 'msg-2',
            sessionKey: 'claude-code:sess-2',
            role: 'assistant',
            content: 'second',
            ordinal: 1,
            ingestedFrom: 'host-import',
            createdDbAt: 1,
            updatedDbAt: 1,
          },
        ],
        job: {
          id: 'job-2',
          host: 'claude-code',
          sessionKey: 'claude-code:sess-2',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:claude-code:sess-2',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenNthCalledWith(1, ['user: first']);
    expect(processor.process).toHaveBeenNthCalledWith(2, ['assistant: second']);
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-session-job-summary-multi',
      stage: stage.id,
      blocks: ['user: first', 'assistant: second'],
      summaries: ['summary: user: first', 'summary: assistant: second'],
      metadata: { provider: 'claude', status: 'success' },
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 2,
      outputCount: 2,
    });
  });

  it('preserves provider error text when transcript-derived summarization fails', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'claude', status: 'error', error: 'model overloaded' },
      })),
    };
    const stage = new SummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-fail');
    context.state.set(RAW_SESSION_JOBS_STATE_KEY, [
      {
        id: 'job-1',
        kind: 'session-job',
        sourceRef: 'claude-code:sess-1',
        host: 'claude-code',
        sessionKey: 'claude-code:sess-1',
        session: {
          id: 'raw-session-1',
          host: 'claude-code',
          externalSessionId: 'sess-1',
          sessionKey: 'claude-code:sess-1',
          sourceType: 'history-import',
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [
          {
            id: 'msg-1',
            sessionKey: 'claude-code:sess-1',
            role: 'user',
            content: 'remember this',
            ordinal: 1,
            ingestedFrom: 'host-import',
            createdDbAt: 1,
            updatedDbAt: 1,
          },
        ],
        job: {
          id: 'job-1',
          host: 'claude-code',
          sessionKey: 'claude-code:sess-1',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:claude-code:sess-1',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const result = await stage.run(context);

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'failed',
      inputCount: 1,
      outputCount: 0,
      error: 'model overloaded',
    });
  });

  it('marks collected raw session jobs succeeded after downstream stages finish', async () => {
    const source: RawSessionJobSource = {
      collect: vi.fn(async () => []),
      markSucceeded: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const stage = new CompleteRawSessionJobsStage();
    const context = createContext(new RecordingArtifactStore(), 'run-complete-session-jobs');
    context.state.set(RAW_SESSION_JOB_SOURCE_STATE_KEY, source);
    context.state.set(RAW_SESSION_JOBS_STATE_KEY, [
      {
        id: 'job-1',
        kind: 'session-job',
        sourceRef: 'claude-code:sess-1',
        host: 'claude-code',
        sessionKey: 'claude-code:sess-1',
        session: {
          id: 'raw-session-1',
          host: 'claude-code',
          externalSessionId: 'sess-1',
          sessionKey: 'claude-code:sess-1',
          sourceType: 'history-import',
          createdAt: 1,
          updatedAt: 2,
        },
        transcript: [],
        job: {
          id: 'job-1',
          host: 'claude-code',
          sessionKey: 'claude-code:sess-1',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:claude-code:sess-1',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const result = await stage.run(context);

    expect(source.markSucceeded).toHaveBeenCalledWith('job-1');
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
      artifactIds: [],
    });
  });

  it('runs summarize session batch stage and emits a contextual summary', async () => {
    const store = new RecordingArtifactStore();
    const sessionContents = ['session-1', 'session-2'];
    const processor: ModelProcessor = {
      process: vi.fn(async (inputs: string[]) => ({
        outputs: inputs.map((text) => `summary: ${text}`),
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = new SummarizeSessionBatchStage({
      processor,
      sessionContents,
    });
    const context = createContext(store, 'run-summary-session');

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledWith(sessionContents);
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
      items: sessionContents,
      summaries: ['summary: session-1', 'summary: session-2'],
      metadata: { provider: 'claude', status: 'success' },
    });
    expect(result).toMatchObject({
      status: 'success',
      inputCount: sessionContents.length,
      outputCount: 2,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('extracts one raw markdown artifact per collected session work item', async () => {
    const store = new RecordingArtifactStore();
    const collectDescriptor = await store.writeArtifact({
      runId: 'run-extract',
      kind: 'work-item',
      source: 'collect-claude-sessions',
      body: JSON.stringify([
        {
          id: 'session-1',
          kind: 'session',
          sourceRef: 'claude://session-1',
          freshnessToken: '42',
          metadata: {
            session: {
              id: 'session-1',
              sessionId: 'session-1',
              sourceRef: 'claude://session-1',
              messages: [
                { role: 'user', content: 'Remember that I prefer short PR descriptions.' },
                { role: 'assistant', content: 'I will remember that preference.' },
              ],
            },
          },
        },
        {
          id: 'session-2',
          kind: 'session',
          sourceRef: 'claude://session-2',
          freshnessToken: '84',
          metadata: {
            session: {
              id: 'session-2',
              sessionId: 'session-2',
              sourceRef: 'claude://session-2',
              messages: [{ role: 'user', content: 'No durable memory here.' }],
            },
          },
        },
      ]),
    });
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: [
            '<!-- FILE: private/short-prs.md -->\n```markdown\nremembered\n```',
          ],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [],
          metadata: { provider: 'claude', status: 'success' },
        }),
    };
    const stage = new ExtractRawMemoriesStage({ processor });

    const result = await stage.run(createContext(store, 'run-extract'));

    expect(processor.process).toHaveBeenCalledTimes(2);
    expect((processor.process as any).mock.calls[0][0][0]).toContain('Session filename: session-1.md');
    expect((processor.process as any).mock.calls[0][0][0]).toContain(
      'Remember that I prefer short PR descriptions.',
    );
    expect((processor.process as any).mock.calls[1][0][0]).toContain('Session filename: session-2.md');
    expect(store.writes.slice(1)).toMatchObject([
      {
        runId: 'run-extract',
        kind: 'raw-memory-batch',
        source: 'extract-raw-memories',
        upstreamIds: [collectDescriptor.id],
      },
      {
        runId: 'run-extract',
        kind: 'raw-memory-batch',
        source: 'extract-raw-memories',
        upstreamIds: [collectDescriptor.id],
      },
    ]);
    expect(JSON.parse(store.writes[1].body)).toEqual({
      sessionId: 'session-1',
      markdown: '<!-- FILE: private/short-prs.md -->\n```markdown\nremembered\n```',
    });
    expect(JSON.parse(store.writes[2].body)).toEqual({
      sessionId: 'session-2',
      markdown: '<!-- NO_MEMORIES -->',
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 2,
      outputCount: 2,
      artifactIds: [store.descriptors[1].id, store.descriptors[2].id],
    });
  });

  it('marks raw extraction as partial and does not emit NO_MEMORIES when a processor call times out', async () => {
    const store = new RecordingArtifactStore();
    await store.writeArtifact({
      runId: 'run-extract-partial',
      kind: 'work-item',
      source: 'collect-claude-sessions',
      body: JSON.stringify([
        {
          id: 'session-1',
          kind: 'session',
          sourceRef: 'claude://session-1',
          metadata: {
            session: {
              id: 'session-1',
              sessionId: 'session-1',
              sourceRef: 'claude://session-1',
              messages: [{ role: 'user', content: 'Remember my PR style.' }],
            },
          },
        },
        {
          id: 'session-2',
          kind: 'session',
          sourceRef: 'claude://session-2',
          metadata: {
            session: {
              id: 'session-2',
              sessionId: 'session-2',
              sourceRef: 'claude://session-2',
              messages: [{ role: 'user', content: 'This one times out.' }],
            },
          },
        },
      ]),
    });
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: ['<!-- FILE: private/pr-style.md -->\n```markdown\nshort PRs\n```'],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [],
          metadata: { provider: 'claude', status: 'timeout', error: 'timed out' },
        }),
    };
    const stage = new ExtractRawMemoriesStage({ processor });

    const result = await stage.run(createContext(store, 'run-extract-partial'));

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'partial',
      inputCount: 2,
      outputCount: 1,
      error: 'timed out',
      artifactIds: [store.descriptors[1].id],
    });
    expect(store.writes).toHaveLength(2);
    expect(JSON.parse(store.writes[1].body)).toEqual({
      sessionId: 'session-1',
      markdown: '<!-- FILE: private/pr-style.md -->\n```markdown\nshort PRs\n```',
    });
  });

  it('fails fast when a collected session work item lacks a valid session transcript payload', async () => {
    const store = new RecordingArtifactStore();
    await store.writeArtifact({
      runId: 'run-extract-invalid-session',
      kind: 'work-item',
      source: 'collect-claude-sessions',
      body: JSON.stringify([
        {
          id: 'session-1',
          kind: 'session',
          sourceRef: 'claude://session-1',
          metadata: {
            session: {
              id: 'session-1',
              sessionId: 'session-1',
              sourceRef: 'claude://session-1',
              messages: [],
            },
          },
        },
      ]),
    });
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: ['should not run'],
      })),
    };
    const stage = new ExtractRawMemoriesStage({ processor });

    await expect(stage.run(createContext(store, 'run-extract-invalid-session'))).rejects.toThrow(
      'ExtractRawMemoriesStage requires a valid session payload with at least one usable message',
    );
    expect(processor.process).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(1);
  });

  it('marks summarize session batch as failed when processor returns no outputs', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'claude', status: 'timeout', error: 'timed out' },
      })),
    };
    const stage = new SummarizeSessionBatchStage({
      processor,
      sessionContents: ['session-timeout'],
    });

    const result = await stage.run(createContext(store, 'run-summary-session-fail'));
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-summary-session-fail',
      stage: stage.id,
      items: ['session-timeout'],
      summaries: [],
      metadata: { provider: 'claude', status: 'timeout', error: 'timed out' },
    });

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'failed',
      inputCount: 1,
      outputCount: 0,
      error: 'timed out',
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

  it('runs summarize block batch stage and writes block summaries', async () => {
    const store = new RecordingArtifactStore();
    const blockContents = ['block-A'];
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: ['block summary'],
        metadata: { provider: 'codex', status: 'success' },
      })),
    };
    const stage = new SummarizeBlockBatchStage({
      processor,
      blockContents,
    });
    const context = createContext(store, 'run-summary-block');

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledWith(blockContents);
    expect(store.writes[0].kind).toBe('summary');
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-summary-block',
      stage: stage.id,
      blocks: blockContents,
      summaries: ['block summary'],
      metadata: { provider: 'codex', status: 'success' },
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: blockContents.length,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('marks summarize block batch as failed when processor errors', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'codex', status: 'error', error: 'provider failed' },
      })),
    };
    const stage = new SummarizeBlockBatchStage({
      processor,
      blockContents: ['block-timeout'],
    });

    const result = await stage.run(createContext(store, 'run-summary-block-fail'));
    expect(JSON.parse(store.writes[0].body)).toEqual({
      runId: 'run-summary-block-fail',
      stage: stage.id,
      blocks: ['block-timeout'],
      summaries: [],
      metadata: { provider: 'codex', status: 'error', error: 'provider failed' },
    });

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'failed',
      inputCount: 1,
      outputCount: 0,
      error: 'provider failed',
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
