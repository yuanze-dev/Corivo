import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { CorivoDatabase } from '@/storage/database';
import type { MemoryPipelineRunner } from '@/memory-pipeline';
import { ArtifactStore, FileRunLock, MemoryPipelineRunner as DefaultMemoryPipelineRunner } from '@/memory-pipeline';
import type { Logger } from '../../src/utils/logging.js';
import {
  createMemoryCommand,
  runMemoryPipeline,
} from '../../src/cli/commands/memory.js';
import { MergeFinalMemoriesStage } from '../../src/memory-pipeline/stages/merge-final-memories.js';

const standaloneExecutor = vi.fn(async (mode: 'full' | 'incremental', provider?: 'claude' | 'codex') => ({
  runId: 'run-standalone',
  pipelineId: mode === 'full' ? 'init-memory-pipeline' : 'scheduled-memory-pipeline',
  status: 'success',
  stages: [],
  provider,
}));

const standalonePrinter = vi.fn();

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isDebugEnabled: vi.fn(() => true),
  };
}

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
    expect(standaloneExecutor).toHaveBeenCalledWith('full', 'claude');
    expect(standalonePrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'init-memory-pipeline' }),
    );
  });

  it('--incremental triggers scheduled pipeline', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run', '--incremental'], {
      from: 'user',
    });
    expect(standaloneExecutor).toHaveBeenCalledWith('incremental', 'claude');
    expect(standalonePrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'scheduled-memory-pipeline' }),
    );
  });

  it('defaults to incremental when no flag is provided', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run'], { from: 'user' });
    expect(standaloneExecutor).toHaveBeenCalledWith('incremental', 'claude');
  });

  it('--provider codex overrides the default extraction provider', async () => {
    const runCommand = buildRunCommand();
    await runCommand.parseAsync(['memory', 'run', '--provider', 'codex'], { from: 'user' });
    expect(standaloneExecutor).toHaveBeenCalledWith('incremental', 'codex');
  });

  it('emits detailed debug logs for the command flow', async () => {
    const logger = createMockLogger();
    const runCommand = createMemoryCommand({
      executor: standaloneExecutor,
      printer: standalonePrinter,
      logger,
    }).commands.find((cmd) => cmd.name() === 'run');

    if (!runCommand) {
      throw new Error('memory run command missing');
    }

    await runCommand.parseAsync(['memory', 'run', '--full'], { from: 'user' });

    expect(logger.debug).toHaveBeenCalledWith('[memory:command] run requested full=true incremental=false provider=claude');
    expect(logger.debug).toHaveBeenCalledWith('[memory:command] resolved mode=full provider=claude');
    expect(logger.debug).toHaveBeenCalledWith('[memory:command] executor completed pipeline=init-memory-pipeline status=success run=run-standalone provider=claude');
    expect(logger.debug).toHaveBeenCalledWith('[memory:command] printer completed');
  });
});

describe('memory command (CLI integration)', () => {
  const cliExecutor = vi.fn(async (mode: 'full' | 'incremental', provider?: 'claude' | 'codex') => ({
    runId: 'run-cli',
    pipelineId: mode === 'full' ? 'init-memory-pipeline' : 'scheduled-memory-pipeline',
    status: 'success',
    stages: [],
    provider,
  }));
  const cliPrinter = vi.fn();
  let program: Command;

  beforeAll(async () => {
    const module = await import('../../src/cli/index.js');
    program = module.createProgram({
      memoryCommand: createMemoryCommand({
        executor: cliExecutor,
        printer: cliPrinter,
      }),
    });
  });

  it('runs --full through the shared CLI program', async () => {
    await program.parseAsync(['memory', 'run', '--full'], { from: 'user' });
    expect(cliExecutor).toHaveBeenCalledWith('full', 'claude');
    expect(cliPrinter).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'init-memory-pipeline' }),
    );
  });
});

describe('memory pipeline cleanup', () => {
  it('builds the incremental pipeline with a requested extraction provider', async () => {
    let seenProvider: string | undefined;

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        provider: 'codex',
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
              pipelineId: 'scheduled-memory-pipeline',
              status: 'success',
              stages: [],
            }),
          } as MemoryPipelineRunner),
        createInitPipeline: () => ({ id: 'init-memory-pipeline', stages: [] }),
        createScheduledPipeline: ({ provider }) => {
          seenProvider = provider;
          return { id: 'scheduled-memory-pipeline', stages: [] };
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
        closeDatabase: () => {},
      } as any),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(seenProvider).toBe('codex');
  });

  it('emits detailed debug logs across pipeline setup and stage execution', async () => {
    const logger = createMockLogger();

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        provider: 'codex',
        resolveConfigDir: () => '/tmp/corivo',
        resolveDatabasePath: () => '/tmp/corivo/corivo.db',
        readConfig: async () => ({}),
        createLogger: () => logger,
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
        createScheduledPipeline: ({ provider }) => ({
          id: 'scheduled-memory-pipeline',
          stages: [
            {
              id: 'collect-jobs',
              run: async () => ({
                stageId: 'collect-jobs',
                status: 'success',
                inputCount: 2,
                outputCount: 1,
                artifactIds: ['artifact-1'],
              }),
            },
          ],
        }),
        createInitPipeline: () => ({ id: 'init-memory-pipeline', stages: [] }),
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
        closeDatabase: () => {},
      } as any),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(logger.debug).toHaveBeenCalledWith('[memory:pipeline] starting mode=incremental provider=codex configDir=/tmp/corivo');
    expect(logger.debug).toHaveBeenCalledWith('[memory:pipeline] resources ready runRoot=/tmp/corivo/memory-pipeline');
    expect(logger.debug).toHaveBeenCalledWith('[memory:pipeline] opened database path=/tmp/corivo/corivo.db');
    expect(logger.debug).toHaveBeenCalledWith('[memory:pipeline] built pipeline id=scheduled-memory-pipeline provider=codex stageCount=1');
    expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/^\[memory:pipeline:runner] acquired lock run=run-/));
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[memory:pipeline:runner] stage start pipeline=scheduled-memory-pipeline run=run-.* stage=collect-jobs$/
      ),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[memory:pipeline:runner] stage complete pipeline=scheduled-memory-pipeline run=run-.* stage=collect-jobs status=success input=2 output=1 artifacts=1$/
      ),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[memory:pipeline] completed pipeline=scheduled-memory-pipeline status=success run=run-/
      ),
    );
  });

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

    await runMemoryPipeline({
      mode: 'incremental',
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
      runMemoryPipeline({
        mode: 'incremental',
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
      runMemoryPipeline({
        mode: 'full',
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
      runMemoryPipeline({
        mode: 'full',
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

    const result = await runMemoryPipeline({
      mode: 'full',
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
