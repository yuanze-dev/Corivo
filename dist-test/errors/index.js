"use strict";
/**
 * 错误处理体系
 *
 * 定义 Corivo 的错误类型层次结构，提供结构化错误信息
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = exports.FingerprintError = exports.IdentityError = exports.ProcessError = exports.FileSystemError = exports.ConfigError = exports.ValidationError = exports.CLIError = exports.CryptoError = exports.DatabaseError = exports.CorivoError = void 0;
exports.isCorivoError = isCorivoError;
exports.wrapError = wrapError;
/**
 * 基础错误类
 */
var CorivoError = /** @class */ (function (_super) {
    __extends(CorivoError, _super);
    function CorivoError(code, message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, message) || this;
        _this.name = 'CorivoError';
        _this.code = code;
        _this.context = context;
        Error.captureStackTrace(_this, _this.constructor);
        return _this;
    }
    CorivoError.prototype.toJSON = function () {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
        };
    };
    /** 获取用户友好的错误消息 */
    CorivoError.prototype.getUserMessage = function () {
        return this.message;
    };
    return CorivoError;
}(Error));
exports.CorivoError = CorivoError;
/**
 * 数据库错误
 */
var DatabaseError = /** @class */ (function (_super) {
    __extends(DatabaseError, _super);
    function DatabaseError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'DB_ERROR', message, context) || this;
        _this.name = 'DatabaseError';
        return _this;
    }
    DatabaseError.prototype.getUserMessage = function () {
        if (this.context.cause) {
            return "\u6570\u636E\u5E93\u9519\u8BEF\uFF1A".concat(this.message, "\uFF08\u539F\u56E0\uFF1A").concat(this.context.cause, "\uFF09");
        }
        return "\u6570\u636E\u5E93\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return DatabaseError;
}(CorivoError));
exports.DatabaseError = DatabaseError;
/**
 * 加密错误
 */
var CryptoError = /** @class */ (function (_super) {
    __extends(CryptoError, _super);
    function CryptoError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'CRYPTO_ERROR', message, context) || this;
        _this.name = 'CryptoError';
        return _this;
    }
    CryptoError.prototype.getUserMessage = function () {
        return "\u52A0\u5BC6\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return CryptoError;
}(CorivoError));
exports.CryptoError = CryptoError;
/**
 * CLI 错误
 */
var CLIError = /** @class */ (function (_super) {
    __extends(CLIError, _super);
    function CLIError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'CLI_ERROR', message, context) || this;
        _this.name = 'CLIError';
        return _this;
    }
    CLIError.prototype.getUserMessage = function () {
        return "\u547D\u4EE4\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return CLIError;
}(CorivoError));
exports.CLIError = CLIError;
/**
 * 验证错误
 */
var ValidationError = /** @class */ (function (_super) {
    __extends(ValidationError, _super);
    function ValidationError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'VALIDATION_ERROR', message, context) || this;
        _this.name = 'ValidationError';
        return _this;
    }
    ValidationError.prototype.getUserMessage = function () {
        return "\u9A8C\u8BC1\u5931\u8D25\uFF1A".concat(this.message);
    };
    return ValidationError;
}(CorivoError));
exports.ValidationError = ValidationError;
/**
 * 配置错误
 */
var ConfigError = /** @class */ (function (_super) {
    __extends(ConfigError, _super);
    function ConfigError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'CONFIG_ERROR', message, context) || this;
        _this.name = 'ConfigError';
        return _this;
    }
    ConfigError.prototype.getUserMessage = function () {
        return "\u914D\u7F6E\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return ConfigError;
}(CorivoError));
exports.ConfigError = ConfigError;
/**
 * 文件系统错误
 */
var FileSystemError = /** @class */ (function (_super) {
    __extends(FileSystemError, _super);
    function FileSystemError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'FS_ERROR', message, context) || this;
        _this.name = 'FileSystemError';
        return _this;
    }
    FileSystemError.prototype.getUserMessage = function () {
        return "\u6587\u4EF6\u7CFB\u7EDF\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return FileSystemError;
}(CorivoError));
exports.FileSystemError = FileSystemError;
/**
 * 进程错误
 */
var ProcessError = /** @class */ (function (_super) {
    __extends(ProcessError, _super);
    function ProcessError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'PROCESS_ERROR', message, context) || this;
        _this.name = 'ProcessError';
        return _this;
    }
    ProcessError.prototype.getUserMessage = function () {
        return "\u8FDB\u7A0B\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return ProcessError;
}(CorivoError));
exports.ProcessError = ProcessError;
/**
 * 身份错误
 */
var IdentityError = /** @class */ (function (_super) {
    __extends(IdentityError, _super);
    function IdentityError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'IDENTITY_ERROR', message, context) || this;
        _this.name = 'IdentityError';
        return _this;
    }
    IdentityError.prototype.getUserMessage = function () {
        return "\u8EAB\u4EFD\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return IdentityError;
}(CorivoError));
exports.IdentityError = IdentityError;
/**
 * 指纹错误
 */
var FingerprintError = /** @class */ (function (_super) {
    __extends(FingerprintError, _super);
    function FingerprintError(message, context) {
        if (context === void 0) { context = {}; }
        var _this = _super.call(this, 'FINGERPRINT_ERROR', message, context) || this;
        _this.name = 'FingerprintError';
        return _this;
    }
    FingerprintError.prototype.getUserMessage = function () {
        return "\u6307\u7EB9\u9519\u8BEF\uFF1A".concat(this.message);
    };
    return FingerprintError;
}(CorivoError));
exports.FingerprintError = FingerprintError;
/**
 * 错误码枚举
 */
exports.ERROR_CODES = {
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
};
/**
 * 判断是否为 CorivoError
 */
function isCorivoError(error) {
    return error instanceof CorivoError;
}
/**
 * 包装未知错误为 CorivoError
 */
function wrapError(error, code) {
    if (code === void 0) { code = exports.ERROR_CODES.UNKNOWN; }
    if (error instanceof CorivoError) {
        return error;
    }
    if (error instanceof Error) {
        return new CorivoError(code, error.message, { originalError: error });
    }
    return new CorivoError(code, String(error), { originalValue: error });
}
