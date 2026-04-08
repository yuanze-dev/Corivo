import { Command } from 'commander';
import type { Logger } from '@/infrastructure/logging';
import type { ExtractionProvider } from '@/infrastructure/llm/types';
import {
  DEFAULT_MEMORY_PROVIDER,
  type MemoryPipelineMode,
  type RunMemoryPipelineOptions,
} from '@/application/memory/run-memory-pipeline';
import type { MemoryPipelineRunResult } from '@/memory-pipeline';

export {
  DEFAULT_MEMORY_PROVIDER,
  type MemoryPipelineExecutionDependencies,
  type MemoryPipelineMode,
  type RunMemoryPipelineOptions,
} from '@/application/memory/run-memory-pipeline';

type MemoryCommandExecutor = (
  mode: MemoryPipelineMode,
  provider: ExtractionProvider,
) => Promise<MemoryPipelineRunResult>;

export interface MemoryCommandOptions {
  executor?: MemoryCommandExecutor;
  printer?: (result: MemoryPipelineRunResult) => void;
  logger?: Pick<Logger, 'debug'>;
}

function defaultPrinter(result: MemoryPipelineRunResult) {
  const stageIds = result.stages.map((stage) => stage.stageId);
  const stageSuffix = stageIds.length > 0 ? ` [stages: ${stageIds.join(', ')}]` : '';
  console.log(`Memory pipeline ${result.pipelineId} finished with status ${result.status} (run ${result.runId})${stageSuffix}`);
}

const missingExecutor: MemoryCommandExecutor = async (_mode, _provider) => {
  throw new Error('memory command requires injected executor capability');
};

const defaultLogger: Pick<Logger, 'debug'> = {
  debug: () => {},
};

export function createMemoryCommand({
  executor = missingExecutor,
  printer = defaultPrinter,
  logger = defaultLogger,
}: MemoryCommandOptions = {}): Command {
  const memoryCommand = new Command('memory');
  memoryCommand.description('Manage memory pipelines');

  memoryCommand
    .command('run')
    .description('Run a memory pipeline (default: incremental scheduled pipeline)')
    .option('--full', 'Trigger the init memory pipeline')
    .option('--incremental', 'Trigger the scheduled memory pipeline (default)')
    .option('--provider <provider>', 'Extraction provider to use (claude or codex)', DEFAULT_MEMORY_PROVIDER)
    .action(async (options: { full?: boolean; incremental?: boolean; provider?: ExtractionProvider }) => {
      logger.debug(
        `[memory:command] run requested full=${options.full === true} incremental=${options.incremental === true} provider=${options.provider ?? DEFAULT_MEMORY_PROVIDER}`
      );
      if (options.full && options.incremental) {
        throw new Error('Cannot specify both --full and --incremental at the same time.');
      }

      const provider = options.provider === 'codex' ? 'codex' : DEFAULT_MEMORY_PROVIDER;
      const mode: MemoryPipelineMode = options.full ? 'full' : 'incremental';
      logger.debug(`[memory:command] resolved mode=${mode} provider=${provider}`);
      const result = await executor(mode, provider);
      logger.debug(
        `[memory:command] executor completed pipeline=${result.pipelineId} status=${result.status} run=${result.runId} provider=${provider}`
      );
      printer(result);
      logger.debug('[memory:command] printer completed');
    });

  return memoryCommand;
}
