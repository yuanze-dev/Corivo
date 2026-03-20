/**
 * 查询历史追踪器
 *
 * 记录用户的查询，用于"你之前也查过类似的"提醒
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';
import { generateBlockId } from '../models/block.js';

/**
 * 查询记录
 */
export interface QueryRecord {
  id: string;
  timestamp: number;
  query: string;
  resultCount: number;
  resultIds: string[];
}

/**
 * 相似查询提醒
 */
export interface SimilarQueryReminder {
  hasSimilar: boolean;
  message: string;
  similarQueries: Array<{ query: string; timestamp: number }>;
}

/**
 * 查询历史追踪器
 */
export class QueryHistoryTracker {
  constructor(private db: CorivoDatabase) {}

  /**
   * 记录查询
   */
  recordQuery(query: string, results: Block[]): void {
    const record: QueryRecord = {
      id: generateBlockId().replace('blk_', 'qry_'),
      timestamp: Date.now(),
      query,
      resultCount: results.length,
      resultIds: results.map((r) => r.id),
    };

    // 保存到数据库
    try {
      const stmt = (this.db as any).db.prepare(`
        INSERT INTO query_logs (id, timestamp, query, result_count)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(record.id, record.timestamp, record.query, record.resultCount);
    } catch (error) {
      // 表可能还不存在，静默失败
      console.debug('[query-history] 记录查询失败:', error);
    }
  }

  /**
   * 查找相似的历史查询
   *
   * @param currentQuery - 当前查询
   * @returns 相似查询提醒
   */
  findSimilarQueries(currentQuery: string): SimilarQueryReminder {
    try {
      // 获取最近 7 天的查询记录
      const stmt = (this.db as any).db.prepare(`
        SELECT query, timestamp FROM query_logs
        WHERE timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 50
      `);

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const rows = stmt.all(sevenDaysAgo) as Array<{ query: string; timestamp: number }>;

      if (rows.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // 找出相似查询
      const similar: Array<{ query: string; timestamp: number }> = [];

      for (const row of rows) {
        if (this.isSimilarQuery(currentQuery, row.query)) {
          similar.push(row);
        }
      }

      if (similar.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // 生成提醒语
      const message = this.generateReminderMessage(similar);

      return {
        hasSimilar: true,
        message,
        similarQueries: similar.slice(0, 3), // 最多返回 3 个
      };
    } catch (error) {
      return { hasSimilar: false, message: '', similarQueries: [] };
    }
  }

  /**
   * 判断两个查询是否相似
   */
  private isSimilarQuery(query1: string, query2: string): boolean {
    // 完全相同
    if (query1 === query2) {
      return false; // 同样的查询不算"相似"，是重复
    }

    // 计算相似度
    const words1 = new Set(this.extractWords(query1));
    const words2 = new Set(this.extractWords(query2));

    if (words1.size === 0 || words2.size === 0) {
      return false;
    }

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;

    return similarity > 0.4; // 40% 相似度
  }

  /**
   * 提取词语
   */
  private extractWords(text: string): string[] {
    const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    return [...chinese, ...english];
  }

  /**
   * 生成友好的提醒语
   */
  private generateReminderMessage(similarQueries: Array<{ query: string; timestamp: number }>): string {
    if (similarQueries.length === 1) {
      const q = similarQueries[0].query;
      const preview = q.length > 20 ? q.slice(0, 20) + '...' : q;
      return `[corivo] 你之前也查过类似的："${preview}"`;
    }

    const previews = similarQueries
      .slice(0, 2)
      .map((s) => {
        const q = s.query;
        return q.length > 15 ? q.slice(0, 15) + '...' : q;
      });

    return `[corivo] 你之前也查过类似的：${previews.join('、')}`;
  }

  /**
   * 清理旧记录（保留最近 30 天）
   */
  cleanupOldRecords(): void {
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const stmt = (this.db as any).db.prepare('DELETE FROM query_logs WHERE timestamp < ?');
      stmt.run(thirtyDaysAgo);
    } catch (error) {
      // 静默失败
    }
  }
}
