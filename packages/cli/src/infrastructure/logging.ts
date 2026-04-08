import { formatWithOptions } from 'node:util';
import { createConsola, LogLevels } from 'consola';
import type { ConsolaReporter, LogObject } from 'consola';

export type LogLevel = 'error' | 'info' | 'debug';

type ConsoleMethod = (...args: unknown[]) => void;

export interface LogTarget {
  log: ConsoleMethod;
  error: ConsoleMethod;
}

export interface Logger {
  log: ConsoleMethod;
  info: ConsoleMethod;
  success: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
  debug: ConsoleMethod;
  isDebugEnabled: () => boolean;
}

const DEFAULT_LOG_LEVEL: LogLevel = 'debug';

const isLogLevel = (value: string): value is LogLevel =>
  value === 'error' || value === 'info' || value === 'debug';

const resolveLogLevel = (value?: string | null): LogLevel =>
  value && isLogLevel(value) ? value : DEFAULT_LOG_LEVEL;

function isTruthyEnvFlag(value?: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readRuntimeMode(env: NodeJS.ProcessEnv): 'production' | 'development' | null {
  const explicitLevel = env.CORIVO_LOG_LEVEL;
  if (explicitLevel && isLogLevel(explicitLevel)) {
    return null;
  }

  const modeCandidates = [
    env.CORIVO_ENV,
    env.NODE_ENV,
    env.MODE,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of modeCandidates) {
    const normalized = candidate.trim().toLowerCase();
    if (normalized === 'production' || normalized === 'prod') {
      return 'production';
    }
    if (normalized === 'development' || normalized === 'dev') {
      return 'development';
    }
  }

  if (isTruthyEnvFlag(env.PROD) || isTruthyEnvFlag(env.CI)) {
    return 'production';
  }

  if (isTruthyEnvFlag(env.DEV)) {
    return 'development';
  }

  return null;
}

export function resolveRuntimeLogLevel(options: {
  explicitLogLevel?: LogLevel | string | null;
  configLogLevel?: LogLevel | string | null;
  env?: NodeJS.ProcessEnv;
} = {}): LogLevel {
  if (options.explicitLogLevel && isLogLevel(options.explicitLogLevel)) {
    return options.explicitLogLevel;
  }

  const env = options.env ?? process.env;
  if (env.CORIVO_LOG_LEVEL && isLogLevel(env.CORIVO_LOG_LEVEL)) {
    return env.CORIVO_LOG_LEVEL;
  }

  const runtimeMode = readRuntimeMode(env);
  if (runtimeMode === 'production') {
    return 'info';
  }
  if (runtimeMode === 'development') {
    return 'debug';
  }

  if (options.configLogLevel && isLogLevel(options.configLogLevel)) {
    return options.configLogLevel;
  }

  return DEFAULT_LOG_LEVEL;
}

const formatArgs = (args: unknown[]): string =>
  formatWithOptions({ colors: false, depth: 6 }, ...args);

const createTargetReporter = (target: LogTarget): ConsolaReporter => ({
  log: (logObj: LogObject) => {
    const write = logObj.level <= 1 ? target.error : target.log;
    write(formatArgs(logObj.args));
  },
});

export const createLogger = (
  target: LogTarget = console,
  level?: LogLevel | string | null
): Logger => {
  const resolvedLevel = resolveLogLevel(level);
  const logger = createConsola({
    level: LogLevels[resolvedLevel],
    reporters: target === console ? undefined : [createTargetReporter(target)],
    formatOptions: {
      date: true,
      compact: true,
    },
  });

  return {
    log: logger.info.bind(logger),
    info: logger.info.bind(logger),
    success: logger.success.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    debug: logger.debug.bind(logger),
    isDebugEnabled: () => resolvedLevel === 'debug',
  };
};
