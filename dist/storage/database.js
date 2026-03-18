/**
 * 数据库存储层
 *
 * 使用 SQLCipher 提供加密的本地存储，支持 WAL 模式和连接池
 */
import Database from 'better-sqlite3';
import { DatabaseError } from '../errors';
import { generateBlockId } from '../models/block';
/**
 * SQLCipher 数据库封装
 */
export class CorivoDatabase {
    config;
    db;
    static instances = new Map();
    constructor(config) {
        this.config = config;
        this.db = new Database(config.path);
        this.initialize();
    }
    /**
     * 获取数据库实例（单例模式，连接池）
     *
     * @param config - 数据库配置
     * @returns 数据库实例
     */
    static getInstance(config) {
        const key = config.path;
        if (!this.instances.has(key)) {
            this.instances.set(key, new CorivoDatabase(config));
        }
        return this.instances.get(key);
    }
    /**
     * 关闭所有数据库连接
     */
    static closeAll() {
        for (const db of this.instances.values()) {
            db.close();
        }
        this.instances.clear();
    }
    /**
     * 初始化数据库
     */
    initialize() {
        // 设置加密密钥
        try {
            this.db.pragma(`key = "x'${this.config.key.toString('hex')}'"`);
            // 验证密钥
            this.db.pragma('cipher_version');
        }
        catch (error) {
            throw new DatabaseError('数据库密钥错误或数据库损坏', { cause: error });
        }
        // 启用 WAL 模式（支持并发读写）
        this.db.pragma('journal_mode = WAL');
        // 其他配置
        this.db.pragma('foreign_keys = OFF'); // 不使用外键
        this.db.pragma('synchronous = NORMAL'); // 平衡性能和安全
        this.db.pragma('cache_size = -64000'); // 64MB 缓存
        this.db.pragma('temp_store = MEMORY');
        this.createSchema();
    }
    /**
     * 创建数据库表结构
     */
    createSchema() {
        // Blocks 表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        annotation TEXT DEFAULT 'pending',
        refs TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        vitality INTEGER DEFAULT 100,
        status TEXT DEFAULT 'active',
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        pattern TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')))
    `);
        // FTS5 全文搜索表
        this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts
      USING fts5(
        id UNINDEXED,
        content,
        annotation,
        content='blocks',
        content_rowid='rowid'
      )
    `);
        // 触发器：同步到 FTS5
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, id, content, annotation)
        VALUES (new.rowid, new.id, new.content, new.annotation);
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER UPDATE ON blocks BEGIN
        UPDATE blocks_fts SET content = new.content, annotation = new.annotation
        WHERE rowid = new.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_bd AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE rowid = old.rowid;
      END;
    `);
        // 索引
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);
      CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
      CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);
      CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blocks(created_at);
    `);
    }
    /**
     * 创建 Block
     *
     * @param input - Block 创建参数
     * @returns 创建的 Block
     */
    createBlock(input) {
        const id = generateBlockId();
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
      INSERT INTO blocks (
        id, content, annotation, refs, source, vitality, status,
        access_count, last_accessed, pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        try {
            stmt.run(id, input.content, input.annotation || 'pending', JSON.stringify(input.refs || []), input.source || 'manual', input.vitality ?? 100, input.status ?? 'active', input.access_count ?? 0, input.last_accessed ?? null, input.pattern ? JSON.stringify(input.pattern) : null, now, now);
        }
        catch (error) {
            throw new DatabaseError('创建 Block 失败', { cause: error, blockId: id });
        }
        return {
            ...input,
            id,
            created_at: now,
            updated_at: now,
        };
    }
    /**
     * 获取 Block
     *
     * @param id - Block ID
     * @returns Block 或 null
     */
    getBlock(id) {
        const stmt = this.db.prepare('SELECT * FROM blocks WHERE id = ?');
        const row = stmt.get(id);
        if (!row)
            return null;
        return this.rowToBlock(row);
    }
    /**
     * 更新 Block
     *
     * @param id - Block ID
     * @param updates - 更新字段
     * @returns 是否更新成功
     */
    updateBlock(id, updates) {
        const fields = [];
        const values = [];
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
        fields.push('updated_at = ?');
        values.push(Math.floor(Date.now() / 1000));
        values.push(id);
        const stmt = this.db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`);
        try {
            const result = stmt.run(...values);
            return result.changes > 0;
        }
        catch (error) {
            throw new DatabaseError('更新 Block 失败', { cause: error, blockId: id });
        }
    }
    /**
     * 删除 Block
     *
     * @param id - Block ID
     * @returns 是否删除成功
     */
    deleteBlock(id) {
        const stmt = this.db.prepare('DELETE FROM blocks WHERE id = ?');
        try {
            const result = stmt.run(id);
            return result.changes > 0;
        }
        catch (error) {
            throw new DatabaseError('删除 Block 失败', { cause: error, blockId: id });
        }
    }
    /**
     * 查询 Blocks
     *
     * @param filter - 查询过滤器
     * @returns Block 数组
     */
    queryBlocks(filter = {}) {
        const conditions = [];
        const values = [];
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
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = filter.limit ? `LIMIT ${filter.limit}` : '';
        const stmt = this.db.prepare(`
      SELECT * FROM blocks ${whereClause} ORDER BY updated_at DESC ${limitClause}
    `);
        try {
            const rows = stmt.all(...values);
            return rows.map(row => this.rowToBlock(row));
        }
        catch (error) {
            throw new DatabaseError('查询 Blocks 失败', { cause: error });
        }
    }
    /**
     * 全文搜索 Blocks（FTS5）
     *
     * @param query - 搜索关键词
     * @param limit - 返回数量限制
     * @returns 相关 Block 数组
     */
    searchBlocks(query, limit = 10) {
        const stmt = this.db.prepare(`
      SELECT b.* FROM blocks b
      INNER JOIN blocks_fts fts ON b.id = fts.id
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
        try {
            const rows = stmt.all(query, limit);
            return rows.map(row => this.rowToBlock(row));
        }
        catch (error) {
            throw new DatabaseError('全文搜索失败', { cause: error });
        }
    }
    /**
     * 获取统计信息
     *
     * @returns 统计数据
     */
    getStats() {
        // 总数
        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM blocks');
        const { count: total } = totalStmt.get();
        // 按状态分组
        const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM blocks GROUP BY status
    `);
        const statusRows = statusStmt.all();
        const byStatus = {};
        for (const row of statusRows) {
            byStatus[row.status] = row.count;
        }
        // 按标注分组（只取前 5）
        const annotationStmt = this.db.prepare(`
      SELECT annotation, COUNT(*) as count FROM blocks GROUP BY annotation ORDER BY count DESC LIMIT 5
    `);
        const annotationRows = annotationStmt.all();
        const byAnnotation = {};
        for (const row of annotationRows) {
            byAnnotation[row.annotation] = row.count;
        }
        return { total, byStatus, byAnnotation };
    }
    /**
     * 健康检查
     *
     * @returns 健康检查结果
     */
    checkHealth() {
        try {
            // 完整性检查
            const integrity = this.db.pragma('integrity_check');
            // 文件大小
            const info = this.db.pragma('page_size');
            const page_count = this.db.pragma('page_count');
            return {
                ok: integrity === 'ok',
                integrity,
                size: info * page_count,
                path: this.config.path,
            };
        }
        catch (error) {
            return {
                ok: false,
                path: this.config.path,
            };
        }
    }
    /**
     * 关闭数据库连接
     */
    close() {
        this.db.close();
    }
    /**
     * 将数据库行转换为 Block 对象
     */
    rowToBlock(row) {
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
    }
}
/**
 * 数据库工具函数
 */
/**
 * 获取默认数据库路径
 */
export function getDefaultDatabasePath() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return `${home}/.corivo/corivo.db`;
}
/**
 * 获取 PID 文件路径
 */
export function getPidFilePath() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return `${home}/.corivo/heartbeat.pid`;
}
/**
 * 获取配置目录路径
 */
export function getConfigDir() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return `${home}/.corivo`;
}
//# sourceMappingURL=database.js.map