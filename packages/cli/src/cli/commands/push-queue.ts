/**
 * Push-Queue command
 *
 * Manages the push queue (internal command, called by hooks).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { getConfigDir } from '@/storage/database';
import { PushQueue } from '../../engine/push-queue.js';

export const pushQueueCommand = new Command('push-queue');

pushQueueCommand
  .description('Manage push queue (internal command)')
  .option('-p, --pending', 'Show pending pushes')
  .option('--dismiss <id>', 'Dismiss a specific push')
  .option('--dismiss-all', 'Dismiss all pushes')
  .option('--clear', 'Clear the queue')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const queue = new PushQueue();
      await queue.load();

      // Handle clear
      if (options.clear) {
        await queue.clear();
        console.log('Push queue cleared');
        return;
      }

      // handle ignore all
      if (options.dismissAll) {
        await queue.markAllShown();
        console.log('All pushes dismissed');
        return;
      }

      // Processing ignores single
      if (options.dismiss) {
        await queue.markShown(options.dismiss);
        console.log(`Dismissed push ${options.dismiss}`);
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
      console.log(`📬 Pending notifications (${pending.length}):`);
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
