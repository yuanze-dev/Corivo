/**
 * CLI main entry point
 *
 * Corivo command-line interface — registers all subcommands and parses arguments.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Read version number
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Read from the project root directory in development environment and from the dist directory in production environment
const packagePath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
const VERSION = packageJson.version;

// import command
import { initCommand } from './commands/init.js';
import { saveCommand } from './commands/save.js';
import { queryCommand } from './commands/query.js';
import { statusCommand } from './commands/status.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { doctorCommand } from './commands/doctor.js';
import { recoverCommand } from './commands/recover.js';
import { injectCommand } from './commands/inject.js';
import { hostCommand } from './commands/host.js';
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
import { daemonCommand } from './commands/daemon.js';
import { updateCommand } from './commands/update.js';
import { createSyncCommand } from './commands/sync.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program
  .name('corivo')
  .description('Your silicon teammate, alive only for you')
  .version(VERSION);

// Register command
program
  .command('init')
  .description('Initialize Corivo')
  .option('--join <code>', 'Join an existing identity using a pairing code (multi-device sync)')
  .option('--server <url>', 'Solver server URL (used with --join)')
  .action(initCommand);

program
  .command('save')
  .description('Save information')
  .option('-c, --content <text>', 'Content')
  .option('-a, --annotation <text>', 'Annotation (type · domain · tag)')
  .option('-s, --source <text>', 'Source')
  .option('--pending', 'Save in pending mode (the heartbeat process will annotate it later)')
  .action((options) => saveCommand(options));

program
  .command('query')
  .description('Query information')
  .argument('[query]', 'Search keywords')
  .option('-l, --limit <number>', 'Result limit', '10')
  .option('-v, --verbose', 'Show detailed information')
  .option('-p, --pattern', 'Show decision patterns')
  .option('--prompt <text>', 'Generate prompt-based query using the current user input')
  .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
  .action((query, options) => queryCommand(query, options));

program
  .command('status')
  .description('View status')
  .option('--tui', 'Launch the interactive status panel')
  .option('--no-password', 'Skip password prompt (development mode)')
  .action(async (options) => {
    if (options.tui) {
      const { renderTui } = await import('../tui/index.js');
      await renderTui();
    } else {
      await statusCommand(options);
    }
  });

program
  .command('start')
  .description('Start the daemon')
  .action(startCommand);

program
  .command('stop')
  .description('Stop the daemon')
  .action(stopCommand);

program
  .command('doctor')
  .description('Run health checks')
  .action(doctorCommand);

program
  .command('recover')
  .description('Recover keys')
  .action(recoverCommand);

program
  .command('inject')
  .description('Inject Corivo rules into a project')
  .option('-t, --target <path>', 'Target project path')
  .option('-g, --global', 'Inject into the global CLAUDE.md')
  .option('--claude-code', 'Install the Claude Code proactive-memory adapter')
  .option('--codex', 'Inject using the Codex rules template')
  .option('--cursor', 'Inject using the Cursor rules template')
  .option('--opencode', 'Install the OpenCode proactive-memory plugin')
  .option('--eject', 'Remove injected rules')
  .option('--force', 'Force-replace existing rules')
  .action((options) => injectCommand(options));

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
  .option('-p, --password <password>', 'Master password')
  .option('-v, --verbose', 'Show detailed information')
  .action((options) => verifyIdentityCommand(options));

program.addCommand(listCommand);
program.addCommand(hostCommand);
program.addCommand(coldScanCommand);
program.addCommand(pushCommand);
program.addCommand(pushQueueCommand);
program.addCommand(remindersCommand);
program.addCommand(carryOverCommand);
program.addCommand(reviewCommand);
program.addCommand(suggestCommand);
program.addCommand(firstRunCommand);
program.addCommand(daemonCommand);
program.addCommand(updateCommand);
program.addCommand(createSyncCommand());

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

// Parse parameters
program.parseAsync().catch((error) => {
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
});
