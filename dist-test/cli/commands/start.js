"use strict";
/**
 * CLI 命令 - start
 *
 * 启动心跳守护进程（无需密码，基于平台指纹认证）
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCommand = startCommand;
exports.startWatchCommand = startWatchCommand;
var promises_1 = __importDefault(require("node:fs/promises"));
var node_child_process_1 = require("node:child_process");
var node_path_1 = __importDefault(require("node:path"));
var database_js_1 = require("../../storage/database.js");
var index_js_1 = require("../../errors/index.js");
var MAX_RESTART_ATTEMPTS = 3;
var RESTART_DELAY = 5000; // 5 秒
function startCommand() {
    return __awaiter(this, void 0, void 0, function () {
        var configDir, configPath, config, content, _a, dbKey, pidPath, existingPid, pid_1, _b, _c, pid, childPid;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    configDir = (0, database_js_1.getConfigDir)();
                    configPath = node_path_1.default.join(configDir, 'config.json');
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, promises_1.default.readFile(configPath, 'utf-8')];
                case 2:
                    content = _d.sent();
                    config = JSON.parse(content);
                    return [3 /*break*/, 4];
                case 3:
                    _a = _d.sent();
                    throw new index_js_1.ConfigError('Corivo 未初始化。请先运行: corivo init');
                case 4:
                    dbKey = config.db_key;
                    // 如果是旧格式（有 encrypted_db_key 但没有 db_key），提示用户重新初始化
                    if (!dbKey && config.encrypted_db_key) {
                        console.log('⚠️  检测到旧版配置格式（需要密码）');
                        console.log('');
                        console.log('Corivo v0.10+ 已移除密码系统，改为基于平台指纹认证。');
                        console.log('请按以下步骤迁移：');
                        console.log('');
                        console.log('  1. 备份数据库：cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup');
                        console.log('  2. 重新初始化：corivo init');
                        console.log('  3. 恢复数据：cp ~/.corivo/corivo.db.backup ~/.corivo/corivo.db');
                        console.log('');
                        console.log('或者直接删除旧配置重新开始：');
                        console.log('  rm ~/.corivo/config.json && corivo init');
                        return [2 /*return*/];
                    }
                    if (!dbKey) {
                        throw new index_js_1.ConfigError('配置文件无效：缺少 db_key');
                    }
                    pidPath = (0, database_js_1.getPidFilePath)();
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, 11, , 12]);
                    return [4 /*yield*/, promises_1.default.readFile(pidPath, 'utf-8')];
                case 6:
                    existingPid = _d.sent();
                    pid_1 = parseInt(existingPid);
                    _d.label = 7;
                case 7:
                    _d.trys.push([7, 8, , 10]);
                    process.kill(pid_1, 0);
                    throw new index_js_1.ProcessError('心跳进程已在运行', { pid: pid_1 });
                case 8:
                    _b = _d.sent();
                    // 进程不存在，删除旧的 PID 文件
                    return [4 /*yield*/, promises_1.default.unlink(pidPath)];
                case 9:
                    // 进程不存在，删除旧的 PID 文件
                    _d.sent();
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 12];
                case 11:
                    _c = _d.sent();
                    return [3 /*break*/, 12];
                case 12:
                    console.log('正在启动心跳守护进程...');
                    pid = (0, node_child_process_1.spawn)(process.execPath, ['./dist/engine/heartbeat.js'], {
                        cwd: process.cwd(),
                        detached: true,
                        stdio: 'ignore',
                        env: __assign(__assign({}, process.env), { CORIVO_DB_PATH: (0, database_js_1.getDefaultDatabasePath)(), CORIVO_CONFIG_DIR: configDir, CORIVO_DB_KEY: dbKey, NODE_ENV: 'production' }),
                    });
                    pid.unref();
                    childPid = pid.pid;
                    if (!childPid) {
                        throw new index_js_1.ProcessError('启动心跳进程失败：无法获取 PID');
                    }
                    return [4 /*yield*/, promises_1.default.writeFile(pidPath, childPid.toString())];
                case 13:
                    _d.sent();
                    console.log("\u2705 \u5FC3\u8DF3\u5B88\u62A4\u8FDB\u7A0B\u5DF2\u542F\u52A8 (PID: ".concat(childPid, ")"));
                    console.log('\n提示: 心跳进程会自动处理待标注的 block 和执行衰减');
                    console.log('如需启用自动重启功能，请使用: corivo start --watch');
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 启动心跳守护进程（带监控模式）
 */
function startWatchCommand() {
    return __awaiter(this, void 0, void 0, function () {
        var configDir, configPath, config, content, _a, dbKey, restartCount, childPid, exitCode;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    configDir = (0, database_js_1.getConfigDir)();
                    configPath = node_path_1.default.join(configDir, 'config.json');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, promises_1.default.readFile(configPath, 'utf-8')];
                case 2:
                    content = _b.sent();
                    config = JSON.parse(content);
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    throw new index_js_1.ConfigError('Corivo 未初始化。请先运行: corivo init');
                case 4:
                    dbKey = config.db_key || config.encrypted_db_key;
                    if (!dbKey) {
                        throw new index_js_1.ConfigError('配置文件无效：缺少 db_key');
                    }
                    console.log('正在启动心跳守护进程（监控模式）...');
                    console.log('监控模式会在心跳进程崩溃时自动重启\n');
                    restartCount = 0;
                    _b.label = 5;
                case 5:
                    if (!(restartCount < MAX_RESTART_ATTEMPTS)) return [3 /*break*/, 11];
                    return [4 /*yield*/, spawnHeartbeat(configDir, dbKey)];
                case 6:
                    childPid = _b.sent();
                    return [4 /*yield*/, waitForExit(childPid)];
                case 7:
                    exitCode = _b.sent();
                    if (exitCode === 0) {
                        // 正常退出
                        console.log('心跳进程已正常退出');
                        return [3 /*break*/, 11];
                    }
                    // 异常退出，尝试重启
                    restartCount++;
                    if (!(restartCount < MAX_RESTART_ATTEMPTS)) return [3 /*break*/, 9];
                    console.log("\n\u26A0\uFE0F  \u5FC3\u8DF3\u8FDB\u7A0B\u5F02\u5E38\u9000\u51FA (\u4EE3\u7801: ".concat(exitCode, ")"));
                    console.log("\u5C06\u5728 ".concat(RESTART_DELAY / 1000, " \u79D2\u540E\u91CD\u542F (").concat(restartCount, "/").concat(MAX_RESTART_ATTEMPTS, ")..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, RESTART_DELAY); })];
                case 8:
                    _b.sent();
                    console.log('正在重启...\n');
                    return [3 /*break*/, 10];
                case 9:
                    console.log("\n\u274C \u5FC3\u8DF3\u8FDB\u7A0B\u5728 ".concat(MAX_RESTART_ATTEMPTS, " \u6B21\u5C1D\u8BD5\u540E\u4ECD\u65E0\u6CD5\u7A33\u5B9A\u8FD0\u884C"));
                    console.log('请检查日志并手动重启');
                    process.exit(1);
                    _b.label = 10;
                case 10: return [3 /*break*/, 5];
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * 生成心跳子进程
 */
function spawnHeartbeat(configDir, dbKey) {
    return __awaiter(this, void 0, void 0, function () {
        var pidPath, existingPid, pid_2, _a, _b, pid, childPid;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    pidPath = (0, database_js_1.getPidFilePath)();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, promises_1.default.readFile(pidPath, 'utf-8')];
                case 2:
                    existingPid = _c.sent();
                    pid_2 = parseInt(existingPid);
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 4, , 6]);
                    process.kill(pid_2, 0);
                    throw new index_js_1.ProcessError('心跳进程已在运行', { pid: pid_2 });
                case 4:
                    _a = _c.sent();
                    // 进程不存在，删除旧的 PID 文件
                    return [4 /*yield*/, promises_1.default.unlink(pidPath)];
                case 5:
                    // 进程不存在，删除旧的 PID 文件
                    _c.sent();
                    return [3 /*break*/, 6];
                case 6: return [3 /*break*/, 8];
                case 7:
                    _b = _c.sent();
                    return [3 /*break*/, 8];
                case 8:
                    pid = (0, node_child_process_1.spawn)(process.execPath, ['./dist/engine/heartbeat.js'], {
                        cwd: process.cwd(),
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        env: __assign(__assign({}, process.env), { CORIVO_DB_PATH: (0, database_js_1.getDefaultDatabasePath)(), CORIVO_CONFIG_DIR: configDir, CORIVO_DB_KEY: dbKey, NODE_ENV: 'production' }),
                    });
                    // 监听子进程输出
                    if (pid.stdout) {
                        pid.stdout.on('data', function (data) {
                            console.log(data.toString().trim());
                        });
                    }
                    if (pid.stderr) {
                        pid.stderr.on('data', function (data) {
                            console.error(data.toString().trim());
                        });
                    }
                    childPid = pid.pid;
                    if (!childPid) {
                        throw new index_js_1.ProcessError('启动心跳进程失败：无法获取 PID');
                    }
                    return [4 /*yield*/, promises_1.default.writeFile(pidPath, childPid.toString())];
                case 9:
                    _c.sent();
                    return [2 /*return*/, childPid];
            }
        });
    });
}
/**
 * 等待子进程退出
 */
function waitForExit(childPid) {
    return new Promise(function (resolve) {
        // 检查进程是否还在运行
        var checkInterval = setInterval(function () {
            try {
                process.kill(childPid, 0);
                // 进程还在运行，继续等待
            }
            catch (_a) {
                // 进程已退出
                clearInterval(checkInterval);
                resolve(null);
            }
        }, 1000);
        // 也监听 SIGTERM 以便优雅退出
        process.once('SIGTERM', function () {
            clearInterval(checkInterval);
            try {
                process.kill(childPid, 'SIGTERM');
            }
            catch (_a) { }
            resolve(null);
        });
        process.once('SIGINT', function () {
            clearInterval(checkInterval);
            try {
                process.kill(childPid, 'SIGTERM');
            }
            catch (_a) { }
            console.log('\n收到退出信号，正在停止监控...');
            resolve(0);
        });
    });
}
