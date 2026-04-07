/**
 * CLI main entry point
 *
 * Corivo command-line interface — registers all subcommands and parses arguments.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
// import command
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { doctorCommand } from './commands/doctor.js';
import { recoverCommand } from './commands/recover.js';
import { identityCommand } from './commands/identity.js';
import { setupPasswordCommand } from './commands/setup-password.js';
import { unlockCommand } from './commands/unlock.js';
import { verifyIdentityCommand } from './commands/verify-identity.js';
import { coldScanCommand } from './commands/cold-scan.js';
import { pushCommand } from './commands/push.js';
import { pushQueueCommand } from './commands/push-queue.js';
import { remindersCommand } from './commands/reminders.js';
import { suggestCommand } from './commands/suggest.js';
import { carryOverCommand } from './commands/carry-over.js';
import { reviewCommand } from './commands/review.js';
import { firstRunCommand } from './commands/heartbeat-first-run.js';
import { updateCommand } from './commands/update.js';
import { createSyncCommand } from './commands/sync.js';
import { listCommand } from './commands/list.js';
import { ingestMessageCommand } from './commands/ingest-message.js';
import { statusCommand } from './commands/status.js';
import type { CliApp } from '@/application/bootstrap/types.js';
import { createCliApp } from '@/application/bootstrap/create-cli-app.js';

// Read version number
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Read from the project root directory in development environment and from the dist directory in production environment
const packagePath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
const VERSION = packageJson.version;

type CliProgramOptions = {
  app?: CliApp;
  memoryCommand?: Command;
};

export function createProgram({ app = createCliApp(), memoryCommand }: CliProgramOptions = {}) {
  const program = new Command();
  const resolvedMemoryCommand = memoryCommand ?? app.commands.memory;

  program.name('corivo').description('Your silicon teammate, alive only for you').version(VERSION);

  // Register command
  program
    .command('init')
    .description('Initialize Corivo')
    .option('--join <code>', 'Join an existing identity using a pairing code (multi-device sync)')
    .option('--server <url>', 'Solver server URL (used with --join)')
    .action(initCommand);

  program
    .command('status')
    .description('View status')
    .option('--json', 'Output JSON formate')
    .action(statusCommand);

  program.command('start').description('Start the daemon').action(startCommand);
  program.command('stop').description('Stop the daemon').action(stopCommand);
  program.command('doctor').description('Run health checks').action(doctorCommand);
  program.command('recover').description('Recover keys').action(recoverCommand);

  program
    .command('identity')
    .description('View identity information')
    .option('-v, --verbose', 'Show detailed information')
    .action((options) => identityCommand(options));

  program
    .command('setup-password')
    .description('Set the master password (for database encryption and cross-device verification)')
    .option('-f, --force', 'Force-change the existing password')
    .action((options) => setupPasswordCommand(options));

  program
    .command('unlock')
    .description('Unlock and inspect database contents')
    .option('-r, --raw', 'Output in raw format')
    .option('-l, --limit <number>', 'Result limit', '100')
    .action((options) => unlockCommand(options));

  program
    .command('verify-identity')
    .description('Cross-device identity verification (fingerprints + password)')
    .option('-v, --verbose', 'Show detailed information')
    .action((options) => verifyIdentityCommand(options));

  program.addCommand(app.commands.query);
  program.addCommand(listCommand);
  program.addCommand(app.commands.save);
  program.addCommand(resolvedMemoryCommand);
  program.addCommand(app.commands.host);
  program.addCommand(coldScanCommand);
  program.addCommand(pushCommand);
  program.addCommand(pushQueueCommand);
  program.addCommand(remindersCommand);
  program.addCommand(carryOverCommand);
  program.addCommand(reviewCommand);
  program.addCommand(suggestCommand);
  program.addCommand(firstRunCommand);
  program.addCommand(app.commands.daemon);
  program.addCommand(updateCommand);
  program.addCommand(createSyncCommand());
  program.addCommand(ingestMessageCommand);
  program.addCommand(app.commands.supermemory);

  // Error handling
  program.configureOutput({
    writeErr: (str) => {
      if (str.includes('error:')) {
        console.error(chalk.red(str));
      } else {
        console.error(str);
      }
    },
  });

  return program;
}
let program: Command | undefined;

export function isCliEntrypoint(
  argvOne: string | undefined,
  moduleFilename: string = __filename,
  cliEntrypoint: string = join(__dirname, '../../bin/corivo.js'),
): boolean {
  if (!argvOne) {
    return false;
  }

  const normalizedArgvOne = normalizeEntrypointPath(argvOne);
  const candidates = [moduleFilename, cliEntrypoint].map((candidate) => normalizeEntrypointPath(candidate));

  return candidates.includes(normalizedArgvOne);
}

function normalizeEntrypointPath(filePath: string): string {
  const resolvedPath = resolve(filePath);

  try {
    return realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

const shouldParseCli = isCliEntrypoint(process.argv[1]);

export { program };

if (shouldParseCli) {
  program = createProgram();
  // Parse parameters
  program.parseAsync().catch((error) => {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });
}
