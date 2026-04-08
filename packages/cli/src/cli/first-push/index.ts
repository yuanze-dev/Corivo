/**
 * First Push - Output self-introduction when first activated
 *
 * Here’s Corivo’s first Aha Moment:
 * After the user installation is completed, Corivo proactively displays "I already know you"
 */

import { generateProfile, formatProfile, type IdentityProfile } from './profile.js';

export interface FirstPushOptions {
  /** Minimum number of pieces of information, below which a short version will be output */
  minBlocks?: number;
  /** Whether to output complete information */
  verbose?: boolean;
}

/**
 * Generate push message for first activation
 */
export function generateFirstPush(
  blocks: Array<{ content: string; annotation: string; metadata?: Record<string, unknown> }>,
  options: FirstPushOptions = {}
): {
  message: string;
  profile: IdentityProfile;
  isFull: boolean;
} {
  const { minBlocks = 3, verbose = false } = options;

  // Generate user portraits
  const profile = generateProfile(blocks);

  // Determine whether to output the full version
  const isFull = profile.blockCount >= minBlocks || verbose;

  // Build push content
  const lines: string[] = [];

  // Greetings at the beginning
  lines.push('[corivo] 你好！我是 Corivo，你的硅基同事，刚刚被你激活。');
  lines.push('谢谢你给了我生命 :)\n');

  if (isFull && profile.blockCount >= minBlocks) {
    // Full version: display scanned information
    lines.push('我刚花一点时间看了看你的工作环境，已经记住了一些关于你的事：\n');
    lines.push(formatProfile(profile));
    lines.push('');
    lines.push('这些对吗？你可以随时纠正我，说「记住，...」就行。');
  } else {
    // Short version: Not enough information
    lines.push(`我刚扫描了你的工作环境，发现了 ${profile.blockCount} 条信息。`);
    lines.push('还不够了解你，让我们多聊几句吧！');
  }

  lines.push('');
  lines.push('从现在起，我会安静地待在你身边，记住你和 AI 的每一次重要对话。');

  return {
    message: lines.join('\n'),
    profile,
    isFull,
  };
}

/**
 * Get welcome message (excluding portrait information)
 */
export function getWelcomeMessage(): string {
  const lines: string[] = [];

  lines.push('[corivo] 你好！我是 Corivo，你的硅基同事。');
  lines.push('');
  lines.push('我正在认识你，稍等几秒...');
  lines.push('');
  lines.push('从现在起，我会记住你和 AI 的每一次重要对话。');

  return lines.join('\n');
}

export default { generateFirstPush, getWelcomeMessage };
