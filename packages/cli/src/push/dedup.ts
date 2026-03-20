/**
 * 推送去重机制
 */

import crypto from 'node:crypto';

/**
 * 去重管理器
 */
export class DedupManager {
  private pushed = new Set<string>();
  private lastPushed = new Map<string, number>();
  private readonly timeWindow = 5 * 60 * 1000; // 5 分钟

  /**
   * 生成内容哈希
   */
  private hash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 检查是否应该推送
   *
   * @param content 推送内容
   * @param sessionId 会话 ID（可选，用于会话级别去重）
   * @returns 是否应该推送
   */
  shouldPush(content: string, sessionId?: string): boolean {
    const contentHash = this.hash(content);
    const key = sessionId ? `${sessionId}:${contentHash}` : contentHash;

    // 检查会话级别去重
    if (this.pushed.has(key)) {
      return false;
    }

    // 检查时间窗口去重
    const lastTime = this.lastPushed.get(contentHash) || 0;
    const now = Date.now();

    if (now - lastTime < this.timeWindow) {
      return false;
    }

    // 记录推送
    this.pushed.add(key);
    this.lastPushed.set(contentHash, now);

    return true;
  }

  /**
   * 批量过滤推送项
   *
   * @param items 推送项列表
   * @param sessionId 会话 ID（可选）
   * @returns 过滤后的推送项
   */
  filter(items: string[], sessionId?: string): string[] {
    return items.filter(item => this.shouldPush(item, sessionId));
  }

  /**
   * 清空会话级别的去重记录
   *
   * @param sessionId 会话 ID
   */
  clearSession(sessionId: string): void {
    const prefix = `${sessionId}:`;
    const toDelete: string[] = [];

    for (const key of this.pushed) {
      if (key.startsWith(prefix)) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.pushed.delete(key);
    }
  }

  /**
   * 清空所有记录
   */
  clearAll(): void {
    this.pushed.clear();
    this.lastPushed.clear();
  }

  /**
   * 清理过期的时间窗口记录
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, time] of this.lastPushed.entries()) {
      if (now - time > this.timeWindow) {
        toDelete.push(hash);
      }
    }

    for (const hash of toDelete) {
      this.lastPushed.delete(hash);
    }
  }
}

// 全局单例
let globalInstance: DedupManager | null = null;

export function getDedupManager(): DedupManager {
  if (!globalInstance) {
    globalInstance = new DedupManager();
  }
  return globalInstance;
}
