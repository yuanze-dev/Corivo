/**
 * 错误处理体系
 *
 * 定义 Corivo 的错误类型层次结构，提供结构化错误信息
 */
/**
 * 基础错误类
 */
export declare class CorivoError extends Error {
    /** 错误码 */
    code: string;
    /** 错误上下文信息 */
    context: Record<string, unknown>;
    constructor(code: string, message: string, context?: Record<string, unknown>);
    toJSON(): Record<string, unknown>;
    /** 获取用户友好的错误消息 */
    getUserMessage(): string;
}
/**
 * 数据库错误
 */
export declare class DatabaseError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 加密错误
 */
export declare class CryptoError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * CLI 错误
 */
export declare class CLIError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 验证错误
 */
export declare class ValidationError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 配置错误
 */
export declare class ConfigError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 文件系统错误
 */
export declare class FileSystemError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 进程错误
 */
export declare class ProcessError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 身份错误
 */
export declare class IdentityError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 指纹错误
 */
export declare class FingerprintError extends CorivoError {
    constructor(message: string, context?: Record<string, unknown>);
    getUserMessage(): string;
}
/**
 * 错误码枚举
 */
export declare const ERROR_CODES: {
    readonly UNKNOWN: "UNKNOWN";
    readonly NOT_IMPLEMENTED: "NOT_IMPLEMENTED";
    readonly DB_NOT_FOUND: "DB_NOT_FOUND";
    readonly DB_LOCKED: "DB_LOCKED";
    readonly DB_CORRUPT: "DB_CORRUPT";
    readonly DB_KEY_ERROR: "DB_KEY_ERROR";
    readonly CRYPTO_KEY_DERIVE_FAILED: "CRYPTO_KEY_DERIVE_FAILED";
    readonly CRYPTO_DECRYPT_FAILED: "CRYPTO_DECRYPT_FAILED";
    readonly CRYPTO_INVALID_KEY: "CRYPTO_INVALID_KEY";
    readonly VALIDATION_INVALID_BLOCK: "VALIDATION_INVALID_BLOCK";
    readonly VALIDATION_INVALID_ANNOTATION: "VALIDATION_INVALID_ANNOTATION";
    readonly VALIDATION_INVALID_PATTERN: "VALIDATION_INVALID_PATTERN";
    readonly CLI_INVALID_COMMAND: "CLI_INVALID_COMMAND";
    readonly CLI_MISSING_ARGUMENT: "CLI_MISSING_ARGUMENT";
    readonly CLI_UNKNOWN_OPTION: "CLI_UNKNOWN_OPTION";
    readonly CONFIG_NOT_INITIALIZED: "CONFIG_NOT_INITIALIZED";
    readonly CONFIG_MISSING_FILE: "CONFIG_MISSING_FILE";
    readonly CONFIG_INVALID_FORMAT: "CONFIG_INVALID_FORMAT";
    readonly PROCESS_ALREADY_RUNNING: "PROCESS_ALREADY_RUNNING";
    readonly PROCESS_NOT_RUNNING: "PROCESS_NOT_RUNNING";
    readonly PROCESS_START_FAILED: "PROCESS_START_FAILED";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
/**
 * 判断是否为 CorivoError
 */
export declare function isCorivoError(error: unknown): error is CorivoError;
/**
 * 包装未知错误为 CorivoError
 */
export declare function wrapError(error: unknown, code?: ErrorCode): CorivoError;
//# sourceMappingURL=index.d.ts.map