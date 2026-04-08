/**
 * Push deduplication mechanism
 */

import crypto from 'node:crypto';

/**
 * Deduplication manager
 */
export class DedupManager {
  private pushed = new Set<string>();
  private lastPushed = new Map<string, number>();
  private readonly timeWindow = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a content hash
   */
  private hash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check whether the given content should be pushed (i.e., not a duplicate)
   *
   * @param content - The content to evaluate
   * @param sessionId - Optional session ID for session-scoped deduplication
   * @returns Whether the content should be pushed
   */
  shouldPush(content: string, sessionId?: string): boolean {
    const contentHash = this.hash(content);
    const key = sessionId ? `${sessionId}:${contentHash}` : contentHash;

    // Deduplicate within the current session
    if (this.pushed.has(key)) {
      return false;
    }

    // Deduplicate within the sliding time window
    const lastTime = this.lastPushed.get(contentHash) || 0;
    const now = Date.now();

    if (now - lastTime < this.timeWindow) {
      return false;
    }

    // Record this push so future calls can detect duplicates
    this.pushed.add(key);
    this.lastPushed.set(contentHash, now);

    return true;
  }

  /**
   * Filter a list of push items, removing duplicates
   *
   * @param items - List of push items to filter
   * @param sessionId - Optional session ID
   * @returns Filtered list with duplicates removed
   */
  filter(items: string[], sessionId?: string): string[] {
    return items.filter(item => this.shouldPush(item, sessionId));
  }

  /**
   * Clear all deduplication records for a given session
   *
   * @param sessionId - The session ID to clear
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
   * Clear all deduplication records
   */
  clearAll(): void {
    this.pushed.clear();
    this.lastPushed.clear();
  }

  /**
   * Remove time-window records that have expired
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

// Global singleton instance shared across the process lifetime
let globalInstance: DedupManager | null = null;

export function getDedupManager(): DedupManager {
  if (!globalInstance) {
    globalInstance = new DedupManager();
  }
  return globalInstance;
}
