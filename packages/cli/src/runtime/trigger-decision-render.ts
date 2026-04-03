import type { Block } from '../models/block.js';
import { extractDecisionLabel } from './scoring.js';

export interface TriggerPushItem {
  id: string;
  type: 'conflict' | 'forgotten' | 'relevant' | 'attention' | 'summary';
  priority: number;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: number;
  expires_at: number;
  dismissed: boolean;
}

export interface TriggerPushRenderPolicy {
  conflictPriority: number;
  forgottenPriority: number;
  attentionPriority: number;
  conflictTtlSeconds: number;
  forgottenTtlSeconds: number;
  attentionTtlSeconds: number;
  conflictPreviewLength: number;
  forgottenPreviewLength: number;
}

export const DEFAULT_TRIGGER_PUSH_RENDER_POLICY: TriggerPushRenderPolicy = {
  conflictPriority: 0,
  forgottenPriority: 1,
  attentionPriority: 3,
  conflictTtlSeconds: 86400,
  forgottenTtlSeconds: 86400 * 3,
  attentionTtlSeconds: 86400,
  conflictPreviewLength: 50,
  forgottenPreviewLength: 100,
};

export function createConflictPushItem(
  conflictSource: Block,
  conflictTarget: Block,
  nowSec: number,
  createPushId: () => string,
  policy: TriggerPushRenderPolicy,
): TriggerPushItem {
  return {
    id: createPushId(),
    type: 'conflict',
    priority: policy.conflictPriority,
    title: '与之前的决策矛盾',
    message: `之前：${conflictTarget.content.slice(0, policy.conflictPreviewLength)}...\n现在：${conflictSource.content.slice(0, policy.conflictPreviewLength)}...`,
    metadata: {
      blockId: conflictSource.id,
      conflictWith: conflictTarget.id,
    },
    created_at: nowSec,
    expires_at: nowSec + policy.conflictTtlSeconds,
    dismissed: false,
  };
}

export function createForgottenPushItem(
  block: Block,
  nowMs: number,
  nowSec: number,
  createPushId: () => string,
  policy: TriggerPushRenderPolicy,
): TriggerPushItem {
  return {
    id: createPushId(),
    type: 'forgotten',
    priority: policy.forgottenPriority,
    title: `考虑一下 ${extractDecisionLabel(block)}`,
    message: block.content.slice(0, policy.forgottenPreviewLength),
    metadata: {
      blockId: block.id,
      daysSinceAccess: Math.floor((nowMs - (block.last_accessed || block.updated_at * 1000)) / 86400000),
    },
    created_at: nowSec,
    expires_at: nowSec + policy.forgottenTtlSeconds,
    dismissed: false,
  };
}

export function createAttentionPushItems(
  blocks: Block[],
  nowSec: number,
  createPushId: () => string,
  policy: TriggerPushRenderPolicy,
): TriggerPushItem[] {
  return blocks.map((block) => ({
    id: createPushId(),
    type: 'attention',
    priority: policy.attentionPriority,
    title: '记忆需要关注',
    message: `${block.annotation} (生命力: ${block.vitality})`,
    metadata: {
      blockId: block.id,
      status: block.status,
      vitality: block.vitality,
    },
    created_at: nowSec,
    expires_at: nowSec + policy.attentionTtlSeconds,
    dismissed: false,
  }));
}
