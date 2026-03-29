/**
 * Suggest 命令
 *
 * 兼容旧 hooks 的 suggest 入口。新的主路径是 carry-over / recall / review。
 */

import { Command } from 'commander';
import { runCarryOverCommand } from './carry-over.js';
import { runReviewCommand } from './review.js';

export interface SuggestCommandOptions {
  context?: string;
  lastMessage?: string;
  password?: boolean;
  format?: 'text' | 'json' | 'hook-text';
}

export const suggestCommand = new Command('suggest');

export async function runSuggestCommand(
  options: SuggestCommandOptions = {},
): Promise<string> {
  const context = options.context ?? 'session-start';

  if (context === 'post-request') {
    return runReviewCommand({
      password: options.password,
      format: options.format,
      lastMessage: options.lastMessage,
    });
  }

  return runCarryOverCommand({
    password: options.password,
    format: options.format,
  });
}

suggestCommand
  .description('兼容旧 hooks 的建议入口（内部命令，供 hooks 调用）')
  .option('-c, --context <type>', '上下文类型: session-start | post-request', 'session-start')
  .option('-m, --last-message <text>', 'Claude 最后的回复内容')
  .option('-f, --format <type>', '输出格式: text | json | hook-text', 'text')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action(async (options) => {
    const output = await runSuggestCommand({
      context: options.context,
      lastMessage: options.lastMessage,
      password: options.password,
      format: options.format,
    });

    if (output) {
      console.log(output);
    }
  });

export default suggestCommand;
