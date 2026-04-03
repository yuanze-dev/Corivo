/**
 * Daemon command - internal use only, invoked by the service manager.
 */

import { Command } from 'commander';

export interface DaemonCommandDeps {
  runDaemon?: () => Promise<void>;
  logger?: Pick<Console, 'log' | 'error'>;
}

const defaultRunDaemon = async (): Promise<void> => {
  throw new Error('daemon command requires injected runDaemon capability');
};

export function createDaemonCommand(deps: DaemonCommandDeps = {}): Command {
  const runDaemon = deps.runDaemon ?? defaultRunDaemon;
  const command = new Command('daemon');

  command.description('Internal use only, invoked by the service manager');
  command
    .command('run')
    .description('Run the heartbeat loop (invoked by the system, not intended for manual execution)')
    .action(async () => {
      await runDaemon();
    });

  return command;
}

export const daemonCommand = createDaemonCommand();

export default daemonCommand;
