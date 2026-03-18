/**
 * 错误处理体系
 *
 * 定义 Corivo 的错误类型层次结构，提供结构化错误信息
 */

/**
 * 基础错误类
 */
export class CorivoError extends Error {
  /** 错误码 */
  code: string;
  /** 错误上下文信息 */
  context: Record<string, unknown>;

  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CorivoError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }

  /** 获取用户友好的错误消息 */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('DB_ERROR', message, context);
    this.name = 'DatabaseError';
  }

  getUserMessage(): string {
    if (this.context.cause) {
      return `数据库错误：${this.message}（原因：${this.context.cause}）`;
    }
    return `数据库错误：${this.message}`;
  }
}

/**
 * 加密错误
 */
export class CryptoError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('CRYPTO_ERROR', message, context);
    this.name = 'CryptoError';
  }

  getUserMessage(): string {
    return `加密错误：${this.message}`;
  }
}

/**
 * CLI 错误
 */
export class CLIError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('CLI_ERROR', message, context);
    this.name = 'CLIError';
  }

  getUserMessage(): string {
    return `命令错误：${this.message}`;
  }
}

/**
 * 验证错误
 */
export class ValidationError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('VALIDATION_ERROR', message, context);
    this.name = 'ValidationError';
  }

  getUserMessage(): string {
    return `验证失败：${this.message}`;
  }
}

/**
 * 配置错误
 */
export class ConfigError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('CONFIG_ERROR', message, context);
    this.name = 'ConfigError';
  }

  getUserMessage(): string {
    return `配置错误：${this.message}`;
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('FS_ERROR', message, context);
    this.name = 'FileSystemError';
  }

  getUserMessage(): string {
    return `文件系统错误：${this.message}`;
  }
}

/**
 * 进程错误
 */
export class ProcessError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('PROCESS_ERROR', message, context);
    this.name = 'ProcessError';
  }

  getUserMessage(): string {
    return `进程错误：${this.message}`;
  }
}

/**
 * 错误码枚举
 */
export const ERROR_CODES = {
  // 通用错误 (0xxx)
  UNKNOWN: 'UNKNOWN',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',

  // 数据库错误 (1xxx)
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_LOCKED: 'DB_LOCKED',
  DB_CORRUPT: 'DB_CORRUPT',
  DB_KEY_ERROR: 'DB_KEY_ERROR',

  // 加密错误 (2xxx)
  CRYPTO_KEY_DERIVE_FAILED: 'CRYPTO_KEY_DERIVE_FAILED',
  CRYPTO_DECRYPT_FAILED: 'CRYPTO_DECRYPT_FAILED',
  CRYPTO_INVALID_KEY: 'CRYPTO_INVALID_KEY',

  // 验证错误 (3xxx)
  VALIDATION_INVALID_BLOCK: 'VALIDATION_INVALID_BLOCK',
  VALIDATION_INVALID_ANNOTATION: 'VALIDATION_INVALID_ANNOTATION',
  VALIDATION_INVALID_PATTERN: 'VALIDATION_INVALID_PATTERN',

  // CLI 错误 (4xxx)
  CLI_INVALID_COMMAND: 'CLI_INVALID_COMMAND',
  CLI_MISSING_ARGUMENT: 'CLI_MISSING_ARGUMENT',
  CLI_UNKNOWN_OPTION: 'CLI_UNKNOWN_OPTION',

  // 配置错误 (5xxx)
  CONFIG_NOT_INITIALIZED: 'CONFIG_NOT_INITIALIZED',
  CONFIG_MISSING_FILE: 'CONFIG_MISSING_FILE',
  CONFIG_INVALID_FORMAT: 'CONFIG_INVALID_FORMAT',

  // 进程错误 (6xxx)
  PROCESS_ALREADY_RUNNING: 'PROCESS_ALREADY_RUNNING',
  PROCESS_NOT_RUNNING: 'PROCESS_NOT_RUNNING',
  PROCESS_START_FAILED: 'PROCESS_START_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 判断是否为 CorivoError
 */
export function isCorivoError(error: unknown): error is CorivoError {
  return error instanceof CorivoError;
}

/**
 * 包装未知错误为 CorivoError
 */
export function wrapError(error: unknown, code: ErrorCode = ERROR_CODES.UNKNOWN): CorivoError {
  if (error instanceof CorivoError) {
    return error;
  }

  if (error instanceof Error) {
    return new CorivoError(code, error.message, { originalError: error });
  }

  return new CorivoError(code, String(error), { originalValue: error });
}
