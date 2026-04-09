import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import type { CorivoDatabase } from '@/infrastructure/storage/facade/database';
import type { Logger } from '../../src/infrastructure/logging.js';
import {
  createMemoryCommand,
} from '../../src/cli/commands/memory.js';
import { createHostCommand } from '../../src/cli/commands/host.js';
import { createDaemonCommand } from '../../src/cli/commands/daemon.js';
import { createQueryCommand } from '../../src/cli/commands/query.js';
import { runMemoryPipeline } from '../../src/application/memory/run-memory-pipeline.js';
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

describe('command layer boundaries', () => {
  it('exposes constructor APIs for dependency injection', () => {
    expect(createMemoryCommand).toBeTypeOf('function');
    expect(createHostCommand).toBeTypeOf('function');
    expect(createDaemonCommand).toBeTypeOf('function');
    expect(createQueryCommand).toBeTypeOf('function');
  });

  it('requires injected execution capabilities by default', async () => {
    await expect(createMemoryCommand().parseAsync(['run'], { from: 'user' })).rejects.toThrow(
      'memory command requires injected executor capability'
    );
    await expect(createHostCommand().parseAsync(['install', 'codex'], { from: 'user' })).rejects.toThrow(
      'host command requires injected installHost capability'
    );
    await expect(createDaemonCommand().parseAsync(['run'], { from: 'user' })).rejects.toThrow(
      'daemon command requires injected runDaemon capability'
    );

    await expect(createQueryCommand().parseAsync(['sqlite'], { from: 'user' })).rejects.toThrow(
      'query command requires injected runSearchQuery capability'
    );
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
  it('supports narrow dependency overrides via runtime/buildPipeline/runPipeline seams', async () => {
    const createLogger = vi.fn(() => createMockLogger());
    const readConfig = vi.fn(async () => ({}));
    const closeDatabase = vi.fn(() => {});
    const buildPipeline = vi.fn(() => ({
      id: 'scheduled-memory-pipeline',
      stages: [],
    }));
    const runPipeline = vi.fn(async () => ({
      runId: 'run',
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success' as const,
      stages: [],
    }));

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        provider: 'codex',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            createLogger,
            readConfig,
            openDatabase: () =>
              ({
                close: () => {},
              } as CorivoDatabase),
            closeDatabase,
          },
          buildPipeline,
          runPipeline,
        },
      }),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(createLogger).toHaveBeenCalledTimes(1);
    expect(readConfig).toHaveBeenCalledWith('/tmp/corivo');
    expect(buildPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'incremental',
        provider: 'codex',
      }),
    );
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('passes requested extraction provider into buildPipeline', async () => {
    let seenProvider: string | undefined;

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        provider: 'codex',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({}),
            openDatabase: () =>
              ({
                close: () => {},
              } as CorivoDatabase),
            closeDatabase: () => {},
          },
          buildPipeline: ({ provider }) => {
            seenProvider = provider;
            return { id: 'scheduled-memory-pipeline', stages: [] };
          },
          runPipeline: async () => ({
            runId: 'run',
            pipelineId: 'scheduled-memory-pipeline',
            status: 'success',
            stages: [],
          }),
        },
      }),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(seenProvider).toBe('codex');
  });

  it('passes resolved remote memory provider context into buildPipeline', async () => {
    let seenProjectTag: string | undefined;
    let seenMemoryProvider: string | undefined;

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({
              memoryEngine: {
                provider: 'supermemory',
                supermemory: {
                  apiKey: 'sm_test',
                  containerTag: 'project.test',
                },
              },
            }),
            openDatabase: () =>
              ({
                close: () => {},
              } as CorivoDatabase),
            closeDatabase: () => {},
          },
          buildPipeline: ({ memoryProvider, projectTag }) => {
            seenMemoryProvider = memoryProvider?.provider;
            seenProjectTag = projectTag;
            return { id: 'scheduled-memory-pipeline', stages: [] };
          },
          runPipeline: async () => ({
            runId: 'run',
            pipelineId: 'scheduled-memory-pipeline',
            status: 'success',
            stages: [],
          }),
        },
      }),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(seenMemoryProvider).toBe('supermemory');
    expect(seenProjectTag).toBe('project.test');
  });

  it('emits detailed debug logs across pipeline setup and stage execution', async () => {
    const logger = createMockLogger();
    const configDir = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-debug-'));

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        provider: 'codex',
        dependencies: {
          runtime: {
            resolveConfigDir: () => configDir,
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({}),
            createLogger: () => logger,
            openDatabase: () =>
              ({
                close: () => {},
              } as CorivoDatabase),
            closeDatabase: () => {},
          },
          buildPipeline: () => ({
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
        },
      }),
    ).resolves.toMatchObject({
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
    });

    expect(logger.debug).toHaveBeenCalledWith(`[memory:pipeline] starting mode=incremental provider=codex configDir=${configDir}`);
    expect(logger.debug).toHaveBeenCalledWith(`[memory:pipeline] resources ready runRoot=${configDir}/memory-pipeline`);
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
        /^\[memory:pipeline:runner] stage complete pipeline=scheduled-memory-pipeline run=run-.* stage=collect-jobs status=success input=2 output=1 artifacts=1 durationMs=\d+ failureClassification=none$/
      ),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[memory:pipeline] completed pipeline=scheduled-memory-pipeline status=success run=run-/
      ),
    );
  });

  it('uses incremental mode when composing incremental pipelines', async () => {
    let seenMode: string | undefined;

    await runMemoryPipeline({
      mode: 'incremental',
      dependencies: {
        runtime: {
          resolveConfigDir: () => '/tmp/corivo',
          resolveDatabasePath: () => '/tmp/corivo/corivo.db',
          readConfig: async () => ({}),
          openDatabase: () =>
            ({
              close: () => {},
            } as CorivoDatabase),
          closeDatabase: () => {},
        },
        buildPipeline: ({ mode }) => {
          seenMode = mode;
          return { id: 'scheduled-memory-pipeline', stages: [] };
        },
        runPipeline: async () => ({
          runId: 'run',
          pipelineId: 'scheduled-memory-pipeline',
          status: 'success',
          stages: [],
        }),
      },
    });

    expect(seenMode).toBe('incremental');
  });

  it('closes the database even if buildPipeline fails', async () => {
    let closed = false;

    await expect(
      runMemoryPipeline({
        mode: 'incremental',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({}),
            openDatabase: () =>
              ({
                close: () => {},
              } as CorivoDatabase),
            closeDatabase: () => {
              closed = true;
            },
          },
          buildPipeline: () => {
            throw new Error('pipeline build failure');
          },
        },
      }),
    ).rejects.toThrow('pipeline build failure');

    expect(closed).toBe(true);
  });

  it('builds the full pipeline with extract-raw-memories in the shared execution path', async () => {
    let seenStageIds: string[] = [];

    await expect(
      runMemoryPipeline({
        mode: 'full',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({}),
            openDatabase: () =>
              ({
                querySessionRecords: () => [],
                close: () => {},
              } as CorivoDatabase),
            closeDatabase: () => {},
          },
          runPipeline: async ({ pipeline }) => {
            seenStageIds = pipeline.stages.map((stage) => stage.id);
            return {
              runId: 'run',
              pipelineId: pipeline.id,
              status: 'success',
              stages: [],
            };
          },
        },
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

  it('passes opened database into buildPipeline for full mode composition', async () => {
    let listedSessions = false;
    let transcriptLookupKey: string | undefined;
    let sessionItemsPromise: Promise<unknown[]> | undefined;
    let closed = false;

    await expect(
      runMemoryPipeline({
        mode: 'full',
        dependencies: {
          runtime: {
            resolveConfigDir: () => '/tmp/corivo',
            resolveDatabasePath: () => '/tmp/corivo/corivo.db',
            readConfig: async () => ({}),
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
          },
          buildPipeline: ({ db }) => {
            const rawDb = db as CorivoDatabase & {
              listRawSessions: () => Array<{
                id: string;
                host: string;
                sessionKey: string;
                externalSessionId: string;
                updatedAt: number;
              }>;
              getRawTranscript: (sessionKey: string) => {
                session: {
                  id: string;
                  externalSessionId: string;
                  host: string;
                };
                messages: Array<{ role: string; content: string }>;
              };
            };
            sessionItemsPromise = Promise.resolve(
              rawDb.listRawSessions().map((session) => {
                const transcript = rawDb.getRawTranscript(session.sessionKey);
                return {
                  id: session.id,
                  kind: 'session',
                  sourceRef: session.sessionKey,
                  freshnessToken: String(session.updatedAt),
                  metadata: {
                    session: {
                      id: session.id,
                      sessionId: transcript.session.externalSessionId,
                      kind: 'raw-session',
                      host: transcript.session.host,
                      messages: transcript.messages,
                    },
                  },
                };
              }),
            );
            return { id: 'init-memory-pipeline', stages: [] };
          },
          runPipeline: async () => ({
            runId: 'run',
            pipelineId: 'init-memory-pipeline',
            status: 'success',
            stages: [],
          }),
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
      dependencies: {
        runtime: {
          resolveConfigDir: () => configDir,
          resolveDatabasePath: () => path.join(configDir, 'corivo.db'),
          readConfig: async () => ({}),
          openDatabase: () =>
            ({
              querySessionRecords: () => [],
              close: () => {},
            } as CorivoDatabase),
          closeDatabase: () => {},
        },
        buildPipeline: () => ({
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
      },
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
