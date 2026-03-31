/**
 * Push-Queue command
 *
 * Manages the push queue (internal command, called by hooks).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { getConfigDir } from '../../storage/database.js';
import { PushQueue } from '../../engine/push-queue.js';

export const pushQueueCommand = new Command('push-queue');

pushQueueCommand
  .description('管理推送队列（内部命令）')
  .option('-p, --pending', '显示待处理的推送')
  .option('--dismiss <id>', '忽略指定的推送')
  .option('--dismiss-all', '忽略所有推送')
  .option('--clear', '清空队列')
  .option('--json', '以 JSON 格式输出')
  .action(async (options) => {
    try {
      const queue = new PushQueue();
      await queue.load();

      // Handle clear
      if (options.clear) {
        await queue.clear();
        console.log('推送队列已清空');
        return;
      }

      // handle ignore all
      if (options.dismissAll) {
        await queue.markAllShown();
        console.log('所有推送已忽略');
        return;
      }

      // Processing ignores single
      if (options.dismiss) {
        await queue.markShown(options.dismiss);
        console.log(`推送 ${options.dismiss} 已忽略`);
        return;
      }

      // Default: Show pending pushes
      const pending = queue.getPending(options.pending === true ? undefined : 5);

      if (pending.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ items: [] }));
        } else {
          // Empty output
        }
        return;
      }

      // JSON output
      if (options.json) {
        console.log(JSON.stringify({ items: pending }, null, 2));
        return;
      }

      // human readable output
      console.log('');
      console.log(`📬 待处理提醒 (${pending.length} 条):`);
      console.log('');

      for (const item of pending) {
        const icon = getIcon(item.type);
        console.log(`  ${icon} ${item.title}`);
        console.log(`     ${item.message}`);
        console.log('');
      }
    } catch (error) {
      console.log('');
    }
  });

function getIcon(type: string): string {
  const icons: Record<string, string> = {
    conflict: '⚡',
    forgotten: '🌱',
    relevant: '💡',
    attention: '⚠️',
    summary: '📊',
  };
  return icons[type] || '📌';
}

export default pushQueueCommand;
