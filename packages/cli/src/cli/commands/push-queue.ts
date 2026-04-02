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
import { createCliContext } from '../context/create-context.js';

export const pushQueueCommand = new Command('push-queue');

pushQueueCommand
  .description('Manage push queue (internal command)')
  .option('-p, --pending', 'Show pending pushes')
  .option('--dismiss <id>', 'Dismiss a specific push')
  .option('--dismiss-all', 'Dismiss all pushes')
  .option('--clear', 'Clear the queue')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const context = createCliContext();
    const output = context.output;
    try {
      const queue = new PushQueue();
      await queue.load();

      // Handle clear
      if (options.clear) {
        await queue.clear();
        output.info('Push queue cleared');
        return;
      }

      // handle ignore all
      if (options.dismissAll) {
        await queue.markAllShown();
        output.info('All pushes dismissed');
        return;
      }

      // Processing ignores single
      if (options.dismiss) {
        await queue.markShown(options.dismiss);
        output.info(`Dismissed push ${options.dismiss}`);
        return;
      }

      // Default: Show pending pushes
      const pending = queue.getPending(options.pending === true ? undefined : 5);

      if (pending.length === 0) {
        if (options.json) {
          output.info(JSON.stringify({ items: [] }));
        } else {
          // Empty output
        }
        return;
      }

      // JSON output
      if (options.json) {
        output.info(JSON.stringify({ items: pending }, null, 2));
        return;
      }

      // human readable output
      output.info('');
      output.info(`📬 Pending notifications (${pending.length}):`);
      output.info('');

      for (const item of pending) {
        const icon = getIcon(item.type);
        output.info(`  ${icon} ${item.title}`);
        output.info(`     ${item.message}`);
        output.info('');
      }
    } catch (error) {
      output.info('');
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
