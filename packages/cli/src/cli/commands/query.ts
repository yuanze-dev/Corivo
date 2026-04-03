/**
 * CLI command - query
 *
 * Adapter-only command surface: parse args, validate flag combinations, delegate execution.
 */

import { Command } from 'commander';
import type { Logger } from '@/utils/logging';
import {
  type PromptQueryCommandOptions,
  type QueryOptions,
  type SearchQueryCommandInput,
} from '@/application/bootstrap/query-execution';

export {
  type PromptQueryCommandOptions,
  type QueryOptions,
  type SearchQueryCommandInput,
} from '@/application/bootstrap/query-execution';

export interface QueryCommandDeps {
  runPromptQuery?: (options: PromptQueryCommandOptions) => Promise<string>;
  runSearchQuery?: (input: SearchQueryCommandInput) => Promise<void>;
  writeOutput?: (text: string) => void;
  logger?: Pick<Logger, 'debug'>;
}

const defaultQueryLogger: Pick<Logger, 'debug'> = {
  debug: () => {},
};

const defaultWriteOutput = (text: string) => {
  console.log(text);
};

const missingPromptExecutor = async (_options: PromptQueryCommandOptions): Promise<string> => {
  throw new Error('query command requires injected runPromptQuery capability');
};

const missingSearchExecutor = async (_input: SearchQueryCommandInput): Promise<void> => {
  throw new Error('query command requires injected runSearchQuery capability');
};

async function runQueryCommand(
  rawQuery: string | undefined,
  options: QueryOptions,
  deps: Required<QueryCommandDeps>,
): Promise<void> {
  const { query, prompt } = validateQueryInputs(rawQuery, options);

  if (prompt) {
    validatePromptQueryOptions(options);
    deps.logger.debug(
      `[query:command] prompt query format=${options.format ?? 'text'} promptLength=${prompt.length}`
    );

    const output = await deps.runPromptQuery({
      password: false,
      format: options.format ?? 'text',
      prompt,
    });

    if (output) {
      deps.writeOutput(output);
    }
    return;
  }

  deps.logger.debug(
    `[query:command] search query="${query}" limit=${options.limit ?? '10'} format=${options.format ?? 'text'}`
  );
  await deps.runSearchQuery({ query, options });
}

export function createQueryCommand(deps: QueryCommandDeps = {}): Command {
  const resolved: Required<QueryCommandDeps> = {
    runPromptQuery: deps.runPromptQuery ?? missingPromptExecutor,
    runSearchQuery: deps.runSearchQuery ?? missingSearchExecutor,
    writeOutput: deps.writeOutput ?? defaultWriteOutput,
    logger: deps.logger ?? defaultQueryLogger,
  };

  return new Command('query')
    .alias('recall')
    .description('Query information')
    .argument('[query]', 'Search keywords')
    .option('-l, --limit <number>', 'Result limit')
    .option('-v, --verbose', 'Show detailed information')
    .option('-p, --pattern', 'Show decision patterns')
    .option('--prompt <text>', 'Generate prompt-based query using the current user input')
    .option('-f, --format <type>', 'Output format: text | json | hook-text', 'text')
    .action(async (query, options: QueryOptions) => {
      await runQueryCommand(query, options, resolved);
    });
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
