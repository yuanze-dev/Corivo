/**
 * 周总结模块
 *
 * 每周一发送简短总结："上周做了 3 个决策"
 */

import type { CorivoDatabase } from '../storage/database.js';

/**
 * 周统计
 */
export interface WeeklyStats {
  decisions: number;
  implementations: number;
  knowledge: number;
  total: number;
}

/**
 * 周总结
 */
export class WeeklySummary {
  constructor(private db: CorivoDatabase) {}

  /**
   * 生成周总结
   *
   * @returns 总结消息
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
   * 获取上周统计
   */
  private getWeeklyStats(): WeeklyStats {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 查询最近 7 天创建的 block
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
   * 检查是否应该发送周总结
   *
   * 简单实现：每周一（根据日期判断）
   *
   * @returns 是否应该发送
   */
  shouldSend(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = 周日, 1 = 周一, ...

    // 周一发送（也可以根据用户偏好调整）
    return dayOfWeek === 1;
  }

  /**
   * 获取下一次发送时间
   *
   * @returns 下次周一的 0 点
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
