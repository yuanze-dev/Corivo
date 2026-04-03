/**
 * Push queue management
 *
 * Persistent storage of push items for reading when the session starts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '@/storage/database';
import type { PushItem } from '../engine/trigger-decision.js';

/**
 * Push queue storage
 */
interface PushQueueStore {
  version: string;
  updated_at: number;
  items: PushItem[];
}

/**
 * push queue manager
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
   * load queue
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.queuePath, 'utf-8');
      this.store = JSON.parse(content);

      // Clean up expired and ignored items
      this.cleanup();
    } catch {
      // File does not exist or parsing failed, use empty queue
      this.store = this.emptyStore();
    }
  }

  /**
   * save queue
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.queuePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.queuePath, JSON.stringify(this.store, null, 2));
  }

  /**
   * Add push item
   */
  async add(item: PushItem): Promise<void> {
    // Check if already exists (based on ID or content hash)
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
      return; // Already exists, do not add again
    }

    this.store.items.push(item);
    this.store.updated_at = Math.floor(Date.now() / 1000);
    await this.save();
  }

  /**
   * Add push items in batches
   */
  async addAll(items: PushItem[]): Promise<void> {
    for (const item of items) {
      await this.add(item);
    }
  }

  /**
   * Get the push to be displayed
   *
   * Filter rules:
   * - Ignored items are not displayed
   * - Expired ones will not be displayed
   * - "Context" class push created more than 24 hours ago will not be displayed (to avoid obsolescence)
   */
  getPending(limit = 5): PushItem[] {
    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - 86400; // 24 hours

    return this.store.items
      .filter(item => {
        if (item.dismissed) {
          return false;
        }
        if (item.expires_at > 0 && item.expires_at < now) {
          return false;
        }
        // Contextual push will not be displayed for more than 24 hours (to avoid outdated content)
        if (item.type === 'relevant' && item.created_at < staleThreshold) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit);
  }

  /**
   * Flag push shown
   */
  async markShown(id: string): Promise<void> {
    const item = this.store.items.find(i => i.id === id);
    if (item) {
      item.dismissed = true;
      await this.save();
    }
  }

  /**
   * Mark all feeds as shown
   */
  async markAllShown(): Promise<void> {
    for (const item of this.store.items) {
      item.dismissed = true;
    }
    await this.save();
  }

  /**
   * Clean up expired and ignored items
   */
  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    const retentionDays = 30;
    const cutoffTime = now - (retentionDays * 86400);

    // Retention: not ignored and (not expired or created within the retention period)
    this.store.items = this.store.items.filter(item => {
      if (!item.dismissed && (item.expires_at === 0 || item.expires_at >= now)) {
        return true;
      }
      return item.created_at > cutoffTime;
    });
  }

  /**
   * Clear the queue
   */
  async clear(): Promise<void> {
    this.store = this.emptyStore();
    await this.save();
  }

  /**
   * Get queue statistics
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
   * Create empty queue
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
