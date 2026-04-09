/**
 * CLI main entry point
 *
 * Corivo command-line interface — registers all subcommands and parses arguments.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// import command
import { initCliCommand } from './commands/init.js';
import { startCliCommand } from './commands/start.js';
import { stopCliCommand } from './commands/stop.js';
import { doctorCliCommand } from './commands/doctor.js';
import { recoverCliCommand } from './commands/recover.js';
import { identityCliCommand } from './commands/identity.js';
import { setupPasswordCliCommand } from './commands/setup-password.js';
import { unlockCliCommand } from './commands/unlock.js';
import { verifyIdentityCliCommand } from './commands/verify-identity.js';
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
import { statusCliCommand } from './commands/status.js';
import type { CliApp } from '@/application/bootstrap/types.js';
import { createCliApp } from '@/application/bootstrap/create-cli-app.js';

// Read version number
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = resolvePackagePath(__dirname);
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
const VERSION = packageJson.version;

type CliProgramOptions = {
  app?: CliApp;
  memoryCommand?: Command;
};

type CommandSpec = {
  route: string;
  build: () => Command;
};

function resolvePackagePath(currentDir: string): string {
  const candidates = [
    join(currentDir, '../../package.json'),
    join(currentDir, '../package.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function createProgram({ app = createCliApp(), memoryCommand }: CliProgramOptions = {}) {
  const program = new Command();
  const resolvedMemoryCommand = memoryCommand ?? app.commands.memory;
  const commandSpecs: CommandSpec[] = [
    { route: 'init', build: () => initCliCommand },
    { route: 'status', build: () => statusCliCommand },
    { route: 'start', build: () => startCliCommand },
    { route: 'stop', build: () => stopCliCommand },
    { route: 'doctor', build: () => doctorCliCommand },
    { route: 'recover', build: () => recoverCliCommand },
    { route: 'identity', build: () => identityCliCommand },
    { route: 'setup-password', build: () => setupPasswordCliCommand },
    { route: 'unlock', build: () => unlockCliCommand },
    { route: 'verify-identity', build: () => verifyIdentityCliCommand },
    { route: 'query', build: () => app.commands.query },
    { route: 'list', build: () => listCommand },
    { route: 'save', build: () => app.commands.save },
    { route: 'memory', build: () => resolvedMemoryCommand },
    { route: 'host', build: () => app.commands.host },
    { route: 'cold-scan', build: () => coldScanCommand },
    { route: 'push', build: () => pushCommand },
    { route: 'push-queue', build: () => pushQueueCommand },
    { route: 'reminders', build: () => remindersCommand },
    { route: 'carry-over', build: () => carryOverCommand },
    { route: 'review', build: () => reviewCommand },
    { route: 'suggest', build: () => suggestCommand },
    { route: 'first-run', build: () => firstRunCommand },
    { route: 'daemon', build: () => app.commands.daemon },
    { route: 'sync', build: () => createSyncCommand() },
    { route: 'ingest-message', build: () => ingestMessageCommand },
    { route: 'supermemory', build: () => app.commands.supermemory },
    { route: 'update', build: () => updateCommand },
  ];

  program.name('corivo').description('Your silicon teammate, alive only for you').version(VERSION);

  for (const { build } of commandSpecs) {
    program.addCommand(build());
  }

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
