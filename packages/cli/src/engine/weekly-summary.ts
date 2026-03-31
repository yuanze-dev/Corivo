/**
 * Weekly summary module
 *
 * Send a short summary every Monday: "3 decisions made last week"
 */

import type { CorivoDatabase } from '../storage/database.js';

/**
 * Weekly Statistics
 */
export interface WeeklyStats {
  decisions: number;
  implementations: number;
  knowledge: number;
  total: number;
}

/**
 * Weekly summary
 */
export class WeeklySummary {
  constructor(private db: CorivoDatabase) {}

  /**
   * Generate weekly summary
   *
   * @returns summarizes the message
   */
  generateSummary(): string | null {
    const stats = this.getWeeklyStats();

    if (stats.total === 0) {
      return null;
    }

    const parts: string[] = [];

    if (stats.decisions > 0) {
      parts.push(`${stats.decisions} 个决策`);
    }
    if (stats.implementations > 0) {
      parts.push(`${stats.implementations} 个功能实现`);
    }
    if (stats.knowledge > 0) {
      parts.push(`${stats.knowledge} 条知识`);
    }

    if (parts.length === 0) {
      return `[corivo] 上周记录了 ${stats.total} 条内容`;
    }

    return `[corivo] 上周：${parts.join('，')}`;
  }

  /**
   * Get last week's statistics
   */
  private getWeeklyStats(): WeeklyStats {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Query blocks created in the last 7 days
    const allBlocks = this.db.queryBlocks({ limit: 1000 });
    const recentBlocks = allBlocks.filter(
      (b) => b.created_at * 1000 >= sevenDaysAgo
    );

    const stats: WeeklyStats = {
      decisions: 0,
      implementations: 0,
      knowledge: 0,
      total: recentBlocks.length,
    };

    for (const block of recentBlocks) {
      const annotation = block.annotation.toLowerCase();

      if (annotation.includes('决策')) {
        stats.decisions++;
      } else if (annotation.includes('知识')) {
        stats.knowledge++;
      } else if (annotation.includes('实现') || annotation.includes('project')) {
        stats.implementations++;
      }
    }

    return stats;
  }

  /**
   * Check if weekly summary should be sent
   *
   * Simple implementation: every Monday (judged based on the date)
   *
   * Should @returns be sent?
   */
  shouldSend(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...

    // Sent on Monday (can also be adjusted according to user preference)
    return dayOfWeek === 1;
  }

  /**
   * Get the next sending time
   *
   * @returns Next Monday at 0:00
   */
  getNextSendTime(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();

    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;

    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);

    return nextMonday;
  }
}
