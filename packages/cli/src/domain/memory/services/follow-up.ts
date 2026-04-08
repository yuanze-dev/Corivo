/**
 * Progress Reminder Manager
 *
 * Provide gentle progress reminders for pending decisions: "What happened to that xxx?"
 */

import type { MemoryServiceDatabase } from '@/domain/memory/contracts/service-database.js';
import type { Block } from '@/domain/memory/models/index.js';
import {
  collectFollowUpReminderItems,
  DEFAULT_FOLLOW_UP_RETRIEVAL_POLICY,
  type FollowUpRetrievalPolicy,
} from '@/runtime/follow-up-retrieval.js';
import {
  buildFollowUpReminderMessage,
  DEFAULT_FOLLOW_UP_RENDER_POLICY,
  formatWeeklyFollowUpReminders,
  type FollowUpRenderPolicy,
} from '@/runtime/follow-up-render.js';

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
  private readonly retrievalPolicy: FollowUpRetrievalPolicy;
  private readonly renderPolicy: FollowUpRenderPolicy;

  constructor(
    private readonly db: MemoryServiceDatabase,
    options: {
      retrievalPolicy?: Partial<FollowUpRetrievalPolicy>;
      renderPolicy?: Partial<FollowUpRenderPolicy>;
    } = {},
  ) {
    this.retrievalPolicy = {
      ...DEFAULT_FOLLOW_UP_RETRIEVAL_POLICY,
      ...options.retrievalPolicy,
    };
    this.renderPolicy = {
      ...DEFAULT_FOLLOW_UP_RENDER_POLICY,
      ...options.renderPolicy,
    };
  }

  /**
   * Get content you need to follow up on
   *
   * @returns List of items that need to be reminded
   */
  getPendingItems(): ReminderItem[] {
    return collectFollowUpReminderItems(this.db, {
      now: Date.now(),
      policy: this.retrievalPolicy,
    }).map((item) => ({
      ...item,
      reminderMessage: buildFollowUpReminderMessage(item.block, item.daysSinceCreation, {
        policy: this.renderPolicy,
      }),
    }));
  }

  /**
   * Get what needs to be reminded this week (for regular heartbeat check)
   *
   * @returns reminder message list
   */
  getWeeklyReminders(): string[] {
    const pending = collectFollowUpReminderItems(this.db, {
      now: Date.now(),
      policy: this.retrievalPolicy,
    });
    return formatWeeklyFollowUpReminders(pending, { policy: this.renderPolicy });
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

    return daysSince >= this.retrievalPolicy.thresholdDays;
  }
}
