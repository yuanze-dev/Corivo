"use strict";
/**
 * 数据库存储层
 *
 * 使用 SQLCipher 提供加密的本地存储，支持 WAL 模式和连接池
 *
 * ## 加密支持
 *
 * 要启用 SQLCipher 加密，需要在构建 better-sqlite3 时链接 SQLCipher 库：
 *
 * ```bash
 * # 卸载普通版本
 * npm uninstall better-sqlite3
 *
 * # 安装构建依赖
 * npm install --save-dev node-gyp
 *
 * # 安装 SQLCipher (macOS)
 * brew install sqlcipher
 *
 * # 设置环境变量并重新安装
 * export SQLITE3_LIB_DIR=$(brew --prefix sqlcipher)/lib
 * export SQLITE3_INCLUDE_DIR=$(brew --prefix sqlcipher)/include
 * npm install better-sqlite3 --build-from-source
 * ```
 *
 * 如果未使用 SQLCipher 构建，pragma key 语句会被静默忽略，
 * 数据库将以明文存储（用户应依赖文件系统加密如 FileVault）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorivoDatabase = void 0;
exports.getDefaultDatabasePath = getDefaultDatabasePath;
exports.getPidFilePath = getPidFilePath;
exports.getConfigDir = getConfigDir;
// ESM 兼容：使用 createRequire 加载 CommonJS 模块
var node_module_1 = require("node:module");
var require = (0, node_module_1.createRequire)(import.meta.url);
var Database = require('better-sqlite3');
var index_js_1 = require("../errors/index.js");
var block_js_1 = require("../models/block.js");
/**
 * SQLCipher 数据库封装
 *
 * ## 单例生命周期
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────┐
 * │                      CorivoDatabase 单例                      │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  getInstance(path, key)                                       │
 * │       │                                                      │
 * │       ▼                                                      │
 * │  ┌─────────────────┐                                        │
 * │  │ 检查 WAL 锁      │ ◄── 防止未释放的锁导致启动失败           │
 * │  │ (stale lock)    │                                        │
 * │  └────────┬────────┘                                        │
 * │           │                                                  │
 * │           ▼                                                  │
 * │  ┌─────────────────┐                                        │
 * │  │ 创建实例        │   如果路径已存在，返回缓存的实例         │
 * │  │ (缓存于 Map)    │                                        │
 * │  └────────┬────────┘                                        │
 * │           │                                                  │
 * │           ▼                                                  │
 * │  ┌─────────────────┐    实例生命周期 = 进程生命周期           │
 * │  │ initialize()    │    close() 仅在进程退出时调用           │
 * │  │ - WAL 模式      │                                        │
 * │  │ - Schema 创建   │                                        │
 * │  └─────────────────┘                                        │
 * │                                                              │
 * │  closeAll()                                                   │
 * │       │                                                      │
 * │       └── 关闭所有缓存连接，清空 Map                         │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## WAL 锁处理
 *
 * - WAL 模式下，-wal 和 -shm 文件由 SQLite 自动管理
 * - 进程异常退出（SIGKILL）可能导致锁未释放
 * - 启动时检测并清理陈旧的锁文件
 * - 正常关闭时 SQLite 会自动清理 WAL 文件
 */
var CorivoDatabase = /** @class */ (function () {
    function CorivoDatabase(config) {
        this.config = config;
        // 启动前检测并清理陈旧的 WAL 锁
        this.detectAndCleanupStaleLock();
        this.db = new Database(config.path);
        this.initialize();
    }
    /**
     * 获取数据库实例（单例模式，连接池）
     *
     * 同一路径的数据库只会创建一个实例，后续调用返回缓存的实例。
     * 实例生命周期与进程生命周期一致，调用者无需手动关闭。
     *
     * @param config - 数据库配置
     * @returns 数据库实例（缓存或新建）
     */
    CorivoDatabase.getInstance = function (config) {
        var key = config.path;
        if (!this.instances.has(key)) {
            this.instances.set(key, new CorivoDatabase(config));
        }
        return this.instances.get(key);
    };
    /**
     * 关闭所有数据库连接
     */
    CorivoDatabase.closeAll = function () {
        for (var _i = 0, _a = this.instances.values(); _i < _a.length; _i++) {
            var db = _a[_i];
            db.close();
        }
        this.instances.clear();
    };
    /**
     * 检测并清理陈旧的 WAL 锁文件
     *
     * 当进程异常退出（如 SIGKILL）时，WAL 文件可能未被清理。
     * 此方法在启动时检测是否有其他进程持有锁，如果没有则清理陈旧文件。
     *
     * ## 检测逻辑
     * 1. 检查 -wal 和 -shm 文件是否存在
     * 2. 尝试以排他模式打开数据库（SQLite 的锁定机制）
     * 3. 如果成功，说明没有其他进程持有锁，可以安全清理
     * 4. 如果失败，抛出错误让用户处理
     *
     * @throws {DatabaseError} 如果数据库被其他进程锁定
     */
    CorivoDatabase.prototype.detectAndCleanupStaleLock = function () {
        var fs = require('node:fs');
        var path = require('node:path');
        var walPath = "".concat(this.config.path, "-wal");
        var shmPath = "".concat(this.config.path, "-shm");
        // 如果 WAL 文件不存在，无需处理
        if (!fs.existsSync(walPath)) {
            return;
        }
        // 尝试通过 SQLite 检测锁状态
        // better-sqlite3 会在打开时尝试获取锁，如果失败会抛出错误
        try {
            var testDb = new Database(this.config.path, { readonly: true });
            testDb.close();
            // 如果能成功打开，说明没有其他进程持有锁
            // 清理陈旧的 WAL 文件（SQLite 会重新创建）
            fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) {
                fs.unlinkSync(shmPath);
            }
        }
        catch (error) {
            var errorCode = error.code;
            if (errorCode === 'SQLITE_BUSY' || errorCode === 'SQLITE_LOCKED') {
                throw new index_js_1.DatabaseError('数据库被其他进程占用。请检查是否有其他 Corivo 进程正在运行，或手动删除 .wal 文件。', { cause: error });
            }
            // 其他错误（如文件不存在）可以忽略，稍后会重新创建
        }
    };
    /**
     * 初始化数据库
     */
    CorivoDatabase.prototype.initialize = function () {
        // 设置 SQLCipher 加密密钥（如果支持）
        // 必须在任何其他操作之前执行
        // 注意：如果 better-sqlite3 未编译 SQLCipher 支持，这会被静默忽略
        try {
            var hexKey = this.config.key.toString('hex');
            this.db.pragma("key = \"x'".concat(hexKey, "'\""));
            // 验证加密是否工作（如果密钥错误，此处会抛出异常）
            this.db.pragma('cipher_version');
        }
        catch (_a) {
            // 如果不支持 SQLCipher，继续使用普通 SQLite
            // 用户应依赖文件系统加密
        }
        // 启用 WAL 模式（支持并发读写）
        this.db.pragma('journal_mode = WAL');
        // 其他配置
        this.db.pragma('foreign_keys = OFF'); // 不使用外键
        this.db.pragma('synchronous = NORMAL'); // 平衡性能和安全
        this.db.pragma('cache_size = -64000'); // 64MB 缓存
        this.db.pragma('temp_store = MEMORY');
        this.createSchema();
    };
    /**
     * 创建数据库表结构
     */
    CorivoDatabase.prototype.createSchema = function () {
        // Blocks 表（如果已存在则跳过）
        // 使用 sqlite_master 检查表是否已存在
        var tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'").get();
        if (!tableExists) {
            // 新数据库：创建完整结构
            this.db.exec("\n        CREATE TABLE blocks (\n          id TEXT PRIMARY KEY,\n          content TEXT NOT NULL,\n          annotation TEXT DEFAULT 'pending',\n          refs TEXT DEFAULT '[]',\n          source TEXT DEFAULT 'manual',\n          vitality INTEGER DEFAULT 100,\n          status TEXT DEFAULT 'active',\n          access_count INTEGER DEFAULT 0,\n          last_accessed INTEGER,\n          pattern TEXT,\n          created_at INTEGER DEFAULT (strftime('%s', 'now')),\n          updated_at INTEGER DEFAULT (strftime('%s', 'now')))\n      ");
        }
        // FTS5 全文搜索表
        // 使用独立的 FTS5 表（而非 external content）避免虚拟表腐烂问题
        // 数据通过触发器自动同步
        //
        // 迁移逻辑：检测并修复旧版本的外部内容表
        var ftsTable = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='blocks_fts'").get();
        if (ftsTable && ftsTable.sql.includes("content='blocks'")) {
            // 旧版本：外部内容表模式，需要重建
            this.db.exec("DROP TABLE IF EXISTS blocks_fts");
            this.db.exec("DROP TRIGGER IF EXISTS blocks_ai");
            this.db.exec("DROP TRIGGER IF EXISTS blocks_au");
            this.db.exec("DROP TRIGGER IF EXISTS blocks_ad");
        }
        var ftsExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blocks_fts'").get();
        if (!ftsExists) {
            this.db.exec("\n        CREATE VIRTUAL TABLE blocks_fts USING fts5(\n          id UNINDEXED,\n          content,\n          annotation\n        )\n      ");
            // 触发器：INSERT 同步
            this.db.exec("\n        CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN\n          INSERT INTO blocks_fts(id, content, annotation)\n          VALUES (new.id, new.content, new.annotation);\n        END\n      ");
            // 触发器：UPDATE 同步（删除后重新插入，避免 FTS5 腐烂）
            this.db.exec("\n        CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN\n          DELETE FROM blocks_fts WHERE id = old.id;\n          INSERT INTO blocks_fts(id, content, annotation)\n          VALUES (new.id, new.content, new.annotation);\n        END\n      ");
            // 触发器：DELETE 同步
            this.db.exec("\n        CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN\n          DELETE FROM blocks_fts WHERE id = old.id;\n        END\n      ");
            // 重建索引：从现有 blocks 表同步数据
            this.db.exec("\n        INSERT INTO blocks_fts(id, content, annotation)\n        SELECT id, content, annotation FROM blocks\n      ");
        }
        // 索引
        this.db.exec("\n      CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);\n      CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);\n      CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);\n      CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);\n      CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blocks(created_at);\n    ");
    };
    /**
     * 创建 Block
     *
     * @param input - Block 创建参数
     * @returns 创建的 Block
     */
    CorivoDatabase.prototype.createBlock = function (input) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        // 验证内容
        if (!input.content || input.content.trim().length === 0) {
            throw new index_js_1.DatabaseError('Block 内容不能为空');
        }
        // 验证内容长度（限制 1MB）
        if (input.content.length > 1024 * 1024) {
            throw new index_js_1.DatabaseError('Block 内容超出最大长度限制 (1MB)');
        }
        // 验证 refs 格式
        if (input.refs !== undefined) {
            if (!Array.isArray(input.refs)) {
                throw new index_js_1.DatabaseError('refs 必须是数组');
            }
            // 验证每个 ref 都是字符串
            for (var _i = 0, _j = input.refs; _i < _j.length; _i++) {
                var ref = _j[_i];
                if (typeof ref !== 'string') {
                    throw new index_js_1.DatabaseError('refs 中的每个元素必须是字符串');
                }
            }
        }
        // 验证 pattern 格式（如果提供）
        if (input.pattern !== undefined) {
            var pattern = input.pattern;
            // 检查必需字段
            if (typeof pattern !== 'object' || pattern === null) {
                throw new index_js_1.DatabaseError('pattern 必须是对象');
            }
            if (typeof pattern.type !== 'string') {
                throw new index_js_1.DatabaseError('pattern.type 必须是字符串');
            }
            if (typeof pattern.decision !== 'string') {
                throw new index_js_1.DatabaseError('pattern.decision 必须是字符串');
            }
            if (!Array.isArray(pattern.dimensions)) {
                throw new index_js_1.DatabaseError('pattern.dimensions 必须是数组');
            }
            if (!Array.isArray(pattern.context_tags)) {
                throw new index_js_1.DatabaseError('pattern.context_tags 必须是数组');
            }
            if (typeof pattern.confidence !== 'number') {
                throw new index_js_1.DatabaseError('pattern.confidence 必须是数字');
            }
        }
        var id = (0, block_js_1.generateBlockId)();
        var now = Math.floor(Date.now() / 1000);
        var stmt = this.db.prepare("\n      INSERT INTO blocks (\n        id, content, annotation, refs, source, vitality, status,\n        access_count, last_accessed, pattern, created_at, updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ");
        try {
            stmt.run(id, input.content, input.annotation || 'pending', JSON.stringify(input.refs || []), input.source || 'manual', (_a = input.vitality) !== null && _a !== void 0 ? _a : 100, (_b = input.status) !== null && _b !== void 0 ? _b : 'active', (_c = input.access_count) !== null && _c !== void 0 ? _c : 0, (_d = input.last_accessed) !== null && _d !== void 0 ? _d : null, input.pattern ? JSON.stringify(input.pattern) : null, now, now);
        }
        catch (error) {
            throw new index_js_1.DatabaseError('创建 Block 失败', { cause: error, blockId: id });
        }
        // 返回完整的 Block 对象（包含默认值）
        return {
            id: id,
            content: input.content,
            annotation: input.annotation || 'pending',
            refs: input.refs || [],
            source: input.source || 'manual',
            vitality: (_e = input.vitality) !== null && _e !== void 0 ? _e : 100,
            status: (_f = input.status) !== null && _f !== void 0 ? _f : 'active',
            access_count: (_g = input.access_count) !== null && _g !== void 0 ? _g : 0,
            last_accessed: (_h = input.last_accessed) !== null && _h !== void 0 ? _h : null,
            pattern: input.pattern,
            created_at: now,
            updated_at: now,
        };
    };
    /**
     * 获取 Block
     *
     * @param id - Block ID
     * @returns Block 或 null
     */
    CorivoDatabase.prototype.getBlock = function (id) {
        var stmt = this.db.prepare('SELECT * FROM blocks WHERE id = ?');
        var row = stmt.get(id);
        if (!row)
            return null;
        return this.rowToBlock(row);
    };
    /**
     * 更新 Block
     *
     * @param id - Block ID
     * @param updates - 更新字段
     * @returns 是否更新成功
     */
    CorivoDatabase.prototype.updateBlock = function (id, updates) {
        var fields = [];
        var values = [];
        if (updates.content !== undefined) {
            fields.push('content = ?');
            values.push(updates.content);
        }
        if (updates.annotation !== undefined) {
            fields.push('annotation = ?');
            values.push(updates.annotation);
        }
        if (updates.vitality !== undefined) {
            fields.push('vitality = ?');
            values.push(updates.vitality);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.access_count !== undefined) {
            fields.push('access_count = ?');
            values.push(updates.access_count);
        }
        if (updates.last_accessed !== undefined) {
            fields.push('last_accessed = ?');
            values.push(updates.last_accessed);
        }
        if (updates.pattern !== undefined) {
            fields.push('pattern = ?');
            values.push(updates.pattern ? JSON.stringify(updates.pattern) : null);
        }
        if (updates.updated_at !== undefined) {
            fields.push('updated_at = ?');
            values.push(updates.updated_at);
        }
        else {
            // 默认自动更新时间戳（生产环境行为）
            fields.push('updated_at = ?');
            values.push(Math.floor(Date.now() / 1000));
        }
        if (updates.created_at !== undefined) {
            fields.push('created_at = ?');
            values.push(updates.created_at);
        }
        values.push(id);
        var stmt = this.db.prepare("UPDATE blocks SET ".concat(fields.join(', '), " WHERE id = ?"));
        try {
            var result = stmt.run.apply(stmt, values);
            return result.changes > 0;
        }
        catch (error) {
            throw new index_js_1.DatabaseError('更新 Block 失败', { cause: error, blockId: id });
        }
    };
    /**
     * 批量更新 Block（vitality 和 status）
     *
     * 使用事务批量更新，比逐条更新快 10-100 倍
     *
     * @param updates - 要更新的 Block 列表，每项包含 id、vitality 和 status
     * @returns 更新成功的数量
     */
    CorivoDatabase.prototype.batchUpdateVitality = function (updates) {
        var _this = this;
        if (updates.length === 0)
            return 0;
        var now = Math.floor(Date.now() / 1000);
        var updatedCount = 0;
        // 使用事务加速批量更新
        var transaction = this.db.transaction(function () {
            var stmt = _this.db.prepare("\n        UPDATE blocks\n        SET vitality = ?, status = ?, updated_at = ?\n        WHERE id = ?\n      ");
            for (var _i = 0, updates_1 = updates; _i < updates_1.length; _i++) {
                var update = updates_1[_i];
                try {
                    var result = stmt.run(update.vitality, update.status, now, update.id);
                    updatedCount += result.changes;
                }
                catch (error) {
                    // 单个更新失败不影响其他更新
                    console.error("\u6279\u91CF\u66F4\u65B0\u5931\u8D25 ".concat(update.id, ":"), error);
                }
            }
        });
        try {
            transaction();
            return updatedCount;
        }
        catch (error) {
            throw new index_js_1.DatabaseError('批量更新 Block 失败', { cause: error });
        }
    };
    /**
     * 删除 Block
     *
     * @param id - Block ID
     * @returns 是否删除成功
     */
    CorivoDatabase.prototype.deleteBlock = function (id) {
        var stmt = this.db.prepare('DELETE FROM blocks WHERE id = ?');
        try {
            var result = stmt.run(id);
            return result.changes > 0;
        }
        catch (error) {
            throw new index_js_1.DatabaseError('删除 Block 失败', { cause: error, blockId: id });
        }
    };
    /**
     * 查询 Blocks
     *
     * @param filter - 查询过滤器
     * @returns Block 数组
     */
    CorivoDatabase.prototype.queryBlocks = function (filter) {
        var _this = this;
        if (filter === void 0) { filter = {}; }
        var conditions = [];
        var values = [];
        if (filter.annotation) {
            conditions.push('annotation = ?');
            values.push(filter.annotation);
        }
        if (filter.status) {
            conditions.push('status = ?');
            values.push(filter.status);
        }
        if (filter.minVitality !== undefined) {
            conditions.push('vitality >= ?');
            values.push(filter.minVitality);
        }
        var whereClause = conditions.length > 0 ? "WHERE ".concat(conditions.join(' AND ')) : '';
        // 验证 limit 范围，防止极端值
        var limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
        var limitClause = limit ? "LIMIT ".concat(limit) : '';
        var stmt = this.db.prepare("\n      SELECT * FROM blocks ".concat(whereClause, " ORDER BY updated_at DESC ").concat(limitClause, "\n    "));
        try {
            var rows = stmt.all.apply(stmt, values);
            return rows.map(function (row) { return _this.rowToBlock(row); });
        }
        catch (error) {
            throw new index_js_1.DatabaseError('查询 Blocks 失败', { cause: error });
        }
    };
    /**
     * 全文搜索 Blocks（使用 FTS5）
     *
     * 使用 FTS5 的 MATCH 运算符进行全文搜索，返回按相关性排序的结果。
     *
     * @param query - 搜索关键词
     * @param limit - 返回数量限制
     * @returns 相关 Block 数组
     */
    CorivoDatabase.prototype.searchBlocks = function (query, limit) {
        var _this = this;
        if (limit === void 0) { limit = 10; }
        // 空查询返回所有结果
        if (!query || query.trim() === '') {
            return this.queryBlocks({ limit: limit });
        }
        // 先尝试 FTS5 全文搜索
        var ftsStmt = this.db.prepare("\n      SELECT b.* FROM blocks b\n      INNER JOIN blocks_fts fts ON b.id = fts.id\n      WHERE blocks_fts MATCH ?\n      ORDER BY rank\n      LIMIT ?\n    ");
        try {
            // 转义查询字符串中的特殊字符
            var escapedQuery = query.replace(/["']/g, '');
            var rows_1 = ftsStmt.all(escapedQuery, limit);
            // FTS5 返回结果，直接返回
            if (rows_1.length > 0) {
                return rows_1.map(function (row) { return _this.rowToBlock(row); });
            }
        }
        catch (error) {
            // FTS5 查询失败，忽略错误，继续使用备用搜索
        }
        // FTS5 无结果或失败时，使用 LIKE 备用搜索
        // 这对中文搜索特别有用，因为 FTS5 对中文分词支持不佳
        var likeStmt = this.db.prepare("\n      SELECT * FROM blocks\n      WHERE content LIKE ? OR annotation LIKE ?\n      ORDER BY updated_at DESC\n      LIMIT ?\n    ");
        var likePattern = "%".concat(query, "%");
        var rows = likeStmt.all(likePattern, likePattern, limit);
        return rows.map(function (row) { return _this.rowToBlock(row); });
    };
    /**
     * 获取统计信息
     *
     * @returns 统计数据
     */
    CorivoDatabase.prototype.getStats = function () {
        // 总数
        var totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM blocks');
        var total = totalStmt.get().count;
        // 按状态分组
        var statusStmt = this.db.prepare("\n      SELECT status, COUNT(*) as count FROM blocks GROUP BY status\n    ");
        var statusRows = statusStmt.all();
        var byStatus = {};
        for (var _i = 0, statusRows_1 = statusRows; _i < statusRows_1.length; _i++) {
            var row = statusRows_1[_i];
            byStatus[row.status] = row.count;
        }
        // 按标注分组（只取前 5）
        var annotationStmt = this.db.prepare("\n      SELECT annotation, COUNT(*) as count FROM blocks GROUP BY annotation ORDER BY count DESC LIMIT 5\n    ");
        var annotationRows = annotationStmt.all();
        var byAnnotation = {};
        for (var _a = 0, annotationRows_1 = annotationRows; _a < annotationRows_1.length; _a++) {
            var row = annotationRows_1[_a];
            byAnnotation[row.annotation] = row.count;
        }
        return { total: total, byStatus: byStatus, byAnnotation: byAnnotation };
    };
    /**
     * 获取状态分布（用于上下文推送）
     *
     * 使用 SQL GROUP BY 在数据库层面聚合，避免读取全部数据到内存
     *
     * @returns 各状态的 block 数量
     */
    CorivoDatabase.prototype.getStatusBreakdown = function () {
        // 单条 SQL 完成全部聚合
        var stmt = this.db.prepare("\n      SELECT\n        COUNT(*) as total,\n        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,\n        SUM(CASE WHEN status = 'cooling' THEN 1 ELSE 0 END) as cooling,\n        SUM(CASE WHEN status = 'cold' THEN 1 ELSE 0 END) as cold,\n        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived\n      FROM blocks\n    ");
        var row = stmt.get();
        // SQLite 返回的 SUM 可能是 null（当没有记录时）
        return {
            total: row.total || 0,
            active: row.active || 0,
            cooling: row.cooling || 0,
            cold: row.cold || 0,
            archived: row.archived || 0,
        };
    };
    /**
     * 健康检查
     *
     * @returns 健康检查结果
     */
    CorivoDatabase.prototype.checkHealth = function () {
        try {
            // 完整性检查
            var integrityResult = this.db.pragma('integrity_check');
            // integrity_check 返回 [{ integrity_check: 'ok' }] 或类似结构
            var ok = Array.isArray(integrityResult)
                ? integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok'
                : String(integrityResult) === 'ok';
            // 文件大小 - pragma 返回值可能是数组或直接值
            var pageSizeResult = this.db.pragma('page_size');
            var pageCountResult = this.db.pragma('page_count');
            var pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
            var pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;
            var size = (pageSize || 0) * (pageCount || 0);
            // 获取 block 数量
            var count = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get();
            return {
                ok: ok,
                integrity: ok ? 'ok' : String(integrityResult),
                size: size,
                path: this.config.path,
                blockCount: count.count,
            };
        }
        catch (error) {
            return {
                ok: false,
                path: this.config.path,
            };
        }
    };
    /**
     * 关闭数据库连接
     *
     * SQLite 会在关闭时自动清理 WAL 文件。
     * 如果进程被 SIGKILL 杀死，WAL 文件可能残留，下次启动时会自动检测并清理。
     */
    CorivoDatabase.prototype.close = function () {
        this.db.close();
    };
    /**
     * 将数据库行转换为 Block 对象
     */
    CorivoDatabase.prototype.rowToBlock = function (row) {
        return {
            id: row.id,
            content: row.content,
            annotation: row.annotation,
            refs: JSON.parse(row.refs || '[]'),
            source: row.source,
            vitality: row.vitality,
            status: row.status,
            access_count: row.access_count,
            last_accessed: row.last_accessed,
            pattern: row.pattern ? JSON.parse(row.pattern) : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    };
    CorivoDatabase.instances = new Map();
    return CorivoDatabase;
}());
exports.CorivoDatabase = CorivoDatabase;
/**
 * 数据库工具函数
 */
/**
 * 获取默认数据库路径
 */
function getDefaultDatabasePath() {
    var home = process.env.HOME || process.env.USERPROFILE || '.';
    return "".concat(home, "/.corivo/corivo.db");
}
/**
 * 获取 PID 文件路径
 */
function getPidFilePath() {
    var home = process.env.HOME || process.env.USERPROFILE || '.';
    return "".concat(home, "/.corivo/heartbeat.pid");
}
/**
 * 获取配置目录路径
 */
function getConfigDir() {
    var home = process.env.HOME || process.env.USERPROFILE || '.';
    return "".concat(home, "/.corivo");
}
