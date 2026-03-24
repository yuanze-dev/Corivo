/**
 * CLI 命令 - list
 *
 * 浏览 Corivo 记忆列表，支持过滤和排序，无需搜索关键词
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { ConfigError } from '../../errors/index.js';
import { getDatabaseKey } from '../../config.js';
import type { BlockFilter, BlockStatus } from '../../models/block.js';

const VALID_STATUSES: BlockStatus[] = ['active', 'cooling', 'cold', 'archived'];
const VALID_SORTS = ['time', 'vitality'];

/** 英文 annotation 类型别名 → 中文前缀 */
const ANNOTATION_ALIASES: Record<string, string> = {
  decision:    '决策',
  fact:        '事实',
  knowledge:   '知识',
  instruction: '指令',
};

export const listCommand = new Command('list');

listCommand
  .description('浏览记忆列表（支持过滤和排序）')
  .option('-s, --status <status>', '按状态过滤: active / cooling / cold / archived')
  .option('-a, --annotation <type>', '按标注类型前缀过滤（如 "决策"、"事实"）')
  .option('--source <source>', '按来源过滤（如 claude-code）')
  .option('-l, --limit <number>', '返回数量', '20')
  .option('--sort <field>', '排序方式: time / vitality', 'time')
  .option('-v, --verbose', '显示详细信息')
  .option('--json', '以 JSON 格式输出')
  .action(async (options: {
    status?: string;
    annotation?: string;
    source?: string;
    limit: string;
    sort: string;
    verbose?: boolean;
    json?: boolean;
  }) => {
    // 参数校验
    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit < 1) {
      console.error(chalk.red('错误: --limit 必须是正整数'));
      process.exit(1);
    }

    if (options.status && !VALID_STATUSES.includes(options.status as BlockStatus)) {
      console.error(chalk.red(`错误: --status 必须是 ${VALID_STATUSES.join(' / ')} 之一`));
      process.exit(1);
    }

    if (!VALID_SORTS.includes(options.sort)) {
      console.error(chalk.red(`错误: --sort 必须是 ${VALID_SORTS.join(' / ')} 之一`));
      process.exit(1);
    }

    // 初始化数据库（使用新式模式）
    const configDir = getConfigDir();
    const configPath = path.join(configDir, 'config.json');

    let config;
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
    }

    const dbKey = await getDatabaseKey(configDir);
    if (!dbKey) {
      throw new ConfigError('无法获取数据库密钥，请重新初始化: corivo init');
    }

    const dbPath = getDefaultDatabasePath();
    const db = CorivoDatabase.getInstance({
      path: dbPath,
      key: dbKey,
      enableEncryption: config.encrypted_db_key !== undefined,
    });

    // 构建过滤器
    const filter: BlockFilter = {
      limit,
      sortBy: options.sort === 'vitality' ? 'vitality' : 'updated_at',
      sortOrder: 'DESC',
    };

    if (options.status) filter.status = options.status as BlockStatus;
    if (options.annotation) {
      const lower = options.annotation.toLowerCase();
      filter.annotationPrefix = ANNOTATION_ALIASES[lower] ?? options.annotation;
    }
    if (options.source) filter.source = options.source;

    const blocks = db.queryBlocks(filter);

    // JSON 输出模式
    if (options.json) {
      console.log(JSON.stringify(blocks, null, 2));
      return;
    }

    // 人类可读输出
    if (blocks.length === 0) {
      console.log(chalk.yellow('\n未找到符合条件的记忆'));
      return;
    }

    console.log(chalk.cyan(`\n找到 ${blocks.length} 条记忆:\n`));

    const termWidth = process.stdout.columns ?? 80;

    for (const block of blocks) {
      const statusColor = getStatusColor(block.status);
      const idStr = chalk.gray(block.id.slice(0, 12));
      const annotationStr = chalk.cyan(truncate(block.annotation || 'pending', 22).padEnd(22));
      const vitalityBar = statusColor(renderVitalityBar(block.vitality));
      const vitalityNum = chalk.white(String(block.vitality).padStart(3));
      const statusStr = statusColor(block.status.padEnd(8));

      // 内容剩余宽度 = 总宽 - id(12) - 空格(2) - annotation(22) - 空格(2) - bar(10) - 空格(1) - vitality(3) - 空格(1) - status(8) - 边距(4)
      const contentWidth = Math.max(10, termWidth - 12 - 2 - 22 - 2 - 10 - 1 - 3 - 1 - 8 - 4);
      const contentStr = chalk.white(truncate(block.content, contentWidth).padEnd(contentWidth));

      console.log(`${idStr}  ${annotationStr}  ${contentStr}  ${vitalityBar} ${vitalityNum} ${statusStr}`);

      if (options.verbose) {
        const createdDate = new Date(block.created_at * 1000).toLocaleDateString('zh-CN');
        const updatedDate = new Date(block.updated_at * 1000).toLocaleDateString('zh-CN');
        console.log(
          chalk.gray(`  来源: ${block.source} | 访问: ${block.access_count}次 | 创建: ${createdDate} | 更新: ${updatedDate}`)
        );
        if (block.refs && block.refs.length > 0) {
          console.log(chalk.gray(`  引用: ${block.refs.join(', ')}`));
        }
      }
    }

    console.log();
  });

/**
 * 渲染生命力进度条（10格）
 */
function renderVitalityBar(vitality: number): string {
  const filled = Math.round(vitality / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 截断字符串并添加省略号
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * 获取状态对应的颜色函数
 */
function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'active':
      return chalk.green;
    case 'cooling':
      return chalk.yellow;
    case 'cold':
      return chalk.hex('#FF9500');
    case 'archived':
      return chalk.gray;
    default:
      return chalk.gray;
  }
}
