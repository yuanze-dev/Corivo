/**
 * CLI command - query
 *
 * Unified query entry point for both manual search and prompt-based runtime surface.
 */

import chalk from 'chalk';
import path from 'node:path';
import type { Block } from '../../models/block.js';
import { ConfigError } from '../../errors/index.js';
import { QueryHistoryTracker } from '../../engine/query-history.js';
import { ContextPusher } from '../../push/context.js';
import { createQueryPack } from '../../runtime/query-pack.js';
import { formatSurfaceItem, type RuntimeOutputFormat } from '../../runtime/render.js';
import { generateRecall } from '../../runtime/recall.js';
import { createCliContext } from '../context/create-context.js';
import { createConfiguredCliContext } from '../context/configured-context.js';
import type { CliContext } from '../context/types.js';
import type { CorivoConfig } from '../../config.js';
import type { RuntimeCommandOptions } from './runtime-support.js';
import { loadRuntimeDb } from './runtime-support.js';

export interface QueryOptions {
  limit?: string;
  verbose?: boolean;
  pattern?: boolean;
  prompt?: string;
  format?: RuntimeOutputFormat;
}

type QueryConfig = CorivoConfig & {
  encrypted_db_key?: unknown;
};

interface SearchJsonResult {
  mode: 'search';
  query: string;
  results: Block[];
}

export interface PromptQueryCommandOptions extends RuntimeCommandOptions {
  prompt?: string;
}

export async function runPromptQueryCommand(
  options: PromptQueryCommandOptions = {},
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

export async function queryCommand(rawQuery: string | undefined, options: QueryOptions): Promise<void> {
  const { query, prompt } = validateQueryInputs(rawQuery, options);

  if (prompt) {
    validatePromptQueryOptions(options);
    const output = await runPromptQueryCommand({
      password: false,
      format: options.format ?? 'text',
      prompt,
    });

    if (output) {
      console.log(output);
    }
    return;
  }

  const bootstrapContext = createCliContext();
  const config = await loadQueryConfig(bootstrapContext);

  if (!config) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const context = createConfiguredCliContext(config);
  await runSearchQueryCommand(context, query, options, config);
}

async function runSearchQueryCommand(
  context: CliContext,
  query: string,
  options: QueryOptions,
  config: QueryConfig,
): Promise<void> {
  const output = context.output;
  const format = options.format ?? 'text';

  if (format === 'hook-text') {
    throw new Error('--format hook-text is only supported with --prompt');
  }

  if (config.encrypted_db_key) {
    throw new ConfigError('Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init');
  }

  const db = context.db.get({
    path: context.paths.databasePath(),
    enableEncryption: false,
  });

  const limit = parseLimit(options.limit);
  const results = db.searchBlocks(query, limit);

  if (format === 'json') {
    output.info(JSON.stringify({
      mode: 'search',
      query,
      results,
    } satisfies SearchJsonResult));
    return;
  }

  if (results.length === 0) {
    output.info(chalk.yellow(`\nNo memories found related to "${query}"`));
    return;
  }

  output.info(chalk.cyan(`\nFound ${results.length} related memories:\n`));

  for (const block of results) {
    output.info(chalk.gray(block.id) + ' ' + chalk.white(block.content));

    const annotation = block.annotation || 'pending';
    const statusColor = getStatusColor(block.status);
    const statusText = statusColor(block.status);

    output.info(
      chalk.gray(`  Annotation: ${annotation} | Vitality: ${block.vitality} | Status: ${statusText}`)
    );

    if (options.verbose) {
      output.info(chalk.gray(`  Access count: ${block.access_count}`));
      if (block.last_accessed) {
        const lastAccess = new Date(block.last_accessed);
        const daysAgo = Math.floor((Date.now() - block.last_accessed) / 86400000);
        output.info(chalk.gray(`  Last accessed: ${lastAccess.toLocaleString('en-US')} (${daysAgo} days ago)`));
      }
      if (block.pattern) {
        output.info(chalk.gray(`  Pattern: ${block.pattern.type} - ${block.pattern.decision}`));
      }
    }

    output.info('');
  }

  const pusher = new ContextPusher(db);
  const queryTracker = new QueryHistoryTracker(db, {
    logger: context.logger,
    clock: context.clock,
  });

  queryTracker.recordQuery(query, results);

  const similarReminder = queryTracker.findSimilarQueries(query);
  if (similarReminder.hasSimilar) {
    output.info(chalk.gray(similarReminder.message));
  }

  if (options.pattern) {
    const patternContext = await pusher.pushPatterns(query, 3);
    if (patternContext) {
      output.info(patternContext);
    }
  }

  const relatedContext = await pusher.pushContext(query, 5, {
    showAnnotation: true,
    showVitality: true,
    showTime: options.verbose,
  });

  if (relatedContext) {
    output.info(relatedContext);
  }
}

function validateQueryInputs(rawQuery: string | undefined, options: QueryOptions): {
  query: string;
  prompt?: string;
} {
  const query = rawQuery?.trim() ?? '';
  const prompt = options.prompt?.trim();

  if (query && prompt) {
    throw new Error('Pass either <query> or --prompt, not both');
  }

  if (prompt) {
    return { query: '', prompt };
  }

  if (!query) {
    throw new Error('Provide either <query> or --prompt');
  }

  return { query };
}

function validatePromptQueryOptions(options: QueryOptions): void {
  if (options.limit) {
    throw new Error('--limit is only supported with <query>');
  }

  if (options.verbose) {
    throw new Error('--verbose is only supported with <query>');
  }

  if (options.pattern) {
    throw new Error('--pattern is only supported with <query>');
  }
}

function parseLimit(limitOption?: string): number {
  const limit = limitOption ? parseInt(limitOption, 10) : 10;
  if (limitOption && isNaN(limit)) {
    throw new Error('--limit must be a valid number');
  }

  return limit;
}

async function loadQueryConfig(context: CliContext): Promise<QueryConfig | null> {
  const config = await context.config.load();
  if (config) {
    return config;
  }

  const configPath = path.join(context.paths.configDir(), 'config.json');
  if (!(await context.fs.exists(configPath))) {
    return null;
  }

  return context.fs.readJson<QueryConfig>(configPath);
}

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
