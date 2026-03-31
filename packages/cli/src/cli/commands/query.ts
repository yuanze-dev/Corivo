/**
 * CLI command - query
 *
 * Searches for information stored in Corivo memory blocks.
 */

import chalk from 'chalk';
import path from 'node:path';
import { ConfigError } from '../../errors/index.js';
import { ContextPusher } from '../../push/context.js';
import { QueryHistoryTracker } from '../../engine/query-history.js';
import { createCliContext } from '../context/create-context.js';
import { createConfiguredCliContext } from '../context/configured-context.js';
import type { CliContext } from '../context/types.js';
import type { CorivoConfig } from '../../config.js';

interface QueryOptions {
  limit?: string;
  verbose?: boolean;
  pattern?: boolean;
}

type QueryConfig = CorivoConfig & {
  encrypted_db_key?: unknown;
};

export async function queryCommand(query: string, options: QueryOptions): Promise<void> {
  const bootstrapContext = createCliContext();
  const config = await loadQueryConfig(bootstrapContext);

  if (!config) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const context = createConfiguredCliContext(config);
  await runQueryCommand(context, query, options, config);
}

async function runQueryCommand(
  context: CliContext,
  query: string,
  options: QueryOptions,
  config: QueryConfig,
): Promise<void> {
  const output = context.output;

  if (config.encrypted_db_key) {
    throw new ConfigError('Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init');
  }

  const db = context.db.get({
    path: context.paths.databasePath(),
    enableEncryption: false,
  });

  // Search
  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  if (options.limit && isNaN(limit)) {
    throw new Error('--limit must be a valid number');
  }
  const results = db.searchBlocks(query, limit);

  if (results.length === 0) {
    output.info(chalk.yellow(`\nNo memories found related to "${query}"`));
    return;
  }

  // Show results
  output.info(chalk.cyan(`\nFound ${results.length} related memories:\n`));

  for (const block of results) {
    // ID and content
    output.info(chalk.gray(block.id) + ' ' + chalk.white(block.content));

    // Meta information
    const annotation = block.annotation || 'pending';
    const statusColor = getStatusColor(block.status);
    const statusText = statusColor(block.status);

    output.info(
      chalk.gray(`  Annotation: ${annotation} | Vitality: ${block.vitality} | Status: ${statusText}`)
    );

    // Details
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

  // Additional contextual push
  const pusher = new ContextPusher(db);
  const queryTracker = new QueryHistoryTracker(db, {
    logger: context.logger,
    clock: context.clock,
  });

  // Record this query
  queryTracker.recordQuery(query, results);

  // Check if there are similar historical queries
  const similarReminder = queryTracker.findSimilarQueries(query);
  if (similarReminder.hasSimilar) {
    output.info(chalk.gray(similarReminder.message));
  }

  // Decision mode push
  if (options.pattern) {
    const patternContext = await pusher.pushPatterns(query, 3);
    if (patternContext) {
      output.info(patternContext);
    }
  }

  // Related memory push
  const relatedContext = await pusher.pushContext(query, 5, {
    showAnnotation: true,
    showVitality: true,
    showTime: options.verbose,
  });

  if (relatedContext) {
    output.info(relatedContext);
  }
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
      return chalk.hex('#FF9500'); // Orange
    case 'archived':
      return chalk.gray;
    default:
      return chalk.gray;
  }
}
