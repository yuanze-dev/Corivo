import type { Block } from '@/domain/memory/models/block.js';
import type { RuntimeDatabase } from './retrieval.js';
import { isDecisionBlock } from './scoring.js';
import { AssociationType } from '@/domain/memory/models/association.js';

export interface TriggerPolicy {
  decisionReminderDays: number;
  forgottenThresholdDays: number;
}

export interface TriggerOutputPolicy {
  maxPushItems: number;
}

export const DEFAULT_TRIGGER_POLICY: TriggerPolicy = {
  decisionReminderDays: 3,
  forgottenThresholdDays: 7,
};

export const DEFAULT_TRIGGER_OUTPUT_POLICY: TriggerOutputPolicy = {
  maxPushItems: 2,
};

export function takeWithinPushItemLimit<T>(
  existingItems: T[],
  incomingItems: T[],
  policy: TriggerOutputPolicy,
): T[] {
  const remainingSlots = Math.max(0, policy.maxPushItems - existingItems.length);
  return incomingItems.slice(0, remainingSlots);
}

export function findConflictAssociationTarget(
  db: Pick<RuntimeDatabase, 'getBlockAssociations' | 'getBlock'>,
  block: Block,
): Block | null {
  if (!isDecisionBlock(block)) {
    return null;
  }

  const conflict = db.getBlockAssociations(block.id)
    .find((association) => association.type === AssociationType.CONFLICTS);
  if (!conflict) {
    return null;
  }

  const otherId = conflict.from_id === block.id ? conflict.to_id : conflict.from_id;
  return db.getBlock(otherId);
}

export function findForgottenDecisionBlock(
  db: Pick<RuntimeDatabase, 'queryBlocks'>,
  nowMs: number,
  policy: TriggerPolicy,
): Block | null {
  const nowSec = Math.floor(nowMs / 1000);
  const threshold = nowSec - (policy.decisionReminderDays * 86400);

  const candidates = db.queryBlocks({ limit: 50 }).filter((block) => {
    if (!isDecisionBlock(block)) {
      return false;
    }

    if (block.created_at < threshold - (4 * 86400)) {
      return false;
    }
    if (block.created_at > threshold) {
      return false;
    }

    const lastAccessed = block.last_accessed || (block.updated_at * 1000);
    const daysSinceAccess = (nowMs - lastAccessed) / 86400000;
    return daysSinceAccess > policy.forgottenThresholdDays;
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => right.vitality - left.vitality)[0];
}

export function collectAttentionBlocks(
  db: Pick<RuntimeDatabase, 'queryBlocks'>,
  limit = 5,
): Block[] {
  return db.queryBlocks({ limit: 100 })
    .filter((block) => {
      if (block.status !== 'cooling' && block.status !== 'cold') {
        return false;
      }

      if (isDecisionBlock(block)) {
        return true;
      }

      return block.annotation.includes('事实') && block.vitality > 30;
    })
    .slice(0, limit);
}
