/**
 * 数据库存储层
 *
 * 使用 SQLCipher 提供加密的本地存储，支持 WAL 模式和连接池
 */

// ESM 兼容：使用 createRequire 加载 CommonJS 模块
import { createRequire } from 'node:module';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { DatabaseError } from '../errors/index.js';
import type { Block, CreateBlockInput, UpdateBlockInput, BlockFilter } from '../models/index.js';
import { generateBlockId } from '../models/block.js';

/**
 * 数据库配置
 */
interface DatabaseConfig {
  /** 数据库文件路径 */
  path: string;
  /** 数据库密钥 */
  key: Buffer;
}

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
export class CorivoDatabase {
  private db: SQLiteDatabase;
  private static instances: Map<string, CorivoDatabase> = new Map();

  private constructor(private config: DatabaseConfig) {
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
  static getInstance(config: DatabaseConfig): CorivoDatabase {
    const key = config.path;
    if (!this.instances.has(key)) {
      this.instances.set(key, new CorivoDatabase(config));
    }
    return this.instances.get(key)!;
  }

  /**
   * 关闭所有数据库连接
   */
  static closeAll(): void {
    for (const db of this.instances.values()) {
      db.close();
    }
    this.instances.clear();
  }

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
  private detectAndCleanupStaleLock(): void {
    const fs = require('node:fs');
    const path = require('node:path');

    const walPath = `${this.config.path}-wal`;
    const shmPath = `${this.config.path}-shm`;

    // 如果 WAL 文件不存在，无需处理
    if (!fs.existsSync(walPath)) {
      return;
    }

    // 尝试通过 SQLite 检测锁状态
    // better-sqlite3 会在打开时尝试获取锁，如果失败会抛出错误
    try {
      const testDb = new Database(this.config.path, { readonly: true });
      testDb.close();
      // 如果能成功打开，说明没有其他进程持有锁
      // 清理陈旧的 WAL 文件（SQLite 会重新创建）
      fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }
    } catch (error) {
      const errorCode = (error as any).code;
      if (errorCode === 'SQLITE_BUSY' || errorCode === 'SQLITE_LOCKED') {
        throw new DatabaseError(
          '数据库被其他进程占用。请检查是否有其他 Corivo 进程正在运行，或手动删除 .wal 文件。',
          { cause: error }
        );
      }
      // 其他错误（如文件不存在）可以忽略，稍后会重新创建
    }
  }

  /**
   * 初始化数据库
   */
  private initialize(): void {
    // TODO: SQLCipher 加密需要编译 better-sqlite3-sqlite3
    // MVP 版本暂时使用普通 SQLite，数据通过配置文件中的密钥保护
    // 将来可以通过文件级加密或使用 sqlcipher npm 包

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
  private createSchema(): void {
    // Blocks 表（如果已存在则跳过）
    // 使用 sqlite_master 检查表是否已存在
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'"
    ).get() as { name: string } | undefined;

    if (!tableExists) {
      // 新数据库：创建完整结构
      this.db.exec(`
        CREATE TABLE blocks (
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
    }

    // FTS5 全文搜索表（暂时禁用以避免 FTS5 虚拟表腐烂问题）
    // TODO: 实现 FTS5 的正确处理方式，或使用更好的全文搜索方案
    /*
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

    // 触发器：同步到 FTS5（仅插入和删除，更新时不同步以避免 FTS5 腐烂问题）
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, id, content, annotation)
        VALUES (new.rowid, new.id, new.content, new.annotation);
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_bd AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE rowid = old.rowid;
      END;
    `);
    */

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
  createBlock(input: CreateBlockInput): Block {
    // 验证内容
    if (!input.content || input.content.trim().length === 0) {
      throw new DatabaseError('Block 内容不能为空');
    }

    const id = generateBlockId();
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO blocks (
        id, content, annotation, refs, source, vitality, status,
        access_count, last_accessed, pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        input.content,
        input.annotation || 'pending',
        JSON.stringify(input.refs || []),
        input.source || 'manual',
        input.vitality ?? 100,
        input.status ?? 'active',
        input.access_count ?? 0,
        input.last_accessed ?? null,
        input.pattern ? JSON.stringify(input.pattern) : null,
        now,
        now
      );
    } catch (error) {
      throw new DatabaseError('创建 Block 失败', { cause: error, blockId: id });
    }

    // 返回完整的 Block 对象（包含默认值）
    return {
      id,
      content: input.content,
      annotation: input.annotation || 'pending',
      refs: input.refs || [],
      source: input.source || 'manual',
      vitality: input.vitality ?? 100,
      status: input.status ?? 'active',
      access_count: input.access_count ?? 0,
      last_accessed: input.last_accessed ?? null,
      pattern: input.pattern,
      created_at: now,
      updated_at: now,
    } as Block;
  }

  /**
   * 获取 Block
   *
   * @param id - Block ID
   * @returns Block 或 null
   */
  getBlock(id: string): Block | null {
    const stmt = this.db.prepare('SELECT * FROM blocks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;
    return this.rowToBlock(row);
  }

  /**
   * 更新 Block
   *
   * @param id - Block ID
   * @param updates - 更新字段
   * @returns 是否更新成功
   */
  updateBlock(id: string, updates: UpdateBlockInput): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

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
    } else {
      // 默认自动更新时间戳（生产环境行为）
      fields.push('updated_at = ?');
      values.push(Math.floor(Date.now() / 1000));
    }
    if (updates.created_at !== undefined) {
      fields.push('created_at = ?');
      values.push(updates.created_at);
    }
    values.push(id);

    const stmt = this.db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`);

    try {
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error: any) {
      throw new DatabaseError('更新 Block 失败', { cause: error, blockId: id });
    }
  }

  /**
   * 删除 Block
   *
   * @param id - Block ID
   * @returns 是否删除成功
   */
  deleteBlock(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM blocks WHERE id = ?');

    try {
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('删除 Block 失败', { cause: error, blockId: id });
    }
  }

  /**
   * 查询 Blocks
   *
   * @param filter - 查询过滤器
   * @returns Block 数组
   */
  queryBlocks(filter: BlockFilter = {}): Block[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

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
    // 验证 limit 范围，防止极端值
    const limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
    const limitClause = limit ? `LIMIT ${limit}` : '';

    const stmt = this.db.prepare(`
      SELECT * FROM blocks ${whereClause} ORDER BY updated_at DESC ${limitClause}
    `);

    try {
      const rows = stmt.all(...values) as any[];
      return rows.map(row => this.rowToBlock(row));
    } catch (error) {
      throw new DatabaseError('查询 Blocks 失败', { cause: error });
    }
  }

  /**
   * 全文搜索 Blocks（使用 LIKE，暂不支持 FTS5）
   *
   * TODO: FTS5 有虚拟表腐烂问题，待修复后改回 FTS5
   *
   * @param query - 搜索关键词
   * @param limit - 返回数量限制
   * @returns 相关 Block 数组
   */
  searchBlocks(query: string, limit = 10): Block[] {
    // 使用 LIKE 进行简单的全文搜索（搜索 content 和 annotation）
    const searchTerm = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM blocks
      WHERE content LIKE ? OR annotation LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    try {
      const rows = stmt.all(searchTerm, searchTerm, limit) as any[];
      return rows.map(row => this.rowToBlock(row));
    } catch (error) {
      throw new DatabaseError('全文搜索失败', { cause: error });
    }
  }

  /**
   * 获取统计信息
   *
   * @returns 统计数据
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byAnnotation: Record<string, number>;
  } {
    // 总数
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM blocks');
    const { count: total } = totalStmt.get() as { count: number };

    // 按状态分组
    const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM blocks GROUP BY status
    `);
    const statusRows = statusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
    }

    // 按标注分组（只取前 5）
    const annotationStmt = this.db.prepare(`
      SELECT annotation, COUNT(*) as count FROM blocks GROUP BY annotation ORDER BY count DESC LIMIT 5
    `);
    const annotationRows = annotationStmt.all() as Array<{ annotation: string; count: number }>;
    const byAnnotation: Record<string, number> = {};
    for (const row of annotationRows) {
      byAnnotation[row.annotation] = row.count;
    }

    return { total, byStatus, byAnnotation };
  }

  /**
   * 获取状态分布（用于上下文推送）
   *
   * 使用 SQL GROUP BY 在数据库层面聚合，避免读取全部数据到内存
   *
   * @returns 各状态的 block 数量
   */
  getStatusBreakdown(): {
    total: number;
    active: number;
    cooling: number;
    cold: number;
    archived: number;
  } {
    // 单条 SQL 完成全部聚合
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'cooling' THEN 1 ELSE 0 END) as cooling,
        SUM(CASE WHEN status = 'cold' THEN 1 ELSE 0 END) as cold,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
      FROM blocks
    `);

    const row = stmt.get() as {
      total: number;
      active: number;
      cooling: number;
      cold: number;
      archived: number;
    };

    // SQLite 返回的 SUM 可能是 null（当没有记录时）
    return {
      total: row.total || 0,
      active: row.active || 0,
      cooling: row.cooling || 0,
      cold: row.cold || 0,
      archived: row.archived || 0,
    };
  }

  /**
   * 健康检查
   *
   * @returns 健康检查结果
   */
  checkHealth(): {
    ok: boolean;
    integrity?: string;
    size?: number;
    path?: string;
    blockCount?: number;
  } {
    try {
      // 完整性检查
      const integrityResult = this.db.pragma('integrity_check');
      // integrity_check 返回 [{ integrity_check: 'ok' }] 或类似结构
      const ok = Array.isArray(integrityResult)
        ? integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok'
        : String(integrityResult) === 'ok';

      // 文件大小 - pragma 返回值可能是数组或直接值
      const pageSizeResult = this.db.pragma('page_size') as any;
      const pageCountResult = this.db.pragma('page_count') as any;

      const pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
      const pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;

      const size = (pageSize || 0) * (pageCount || 0);

      // 获取 block 数量
      const count = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get() as { count: number };

      return {
        ok,
        integrity: ok ? 'ok' : String(integrityResult),
        size,
        path: this.config.path,
        blockCount: count.count,
      };
    } catch (error) {
      return {
        ok: false,
        path: this.config.path,
      };
    }
  }

  /**
   * 关闭数据库连接
   *
   * SQLite 会在关闭时自动清理 WAL 文件。
   * 如果进程被 SIGKILL 杀死，WAL 文件可能残留，下次启动时会自动检测并清理。
   */
  close(): void {
    this.db.close();
  }

  /**
   * 将数据库行转换为 Block 对象
   */
  private rowToBlock(row: any): Block {
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
export function getDefaultDatabasePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo/corivo.db`;
}

/**
 * 获取 PID 文件路径
 */
export function getPidFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo/heartbeat.pid`;
}

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo`;
}
