import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { CorivoDatabase } from '@/storage/database';
import type { MemoryPipelineRunner } from '@/memory-pipeline';
import { ArtifactStore, FileRunLock, MemoryPipelineRunner as DefaultMemoryPipelineRunner } from '@/memory-pipeline';
import {
  createMemoryCommand,
  runMemoryPipeline,
  setMemoryCommandExecutor,
  setMemoryCommandPrinter,
  resetMemoryCommandOverrides,
} from '../../src/cli/commands/memory.js';
import { MergeFinalMemoriesStage } from '../../src/memory-pipeline/stages/merge-final-memories.js';

const standaloneExecutor = vi.fn(async (mode: 'full' | 'incremental') => ({
  runId: 'run-standalone',
  pipelineId: mode === 'full' ? 'init-memory-pipeline' : 'scheduled-memory-pipeline',
  status: 'success',
  stages: [],
}));

const standalonePrinter = vi.fn();

function buildRunCommand(): Command {
  const command = createMemoryCommand({ executor: standaloneExecutor, printer: standalonePrinter });
  const runCommand = command.commands.find((cmd) => cmd.name() === 'run');
  if (!runCommand) {
    throw new Error('memory run command missing');
  }
  return runCommand;
}

beforeEach(() => {
  standaloneExecutor.mockClear();
  standalonePrinter.mockClear();
});

describe('memory command (standalone)', () => {
  it('--full triggers init pipeline', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run', '--full'], { from: 'user' });
    expect(standaloneExecutor).toHaveBeenCalledWith('full');
    expect(standalonePrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'init-memory-pipeline' }),
    );
  });

  it('--incremental triggers scheduled pipeline', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run', '--incremental'], {
      from: 'user',
    });
    expect(standaloneExecutor).toHaveBeenCalledWith('incremental');
    expect(standalonePrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'scheduled-memory-pipeline' }),
    );
  });

  it('defaults to incremental when no flag is provided', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run'], { from: 'user' });
    expect(standaloneExecutor).toHaveBeenCalledWith('incremental');
  });
});

describe('memory command (CLI integration)', () => {
  const cliExecutor = vi.fn(async (mode: 'full' | 'incremental') => ({
    runId: 'run-cli',
    pipelineId: mode === 'full' ? 'init-memory-pipeline' : 'scheduled-memory-pipeline',
    status: 'success',
    stages: [],
  }));
  const cliPrinter = vi.fn();
  let program: Command;

  beforeAll(async () => {
    setMemoryCommandExecutor(cliExecutor);
    setMemoryCommandPrinter(cliPrinter);
    const module = await import('../../src/cli/index.js');
    program = module.program;
  });

  afterAll(() => {
    resetMemoryCommandOverrides();
  });

  it('runs --full through the shared CLI program', async () => {
    await program.parseAsync(['memory', 'run', '--full'], { from: 'user' });
    expect(cliExecutor).toHaveBeenCalledWith('full');
    expect(cliPrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'init-memory-pipeline' }),
    );
  });
});

describe('memory pipeline cleanup', () => {
  it('builds the incremental pipeline from raw-session job source', async () => {
    const createScheduledPipeline = vi.fn(() => ({
      id: 'scheduled-memory-pipeline' as const,
      stages: [],
    }));
    const createRawSessionJobSource = vi.fn(() => ({
      collect: async () => [],
      markSucceeded: async () => {},
      markFailed: async () => {},
    }));

    await runMemoryPipeline('incremental', {
      resolveConfigDir: () => '/tmp/corivo',
      resolveDatabasePath: () => '/tmp/corivo/corivo.db',
      readConfig: async () => ({}),
      createArtifactStore: () => ({
        writeArtifact: async () => ({
          id: 'artifact',
          kind: 'work-item',
          version: 1,
          path: 'artifacts/detail/test.json',
          source: 'test',
          createdAt: Date.now(),
        }),
        persistDescriptor: async () => {},
        getDescriptor: async () => undefined,
      }),
      createLock: () => ({
        acquire: async () => {},
        release: async () => {},
      }),
      createRunner: () =>
        ({
          run: async () => ({
            runId: 'run',
            pipelineId: 'scheduled-memory-pipeline',
            status: 'success',
            stages: [],
          }),
        } as MemoryPipelineRunner),
      createInitPipeline: () => ({ id: 'init-memory-pipeline', stages: [] }),
      createScheduledPipeline,
      createSessionSource: () => ({ collect: async () => [] }),
      createRawSessionJobSource,
      openDatabase: () =>
        ({
          close: () => {},
        } as CorivoDatabase),
      closeDatabase: () => {},
    } as any);

    expect(createRawSessionJobSource).toHaveBeenCalled();
    expect(createScheduledPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ rawSessionJobSource: expect.anything() }),
    );
  });

  it('closes the database even if incremental build fails', async () => {
    let closed = false;

    await expect(
      runMemoryPipeline('incremental', {
        resolveConfigDir: () => '/tmp/corivo',
        resolveDatabasePath: () => '/tmp/corivo/corivo.db',
        readConfig: async () => ({}),
        createArtifactStore: () => ({
          writeArtifact: async () => ({
            id: 'artifact',
            kind: 'work-item',
            version: 1,
            path: 'artifacts/detail/test.json',
            source: 'test',
            createdAt: Date.now(),
          }),
          persistDescriptor: async () => {},
          getDescriptor: async () => undefined,
        }),
        createLock: () => ({
          acquire: async () => {},
          release: async () => {},
        }),
        createRunner: () =>
          ({
            run: async () => ({
              runId: 'run',
              pipelineId: 'scheduled-memory-pipeline',
              status: 'success',
              stages: [],
            }),
          } as MemoryPipelineRunner),
        createInitPipeline: () => ({ id: 'init-memory-pipeline', stages: [] }),
        createScheduledPipeline: () => {
          throw new Error('pipeline build failure');
        },
        createSessionSource: () => ({ collect: async () => [] }),
        createRawSessionJobSource: () => ({
          collect: async () => [],
          markSucceeded: async () => {},
          markFailed: async () => {},
        }),
        openDatabase: () =>
          ({
            close: () => {},
          } as CorivoDatabase),
        closeDatabase: () => {
          closed = true;
        },
      } as any),
    ).rejects.toThrow('pipeline build failure');

    expect(closed).toBe(true);
  });

  it('builds the full pipeline with extract-raw-memories in the shared execution path', async () => {
    const seenStageIds: string[] = [];

    await expect(
      runMemoryPipeline('full', {
        resolveConfigDir: () => '/tmp/corivo',
        resolveDatabasePath: () => '/tmp/corivo/corivo.db',
        readConfig: async () => ({}),
        createArtifactStore: () => ({
          writeArtifact: async () => ({
            id: 'artifact',
            kind: 'work-item',
            version: 1,
            path: 'artifacts/detail/test.json',
            source: 'test',
            createdAt: Date.now(),
          }),
          persistDescriptor: async () => {},
          getDescriptor: async () => undefined,
          readArtifact: async () => '[]',
          listArtifacts: async () => [],
        }),
        createLock: () => ({
          acquire: async () => {},
          release: async () => {},
        }),
        createRunner: () =>
          ({
            run: async (pipeline) => {
              seenStageIds.push(...pipeline.stages.map((stage) => stage.id));
              return {
                runId: 'run',
                pipelineId: pipeline.id,
                status: 'success',
                stages: [],
              };
            },
          } as MemoryPipelineRunner),
        openDatabase: () =>
          ({
            querySessionRecords: () => [],
            close: () => {},
          } as CorivoDatabase),
        closeDatabase: () => {},
        createSessionSource: () => ({ collect: async () => [] }),
      }),
    ).resolves.toMatchObject({
      pipelineId: 'init-memory-pipeline',
      status: 'success',
    });

    expect(seenStageIds).toEqual([
      'collect-claude-sessions',
      'extract-raw-memories',
      'merge-final-memories',
      'summarize-session-batch',
      'consolidate-session-summaries',
      'append-detail-records',
      'rebuild-memory-index',
    ]);
  });

  it('builds the full pipeline from database-backed raw sessions in the shared execution path', async () => {
    let listedSessions = false;
    let transcriptLookupKey: string | undefined;
    let sessionItemsPromise: Promise<unknown[]> | undefined;
    let closed = false;

    await expect(
      runMemoryPipeline('full', {
        resolveConfigDir: () => '/tmp/corivo',
        resolveDatabasePath: () => '/tmp/corivo/corivo.db',
        readConfig: async () => ({}),
        createArtifactStore: () => ({
          writeArtifact: async () => ({
            id: 'artifact',
            kind: 'work-item',
            version: 1,
            path: 'artifacts/detail/test.json',
            source: 'test',
            createdAt: Date.now(),
          }),
          persistDescriptor: async () => {},
          getDescriptor: async () => undefined,
          readArtifact: async () => '[]',
          listArtifacts: async () => [],
        }),
        createLock: () => ({
          acquire: async () => {},
          release: async () => {},
        }),
        createRunner: () =>
          ({
            run: async () => ({
              runId: 'run',
              pipelineId: 'init-memory-pipeline',
              status: 'success',
              stages: [],
            }),
          } as MemoryPipelineRunner),
        createInitPipeline: ({ sessionSource }) => {
          sessionItemsPromise = sessionSource.collect();
          return { id: 'init-memory-pipeline', stages: [] };
        },
        openDatabase: () =>
          ({
            listRawSessions: () => {
              listedSessions = true;
              return [
                {
                  id: 'raw-session-1',
                  host: 'codex',
                  externalSessionId: 'session-1',
                  sessionKey: 'codex:session-1',
                  sourceType: 'history-import',
                  updatedAt: 123,
                },
              ];
            },
            getRawTranscript: (sessionKey: string) => {
              transcriptLookupKey = sessionKey;
              return {
                session: {
                  id: 'raw-session-1',
                  host: 'codex',
                  externalSessionId: 'session-1',
                  sessionKey: 'codex:session-1',
                  sourceType: 'history-import',
                  updatedAt: 123,
                },
                messages: [
                  {
                    id: 'raw-message-1',
                    sessionKey: 'codex:session-1',
                    role: 'user',
                    content: 'Remember that I prefer small PRs.',
                    ordinal: 1,
                    ingestedFrom: 'host-import',
                    createdDbAt: 123,
                    updatedDbAt: 123,
                  },
                ],
              };
            },
            close: () => {},
          } as CorivoDatabase),
        closeDatabase: () => {
          closed = true;
        },
      }),
    ).resolves.toMatchObject({
      pipelineId: 'init-memory-pipeline',
      status: 'success',
    });

    expect(listedSessions).toBe(true);
    expect(transcriptLookupKey).toBe('codex:session-1');
    await expect(sessionItemsPromise).resolves.toEqual([
      expect.objectContaining({
        id: 'raw-session-1',
        kind: 'session',
        sourceRef: 'codex:session-1',
        freshnessToken: '123',
        metadata: {
          session: expect.objectContaining({
            id: 'raw-session-1',
            sessionId: 'session-1',
            kind: 'raw-session',
            host: 'codex',
            messages: [
              expect.objectContaining({
                role: 'user',
                content: 'Remember that I prefer small PRs.',
              }),
            ],
          }),
        },
      }),
    ]);
    expect(closed).toBe(true);
  });

  it('writes raw and final memory files under the configured memory root in the shared execution path', async () => {
    const configDir = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-command-'));
    const runRoot = path.join(configDir, 'memory-pipeline');
    await mkdir(runRoot, { recursive: true });

    const result = await runMemoryPipeline('full', {
      resolveConfigDir: () => configDir,
      resolveDatabasePath: () => path.join(configDir, 'corivo.db'),
      readConfig: async () => ({}),
      createArtifactStore: (incomingRunRoot) => new ArtifactStore(incomingRunRoot),
      createLock: (incomingRunRoot) => new FileRunLock(path.join(incomingRunRoot, 'run.lock')),
      createRunner: (options) => new DefaultMemoryPipelineRunner(options),
      createInitPipeline: () => ({
        id: 'init-memory-pipeline',
        stages: [
          {
            id: 'seed-raw-memories',
            async run(context) {
              const descriptor = await context.artifactStore.writeArtifact({
                runId: context.runId,
                kind: 'raw-memory-batch',
                source: 'extract-raw-memories',
                body: JSON.stringify({
                  sessionId: 'session-123',
                  markdown: `<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-123
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`,
                }),
              });

              return {
                stageId: 'seed-raw-memories',
                status: 'success' as const,
                inputCount: 0,
                outputCount: 1,
                artifactIds: [descriptor.id],
              };
            },
          },
          new MergeFinalMemoriesStage({
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
merged_from: [session-123]
---

Prefer small, reviewable pull requests by default.
\`\`\`

<!-- FILE: memories/final/private/MEMORY.md -->
\`\`\`markdown
- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.
\`\`\`

<!-- FILE: memories/final/team/MEMORY.md -->
\`\`\`markdown
\`\`\`
`,
                ],
                metadata: { provider: 'claude', status: 'success' as const },
              })),
            },
          }),
        ],
      }),
      openDatabase: () =>
        ({
          querySessionRecords: () => [],
          close: () => {},
        } as CorivoDatabase),
      closeDatabase: () => {},
      createSessionSource: () => ({ collect: async () => [] }),
    });

    expect(result).toMatchObject({
      pipelineId: 'init-memory-pipeline',
      status: 'success',
    });

    await expect(
      readFile(path.join(configDir, 'memory', 'raw', 'session-123.memories.md'), 'utf8'),
    ).resolves.toContain('source_session: session-123');
    await expect(
      readFile(path.join(configDir, 'memory', 'final', 'private', 'user-short-prs.md'), 'utf8'),
    ).resolves.toContain('merged_from: [session-123]');
    await expect(
      readFile(path.join(configDir, 'memory', 'final', 'private', 'MEMORY.md'), 'utf8'),
    ).resolves.toContain('[User prefers short PRs](user-short-prs.md)');
    await expect(
      readFile(path.join(configDir, 'memory', 'final', 'team', 'MEMORY.md'), 'utf8'),
    ).resolves.toBe('');
  });
});

describe('memory command output', () => {
  it('prints the new full-pipeline phase stage ids when they are present in the run result', async () => {
    const executor = vi.fn(async () => ({
      runId: 'run-output',
      pipelineId: 'init-memory-pipeline',
      status: 'success' as const,
      stages: [
        {
          stageId: 'extract-raw-memories',
          status: 'success' as const,
          inputCount: 1,
          outputCount: 1,
          artifactIds: ['raw-1'],
        },
        {
          stageId: 'merge-final-memories',
          status: 'success' as const,
          inputCount: 1,
          outputCount: 1,
          artifactIds: ['final-1'],
        },
      ],
    }));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const runCommand = createMemoryCommand({ executor }).commands.find((cmd) => cmd.name() === 'run');

    if (!runCommand) {
      throw new Error('memory run command missing');
    }

    await runCommand.parseAsync(['memory', 'run', '--full'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('extract-raw-memories');
    expect(output).toContain('merge-final-memories');

    consoleSpy.mockRestore();
  });
});
