/**
 * CLI command - list
 *
 * Browses the Corivo memory list with optional filtering and sorting, no search keyword required.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { ConfigError } from '../../errors/index.js';
import type { BlockFilter, BlockStatus } from '@/domain/memory/models/block.js';
import { getCliOutput } from '@/cli/runtime';

const VALID_STATUSES: BlockStatus[] = ['active', 'cooling', 'cold', 'archived'];
const VALID_SORTS = ['time', 'vitality'];

/** English annotation type alias → annotation prefix */
const ANNOTATION_ALIASES: Record<string, string> = {
  decision: 'Decision',
  fact: 'Fact',
  knowledge: 'Knowledge',
  instruction: 'Instruction',
};

export const listCommand = new Command('list');

listCommand
  .description('Browse memory list (supports filtering and sorting)')
  .option('-s, --status <status>', 'Filter by status: active / cooling / cold / archived')
  .option('-a, --annotation <type>', 'Filter by annotation prefix (for example "Decision" or "Fact")')
  .option('--source <source>', 'Filter by source (for example claude-code)')
  .option('-l, --limit <number>', 'Result limit', '20')
  .option('--sort <field>', 'Sort order: time / vitality', 'time')
  .option('-v, --verbose', 'Show detailed information')
  .option('--json', 'Output as JSON')
  .action(async (options: {
    status?: string;
    annotation?: string;
    source?: string;
    limit: string;
    sort: string;
    verbose?: boolean;
    json?: boolean;
  }) => {
    const output = getCliOutput();
    // Parameter verification
    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit < 1) {
      output.error(chalk.red('Error: --limit must be a positive integer'));
      process.exit(1);
    }

    if (options.status && !VALID_STATUSES.includes(options.status as BlockStatus)) {
      output.error(chalk.red(`Error: --status must be one of ${VALID_STATUSES.join(' / ')}`));
      process.exit(1);
    }

    if (!VALID_SORTS.includes(options.sort)) {
      output.error(chalk.red(`Error: --sort must be one of ${VALID_SORTS.join(' / ')}`));
      process.exit(1);
    }

    // Initialize the database (using modern schema)
    const configDir = getConfigDir();
    const configPath = path.join(configDir, 'config.json');

    let config;
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      throw new ConfigError('Corivo is not initialized. Please run: corivo init');
    }

    if (config.encrypted_db_key) {
      throw new ConfigError('Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init');
    }

    const dbPath = getDefaultDatabasePath();
    const db = CorivoDatabase.getInstance({
      path: dbPath,
      enableEncryption: false,
    });

    // Build filter
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

    // JSON output mode
    if (options.json) {
      output.info(JSON.stringify(blocks, null, 2));
      return;
    }

    // human readable output
    if (blocks.length === 0) {
      output.warn(chalk.yellow('\nNo matching memories found'));
      return;
    }

    output.info(chalk.cyan(`\nFound ${blocks.length} memories:\n`));

    const termWidth = process.stdout.columns ?? 80;

    for (const block of blocks) {
      const statusColor = getStatusColor(block.status);
      const idStr = chalk.gray(block.id.slice(0, 12));
      const annotationStr = chalk.cyan(truncate(block.annotation || 'pending', 22).padEnd(22));
      const vitalityBar = statusColor(renderVitalityBar(block.vitality));
      const vitalityNum = chalk.white(String(block.vitality).padStart(3));
      const statusStr = statusColor(block.status.padEnd(8));

      // Content remaining width = total width - id(12) - space(2) - annotation(22) - space(2) - bar(10) - space(1) - vitality(3) - space(1) - status(8) - margin(4)
      const contentWidth = Math.max(10, termWidth - 12 - 2 - 22 - 2 - 10 - 1 - 3 - 1 - 8 - 4);
      const contentStr = chalk.white(truncate(block.content, contentWidth).padEnd(contentWidth));

      output.info(`${idStr}  ${annotationStr}  ${contentStr}  ${vitalityBar} ${vitalityNum} ${statusStr}`);

      if (options.verbose) {
        const createdDate = new Date(block.created_at * 1000).toLocaleDateString('en-US');
        const updatedDate = new Date(block.updated_at * 1000).toLocaleDateString('en-US');
        output.info(
          chalk.gray(`  Source: ${block.source} | Accesses: ${block.access_count} | Created: ${createdDate} | Updated: ${updatedDate}`)
        );
        if (block.refs && block.refs.length > 0) {
          output.info(chalk.gray(`  Refs: ${block.refs.join(', ')}`));
        }
      }
    }

    output.info('');
  });

/**
 * Rendering vitality progress bar (10 grids)
 */
function renderVitalityBar(vitality: number): string {
  const filled = Math.round(vitality / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Truncate string and add ellipses
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Get the color function corresponding to the state
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
