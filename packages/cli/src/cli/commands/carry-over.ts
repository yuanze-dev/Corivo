import { Command } from 'commander';
import { generateCarryOver } from '@/application/carry-over/run-carry-over';
import { formatSurfaceItem } from '@/cli/presenters/query-renderer';
import type { RuntimeCommandOptions } from '@/runtime/runtime-support.js';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import { getCliOutput } from '@/cli/runtime';

export async function runCarryOverCommand(
  options: RuntimeCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db) {
    return '';
  }

  return formatSurfaceItem(
    generateCarryOver(db, { now: Math.floor(Date.now() / 1000) }),
    options.format,
  );
}

export const carryOverCommand = new Command('carry-over');

carryOverCommand
  .description('Generate session-start carry-over (internal command for hooks)')
  .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
  .option('--no-password', 'Skip password prompt (development mode)')
  .action(async (options) => {
    const outputWriter = getCliOutput();
    const output = await runCarryOverCommand({
      password: options.password,
      format: options.format,
    });

    if (output) {
      outputWriter.info(output);
    }
  });

export default carryOverCommand;
