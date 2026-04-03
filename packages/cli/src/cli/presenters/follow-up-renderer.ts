import type { Block } from '@/domain/memory/models/block.js';
import type { FollowUpReminderItem } from '@/application/review/follow-up-retrieval.js';

export interface FollowUpRenderPolicy {
  previewLength: number;
  weeklyReminderLimit: number;
  weeklyReminderPrefix: string;
}

export const DEFAULT_FOLLOW_UP_RENDER_POLICY: FollowUpRenderPolicy = {
  previewLength: 30,
  weeklyReminderLimit: 3,
  weeklyReminderPrefix: '[corivo] ',
};

export function buildFollowUpReminderMessage(
  block: Block,
  daysSince: number,
  options: {
    policy?: Partial<FollowUpRenderPolicy>;
  } = {},
): string {
  const policy = {
    ...DEFAULT_FOLLOW_UP_RENDER_POLICY,
    ...options.policy,
  };
  const preview = block.content.length > policy.previewLength
    ? `${block.content.slice(0, policy.previewLength)}...`
    : block.content;

  if (daysSince <= 7) {
    return `那个 "${preview}" 有进展吗？`;
  }
  if (daysSince <= 14) {
    return `"${preview}" 怎么样了？`;
  }
  return `还要继续 "${preview}" 吗？`;
}

export function formatWeeklyFollowUpReminders(
  items: FollowUpReminderItem[],
  options: {
    policy?: Partial<FollowUpRenderPolicy>;
  } = {},
): string[] {
  const policy = {
    ...DEFAULT_FOLLOW_UP_RENDER_POLICY,
    ...options.policy,
  };
  return items
    .slice(0, policy.weeklyReminderLimit)
    .map((item) =>
      `${policy.weeklyReminderPrefix}${buildFollowUpReminderMessage(item.block, item.daysSinceCreation, { policy })}`,
    );
}
