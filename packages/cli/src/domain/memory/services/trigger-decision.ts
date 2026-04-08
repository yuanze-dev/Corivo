/**
 * trigger decision engine
 *
 * Let Corivo decide when it needs to tell the user what
 */

import type { MemoryServiceDatabase } from '@/domain/memory/contracts/service-database.js';
import type { Block } from '@/domain/memory/models/block.js';
import {
  collectAttentionBlocks,
  DEFAULT_TRIGGER_OUTPUT_POLICY,
  DEFAULT_TRIGGER_POLICY,
  findConflictAssociationTarget,
  findForgottenDecisionBlock,
  takeWithinPushItemLimit,
  type TriggerOutputPolicy,
  type TriggerPolicy,
} from '@/runtime/trigger-decision.js';
import {
  createAttentionPushItems,
  createConflictPushItem,
  createForgottenPushItem,
  DEFAULT_TRIGGER_PUSH_RENDER_POLICY,
  type TriggerPushRenderPolicy,
} from '@/runtime/trigger-decision-render.js';
import { isDecisionBlock } from '@/runtime/scoring.js';
import { generateBlockId } from '@/domain/memory/models/block.js';

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
  private readonly policy: TriggerPolicy;
  private readonly outputPolicy: TriggerOutputPolicy;
  private readonly createPushId: () => string;
  private readonly renderPolicy: TriggerPushRenderPolicy;

  constructor(
    private readonly db: MemoryServiceDatabase,
    runtime: {
      policy?: Partial<TriggerPolicy>;
      outputPolicy?: Partial<TriggerOutputPolicy>;
      createPushId?: () => string;
      renderPolicy?: Partial<TriggerPushRenderPolicy>;
    } = {},
  ) {
    this.policy = {
      ...DEFAULT_TRIGGER_POLICY,
      ...runtime.policy,
    };
    this.outputPolicy = {
      ...DEFAULT_TRIGGER_OUTPUT_POLICY,
      ...runtime.outputPolicy,
    };
    this.createPushId = runtime.createPushId ?? (() => generateBlockId().replace('blk_', 'push_'));
    this.renderPolicy = {
      ...DEFAULT_TRIGGER_PUSH_RENDER_POLICY,
      ...runtime.renderPolicy,
    };
  }

  /**
   * Decide whether to push
   *
   * @param input trigger input
   * @returns Push item list (up to 2 items)
   */
  decide(input: TriggerInput): PushItem[] {
    const items: PushItem[] = [];
    const nowMs = input.now;
    const nowSec = Math.floor(nowMs / 1000);

    // 1. Conflict detection (highest priority)
    if (input.recentBlock) {
      const conflictTarget = findConflictAssociationTarget(this.db, input.recentBlock);
      if (conflictTarget) {
        const conflict = createConflictPushItem(
          input.recentBlock,
          conflictTarget,
          nowSec,
          this.createPushId,
          this.renderPolicy,
        );
        items.push(conflict);
      }
    }

    // 2. Forgotten decisions (important but not urgent)
    if (!input.recentBlock || !isDecisionBlock(input.recentBlock)) {
      // If what you just saved is not a decision, check if there are any forgotten decisions.
      const forgottenBlock = findForgottenDecisionBlock(this.db, nowMs, this.policy);
      if (forgottenBlock) {
        const forgotten = createForgottenPushItem(
          forgottenBlock,
          nowMs,
          nowSec,
          this.createPushId,
          this.renderPolicy,
        );
        items.push(forgotten);
      }
    }

    // 3. Memories that require attention (cooling period)
    const attention = createAttentionPushItems(
      collectAttentionBlocks(this.db),
      nowSec,
      this.createPushId,
      this.renderPolicy,
    );
    const limitedAttention = takeWithinPushItemLimit(items, attention, this.outputPolicy);
    if (limitedAttention.length > 0) {
      items.push(...limitedAttention);
    }

    return takeWithinPushItemLimit([], items, this.outputPolicy);
  }
}

export default TriggerDecision;
