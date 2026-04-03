/**
 * Reminders command
 * View and manage the reminders queue.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigDir } from '@/storage/database';
import type { CliOutput } from '@/cli/runtime';
import { getCliOutput } from '@/cli/runtime';

const REMINDERS_FILE = 'reminders.json';

export const remindersCommand = new Command('reminders');

remindersCommand
  .description('View and manage the reminder queue')
  .option('-p, --pending', 'Show only pending reminders')
  .option('-d, --dismiss <id>', 'Dismiss a specific reminder')
  .option('-a, --dismiss-all', 'Dismiss all pending reminders')
  .option('-c, --cleanup', 'Clean up expired reminders')
  .option('-j, --json', 'Output as JSON (for scripts)')
  .action(async (options) => {
    const output = getCliOutput();
    try {
      const configDir = getConfigDir();
      const remindersPath = path.join(configDir, REMINDERS_FILE);

      // Handling ignore operations
      if (options.dismissAll) {
        await dismissAll(remindersPath, output);
        return;
      }

      if (options.dismiss) {
        await dismissReminder(remindersPath, options.dismiss, output);
        return;
      }

      if (options.cleanup) {
        await cleanupReminders(remindersPath, output);
        return;
      }

      // Default: Show reminder list
      await displayReminders(remindersPath, options, output);
    } catch (error) {
      output.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * Show reminder list
 */
async function displayReminders(
  remindersPath: string,
  options: { pending?: boolean; json?: boolean },
  output: CliOutput = getCliOutput(),
): Promise<void> {
  const store = await loadStore(remindersPath);
  const now = Math.floor(Date.now() / 1000);

  let reminders = store.reminders;

  // filter conditions
  if (options.pending) {
    reminders = reminders.filter((r: any) => {
      if (r.dismissed) return false;
      if (r.expiresAt > 0 && r.expiresAt < now) return false;
      return true;
    });
  }

  if (reminders.length === 0) {
    if (options.json) {
      output.info(JSON.stringify({ reminders: [] }));
    } else {
      output.info('');
      output.info(chalk.gray('No pending reminders'));
      output.info('');
    }
    return;
  }

  // JSON output
  if (options.json) {
    output.info(JSON.stringify({ reminders }, null, 2));
    return;
  }

  // human readable output
  output.info('');
  output.info(chalk.cyan(`You have ${reminders.length} reminders:`));
  output.info('');

  for (const reminder of reminders) {
    output.info(formatReminder(reminder));
    output.info('');
  }

  // Tips on how to deal with
  if (options.pending) {
    output.info(chalk.gray('Tip: run corivo reminders --dismiss-all to dismiss all reminders'));
    output.info('');
  }
}

/**
 * Ignore specific reminders
 */
async function dismissReminder(remindersPath: string, id: string, output: CliOutput = getCliOutput()): Promise<void> {
  const store = await loadStore(remindersPath);
  const reminder = store.reminders.find((r: any) => r.id === id);

  if (!reminder) {
    output.info('');
    output.warn(chalk.yellow(`Reminder not found: ${id}`));
    output.info('');
    return;
  }

  reminder.dismissed = true;
  store.lastUpdated = Math.floor(Date.now() / 1000);

  await saveStore(remindersPath, store);

  output.info('');
  output.success(chalk.green(`Dismissed reminder: ${reminder.title || id}`));
  output.info('');
}

/**
 * Ignore all reminders
 */
async function dismissAll(remindersPath: string, output: CliOutput = getCliOutput()): Promise<void> {
  const store = await loadStore(remindersPath);
  let count = 0;

  for (const reminder of store.reminders) {
    if (!reminder.dismissed) {
      reminder.dismissed = true;
      count++;
    }
  }

  if (count > 0) {
    store.lastUpdated = Math.floor(Date.now() / 1000);
    await saveStore(remindersPath, store);
  }

  output.info('');
  output.success(chalk.green(`Dismissed ${count} reminders`));
  output.info('');
}

/**
 * Clear expired reminders
 */
async function cleanupReminders(remindersPath: string, output: CliOutput = getCliOutput()): Promise<void> {
  const store = await loadStore(remindersPath);
  const now = Math.floor(Date.now() / 1000);
  const retentionDays = 30;
  const cutoffTime = now - (retentionDays * 86400);

  const originalLength = store.reminders.length;

  // Retention: not ignored and (not expired or created within the retention period)
  store.reminders = store.reminders.filter((r: any) => {
    if (!r.dismissed && (r.expiresAt === 0 || r.expiresAt >= now)) {
      return true;
    }
    return r.createdAt > cutoffTime;
  });

  const cleanedCount = originalLength - store.reminders.length;

  if (cleanedCount > 0) {
    store.lastUpdated = now;
    await saveStore(remindersPath, store);
  }

  output.info('');
  output.success(chalk.green(`Cleaned up ${cleanedCount} expired reminders`));
  output.info('');
}

/**
 * Load reminder storage
 */
async function loadStore(remindersPath: string): Promise<any> {
  try {
    const content = await fs.readFile(remindersPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      reminders: [],
      lastUpdated: Math.floor(Date.now() / 1000),
    };
  }
}

/**
 * Save reminder storage
 */
async function saveStore(remindersPath: string, store: any): Promise<void> {
  const dir = path.dirname(remindersPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(remindersPath, JSON.stringify(store, null, 2));
}

/**
 * Format a single reminder
 */
function formatReminder(reminder: any): string {
  const lines: string[] = [];

  // status icon
  const statusIcon = reminder.dismissed ? '✓' : '○';

  // priority icon
  const priorityIcon: Record<string, string> = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  // type icon
  const typeIcon: Record<string, string> = {
    'follow-up': '📋',
    'attention': '⚠️',
    'conflict': '⚡',
    'weekly': '📊',
    'custom': '📌',
  };

  const pIcon = priorityIcon[reminder.priority] || '○';
  const tIcon = typeIcon[reminder.type] || '📌';

  lines.push(`${statusIcon} ${pIcon} ${tIcon} ${reminder.title || 'Reminder'}`);

  // Message content
  if (reminder.message) {
    lines.push(chalk.gray(`   ${reminder.message}`));
  }

  // ID (for --dismiss operation)
  lines.push(chalk.gray(`   ID: ${reminder.id}`));

  return lines.join('\n');
}

export default remindersCommand;
