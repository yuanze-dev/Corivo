/**
 * 推送队列管理
 *
 * 持久化存储推送项，供会话启动时读取
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '../storage/database.js';
import type { PushItem } from '../engine/trigger-decision.js';

/**
 * 推送队列存储
 */
interface PushQueueStore {
  version: string;
  updated_at: number;
  items: PushItem[];
}

/**
 * 推送队列管理器
 */
export class PushQueue {
  private queuePath: string;
  private store: PushQueueStore;

  constructor() {
    const configDir = getConfigDir();
    this.queuePath = path.join(configDir, 'push-queue.json');
    this.store = this.emptyStore();
  }

  /**
   * 加载队列
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.queuePath, 'utf-8');
      this.store = JSON.parse(content);

      // 清理过期和已忽略的项
      this.cleanup();
    } catch {
      // 文件不存在或解析失败，使用空队列
      this.store = this.emptyStore();
    }
  }

  /**
   * 保存队列
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.queuePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.queuePath, JSON.stringify(this.store, null, 2));
  }

  /**
   * 添加推送项
   */
  async add(item: PushItem): Promise<void> {
    // 检查是否已存在（基于 ID 或内容哈希）
    const exists = this.store.items.some(existing => {
      if (existing.id === item.id) {
        return true;
      }
      if (existing.type === item.type && existing.metadata?.blockId === item.metadata?.blockId) {
        return true;
      }
      return false;
    });

    if (exists) {
      return; // 已存在，不重复添加
    }

    this.store.items.push(item);
    this.store.updated_at = Math.floor(Date.now() / 1000);
    await this.save();
  }

  /**
   * 批量添加推送项
   */
  async addAll(items: PushItem[]): Promise<void> {
    for (const item of items) {
      await this.add(item);
    }
  }

  /**
   * 获取待显示的推送
   *
   * 过滤规则：
   * - 已忽略的不显示
   * - 过期的不显示
   * - 创建时间超过 24 小时的 "上下文" 类推送不显示（避免过时）
   */
  getPending(limit = 5): PushItem[] {
    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - 86400; // 24 小时

    return this.store.items
      .filter(item => {
        if (item.dismissed) {
          return false;
        }
        if (item.expires_at > 0 && item.expires_at < now) {
          return false;
        }
        // 上下文类推送超过 24 小时不显示（避免过时内容）
        if (item.type === 'relevant' && item.created_at < staleThreshold) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit);
  }

  /**
   * 标记推送已显示
   */
  async markShown(id: string): Promise<void> {
    const item = this.store.items.find(i => i.id === id);
    if (item) {
      item.dismissed = true;
      await this.save();
    }
  }

  /**
   * 标记所有推送已显示
   */
  async markAllShown(): Promise<void> {
    for (const item of this.store.items) {
      item.dismissed = true;
    }
    await this.save();
  }

  /**
   * 清理过期和已忽略的项
   */
  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    const retentionDays = 30;
    const cutoffTime = now - (retentionDays * 86400);

    // 保留：未忽略 且（未过期 或 创建时间在保留期内）
    this.store.items = this.store.items.filter(item => {
      if (!item.dismissed && (item.expires_at === 0 || item.expires_at >= now)) {
        return true;
      }
      return item.created_at > cutoffTime;
    });
  }

  /**
   * 清空队列
   */
  async clear(): Promise<void> {
    this.store = this.emptyStore();
    await this.save();
  }

  /**
   * 获取队列统计
   */
  getStats(): { total: number; pending: number; dismissed: number } {
    const now = Math.floor(Date.now() / 1000);

    return {
      total: this.store.items.length,
      pending: this.store.items.filter(i => !i.dismissed && (i.expires_at === 0 || i.expires_at >= now)).length,
      dismissed: this.store.items.filter(i => i.dismissed).length,
    };
  }

  /**
   * 创建空队列
   */
  private emptyStore(): PushQueueStore {
    return {
      version: '1.0',
      updated_at: Math.floor(Date.now() / 1000),
      items: [],
    };
  }
}

export default PushQueue;
