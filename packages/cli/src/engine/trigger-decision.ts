/**
 * trigger decision engine
 *
 * Let Corivo decide when it needs to tell the user what
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/block.js';
import { AssociationType } from '../models/association.js';

/**
 * Trigger decision input
 */
export interface TriggerInput {
  /** current timestamp */
  now: number;
  /** Recently saved blocks */
  recentBlock?: Block;
  /** Current conversation context (if any) */
  conversationContext?: string;
  /** Last check time */
  lastCheckTime?: number;
}

/**
 * Push items
 */
export interface PushItem {
  id: string;
  type: 'conflict' | 'forgotten' | 'relevant' | 'attention' | 'summary';
  priority: number; // 0-4, the smaller the value, the more important it is.
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: number;
  expires_at: number;
  dismissed: boolean;
}

/**
 * trigger decision engine
 */
export class TriggerDecision {
  private db: CorivoDatabase;
  private readonly DECISION_DAYS = 3; // Reminder after N days of decision making
  private readonly FORGOTTEN_THRESHOLD = 7; // Not visited for N days is considered forgotten.
  private readonly CONFLICT_COOLDOWN = 86400 * 7; // The same conflict will not be repeated for 7 days

  constructor(db: CorivoDatabase) {
    this.db = db;
  }

  /**
   * Decide whether to push
   *
   * @param input trigger input
   * @returns Push item list (up to 2 items)
   */
  decide(input: TriggerInput): PushItem[] {
    const items: PushItem[] = [];

    // 1. Conflict detection (highest priority)
    if (input.recentBlock) {
      const conflict = this.checkConflict(input.recentBlock);
      if (conflict) {
        items.push(conflict);
      }
    }

    // 2. Forgotten decisions (important but not urgent)
    if (!input.recentBlock || !input.recentBlock.annotation.includes('决策')) {
      // If what you just saved is not a decision, check if there are any forgotten decisions.
      const forgotten = this.checkForgotten(input.now);
      if (forgotten) {
        items.push(forgotten);
      }
    }

    // 3. Memories that require attention (cooling period)
    const attention = this.checkAttention();
    if (attention.length > 0 && items.length < 2) {
      items.push(...attention.slice(0, 2 - items.length));
    }

    // Restraint: return up to 2 items
    return items.slice(0, 2);
  }

  /**
   * Check for conflicts
   */
  private checkConflict(block: Block): PushItem | null {
    // Check only decision classes
    if (!block.annotation.includes('决策')) {
      return null;
    }

    // Extract keywords
    const keywords = this.extractKeywords(block.content);

    // Search for potentially conflicting decisions
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const existing of results) {
        // skip yourself
        if (existing.id === block.id) {
          continue;
        }

        // Check only decision classes
        if (!existing.annotation.includes('决策')) {
          continue;
        }

        // Check if there is already an association
        const assocs = this.db.getBlockAssociations(block.id);
        const hasConflict = assocs.some(a => a.type === AssociationType.CONFLICTS);

        if (hasConflict) {
          // Find contradictory relationships
          const conflictAssoc = assocs.find(a => a.type === AssociationType.CONFLICTS);
          const otherId = conflictAssoc?.from_id === block.id
            ? conflictAssoc.to_id
            : conflictAssoc?.from_id;

          if (otherId) {
            const otherBlock = this.db.getBlock(otherId);
            if (otherBlock) {
              return {
                id: `push_${Date.now()}_conflict`,
                type: 'conflict',
                priority: 0,
                title: '与之前的决策矛盾',
                message: `之前：${existing.content.slice(0, 50)}...\n现在：${block.content.slice(0, 50)}...`,
                metadata: {
                  blockId: block.id,
                  conflictWith: otherBlock.id,
                },
                created_at: Math.floor(Date.now() / 1000),
                expires_at: Math.floor(Date.now() / 1000) + 86400, // Expires in 1 day
                dismissed: false,
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check for forgotten decisions
   */
  private checkForgotten(now: number): PushItem | null {
    const nowSec = Math.floor(now / 1000);
    const threshold = nowSec - (this.DECISION_DAYS * 86400);

    // Get decision class block
    const blocks = this.db.queryBlocks({ limit: 50 });

    // Find unfinished decisions created 3-N days ago
    const candidates = blocks.filter(block => {
      if (!block.annotation.includes('决策')) {
        return false;
      }

      // Time range: 3-7 days ago
      if (block.created_at < threshold - (4 * 86400)) {
        return false; // too old
      }
      if (block.created_at > threshold) {
        return false; // too new
      }

      // Check if "forgotten" (no recent access)
      const lastAccessed = block.last_accessed || (block.updated_at * 1000);
      const daysSinceAccess = (now - lastAccessed) / 86400000;

      return daysSinceAccess > this.FORGOTTEN_THRESHOLD;
    });

    if (candidates.length === 0) {
      return null;
    }

    // Choose the most vital but forgotten
    const best = candidates.sort((a, b) => b.vitality - a.vitality)[0];

    return {
      id: `push_${Date.now()}_forgotten`,
      type: 'forgotten',
      priority: 1,
      title: `考虑一下 ${this.extractDecision(best)}`,
      message: best.content.slice(0, 100),
      metadata: {
        blockId: best.id,
        daysSinceAccess: Math.floor((now - (best.last_accessed || best.updated_at * 1000)) / 86400000),
      },
      created_at: nowSec,
      expires_at: nowSec + 86400 * 3, // Expires in 3 days
      dismissed: false,
    };
  }

  /**
   * Check for memories that require attention
   */
  private checkAttention(): PushItem[] {
    const blocks = this.db.queryBlocks({ limit: 100 });

    // Find important memories for cooling/freezing
    const needsAttention = blocks.filter(block => {
      if (block.status !== 'cooling' && block.status !== 'cold') {
        return false;
      }

      // priority decision making
      if (block.annotation.includes('决策')) {
        return true;
      }

      // Next is the fact of high vitality
      if (block.annotation.includes('事实') && block.vitality > 30) {
        return true;
      }

      return false;
    }).slice(0, 5);

    if (needsAttention.length === 0) {
      return [];
    }

    return needsAttention.map(block => ({
      id: `push_${Date.now()}_${block.id}`,
      type: 'attention' as const,
      priority: 3,
      title: '记忆需要关注',
      message: `${block.annotation} (生命力: ${block.vitality})`,
      metadata: {
        blockId: block.id,
        status: block.status,
        vitality: block.vitality,
      },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      dismissed: false,
    }));
  }

  /**
   * Extract decision-making keywords
   */
  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().match(/[a-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Extract decision content
   */
  private extractDecision(block: Block): string {
    if (block.pattern && 'decision' in block.pattern) {
      return (block.pattern as { decision: string }).decision;
    }

    // Extract tag from annotation
    const parts = block.annotation.split(' · ');
    if (parts.length >= 3) {
      return parts[2]; // tag
    }

    return block.content.slice(0, 20);
  }
}

export default TriggerDecision;
