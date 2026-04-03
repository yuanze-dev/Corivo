import chalk from 'chalk';
import type { Block } from '@/domain/memory/models/block';
import { ConfigError } from '@/errors';
import { ContextPusher } from '@/push/context.js';
import { createQueryPack } from '@/application/query/query-pack.js';
import {
  createRuntimeQueryHistoryStore,
  createRuntimeQueryHistoryTracker,
} from '@/runtime/query-history.js';
import { formatSurfaceItem, type RuntimeOutputFormat } from '@/cli/presenters/query-renderer.js';
import { generateRecall } from '@/application/query/generate-recall.js';
import { loadMemoryIndex } from '@/runtime/memory-index.js';
import { generateRawTranscriptRecall } from '@/application/query/generate-raw-recall.js';
import type { RuntimeCommandOptions } from '@/runtime/runtime-support';
import { loadRuntimeDb } from '@/runtime/runtime-support';
import type { Logger } from '@/utils/logging';

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
  const db = await loadRuntimeDb(options);
  if (!db || !options.prompt) {
    return '';
  }

  const queryPack = createQueryPack({ prompt: options.prompt });
  const memoryIndex = await loadMemoryIndex();
  const recall =
    generateRecall(db, queryPack, { memoryIndex })
    ?? await generateRawTranscriptRecall(db, queryPack);

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

  const db = await loadDb({ password: false });
  if (!db) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const limit = parseLimit(options.limit);
  const results = db.searchBlocks(query, limit);

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
