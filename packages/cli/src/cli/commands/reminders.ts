/**
 * Reminders command
 * View and manage the reminders queue.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigDir } from '../../storage/database.js';

const REMINDERS_FILE = 'reminders.json';

export const remindersCommand = new Command('reminders');

remindersCommand
  .description('查看和管理提醒队列')
  .option('-p, --pending', '只显示待处理的提醒')
  .option('-d, --dismiss <id>', '忽略指定的提醒')
  .option('-a, --dismiss-all', '忽略所有待处理提醒')
  .option('-c, --cleanup', '清理过期的提醒')
  .option('-j, --json', '以 JSON 格式输出（供脚本调用）')
  .action(async (options) => {
    try {
      const configDir = getConfigDir();
      const remindersPath = path.join(configDir, REMINDERS_FILE);

      // Handling ignore operations
      if (options.dismissAll) {
        await dismissAll(remindersPath);
        return;
      }

      if (options.dismiss) {
        await dismissReminder(remindersPath, options.dismiss);
        return;
      }

      if (options.cleanup) {
        await cleanupReminders(remindersPath);
        return;
      }

      // Default: Show reminder list
      await displayReminders(remindersPath, options);
    } catch (error) {
      console.error(chalk.red('错误:'), error);
      process.exit(1);
    }
  });

/**
 * Show reminder list
 */
async function displayReminders(
  remindersPath: string,
  options: { pending?: boolean; json?: boolean }
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
      console.log(JSON.stringify({ reminders: [] }));
    } else {
      console.log('');
      console.log(chalk.gray('没有待处理的提醒'));
      console.log('');
    }
    return;
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({ reminders }, null, 2));
    return;
  }

  // human readable output
  console.log('');
  console.log(chalk.cyan(`你有 ${reminders.length} 条提醒:`));
  console.log('');

  for (const reminder of reminders) {
    console.log(formatReminder(reminder));
    console.log('');
  }

  // Tips on how to deal with
  if (options.pending) {
    console.log(chalk.gray(`提示: 运行 corivo reminders --dismiss-all 可忽略所有提醒`));
    console.log('');
  }
}

/**
 * Ignore specific reminders
 */
async function dismissReminder(remindersPath: string, id: string): Promise<void> {
  const store = await loadStore(remindersPath);
  const reminder = store.reminders.find((r: any) => r.id === id);

  if (!reminder) {
    console.log('');
    console.log(chalk.yellow(`未找到提醒: ${id}`));
    console.log('');
    return;
  }

  reminder.dismissed = true;
  store.lastUpdated = Math.floor(Date.now() / 1000);

  await saveStore(remindersPath, store);

  console.log('');
  console.log(chalk.green(`已忽略提醒: ${reminder.title || id}`));
  console.log('');
}

/**
 * Ignore all reminders
 */
async function dismissAll(remindersPath: string): Promise<void> {
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

  console.log('');
  console.log(chalk.green(`已忽略 ${count} 条提醒`));
  console.log('');
}

/**
 * Clear expired reminders
 */
async function cleanupReminders(remindersPath: string): Promise<void> {
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

  console.log('');
  console.log(chalk.green(`清理了 ${cleanedCount} 条过期提醒`));
  console.log('');
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

  lines.push(`${statusIcon} ${pIcon} ${tIcon} ${reminder.title || '提醒'}`);

  // Message content
  if (reminder.message) {
    lines.push(chalk.gray(`   ${reminder.message}`));
  }

  // ID (for --dismiss operation)
  lines.push(chalk.gray(`   ID: ${reminder.id}`));

  return lines.join('\n');
}

export default remindersCommand;
