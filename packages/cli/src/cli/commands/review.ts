import { Command } from 'commander';
import { createQueryPack } from '../../runtime/query-pack.js';
import { formatSurfaceItem } from '../../runtime/render.js';
import { generateReview } from '../../runtime/review.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';

export interface ReviewCommandOptions extends RuntimeCommandOptions {
  lastMessage?: string;
}

export async function runReviewCommand(
  options: ReviewCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db || !options.lastMessage) {
    return '';
  }

  return formatSurfaceItem(
    generateReview(db, createQueryPack({ assistantMessage: options.lastMessage })),
    options.format,
  );
}

export const reviewCommand = new Command('review');

reviewCommand
  .description('生成答后 review（内部命令，供 hooks 调用）')
  .option('-m, --last-message <text>', 'Claude 最后的回复内容')
  .option('-f, --format <type>', '输出格式: text | json | hook-text', 'text')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action(async (options) => {
    const output = await runReviewCommand({
      password: options.password,
      format: options.format,
      lastMessage: options.lastMessage,
    });

    if (output) {
      console.log(output);
    }
  });

export default reviewCommand;
