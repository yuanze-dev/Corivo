/**
 * 进展提醒管理器
 *
 * 对待办决策进行温和的进展提醒："那个 xxx 后来怎么样了？"
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';

/**
 * 提醒项
 */
export interface ReminderItem {
  block: Block;
  daysSinceCreation: number;
  reminderMessage: string;
}

/**
 * 进展提醒管理器
 */
export class FollowUpManager {
  private static readonly FOLLOW_UP_THRESHOLD_DAYS = 3; // 3 天后提醒
  private static readonly REMINDER_COOLDOWN_DAYS = 7; // 同一内容 7 天内只提醒一次

  constructor(private db: CorivoDatabase) {}

  /**
   * 获取需要跟进的内容
   *
   * @returns 需要提醒的项列表
   */
  getPendingItems(): ReminderItem[] {
    // 获取待办决策
    const pendingDecisions = this.db.queryBlocks({
      annotation: 'pending',
      limit: 100,
    });

    // 获取决策类但未标注完成的
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

      // 超过 3 天且未归档
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
   * 获取本周需要提醒的内容（用于心跳定期检查）
   *
   * @returns 提醒消息列表
   */
  getWeeklyReminders(): string[] {
    const pending = this.getPendingItems();

    // 只提醒最多 3 个，避免烦人
    const limited = pending.slice(0, 3);

    if (limited.length === 0) {
      return [];
    }

    return limited.map((item) => `[corivo] ${item.reminderMessage}`);
  }

  /**
   * 生成提醒语
   */
  private generateReminder(block: Block, daysSince: number): string {
    const preview = block.content.length > 30
      ? block.content.slice(0, 30) + '...'
      : block.content;

    // 根据时间调整语气
    if (daysSince <= 7) {
      return `那个 "${preview}" 有进展吗？`;
    } else if (daysSince <= 14) {
      return `"${preview}" 怎么样了？`;
    } else {
      return `还要继续 "${preview}" 吗？`;
    }
  }

  /**
   * 检查某个 block 是否需要提醒
   *
   * @param blockId - Block ID
   * @returns 是否需要提醒
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
