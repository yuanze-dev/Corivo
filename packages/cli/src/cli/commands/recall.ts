import { Command } from 'commander';
import { createQueryPack } from '../../runtime/query-pack.js';
import { generateRecall } from '../../runtime/recall.js';
import { formatSurfaceItem } from '../../runtime/render.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';

export interface RecallCommandOptions extends RuntimeCommandOptions {
  prompt?: string;
}

export async function runRecallCommand(
  options: RecallCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db || !options.prompt) {
    return '';
  }

  return formatSurfaceItem(
    generateRecall(db, createQueryPack({ prompt: options.prompt })),
    options.format,
  );
}

export const recallCommand = new Command('recall');

recallCommand
  .description('Generate pre-response recall (internal command for hooks)')
  .option('-p, --prompt <text>', 'Current user input')
  .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
  .option('--no-password', 'Skip password prompt (development mode)')
  .action(async (options) => {
    const output = await runRecallCommand({
      password: options.password,
      format: options.format,
      prompt: options.prompt,
    });

    if (output) {
      console.log(output);
    }
  });

export default recallCommand;
