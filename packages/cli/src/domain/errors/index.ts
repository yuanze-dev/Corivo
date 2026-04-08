/**
 * Error handling system
 *
 * Define Corivo's error type hierarchy to provide structured error information
 */

/**
 * Basic error classes
 */
export class CorivoError extends Error {
  /** error code */
  code: string;
  /** Error context information */
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

  /** Get user-friendly error messages */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Database error
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
 * Encryption error
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
 * CLI error
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
 * Validation error
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
 * Configuration error
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
 * File system error
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
 * process error
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
 * mistaken identity
 */
export class IdentityError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('IDENTITY_ERROR', message, context);
    this.name = 'IdentityError';
  }

  getUserMessage(): string {
    return `身份错误：${this.message}`;
  }
}

/**
 * Fingerprint error
 */
export class FingerprintError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('FINGERPRINT_ERROR', message, context);
    this.name = 'FingerprintError';
  }

  getUserMessage(): string {
    return `指纹错误：${this.message}`;
  }
}

/**
 * Error code enumeration
 */
export const ERROR_CODES = {
  // Generic error (0xxx)
  UNKNOWN: 'UNKNOWN',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',

  // Database error (1xxx)
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_LOCKED: 'DB_LOCKED',
  DB_CORRUPT: 'DB_CORRUPT',
  DB_KEY_ERROR: 'DB_KEY_ERROR',

  // Encryption error (2xxx)
  CRYPTO_KEY_DERIVE_FAILED: 'CRYPTO_KEY_DERIVE_FAILED',
  CRYPTO_DECRYPT_FAILED: 'CRYPTO_DECRYPT_FAILED',
  CRYPTO_INVALID_KEY: 'CRYPTO_INVALID_KEY',

  // Validation error (3xxx)
  VALIDATION_INVALID_BLOCK: 'VALIDATION_INVALID_BLOCK',
  VALIDATION_INVALID_ANNOTATION: 'VALIDATION_INVALID_ANNOTATION',
  VALIDATION_INVALID_PATTERN: 'VALIDATION_INVALID_PATTERN',

  // CLI errors (4xxx)
  CLI_INVALID_COMMAND: 'CLI_INVALID_COMMAND',
  CLI_MISSING_ARGUMENT: 'CLI_MISSING_ARGUMENT',
  CLI_UNKNOWN_OPTION: 'CLI_UNKNOWN_OPTION',

  // Configuration error (5xxx)
  CONFIG_NOT_INITIALIZED: 'CONFIG_NOT_INITIALIZED',
  CONFIG_MISSING_FILE: 'CONFIG_MISSING_FILE',
  CONFIG_INVALID_FORMAT: 'CONFIG_INVALID_FORMAT',

  // Process error (6xxx)
  PROCESS_ALREADY_RUNNING: 'PROCESS_ALREADY_RUNNING',
  PROCESS_NOT_RUNNING: 'PROCESS_NOT_RUNNING',
  PROCESS_START_FAILED: 'PROCESS_START_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Determine whether it is CorivoError
 */
export function isCorivoError(error: unknown): error is CorivoError {
  return error instanceof CorivoError;
}

/**
 * Wrapping unknown errors as CorivoError
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
