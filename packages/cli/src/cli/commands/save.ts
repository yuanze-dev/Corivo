/**
 * CLI command - save
 *
 * Saves information to Corivo as a memory block.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ValidationError } from '@/domain/errors/index.js';
import { getCliOutput } from '@/cli/runtime';
import {
  createSaveMemoryUseCase,
  type SaveMemoryInput,
  type SaveMemoryResult,
} from '@/application/memory/save-memory.js';
import type { Logger } from '@/infrastructure/logging.js';

interface SaveOptions {
  content?: string;
  annotation?: string;
  source?: string;
  pending?: boolean;
}

export interface SaveCommandDeps {
  saveMemory?: (input: SaveMemoryInput) => Promise<SaveMemoryResult>;
  output?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    success: (...args: unknown[]) => void;
  };
  logger?: Pick<Logger, 'debug'>;
}

const defaultSaveLogger: Pick<Logger, 'debug'> = {
  debug: () => {},
};

async function runSaveCommand(options: SaveOptions, deps: Required<SaveCommandDeps>): Promise<void> {
  const output = deps.output;

  // Validate input
  if (!options.content || options.content.trim().length === 0) {
    throw new ValidationError('Missing --content argument');
  }

  // Keep legacy UX: warn when user didn't explicitly opt into pending, but we will still save as pending.
  const annotationForWarn = (options.annotation ?? '').trim() || (options.pending ? 'pending' : '');
  if (!options.pending && !annotationForWarn) {
    output.warn(chalk.yellow('\n⚠️  No annotation provided, saving in pending mode'));
    output.info(chalk.gray('The heartbeat daemon will try to annotate it automatically later\n'));
  }

  deps.logger.debug(
    `[save:command] contentLength=${options.content.length} pending=${Boolean(options.pending)} annotationProvided=${Boolean((options.annotation ?? '').trim())}`,
  );

  const result = await deps.saveMemory({
    content: options.content,
    annotation: options.annotation,
    source: options.source,
    pending: options.pending,
  });

  // Show results
  output.success(chalk.green('\n✅ Memory saved\n'));
  output.info(chalk.gray('ID:       ') + chalk.white(result.local?.id ?? result.id ?? ''));
  output.info(chalk.gray('Content:   ') + chalk.white(result.content));
  output.info(chalk.gray('Annotation:') + chalk.cyan(result.annotation));
  if (result.local) {
    output.info(chalk.gray('Vitality:  ') + chalk.yellow(`${result.local.vitality} (${result.local.status})`));
  } else {
    output.info(chalk.gray('Provider:  ') + chalk.cyan(result.provider));
  }
  output.info('');

  // If there is any conflict, please give a friendly reminder
  if (result.conflictReminder && result.conflictReminder.hasConflict) {
    output.warn(chalk.yellow(result.conflictReminder.message));
    output.info('');
  }
}

export async function saveCommand(options: SaveOptions, deps: SaveCommandDeps = {}): Promise<void> {
  const resolved: Required<SaveCommandDeps> = {
    saveMemory: deps.saveMemory ?? createSaveMemoryUseCase(),
    output: deps.output ?? getCliOutput(),
    logger: deps.logger ?? defaultSaveLogger,
  };

  await runSaveCommand(options, resolved);
}

export function createSaveCommand(deps: SaveCommandDeps = {}): Command {
  const resolved: Required<SaveCommandDeps> = {
    saveMemory: deps.saveMemory ?? createSaveMemoryUseCase(),
    output: deps.output ?? getCliOutput(),
    logger: deps.logger ?? defaultSaveLogger,
  };

  return new Command('save')
    .description('Save information')
    .option('-c, --content <text>', 'Content')
    .option('-a, --annotation <text>', 'Annotation (type · domain · tag)')
    .option('-s, --source <text>', 'Source')
    .option('--pending', 'Save in pending mode (the heartbeat process will annotate it later)')
    .action(async (options: SaveOptions) => {
      await runSaveCommand(options, resolved);
    });
}
