import { formatWithOptions } from 'node:util';
import { createConsola, LogLevels } from 'consola';
import type { ConsolaReporter, LogObject } from 'consola';
import type { LogLevel } from '@/type';

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

const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const isLogLevel = (value: string): value is LogLevel =>
  value === 'error' || value === 'info' || value === 'debug';

const resolveLogLevel = (value?: string | null): LogLevel =>
  value && isLogLevel(value) ? value : DEFAULT_LOG_LEVEL;

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
