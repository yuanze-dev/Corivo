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
  const commands = [
    initCliCommand,
    statusCliCommand,
    startCliCommand,
    stopCliCommand,
    doctorCliCommand,
    recoverCliCommand,
    identityCliCommand,
    setupPasswordCliCommand,
    unlockCliCommand,
    verifyIdentityCliCommand,
    app.commands.query,
    listCommand,
    app.commands.save,
    resolvedMemoryCommand,
    app.commands.host,
    coldScanCommand,
    pushCommand,
    pushQueueCommand,
    remindersCommand,
    carryOverCommand,
    reviewCommand,
    suggestCommand,
    firstRunCommand,
    app.commands.daemon,
    createSyncCommand(),
    ingestMessageCommand,
    app.commands.supermemory,
    updateCommand,
  ];

  program.name('corivo').description('Your silicon teammate, alive only for you').version(VERSION);

  commands.forEach((command) => {
    program.addCommand(command);
  });

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
