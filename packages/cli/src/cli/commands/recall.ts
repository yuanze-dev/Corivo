import { Command } from 'commander';
import { createQueryPack } from '../../runtime/query-pack.js';
import { generateRecall } from '../../runtime/recall.js';
import { formatSurfaceItem } from '../../runtime/render.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';

export interface RecallCommandOptions extends RuntimeCommandOptions {
  prompt?: string;
}

export async function runRecallCommand(
  options: RecallCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db || !options.prompt) {
    return '';
  }

  return formatSurfaceItem(
    generateRecall(db, createQueryPack({ prompt: options.prompt })),
    options.format,
  );
}

export const recallCommand = new Command('recall');

recallCommand
  .description('生成答前 recall（内部命令，供 hooks 调用）')
  .option('-p, --prompt <text>', '当前用户输入')
  .option('-f, --format <type>', '输出格式: text | json | hook-text', 'text')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action(async (options) => {
    const output = await runRecallCommand({
      password: options.password,
      format: options.format,
      prompt: options.prompt,
    });

    if (output) {
      console.log(output);
    }
  });

export default recallCommand;
