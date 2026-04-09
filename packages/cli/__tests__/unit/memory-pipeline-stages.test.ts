import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Block, BlockFilter } from '../../src/domain/memory/models/block.js';
import type {
  ArtifactDescriptor,
  ArtifactWriteInput,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
} from '../../src/memory-pipeline/types.js';
import {
  ArtifactStore,
  BlockWorkItem,
  ClaudeSessionSource,
  CompleteRawSessionJobsStage,
  DatabaseRawSessionJobSource,
  DatabaseStaleBlockSource,
  ExtractionBackedModelProcessor,
  ModelProcessor,
  NoopModelProcessor,
  StubClaudeSessionSource,
  createAppendDetailRecordsStage,
  createCollectClaudeSessionsStage,
  createCollectRawSessionJobsStage,
  createCollectStaleBlocksStage,
  createConsolidateSessionSummariesStage,
  createExtractRawMemoriesStage,
  createRebuildMemoryIndexStage,
  createRefreshMemoryIndexStage,
  createSyncProviderMemoriesStage,
  createSummarizeBlockBatchStage,
  createSummarizeSessionBatchStage,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
} from '../../src/memory-pipeline/index.js';
import type { RawSessionJobSource } from '../../src/memory-pipeline/sources/raw-session-job-source.js';
import { MergeFinalMemoriesStage } from '../../src/memory-pipeline/stages/merge-final-memories.js';
import { DatabaseClaudeSessionSource } from '../../src/memory-pipeline/sources/claude-session-source.js';
import type { StaleBlockSource } from '../../src/memory-pipeline/stages/collect-stale-blocks.js';
import {
  createMemoryPipelineState,
  setClaimedRawSessionJobs,
} from '../../src/memory-pipeline/pipeline-state.js';
import { buildRawExtractionPrompt } from '../../src/memory-pipeline/prompts/raw-extraction-prompt.js';

const buildRawMemoryItems = (input: {
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  scope: 'private' | 'team';
  sourceSession: string;
  body: string;
  forget?: boolean | string;
}) => [
  {
    frontmatter: {
      name: input.name,
      description: input.description,
      type: input.type,
      scope: input.scope,
      source_session: input.sourceSession,
      ...(input.forget === undefined ? {} : { forget: input.forget }),
    },
    body: input.body,
  },
];

const buildRawMemoryMarkdown = (input: {
  filePath: string;
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  scope: 'private' | 'team';
  sourceSession: string;
  body: string;
}): string => `<!-- FILE: ${input.filePath} -->
\`\`\`markdown
---
name: ${input.name}
description: ${input.description}
type: ${input.type}
scope: ${input.scope}
source_session: ${input.sourceSession}
---

${input.body}
\`\`\``;

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
  readonly memoryFiles = new Map<string, string>();

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

  async writeMemoryFile(relativePath: string, body: string): Promise<string> {
    this.memoryFiles.set(relativePath, body);
    return relativePath;
  }

  async readMemoryFile(relativePath: string): Promise<string> {
    const body = this.memoryFiles.get(relativePath);
    if (body === undefined) {
      throw new Error(`memory file not found: ${relativePath}`);
    }
    return body;
  }

  async listMemoryFiles(relativeDir = ''): Promise<string[]> {
    const prefix = relativeDir ? `${relativeDir.replace(/\/+$/, '')}/` : '';
    return [...this.memoryFiles.keys()]
      .filter((file) => file.startsWith(prefix))
      .sort();
  }

  async listFinalMemoryFiles(kind: 'detail' | 'index' | 'all' = 'all'): Promise<string[]> {
    const finalFiles = await this.listMemoryFiles('final');
    if (kind === 'all') {
      return finalFiles;
    }
    if (kind === 'index') {
      return finalFiles.filter((file) => file.endsWith('/MEMORY.md'));
    }
    return finalFiles.filter((file) => file.endsWith('.md') && !file.endsWith('/MEMORY.md'));
  }
}

const createContext = (
  artifactStore: MemoryPipelineArtifactStore,
  runId = 'run-test',
): MemoryPipelineContext => ({
  runId,
  trigger: { type: 'manual', runAt: Date.now() },
  artifactStore,
  state: createMemoryPipelineState(),
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
      'merge-final-memories',
      'summarize-session-batch',
      'consolidate-session-summaries',
      'append-detail-records',
      'rebuild-memory-index',
    ]);
  });

  it('configures scheduled pipeline with the expected stage order', () => {
    const pipeline = createScheduledMemoryPipeline({
      rawSessionJobSource: {
        collect: async () => [],
        markSucceeded: async () => {},
        markFailed: async () => {},
      },
    });
    const ids = pipeline.stages.map((stage) => stage.id);
    expect(ids).toEqual([
      'collect-raw-session-jobs',
      'summarize-block-batch',
      'merge-final-memories',
      'append-detail-records',
      'refresh-memory-index',
      'complete-raw-session-jobs',
    ]);
  });

  it('configures scheduled pipeline with provider sync when a remote memory provider is injected', () => {
    const pipeline = createScheduledMemoryPipeline({
      rawSessionJobSource: {
        collect: async () => [],
        markSucceeded: async () => {},
        markFailed: async () => {},
      },
      memoryProvider: {
        provider: 'supermemory',
        save: vi.fn(),
        search: vi.fn(),
        recall: vi.fn(),
        healthcheck: vi.fn(),
      } as any,
      projectTag: 'project.test',
    });

    expect(pipeline.stages.map((stage) => stage.id)).toEqual([
      'collect-raw-session-jobs',
      'summarize-block-batch',
      'merge-final-memories',
      'append-detail-records',
      'refresh-memory-index',
      'sync-provider-memories',
      'complete-raw-session-jobs',
    ]);
  });

  it('enforces RawSessionJobSource when building scheduled pipeline', () => {
    expect(() => createScheduledMemoryPipeline({} as unknown as { rawSessionJobSource: RawSessionJobSource })).toThrow(
      'RawSessionJobSource is required to build scheduled memory pipeline',
    );
    expect(() => createCollectRawSessionJobsStage(undefined as unknown as RawSessionJobSource)).toThrow(
      'RawSessionJobSource is required',
    );
    expect(() => createCollectStaleBlocksStage(undefined as unknown as StaleBlockSource)).toThrow(
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
    const stage = createCollectClaudeSessionsStage(sessionSource);
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
    expect(context.state.collectedSessions).toHaveLength(1);
    expect(context.state.collectedSessions[0]?.sourceRef).toBe('claude://session-1');
    expect(context.state.collectedSessions[0]?.metadata?.session?.sessionId).toBe('session-1');
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
    const stage = createCollectClaudeSessionsStage(sessionSource);
    const context = createContext(store, 'run-reject');

    await expect(stage.run(context)).rejects.toThrow(
      'CollectClaudeSessionsStage only accepts claude-session work items',
    );
    expect(store.writes).toEqual([]);
  });

  it('enforces ClaudeSessionSource when building init pipeline', () => {
    expect(() => createInitMemoryPipeline({} as unknown as { sessionSource: ClaudeSessionSource })).toThrow(
      'ClaudeSessionSource is required to build init memory pipeline',
    );
    expect(() => createCollectClaudeSessionsStage(undefined as unknown as ClaudeSessionSource)).toThrow(
      'ClaudeSessionSource is required',
    );
  });

  it('appends detail records from final memory files and reports a detail-record artifact', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/private/user-short-prs.md',
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
    await store.writeMemoryFile(
      'final/private/MEMORY.md',
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
    );
    const stage = createAppendDetailRecordsStage();
    const context = createContext(store, 'run-detail');

    const result = await stage.run(context);

    const [write] = store.writes;
    expect(write.runId).toBe('run-detail');
    expect(write.kind).toBe('detail-record');
    expect(write.source).toBe(stage.id);
    expect(JSON.parse(write.body)).toEqual({
      files: [
        {
          path: 'final/private/user-short-prs.md',
          content: expect.stringContaining('merged_from: [session-001]'),
        },
      ],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('refreshes the memory index artifact from existing MEMORY.md files', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/private/MEMORY.md',
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
    );
    await store.writeMemoryFile(
      'final/team/MEMORY.md',
      '- [Release check cadence](release-checks.md) — Post-release verification is a standing team habit.\n',
    );
    const stage = createRefreshMemoryIndexStage();
    const context = createContext(store, 'run-refresh-index');
    context.state.mergedFinalOutputs.files = [
      'memory/final/private/MEMORY.md',
      'memory/final/team/MEMORY.md',
    ];
    const result = await stage.run(context);
    const [write] = store.writes;

    expect(write.kind).toBe('memory-index');
    expect(JSON.parse(write.body)).toEqual({
      indexes: [
        {
          path: 'final/private/MEMORY.md',
          content:
            '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
        },
        {
          path: 'final/team/MEMORY.md',
          content:
            '- [Release check cadence](release-checks.md) — Post-release verification is a standing team habit.\n',
        },
      ],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 2,
      outputCount: 2,
    });
    expect(context.state.indexRefresh?.stageId).toBe(stage.id);
    expect(context.state.indexRefresh?.indexCount).toBe(2);
  });

  it('rebuilds the memory index artifact from existing MEMORY.md files', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/private/MEMORY.md',
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
    );
    const stage = createRebuildMemoryIndexStage();
    const context = createContext(store, 'run-rebuild-index');
    context.state.mergedFinalOutputs.files = ['memory/final/private/MEMORY.md'];
    const result = await stage.run(context);
    const [write] = store.writes;

    expect(write.kind).toBe('memory-index');
    expect(JSON.parse(write.body)).toEqual({
      indexes: [
        {
          path: 'final/private/MEMORY.md',
          content:
            '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
        },
      ],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
  });

  it('runs collect stale blocks stage with its source dependency', async () => {
    const blocks: BlockWorkItem[] = [
      { id: 'blk-1', kind: 'block', sourceRef: 'db' },
    ];
    const staleSource: StaleBlockSource = {
      collect: vi.fn(async () => blocks),
    };
    const store = new RecordingArtifactStore();
    const stage = createCollectStaleBlocksStage(staleSource);
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
    const stage = createCollectRawSessionJobsStage(source);
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
    expect(context.state.rawSessionJobs.claimed).toEqual(jobs);
    expect(context.state.rawSessionJobs.source).toBe(source);
  });

  it('summarizes transcript-derived content from collected raw session jobs', async () => {
    const store = new RecordingArtifactStore();
    const expectedMarkdown = buildRawMemoryMarkdown({
      filePath: 'private/session-memory.md',
      name: 'Session memory',
      description: 'Remembered from session transcript',
      type: 'user',
      scope: 'private',
      sourceSession: 'sess-1.md',
      body: 'remembered from transcript',
    });
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [expectedMarkdown],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary');
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
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
      ],
    });

    const result = await stage.run(context);

    const expectedPrompt = buildRawExtractionPrompt({
      sessionFilename: 'sess-1.md',
      sessionTranscript: 'user: remember this\nassistant: noted',
    });
    expect(processor.process).toHaveBeenCalledWith(
      [expectedPrompt],
      { timeoutMs: 36000 },
    );
    expect(JSON.parse(store.writes[0].body)).toEqual({
      sessionId: 'sess-1',
      items: buildRawMemoryItems({
        name: 'Session memory',
        description: 'Remembered from session transcript',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-1.md',
        body: 'remembered from transcript',
      }),
    });
    expect(store.writes[0]).toMatchObject({
      runId: 'run-session-job-summary',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
    });
    expect(JSON.parse(store.writes[1].body)).toEqual({
      runId: 'run-session-job-summary',
      stage: stage.id,
      blocks: [expectedPrompt],
      summaries: [expectedMarkdown],
      metadata: { provider: 'claude', status: 'success' },
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
      artifactIds: [store.descriptors[0].id, store.descriptors[1].id],
    });
  });

  it('processes transcript-derived raw session jobs one-by-one to preserve per-job output cardinality', async () => {
    const store = new RecordingArtifactStore();
    const expectedFirstMarkdown = buildRawMemoryMarkdown({
      filePath: 'private/session-memory-1.md',
      name: 'Session memory one',
      description: 'Remembered from first transcript',
      type: 'user',
      scope: 'private',
      sourceSession: 'sess-1.md',
      body: 'summary one',
    });
    const expectedSecondMarkdown = buildRawMemoryMarkdown({
      filePath: 'private/session-memory-2.md',
      name: 'Session memory two',
      description: 'Remembered from second transcript',
      type: 'user',
      scope: 'private',
      sourceSession: 'sess-2.md',
      body: 'summary two',
    });
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: [expectedFirstMarkdown],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [expectedSecondMarkdown],
          metadata: { provider: 'claude', status: 'success' },
        }),
    };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-multi');
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
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
      ],
    });

    const result = await stage.run(context);

    const expectedFirstPrompt = buildRawExtractionPrompt({
      sessionFilename: 'sess-1.md',
      sessionTranscript: 'user: first',
    });
    const expectedSecondPrompt = buildRawExtractionPrompt({
      sessionFilename: 'sess-2.md',
      sessionTranscript: 'assistant: second',
    });
    expect(processor.process).toHaveBeenNthCalledWith(1, [expectedFirstPrompt], { timeoutMs: 34500 });
    expect(processor.process).toHaveBeenNthCalledWith(2, [expectedSecondPrompt], { timeoutMs: 34500 });
    expect(JSON.parse(store.writes[0].body)).toEqual({
      sessionId: 'sess-1',
      items: buildRawMemoryItems({
        name: 'Session memory one',
        description: 'Remembered from first transcript',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-1.md',
        body: 'summary one',
      }),
    });
    expect(JSON.parse(store.writes[1].body)).toEqual({
      sessionId: 'sess-2',
      items: buildRawMemoryItems({
        name: 'Session memory two',
        description: 'Remembered from second transcript',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-2.md',
        body: 'summary two',
      }),
    });
    expect(JSON.parse(store.writes[2].body)).toEqual({
      runId: 'run-session-job-summary-multi',
      stage: stage.id,
      blocks: [expectedFirstPrompt, expectedSecondPrompt],
      summaries: [expectedFirstMarkdown, expectedSecondMarkdown],
      metadata: { provider: 'claude', status: 'success' },
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 2,
      outputCount: 2,
      artifactIds: [store.descriptors[0].id, store.descriptors[1].id, store.descriptors[2].id],
    });
  });

  it('computes dynamic timeout per transcript from message count and total characters', async () => {
    const store = new RecordingArtifactStore();
    const process = vi.fn(async (inputs: string[]) => ({
      outputs: [`summary: ${inputs[0]}`],
      metadata: { provider: 'codex', status: 'success' as const },
    }));
    const processor: ModelProcessor = { process };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-timeout');
    const longUser = 'u'.repeat(1100);
    const longAssistant = 'a'.repeat(900);
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
        {
          id: 'job-timeout-1',
          kind: 'session-job',
          sourceRef: 'codex:sess-timeout-1',
          host: 'codex',
          sessionKey: 'codex:sess-timeout-1',
          session: {
            id: 'raw-session-timeout-1',
            host: 'codex',
            externalSessionId: 'sess-timeout-1',
            sessionKey: 'codex:sess-timeout-1',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-timeout-1',
              sessionKey: 'codex:sess-timeout-1',
              role: 'user',
              content: longUser,
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
            {
              id: 'msg-timeout-2',
              sessionKey: 'codex:sess-timeout-1',
              role: 'assistant',
              content: longAssistant,
              ordinal: 2,
              ingestedFrom: 'host-import',
              createdDbAt: 2,
              updatedDbAt: 2,
            },
          ],
          job: {
            id: 'job-timeout-1',
            host: 'codex',
            sessionKey: 'codex:sess-timeout-1',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-timeout-1',
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
      ],
    });

    await stage.run(context);
    const expectedPrompt = buildRawExtractionPrompt({
      sessionFilename: 'sess-timeout-1.md',
      sessionTranscript: `user: ${longUser}\nassistant: ${longAssistant}`,
    });

    expect(process).toHaveBeenCalledWith(
      [expectedPrompt],
      { timeoutMs: 39000 },
    );
  });

  it('adds extra timeout for transcripts with an extra-long assistant message', async () => {
    const store = new RecordingArtifactStore();
    const process = vi.fn(async (inputs: string[]) => ({
      outputs: [`summary: ${inputs[0]}`],
      metadata: { provider: 'codex', status: 'success' as const },
    }));
    const processor: ModelProcessor = { process };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-timeout-long-assistant');
    const longAssistant = 'a'.repeat(4500);
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
        {
          id: 'job-timeout-2',
          kind: 'session-job',
          sourceRef: 'codex:sess-timeout-2',
          host: 'codex',
          sessionKey: 'codex:sess-timeout-2',
          session: {
            id: 'raw-session-timeout-2',
            host: 'codex',
            externalSessionId: 'sess-timeout-2',
            sessionKey: 'codex:sess-timeout-2',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-timeout-3',
              sessionKey: 'codex:sess-timeout-2',
              role: 'user',
              content: 'short',
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
            {
              id: 'msg-timeout-4',
              sessionKey: 'codex:sess-timeout-2',
              role: 'assistant',
              content: longAssistant,
              ordinal: 2,
              ingestedFrom: 'host-import',
              createdDbAt: 2,
              updatedDbAt: 2,
            },
          ],
          job: {
            id: 'job-timeout-2',
            host: 'codex',
            sessionKey: 'codex:sess-timeout-2',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-timeout-2',
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
      ],
    });

    await stage.run(context);
    const expectedPrompt = buildRawExtractionPrompt({
      sessionFilename: 'sess-timeout-2.md',
      sessionTranscript: `user: short\nassistant: ${longAssistant}`,
    });

    expect(process).toHaveBeenCalledWith(
      [expectedPrompt],
      { timeoutMs: 68000 },
    );
  });

  it('preserves provider error text when transcript-derived summarization fails', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'claude', status: 'error', error: 'model overloaded' },
      })),
    };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-fail');
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
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
      ],
    });

    const result = await stage.run(context);

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'failed',
      inputCount: 1,
      outputCount: 0,
      error: '[sess-1] model overloaded',
    });
  });

  it('continues transcript-derived summarization after a timeout and records diagnostics', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: [
            buildRawMemoryMarkdown({
              filePath: 'private/memory-1.md',
              name: 'Memory one',
              description: 'First recovered memory',
              type: 'user',
              scope: 'private',
              sourceSession: 'sess-partial-1.md',
              body: 'memory-1',
            }),
          ],
          metadata: { provider: 'codex', status: 'success' as const },
        })
        .mockResolvedValueOnce({
          outputs: [],
          metadata: {
            provider: 'codex',
            status: 'timeout' as const,
            error: 'codex extraction timed out',
            diagnostics: {
              timeoutMs: 37500,
              exitCode: null,
              stderr: 'timed out after waiting for model',
              stdout: '[codex] starting',
            },
          },
        })
        .mockResolvedValueOnce({
          outputs: [
            buildRawMemoryMarkdown({
              filePath: 'private/memory-3.md',
              name: 'Memory three',
              description: 'Third recovered memory',
              type: 'user',
              scope: 'private',
              sourceSession: 'sess-partial-3.md',
              body: 'memory-3',
            }),
          ],
          metadata: { provider: 'codex', status: 'success' as const },
        }),
    };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-partial');
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
        {
          id: 'job-partial-1',
          kind: 'session-job',
          sourceRef: 'codex:sess-partial-1',
          host: 'codex',
          sessionKey: 'codex:sess-partial-1',
          session: {
            id: 'raw-session-partial-1',
            host: 'codex',
            externalSessionId: 'sess-partial-1',
            sessionKey: 'codex:sess-partial-1',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-partial-1',
              sessionKey: 'codex:sess-partial-1',
              role: 'user',
              content: 'remember alpha',
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
          ],
          job: {
            id: 'job-partial-1',
            host: 'codex',
            sessionKey: 'codex:sess-partial-1',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-partial-1',
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
          id: 'job-partial-2',
          kind: 'session-job',
          sourceRef: 'codex:sess-partial-2',
          host: 'codex',
          sessionKey: 'codex:sess-partial-2',
          session: {
            id: 'raw-session-partial-2',
            host: 'codex',
            externalSessionId: 'sess-partial-2',
            sessionKey: 'codex:sess-partial-2',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-partial-2',
              sessionKey: 'codex:sess-partial-2',
              role: 'user',
              content: 'remember beta',
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
          ],
          job: {
            id: 'job-partial-2',
            host: 'codex',
            sessionKey: 'codex:sess-partial-2',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-partial-2',
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
          id: 'job-partial-3',
          kind: 'session-job',
          sourceRef: 'codex:sess-partial-3',
          host: 'codex',
          sessionKey: 'codex:sess-partial-3',
          session: {
            id: 'raw-session-partial-3',
            host: 'codex',
            externalSessionId: 'sess-partial-3',
            sessionKey: 'codex:sess-partial-3',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-partial-3',
              sessionKey: 'codex:sess-partial-3',
              role: 'user',
              content: 'remember gamma',
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
          ],
          job: {
            id: 'job-partial-3',
            host: 'codex',
            sessionKey: 'codex:sess-partial-3',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-partial-3',
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
      ],
    });

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'partial',
      inputCount: 3,
      outputCount: 2,
      error: expect.stringContaining('sess-partial-2'),
    });
    expect(JSON.parse(store.writes[0].body)).toEqual({
      sessionId: 'sess-partial-1',
      items: buildRawMemoryItems({
        name: 'Memory one',
        description: 'First recovered memory',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-partial-1.md',
        body: 'memory-1',
      }),
    });
    expect(JSON.parse(store.writes[1].body)).toEqual({
      sessionId: 'sess-partial-3',
      items: buildRawMemoryItems({
        name: 'Memory three',
        description: 'Third recovered memory',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-partial-3.md',
        body: 'memory-3',
      }),
    });
    expect(JSON.parse(store.writes[2].body)).toEqual({
      runId: 'run-session-job-summary-partial',
      stage: stage.id,
      blocks: expect.any(Array),
      summaries: [
        buildRawMemoryMarkdown({
          filePath: 'private/memory-1.md',
          name: 'Memory one',
          description: 'First recovered memory',
          type: 'user',
          scope: 'private',
          sourceSession: 'sess-partial-1.md',
          body: 'memory-1',
        }),
        buildRawMemoryMarkdown({
          filePath: 'private/memory-3.md',
          name: 'Memory three',
          description: 'Third recovered memory',
          type: 'user',
          scope: 'private',
          sourceSession: 'sess-partial-3.md',
          body: 'memory-3',
        }),
      ],
      metadata: {
        items: [
          { provider: 'codex', status: 'success' },
          {
            provider: 'codex',
            status: 'timeout',
            error: 'codex extraction timed out',
            diagnostics: {
              timeoutMs: 37500,
              exitCode: null,
              stderr: 'timed out after waiting for model',
              stdout: '[codex] starting',
            },
          },
          { provider: 'codex', status: 'success' },
        ],
        failures: [
          {
            index: 1,
            sessionId: 'sess-partial-2',
            provider: 'codex',
            status: 'timeout',
            error: 'codex extraction timed out',
            diagnostics: {
              timeoutMs: 37500,
              exitCode: null,
              stderr: 'timed out after waiting for model',
              stdout: '[codex] starting',
            },
          },
        ],
      },
    });
  });

  it('retries transcript-derived raw markdown when the FILE path is invalid', async () => {
    const store = new RecordingArtifactStore();
    const invalidMarkdown = `<!-- FILE: memories/final/private/user-name.md -->
\`\`\`markdown
---
name: User english name
description: User says their English name is Sean
type: user
scope: private
source_session: sess-retry-path.md
---

The user says their English name is Sean.
\`\`\`
`;
    const validMarkdown = `<!-- FILE: private/user-name.md -->
\`\`\`markdown
---
name: User english name
description: User says their English name is Sean
type: user
scope: private
source_session: sess-retry-path.md
---

The user says their English name is Sean.
\`\`\`
`;
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: [invalidMarkdown],
          metadata: { provider: 'codex', status: 'success' as const },
        })
        .mockResolvedValueOnce({
          outputs: [validMarkdown],
          metadata: { provider: 'codex', status: 'success' as const },
        }),
    };
    const stage = createSummarizeBlockBatchStage({ processor });
    const context = createContext(store, 'run-session-job-summary-retry-invalid-file-path');
    setClaimedRawSessionJobs(context.state, {
      source: undefined,
      jobs: [
        {
          id: 'job-retry-path-1',
          kind: 'session-job',
          sourceRef: 'codex:sess-retry-path',
          host: 'codex',
          sessionKey: 'codex:sess-retry-path',
          session: {
            id: 'raw-session-retry-path',
            host: 'codex',
            externalSessionId: 'sess-retry-path',
            sessionKey: 'codex:sess-retry-path',
            sourceType: 'history-import',
            createdAt: 1,
            updatedAt: 2,
          },
          transcript: [
            {
              id: 'msg-retry-path-1',
              sessionKey: 'codex:sess-retry-path',
              role: 'user',
              content: 'Remember my English name is Sean.',
              ordinal: 1,
              ingestedFrom: 'host-import',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
          ],
          job: {
            id: 'job-retry-path-1',
            host: 'codex',
            sessionKey: 'codex:sess-retry-path',
            jobType: 'extract-session',
            status: 'running',
            dedupeKey: 'extract-session:codex:sess-retry-path',
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
      ],
    });

    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processor.process).mock.calls[1]?.[0]?.[0]).toContain(
      'Your previous raw memory output was invalid',
    );
    expect(vi.mocked(processor.process).mock.calls[1]?.[0]?.[0]).toContain(
      'Invalid raw memory file path',
    );
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(JSON.parse(store.writes[0].body)).toEqual({
      sessionId: 'sess-retry-path',
      items: buildRawMemoryItems({
        name: 'User english name',
        description: 'User says their English name is Sean',
        type: 'user',
        scope: 'private',
        sourceSession: 'sess-retry-path.md',
        body: 'The user says their English name is Sean.',
      }),
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
    setClaimedRawSessionJobs(context.state, {
      source,
      jobs: [
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
      ],
    });

    const result = await stage.run(context);

    expect(source.markSucceeded).toHaveBeenCalledWith('job-1');
    expect(context.state.rawSessionJobs.succeededJobIds.has('job-1')).toBe(true);
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
      artifactIds: [],
    });
  });

  it('returns failed with partial output when some raw session job completions fail', async () => {
    const source: RawSessionJobSource = {
      collect: vi.fn(async () => []),
      markSucceeded: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('write failed')),
      markFailed: vi.fn(async () => {}),
    };
    const stage = new CompleteRawSessionJobsStage();
    const context = createContext(new RecordingArtifactStore(), 'run-complete-session-jobs-partial');
    setClaimedRawSessionJobs(context.state, {
      source,
      jobs: [
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
          transcript: [],
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
      ],
    });

    const result = await stage.run(context);

    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'failed',
      inputCount: 2,
      outputCount: 1,
    });
    expect(result.error).toContain('job-2');
    expect(result.error).toContain('write failed');
    expect(context.state.rawSessionJobs.succeededJobIds.has('job-1')).toBe(true);
    expect(context.state.rawSessionJobs.succeededJobIds.has('job-2')).toBe(false);
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
    const stage = createSummarizeSessionBatchStage({
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
            buildRawMemoryMarkdown({
              filePath: 'private/short-prs.md',
              name: 'Short PR preference',
              description: 'User prefers short PR descriptions',
              type: 'user',
              scope: 'private',
              sourceSession: 'session-1.md',
              body: 'remembered',
            }),
          ],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [],
          metadata: { provider: 'claude', status: 'success' },
        }),
    };
    const stage = createExtractRawMemoriesStage({ processor });
    const context = createContext(store, 'run-extract');
    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain('Session filename: session-1.md');
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain(
      'Remember that I prefer short PR descriptions.',
    );
    expect(vi.mocked(processor.process).mock.calls[1]?.[0]?.[0]).toContain('Session filename: session-2.md');
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
      items: buildRawMemoryItems({
        name: 'Short PR preference',
        description: 'User prefers short PR descriptions',
        type: 'user',
        scope: 'private',
        sourceSession: 'session-1.md',
        body: 'remembered',
      }),
    });
    expect(JSON.parse(store.writes[2].body)).toEqual({
      sessionId: 'session-2',
      items: [],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 2,
      outputCount: 2,
      artifactIds: [store.descriptors[1].id, store.descriptors[2].id],
    });
    expect(context.state.extractedRawMemories).toEqual([
      {
        sessionId: 'session-1',
        artifactId: store.descriptors[1].id,
      },
      {
        sessionId: 'session-2',
        artifactId: store.descriptors[2].id,
      },
    ]);
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
          outputs: [
            buildRawMemoryMarkdown({
              filePath: 'private/pr-style.md',
              name: 'PR style preference',
              description: 'User prefers short PRs',
              type: 'user',
              scope: 'private',
              sourceSession: 'session-1.md',
              body: 'short PRs',
            }),
          ],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [],
          metadata: { provider: 'claude', status: 'timeout', error: 'timed out' },
        }),
    };
    const stage = createExtractRawMemoriesStage({ processor });

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
      items: buildRawMemoryItems({
        name: 'PR style preference',
        description: 'User prefers short PRs',
        type: 'user',
        scope: 'private',
        sourceSession: 'session-1.md',
        body: 'short PRs',
      }),
    });
  });

  it('retries raw extraction when markdown output has an invalid FILE path', async () => {
    const store = new RecordingArtifactStore();
    await store.writeArtifact({
      runId: 'run-extract-retry-invalid-file-path',
      kind: 'work-item',
      source: 'collect-claude-sessions',
      body: JSON.stringify([
        {
          id: 'session-retry-1',
          kind: 'session',
          sourceRef: 'claude://session-retry-1',
          metadata: {
            session: {
              id: 'session-retry-1',
              sessionId: 'session-retry-1',
              sourceRef: 'claude://session-retry-1',
              messages: [{ role: 'user', content: 'Remember that my English name is Sean.' }],
            },
          },
        },
      ]),
    });
    const invalidMarkdown = `<!-- FILE: memories/final/private/user-name.md -->
\`\`\`markdown
---
name: User english name
description: User says their English name is Sean
type: user
scope: private
source_session: session-retry-1.md
---

The user says their English name is Sean.
\`\`\`
`;
    const validMarkdown = `<!-- FILE: private/user-name.md -->
\`\`\`markdown
---
name: User english name
description: User says their English name is Sean
type: user
scope: private
source_session: session-retry-1.md
---

The user says their English name is Sean.
\`\`\`
`;
    const processor: ModelProcessor = {
      process: vi
        .fn()
        .mockResolvedValueOnce({
          outputs: [invalidMarkdown],
          metadata: { provider: 'claude', status: 'success' },
        })
        .mockResolvedValueOnce({
          outputs: [validMarkdown],
          metadata: { provider: 'claude', status: 'success' },
        }),
    };
    const stage = createExtractRawMemoriesStage({ processor });

    const result = await stage.run(createContext(store, 'run-extract-retry-invalid-file-path'));

    expect(processor.process).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processor.process).mock.calls[1]?.[0]?.[0]).toContain(
      'Your previous raw memory output was invalid',
    );
    expect(vi.mocked(processor.process).mock.calls[1]?.[0]?.[0]).toContain(
      'Invalid raw memory file path',
    );
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(JSON.parse(store.writes[1].body)).toEqual({
      sessionId: 'session-retry-1',
      items: buildRawMemoryItems({
        name: 'User english name',
        description: 'User says their English name is Sean',
        type: 'user',
        scope: 'private',
        sourceSession: 'session-retry-1.md',
        body: 'The user says their English name is Sean.',
      }),
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
    const stage = createExtractRawMemoriesStage({ processor });

    await expect(stage.run(createContext(store, 'run-extract-invalid-session'))).rejects.toThrow(
      'ExtractRawMemoriesStage requires a valid session payload with at least one usable message',
    );
    expect(processor.process).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(1);
  });

  it('merges raw memories into final private and team markdown files plus MEMORY indexes under the memory root', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-stage-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-final',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });

    await store.writeArtifact({
      runId: 'run-merge-final',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-002',
        markdown: `<!-- FILE: team/release-checks.md -->
\`\`\`markdown
---
name: Release check cadence
description: Team standard for post-release verification
type: project
scope: team
source_session: session-002
---

Always verify the deployment with a focused smoke test.
\`\`\`
`,
      }),
    });

    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [
          `<!-- FILE: memories/final/private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: Canonical preference for small reviewable pull requests
type: user
scope: private
merged_from: [session-001]
---

Prefer small, reviewable pull requests by default.
\`\`\`

<!-- FILE: memories/final/team/release-checks.md -->
\`\`\`markdown
---
name: Release check cadence
description: Canonical team expectation for post-release verification
type: project
scope: team
merged_from: [session-002]
---

Always verify the deployment with a focused smoke test.
\`\`\`

<!-- FILE: memories/final/private/MEMORY.md -->
\`\`\`markdown
- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.
\`\`\`

<!-- FILE: memories/final/team/MEMORY.md -->
\`\`\`markdown
- [Release check cadence](release-checks.md) — Post-release verification is a standing team habit.
\`\`\`
`,
        ],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = new MergeFinalMemoriesStage({ processor });
    const context = createContext(store, 'run-merge-final');
    const result = await stage.run(context);

    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain(
      'You are acting as the final memory merge subagent.',
    );
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain('session-001.memories.md');
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain('session-002.memories.md');
    expect(vi.mocked(processor.process).mock.calls[0]?.[1]).toEqual({ timeoutMs: 600000 });

    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-001.memories.md'), 'utf8'),
    ).resolves.toContain('source_session: session-001');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-002.memories.md'), 'utf8'),
    ).resolves.toContain('source_session: session-002');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'user-short-prs.md'), 'utf8'),
    ).resolves.toContain('merged_from: [session-001]');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'team', 'release-checks.md'), 'utf8'),
    ).resolves.toContain('merged_from: [session-002]');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'MEMORY.md'), 'utf8'),
    ).resolves.toContain('[User prefers short PRs](user-short-prs.md)');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'team', 'MEMORY.md'), 'utf8'),
    ).resolves.toContain('[Release check cadence](release-checks.md)');

    const descriptors = await store.listArtifacts({
      runId: 'run-merge-final',
      kind: 'final-memory-batch',
      source: 'merge-final-memories',
    });
    expect(descriptors).toHaveLength(1);
    await expect(store.readArtifact(descriptors[0]!.id)).resolves.toContain(
      'memory/final/private/user-short-prs.md',
    );

    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'success',
      inputCount: 2,
      outputCount: 4,
      artifactIds: [descriptors[0]!.id],
    });
    expect(context.state.mergedFinalOutputs.files).toEqual([
      'memory/final/private/user-short-prs.md',
      'memory/final/team/release-checks.md',
      'memory/final/private/MEMORY.md',
      'memory/final/team/MEMORY.md',
    ]);
  });

  it('no-ops cleanly when there are no raw memory artifacts to merge', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-empty-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: ['should not run'],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };
    const stage = new MergeFinalMemoriesStage({ processor });

    const result = await stage.run(createContext(store, 'run-merge-empty'));

    expect(processor.process).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'success',
      inputCount: 0,
      outputCount: 0,
      artifactIds: [],
    });
    await expect(
      store.listArtifacts({
        runId: 'run-merge-empty',
        kind: 'final-memory-batch',
        source: 'merge-final-memories',
      }),
    ).resolves.toEqual([]);
  });

  it('skips NO_MEMORIES raw artifacts when building merge inputs and writing raw files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-skip-no-memories-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-skip-no-memories',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });
    await store.writeArtifact({
      runId: 'run-merge-skip-no-memories',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-002',
        markdown: '<!-- NO_MEMORIES -->',
      }),
    });

    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [
          `<!-- FILE: memories/final/private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: Canonical preference for small reviewable pull requests
type: user
scope: private
merged_from: [session-001]
---

Keep pull requests narrowly scoped and easy to review.
\`\`\`

<!-- FILE: memories/final/private/MEMORY.md -->
\`\`\`markdown
- [User prefers short PRs](user-short-prs.md) — Keep PRs narrowly scoped and easy to review.
\`\`\`

<!-- FILE: memories/final/team/MEMORY.md -->
\`\`\`markdown
\`\`\`
`,
        ],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };

    const stage = new MergeFinalMemoriesStage({ processor });
    const result = await stage.run(createContext(store, 'run-merge-skip-no-memories'));

    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).toContain('session-001.memories.md');
    expect(vi.mocked(processor.process).mock.calls[0]?.[0]?.[0]).not.toContain('session-002.memories.md');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-001.memories.md'), 'utf8'),
    ).resolves.toContain('source_session: session-001');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-002.memories.md'), 'utf8'),
    ).rejects.toThrow();
    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'success',
      inputCount: 2,
    });
  });

  it('no-ops when every raw memory artifact is NO_MEMORIES', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-all-no-memories-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-all-no-memories',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: '<!-- NO_MEMORIES -->',
      }),
    });
    await store.writeArtifact({
      runId: 'run-merge-all-no-memories',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-002',
        markdown: '<!-- NO_MEMORIES -->',
      }),
    });

    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: ['should not run'],
        metadata: { provider: 'claude', status: 'success' },
      })),
    };

    const stage = new MergeFinalMemoriesStage({ processor });
    const result = await stage.run(createContext(store, 'run-merge-all-no-memories'));

    expect(processor.process).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-001.memories.md'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-002.memories.md'), 'utf8'),
    ).rejects.toThrow();
    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'success',
      inputCount: 2,
      outputCount: 0,
      artifactIds: [],
    });
  });

  it('syncs final detail memory files to the provider with stable customIds', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/private/short-prs.md',
      `---
name: User prefers short PRs
description: Canonical preference
type: user
scope: private
merged_from: [session-001]
---

Prefer small, reviewable pull requests by default.
`,
    );
    await store.writeMemoryFile(
      'final/private/MEMORY.md',
      '- [User prefers short PRs](short-prs.md) — Canonical preference.',
    );

    const save = vi.fn(async () => ({ ok: true, provider: 'supermemory' as const, id: 'doc_1' }));
    const stage = createSyncProviderMemoriesStage({
      provider: {
        provider: 'supermemory',
        save,
        search: vi.fn(),
        recall: vi.fn(),
        healthcheck: vi.fn(),
      },
      projectTag: 'project.test',
    });

    const result = await stage.run(createContext(store, 'run-sync-provider'));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Prefer small, reviewable pull requests by default.',
      customId: expect.stringMatching(/^corivo:project\.test:[a-f0-9]+$/),
      annotation: 'pending',
      source: 'memory-pipeline',
    }));
    expect(result).toMatchObject({
      stageId: 'sync-provider-memories',
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
  });

  it('returns partial when some provider sync writes fail', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/private/a.md',
      `---
name: A
description: A
type: user
scope: private
merged_from: [session-001]
---

First durable memory.
`,
    );
    await store.writeMemoryFile(
      'final/team/b.md',
      `---
name: B
description: B
type: project
scope: team
merged_from: [session-002]
---

Second durable memory.
`,
    );

    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, provider: 'supermemory', id: 'doc_1' })
      .mockRejectedValueOnce(new Error('network down'));
    const stage = createSyncProviderMemoriesStage({
      provider: {
        provider: 'supermemory',
        save,
        search: vi.fn(),
        recall: vi.fn(),
        healthcheck: vi.fn(),
      },
      projectTag: 'project.test',
    });

    const result = await stage.run(createContext(store, 'run-sync-provider-partial'));

    expect(save).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      stageId: 'sync-provider-memories',
      status: 'partial',
      inputCount: 2,
      outputCount: 1,
      error: expect.stringContaining('network down'),
    });
  });

  it.each([
    ['error', 'provider down'],
    ['timeout', 'timed out'],
  ])('fails cleanly when merge processor returns %s metadata', async (status, error) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-fail-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-fail',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });

    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'claude', status: status as 'error' | 'timeout', error },
      })),
    };
    const stage = new MergeFinalMemoriesStage({ processor });

    const result = await stage.run(createContext(store, 'run-merge-fail'));

    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'failed',
      inputCount: 1,
      outputCount: 0,
      artifactIds: [],
      error: expect.stringContaining(error),
    });
    await expect(
      readFile(path.join(tempRoot, 'memory', 'raw', 'session-001.memories.md'), 'utf8'),
    ).resolves.toContain('source_session: session-001');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'user-short-prs.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('includes provider diagnostics in merge failure output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-fail-diag-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-fail-diag',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        items: buildRawMemoryItems({
          name: 'User prefers short PRs',
          description: 'User usually wants small reviewable pull requests',
          type: 'user',
          scope: 'private',
          sourceSession: 'session-001',
          body: 'Keep PRs narrowly scoped and easy to review.',
        }),
      }),
    });

    const stage = new MergeFinalMemoriesStage({
      processor: {
        process: vi.fn(async () => ({
          outputs: [],
          metadata: {
            provider: 'codex',
            status: 'timeout',
            error: 'codex extraction timed out',
            diagnostics: {
              timeoutMs: 180000,
              exitCode: null,
              stderr: 'model stalled after planning',
              stdout: '[codex] started merge',
            },
          },
        })),
      },
    });

    const result = await stage.run(createContext(store, 'run-merge-fail-diag'));

    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'failed',
      error: expect.stringContaining('codex extraction timed out'),
    });
    expect(result.error).toContain('provider=codex');
    expect(result.error).toContain('timeoutMs=180000');
    expect(result.error).toContain('stderr=model stalled after planning');
    expect(result.error).toContain('stdout=[codex] started merge');
  });

  it('logs merge prompt diagnostics before invoking the merge processor', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-log-diag-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-log-diag',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        items: buildRawMemoryItems({
          name: 'User prefers short PRs',
          description: 'User usually wants small reviewable pull requests',
          type: 'user',
          scope: 'private',
          sourceSession: 'session-001',
          body: 'Keep PRs narrowly scoped and easy to review.',
        }),
      }),
    });

    const debug = vi.fn();
    const stage = new MergeFinalMemoriesStage({
      processor: {
        process: vi.fn(async () => ({
          outputs: ['I merged the memory set.'],
          metadata: { provider: 'codex', status: 'success' },
        })),
      },
    });

    await stage.run({
      ...createContext(store, 'run-merge-log-diag'),
      logger: {
        log: vi.fn(),
        error: vi.fn(),
        debug,
      },
    });

    expect(debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[memory:pipeline:merge-final-memories] prompt diagnostics rawFileCount=1 existingFinalFileCount=\d+ promptLength=\d+$/,
      ),
    );
  });

  it('falls back to deterministic final files when merge output is malformed and there are no existing final detail files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-fallback-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-fallback',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });

    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: ['I merged the memory set.'],
        metadata: { provider: 'codex', status: 'success' },
      })),
    };
    const stage = new MergeFinalMemoriesStage({ processor });
    const result = await stage.run(createContext(store, 'run-merge-fallback'));

    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'user-prefers-short-prs.md'), 'utf8'),
    ).resolves.toContain('merged_from: [session-001]');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'MEMORY.md'), 'utf8'),
    ).resolves.toContain('[User prefers short PRs](user-prefers-short-prs.md)');
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'team', 'MEMORY.md'), 'utf8'),
    ).resolves.toBe('');
    expect(result).toMatchObject({
      stageId: 'merge-final-memories',
      status: 'success',
      inputCount: 1,
      outputCount: 3,
    });
  });

  it('rejects duplicate final file blocks before writing any final files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-duplicate-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-duplicate',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });

    const stage = new MergeFinalMemoriesStage({
      processor: {
        process: vi.fn(async () => ({
          outputs: [
            `<!-- FILE: memories/final/private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: Canonical preference for small reviewable pull requests
type: user
scope: private
merged_from: [session-001]
---

Prefer small, reviewable pull requests by default.
\`\`\`

<!-- FILE: memories/final/private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: Duplicate canonical preference
type: user
scope: private
merged_from: [session-001]
---

Duplicate content.
\`\`\`
`,
          ],
          metadata: { provider: 'claude', status: 'success' },
        })),
      },
    });

    await expect(stage.run(createContext(store, 'run-merge-duplicate'))).rejects.toThrow(
      'Duplicate final memory file path: final/private/user-short-prs.md',
    );
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'user-short-prs.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('rejects malformed final merge output before writing any final files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'corivo-merge-malformed-'));
    const runRoot = path.join(tempRoot, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });
    const store = new ArtifactStore(runRoot);

    await store.writeArtifact({
      runId: 'run-merge-malformed',
      kind: 'raw-memory-batch',
      source: 'extract-raw-memories',
      body: JSON.stringify({
        sessionId: 'session-001',
        markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
      }),
    });

    const stage = new MergeFinalMemoriesStage({
      processor: {
        process: vi.fn(async () => ({
          outputs: [
            `<!-- FILE: memories/final/private/user-short-prs.md -->
\`\`\`markdown
not valid final memory content
\`\`\`
`,
          ],
          metadata: { provider: 'claude', status: 'success' },
        })),
      },
    });

    await expect(stage.run(createContext(store, 'run-merge-malformed'))).rejects.toThrow(
      'Final memory document must start with frontmatter.',
    );
    await expect(
      readFile(path.join(tempRoot, 'memory', 'final', 'private', 'user-short-prs.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('marks summarize session batch as failed when processor returns no outputs', async () => {
    const store = new RecordingArtifactStore();
    const processor: ModelProcessor = {
      process: vi.fn(async () => ({
        outputs: [],
        metadata: { provider: 'claude', status: 'timeout', error: 'timed out' },
      })),
    };
    const stage = createSummarizeSessionBatchStage({
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
    const stage = createConsolidateSessionSummariesStage();
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
    const stage = createSummarizeBlockBatchStage({
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
    const stage = createSummarizeBlockBatchStage({
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
    await store.writeMemoryFile(
      'final/private/MEMORY.md',
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
    );
    const stage = createRefreshMemoryIndexStage();
    const context = createContext(store, 'run-refresh');
    context.state.mergedFinalOutputs.files = ['memory/final/private/MEMORY.md'];

    const result = await stage.run(context);

    expect(store.writes[0]).toMatchObject({
      runId: 'run-refresh',
      kind: 'memory-index',
      source: stage.id,
    });
    expect(JSON.parse(store.writes[0].body)).toEqual({
      indexes: [
        {
          path: 'final/private/MEMORY.md',
          content:
            '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.\n',
        },
      ],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });

  it('writes a rebuild index artifact with the correct metadata', async () => {
    const store = new RecordingArtifactStore();
    await store.writeMemoryFile(
      'final/team/MEMORY.md',
      '- [Release check cadence](release-checks.md) — Post-release verification is a standing team habit.\n',
    );
    const stage = createRebuildMemoryIndexStage();
    const context = createContext(store, 'run-index');
    context.state.mergedFinalOutputs.files = ['memory/final/team/MEMORY.md'];

    const result = await stage.run(context);

    const [write] = store.writes;
    expect(write).toMatchObject({
      runId: 'run-index',
      kind: 'memory-index',
      source: stage.id,
    });
    expect(JSON.parse(write.body)).toEqual({
      indexes: [
        {
          path: 'final/team/MEMORY.md',
          content:
            '- [Release check cadence](release-checks.md) — Post-release verification is a standing team habit.\n',
        },
      ],
    });
    expect(result).toMatchObject({
      stageId: stage.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
    });
    expect(result.artifactIds).toEqual([store.descriptors[0].id]);
  });
});
