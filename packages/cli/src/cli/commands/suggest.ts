/**
 * Suggest command
 *
 * Legacy entry point for older hooks. The primary paths are now carry-over / query / review.
 */

import { Command } from 'commander';
import { runCarryOverCommand } from './carry-over.js';
import { runReviewCommand } from './review.js';
import { getCliOutput } from '@/cli/runtime';

export interface SuggestCommandOptions {
  context?: string;
  lastMessage?: string;
  format?: 'text' | 'json' | 'hook-text';
}

export const suggestCommand = new Command('suggest');

function hasObviousNextStep(message: string): boolean {
  const lower = message.toLowerCase();

  const signals = [
    'bug.*fix',
    'resolved.*bug',
    'fix.*done',
    'code.*done',
    'wrapped up',
    'implemented',
    'done',
    'finished',
    'complete',
    'tests?.*passed',
    'tests?.*pass',
  ];

  return signals.some((signal) => new RegExp(signal, 'i').test(lower));
}

export async function runSuggestCommand(
  options: SuggestCommandOptions = {},
): Promise<string> {
  const context = options.context ?? 'session-start';

  if (context === 'post-request') {
    if (options.lastMessage && hasObviousNextStep(options.lastMessage)) {
      return '';
    }

    return runReviewCommand({
      format: options.format,
      lastMessage: options.lastMessage,
    });
  }

  return runCarryOverCommand({
    format: options.format,
  });
}

suggestCommand
  .description('Compatibility entry point for legacy hooks (internal command for hooks)')
  .option('-c, --context <type>', 'Context type: session-start | post-request', 'session-start')
  .option('-m, --last-message <text>', "Claude's last response")
  .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
  .action(async (options) => {
    const outputWriter = getCliOutput();
    const output = await runSuggestCommand({
      context: options.context,
      lastMessage: options.lastMessage,
      format: options.format,
    });

    if (output) {
      outputWriter.info(output);
    }
  });

export default suggestCommand;
