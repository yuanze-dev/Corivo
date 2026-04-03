import { Command } from 'commander';
import { createQueryPack } from '@/application/query/query-pack.js';
import { formatSurfaceItem } from '@/cli/presenters/query-renderer.js';
import { generateReview } from '@/application/review/run-review.js';
import type { RuntimeCommandOptions } from '@/runtime/runtime-support.js';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import { getCliOutput } from '@/cli/runtime';

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
    const outputWriter = getCliOutput();
    const output = await runReviewCommand({
      password: options.password,
      format: options.format,
      lastMessage: options.lastMessage,
    });

    if (output) {
      outputWriter.info(output);
    }
  });

export default reviewCommand;
