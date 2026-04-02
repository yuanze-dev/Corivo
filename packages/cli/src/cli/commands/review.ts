import { Command } from 'commander';
import { createQueryPack } from '../../runtime/query-pack.js';
import { formatSurfaceItem } from '../../runtime/render.js';
import { generateReview } from '../../runtime/review.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';
import { createCliContext } from '../context/create-context.js';

export interface ReviewCommandOptions extends RuntimeCommandOptions {
  lastMessage?: string;
}

export async function runReviewCommand(
  options: ReviewCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db || !options.lastMessage) {
    return '';
  }

  return formatSurfaceItem(
    generateReview(db, createQueryPack({ assistantMessage: options.lastMessage })),
    options.format,
  );
}

export const reviewCommand = new Command('review');

reviewCommand
  .description('Generate post-response review (internal command for hooks)')
  .option('-m, --last-message <text>', "Claude's last response")
  .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
  .option('--no-password', 'Skip password prompt (development mode)')
  .action(async (options) => {
    const context = createCliContext();
    const output = await runReviewCommand({
      password: options.password,
      format: options.format,
      lastMessage: options.lastMessage,
    });

    if (output) {
      context.output.info(output);
    }
  });

export default reviewCommand;
