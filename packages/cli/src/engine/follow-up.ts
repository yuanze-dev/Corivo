/**
 * Progress Reminder Manager
 *
 * Provide gentle progress reminders for pending decisions: "What happened to that xxx?"
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';

/**
 * reminder items
 */
export interface ReminderItem {
  block: Block;
  daysSinceCreation: number;
  reminderMessage: string;
}

/**
 * Progress Reminder Manager
 */
export class FollowUpManager {
  private static readonly FOLLOW_UP_THRESHOLD_DAYS = 3; // Reminder after 3 days
  private static readonly REMINDER_COOLDOWN_DAYS = 7; // Only remind once for the same content within 7 days

  constructor(private db: CorivoDatabase) {}

  /**
   * Get content you need to follow up on
   *
   * @returns List of items that need to be reminded
   */
  getPendingItems(): ReminderItem[] {
    // Get pending decisions
    const pendingDecisions = this.db.queryBlocks({
      annotation: 'pending',
      limit: 100,
    });

    // Get the decision class but not marked it
    const decisions = this.db.queryBlocks({
      limit: 100,
    }).filter((b) =>
      b.annotation.includes('决策') &&
      b.status !== 'archived'
    );

    const combined = [...pendingDecisions, ...decisions];

    const now = Date.now();
    const reminders: ReminderItem[] = [];

    for (const block of combined) {
      const daysSince = (now - block.created_at * 1000) / (24 * 60 * 60 * 1000);

      // Older than 3 days and not archived
      if (daysSince >= FollowUpManager.FOLLOW_UP_THRESHOLD_DAYS) {
        reminders.push({
          block,
          daysSinceCreation: Math.floor(daysSince),
          reminderMessage: this.generateReminder(block, Math.floor(daysSince)),
        });
      }
    }

    return reminders;
  }

  /**
   * Get what needs to be reminded this week (for regular heartbeat check)
   *
   * @returns reminder message list
   */
  getWeeklyReminders(): string[] {
    const pending = this.getPendingItems();

    // Only remind up to 3 people to avoid being annoying
    const limited = pending.slice(0, 3);

    if (limited.length === 0) {
      return [];
    }

    return limited.map((item) => `[corivo] ${item.reminderMessage}`);
  }

  /**
   * Generate reminder
   */
  private generateReminder(block: Block, daysSince: number): string {
    const preview = block.content.length > 30
      ? block.content.slice(0, 30) + '...'
      : block.content;

    // Adjust tone according to time
    if (daysSince <= 7) {
      return `那个 "${preview}" 有进展吗？`;
    } else if (daysSince <= 14) {
      return `"${preview}" 怎么样了？`;
    } else {
      return `还要继续 "${preview}" 吗？`;
    }
  }

  /**
   * Check whether a certain block needs to be reminded
   *
   * @param blockId - Block ID
   * @returns Do you need a reminder?
   */
  needsReminder(blockId: string): boolean {
    const block = this.db.getBlock(blockId);
    if (!block) {
      return false;
    }

    const now = Date.now();
    const daysSince = (now - block.created_at * 1000) / (24 * 60 * 60 * 1000);

    return daysSince >= FollowUpManager.FOLLOW_UP_THRESHOLD_DAYS;
  }
}
