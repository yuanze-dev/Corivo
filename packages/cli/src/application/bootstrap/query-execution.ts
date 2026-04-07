import chalk from 'chalk';
import type { Block } from '@/domain/memory/models/block';
import { ConfigError } from '@/errors';
import { ContextPusher } from '@/push/context.js';
import {
  createRuntimeQueryHistoryStore,
  createRuntimeQueryHistoryTracker,
} from '@/runtime/query-history.js';
import { formatSurfaceItem, type RuntimeOutputFormat } from '@/cli/presenters/query-renderer.js';
import type { RuntimeCommandOptions } from '@/runtime/runtime-support';
import { loadRuntimeDb } from '@/runtime/runtime-support';
import type { Logger } from '@/utils/logging';
import { loadConfig } from '@/config.js';
import { createLocalMemoryProvider } from '@/domain/memory/providers/local-memory-provider.js';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';
import { isMemoryProviderUnavailableError } from '@/domain/memory/providers/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '@/storage/database';

export interface QueryOptions {
  limit?: string;
  verbose?: boolean;
  pattern?: boolean;
  prompt?: string;
  format?: RuntimeOutputFormat;
}

interface SearchJsonResult {
  mode: 'search';
  query: string;
  results: Block[];
}

export interface PromptQueryCommandOptions extends RuntimeCommandOptions {
  prompt?: string;
}

export interface SearchQueryCommandInput {
  query: string;
  options: QueryOptions;
}

export interface SearchQueryExecutionDeps {
  loadDb?: (options?: RuntimeCommandOptions) => Promise<any>;
  writeOutput?: (text: string) => void;
  logger?: Pick<Logger, 'debug'>;
  now?: () => number;
}

const defaultQueryLogger: Pick<Logger, 'debug'> = {
  debug: () => {},
};

const defaultWriteOutput = (text: string) => {
  console.log(text);
};

export async function runPromptQueryCommand(
  options: PromptQueryCommandOptions = {},
): Promise<string> {
  if (!options.prompt) {
    return '';
  }

  const config = await loadProviderConfigOrThrow();
  const provider = resolveMemoryProvider(config);
  const localProvider = createLocalMemoryProvider();
  const db = await loadRuntimeDb(options);

  if (!db && provider.provider === 'local') {
    return '';
  }

  let recall = null;
  try {
    recall = await provider.recall({ prompt: options.prompt, db: db ?? undefined });
  } catch (error) {
    if (isMemoryProviderUnavailableError(error)) {
      if (db) {
        recall = await localProvider.recall({ prompt: options.prompt, db });
      } else {
        recall = null;
      }
    } else {
      throw error;
    }
  }
  // Provider miss: preserve legacy local recall chain as fallback.
  if (!recall && provider.provider !== 'local' && db) {
    recall = await localProvider.recall({ prompt: options.prompt, db });
  }

  return formatSurfaceItem(recall, options.format);
}

export async function runSearchQueryCommand(
  input: SearchQueryCommandInput,
  deps: SearchQueryExecutionDeps = {},
): Promise<void> {
  const writeOutput = deps.writeOutput ?? defaultWriteOutput;
  const logger = deps.logger ?? defaultQueryLogger;
  const now = deps.now ?? (() => Date.now());
  const loadDb = deps.loadDb ?? loadRuntimeDb;
  const { query, options } = input;
  const format = options.format ?? 'text';

  if (format === 'hook-text') {
    throw new Error('--format hook-text is only supported with --prompt');
  }

  const config = await loadProviderConfigOrThrow();
  const provider = resolveMemoryProvider(config);
  const localProvider = createLocalMemoryProvider();
  const db = await loadDb({ password: false });

  if (!db && provider.provider === 'local') {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const limit = parseLimit(options.limit);

  let results: Block[] = [];
  try {
    results = await provider.search({ query, limit, db: db ?? undefined });
  } catch (error) {
    if (isMemoryProviderUnavailableError(error)) {
      if (db) {
        results = await localProvider.search({ query, limit, db });
      } else {
        results = [];
      }
    } else {
      throw error;
    }
  }
  // Provider miss: preserve legacy local search fallback behavior.
  if (results.length === 0 && provider.provider !== 'local' && db) {
    results = await localProvider.search({ query, limit, db });
  }

  if (format === 'json') {
    writeOutput(JSON.stringify({
      mode: 'search',
      query,
      results,
    } satisfies SearchJsonResult));
    return;
  }

  if (results.length === 0) {
    writeOutput(chalk.yellow(`\nNo memories found related to "${query}"`));
    return;
  }

  writeOutput(chalk.cyan(`\nFound ${results.length} related memories:\n`));

  for (const block of results) {
    writeOutput(chalk.gray(block.id) + ' ' + chalk.white(block.content));

    const annotation = block.annotation || 'pending';
    const statusColor = getStatusColor(block.status);
    const statusText = statusColor(block.status);

    writeOutput(
      chalk.gray(`  Annotation: ${annotation} | Vitality: ${block.vitality} | Status: ${statusText}`)
    );

    if (options.verbose) {
      writeOutput(chalk.gray(`  Access count: ${block.access_count}`));
      if (block.last_accessed) {
        const lastAccess = new Date(block.last_accessed);
        const daysAgo = Math.floor((now() - block.last_accessed) / 86400000);
        writeOutput(chalk.gray(`  Last accessed: ${lastAccess.toLocaleString('en-US')} (${daysAgo} days ago)`));
      }
      if (block.pattern) {
        writeOutput(chalk.gray(`  Pattern: ${block.pattern.type} - ${block.pattern.decision}`));
      }
    }

    writeOutput('');
  }

  if (!db) {
    return;
  }

  const pusher = new ContextPusher(db);
  const queryHistoryStore = createRuntimeQueryHistoryStore(db);
  const queryTracker = createRuntimeQueryHistoryTracker(queryHistoryStore, {
    logger,
    clock: { now },
  });

  queryTracker.recordQuery(query, results);

  const similarReminder = queryTracker.findSimilarQueries(query);
  if (similarReminder.hasSimilar) {
    writeOutput(chalk.gray(similarReminder.message));
  }

  if (options.pattern) {
    const patternContext = await pusher.pushPatterns(query, 3);
    if (patternContext) {
      writeOutput(patternContext);
    }
  }

  const relatedContext = await pusher.pushContext(query, 5, {
    showAnnotation: true,
    showVitality: true,
    showTime: options.verbose,
  });

  if (relatedContext) {
    writeOutput(relatedContext);
  }
}

async function loadProviderConfigOrThrow() {
  const config = await loadConfig();
  if (config) {
    return config;
  }

  // If config.json exists but failed validation, treat as a config error rather than
  // silently falling back to local behavior.
  const configPath = path.join(getConfigDir(), 'config.json');
  try {
    await fs.access(configPath);
  } catch {
    return null;
  }

  throw new ConfigError('Corivo config is invalid. Please re-run: corivo init');
}

function parseLimit(limitOption?: string): number {
  const limit = limitOption ? parseInt(limitOption, 10) : 10;
  if (limitOption && isNaN(limit)) {
    throw new Error('--limit must be a valid number');
  }

  return limit;
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
