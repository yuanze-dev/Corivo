import { Command } from 'commander';
import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { CorivoDatabase } from '@/storage/database';
import type { MemoryPipelineRunner } from '@/memory-pipeline';
import {
  createMemoryCommand,
  runMemoryPipeline,
  setMemoryCommandExecutor,
  setMemoryCommandPrinter,
  resetMemoryCommandOverrides,
} from '../../src/cli/commands/memory.js';

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
});
