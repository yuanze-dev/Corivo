import type { Block } from '@/domain/memory/models/block.js';
import type { RuntimeDatabase } from './retrieval.js';

export interface FollowUpReminderItem {
  block: Block;
  daysSinceCreation: number;
}

export interface FollowUpRetrievalPolicy {
  thresholdDays: number;
  queryLimit: number;
}

export const DEFAULT_FOLLOW_UP_RETRIEVAL_POLICY: FollowUpRetrievalPolicy = {
  thresholdDays: 3,
  queryLimit: 100,
};

export function collectFollowUpReminderItems(
  db: Pick<RuntimeDatabase, 'queryBlocks'>,
  options: {
    now?: number;
    policy?: Partial<FollowUpRetrievalPolicy>;
  } = {},
): FollowUpReminderItem[] {
  const policy: FollowUpRetrievalPolicy = {
    ...DEFAULT_FOLLOW_UP_RETRIEVAL_POLICY,
    ...options.policy,
  };
  const now = options.now ?? Date.now();

  const pendingDecisions = db.queryBlocks({
    annotation: 'pending',
    limit: policy.queryLimit,
  });
  const decisions = db.queryBlocks({ limit: policy.queryLimit })
    .filter((block) => block.annotation.includes('决策') && block.status !== 'archived');

  const deduped = new Map<string, Block>();
  for (const block of [...pendingDecisions, ...decisions]) {
    deduped.set(block.id, block);
  }

  const reminders: FollowUpReminderItem[] = [];
  for (const block of deduped.values()) {
    const daysSinceCreation = Math.floor((now - block.created_at * 1000) / (24 * 60 * 60 * 1000));
    if (daysSinceCreation >= policy.thresholdDays) {
      reminders.push({
        block,
        daysSinceCreation,
      });
    }
  }

  return reminders;
}
