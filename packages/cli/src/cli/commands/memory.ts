import { Command } from 'commander';
import { createCliContext } from '@/cli/context';
import type { Logger } from '@/utils/logging';
import type { ExtractionProvider } from '@/extraction/types';
import {
  DEFAULT_MEMORY_PROVIDER,
  runMemoryPipeline,
  type MemoryPipelineMode,
  type RunMemoryPipelineOptions,
} from '@/application/memory/run-memory-pipeline';
import type { MemoryPipelineRunResult } from '@/memory-pipeline';

export {
  DEFAULT_MEMORY_PROVIDER,
  runMemoryPipeline,
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
  logger?: Logger;
}

function defaultPrinter(result: MemoryPipelineRunResult) {
  const context = createCliContext();
  const stageIds = result.stages.map((stage) => stage.stageId);
  const stageSuffix = stageIds.length > 0 ? ` [stages: ${stageIds.join(', ')}]` : '';
  context.output.info(
    `Memory pipeline ${result.pipelineId} finished with status ${result.status} (run ${result.runId})${stageSuffix}`
  );
}

const defaultExecutor: MemoryCommandExecutor = (mode, provider) =>
  runMemoryPipeline({ mode, provider });

export function createMemoryCommand({
  executor = defaultExecutor,
  printer = defaultPrinter,
  logger = createCliContext().logger,
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
