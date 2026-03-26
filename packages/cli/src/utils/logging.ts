type ConsoleMethod = (...args: unknown[]) => void;
export type LogLevel = 'error' | 'info' | 'debug';
type LogTarget = {
  log: ConsoleMethod;
  error: ConsoleMethod;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function stringifyLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;

  try {
    const json = JSON.stringify(arg);
    return json ?? String(arg);
  } catch {
    return String(arg);
  }
}

export function formatLogLine(args: unknown[], date = new Date()): string {
  const timestamp = `[${formatTimestamp(date)}]`;
  const message = args.map(stringifyLogArg).join(' ');

  return message
    .split('\n')
    .map((line) => (line ? `${timestamp} ${line}` : line))
    .join('\n');
}

export function createTimestampLogger(target = console): {
  log: ConsoleMethod;
  error: ConsoleMethod;
  debug: ConsoleMethod;
  isDebugEnabled: () => boolean;
};
export function createTimestampLogger(target: LogTarget = console, level: LogLevel = 'info'): {
  log: ConsoleMethod;
  error: ConsoleMethod;
  debug: ConsoleMethod;
  isDebugEnabled: () => boolean;
} {
  return {
    log: (...args: unknown[]) => target.log(formatLogLine(args)),
    error: (...args: unknown[]) => target.error(formatLogLine(args)),
    debug: (...args: unknown[]) => {
      if (level === 'debug') {
        target.log(formatLogLine(args));
      }
    },
    isDebugEnabled: () => level === 'debug',
  };
}

export function normalizeLogLevel(level?: string | null): LogLevel {
  if (level === 'error') return 'error';
  if (level === 'debug') return 'debug';
  return 'info';
}
