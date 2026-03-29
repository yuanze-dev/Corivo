import { Command } from 'commander';
import { generateCarryOver } from '../../runtime/carry-over.js';
import { formatSurfaceItem } from '../../runtime/render.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';

export async function runCarryOverCommand(
  options: RuntimeCommandOptions = {},
): Promise<string> {
  const db = await loadRuntimeDb(options);
  if (!db) {
    return '';
  }

  return formatSurfaceItem(
    generateCarryOver(db, { now: Math.floor(Date.now() / 1000) }),
    options.format,
  );
}

export const carryOverCommand = new Command('carry-over');

carryOverCommand
  .description('生成会话开场 carry-over（内部命令，供 hooks 调用）')
  .option('-f, --format <type>', '输出格式: text | json | hook-text', 'text')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action(async (options) => {
    const output = await runCarryOverCommand({
      password: options.password,
      format: options.format,
    });

    if (output) {
      console.log(output);
    }
  });

export default carryOverCommand;
