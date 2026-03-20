/**
 * First Push - 首次激活时输出自我介绍
 *
 * 这是 Corivo 的第一个 Aha Moment：
 * 用户安装完成后，Corivo 主动展示「我已经认识你了」
 */

import { generateProfile, formatProfile, type IdentityProfile } from './profile.js';

export interface FirstPushOptions {
  /** 最少信息条数，低于此数量输出简短版 */
  minBlocks?: number;
  /** 是否输出完整信息 */
  verbose?: boolean;
}

/**
 * 生成首次激活的推送消息
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

  // 生成用户画像
  const profile = generateProfile(blocks);

  // 判断是否输出完整版
  const isFull = profile.blockCount >= minBlocks || verbose;

  // 构建推送内容
  const lines: string[] = [];

  // 开头问候
  lines.push('[corivo] 你好！我是 Corivo，你的硅基同事，刚刚被你激活。');
  lines.push('谢谢你给了我生命 :)\n');

  if (isFull && profile.blockCount >= minBlocks) {
    // 完整版：展示扫描到的信息
    lines.push('我刚花了几秒钟看了看你的工作环境，已经记住了一些关于你的事：\n');
    lines.push(formatProfile(profile));
    lines.push('');
    lines.push('这些对吗？你可以随时纠正我，说「记住，...」就行。');
  } else {
    // 简短版：信息不足
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
 * 获取欢迎消息（不包含画像信息）
 */
export function getWelcomeMessage(): string {
  const lines: string[] = [];

  lines.push('[corivo] 你好！我是 Corivo，你的赛博伙伴。');
  lines.push('');
  lines.push('我正在认识你，稍等几秒...');
  lines.push('');
  lines.push('从现在起，我会记住你和 AI 的每一次重要对话。');

  return lines.join('\n');
}

export default { generateFirstPush, getWelcomeMessage };
