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
import type { Block, CreateBlockInput, UpdateBlockInput, BlockFilter, Association, CreateAssociationInput, AssociationFilter, AssociationStats } from '../models/index.js';
/**
 * 数据库配置
 */
interface DatabaseConfig {
    /** 数据库文件路径 */
    path: string;
    /** 数据库密钥 */
    key: Buffer;
    /** 是否启用加密（默认 false） */
    enableEncryption?: boolean;
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
export declare class CorivoDatabase {
    private config;
    private db;
    private static instances;
    private enableEncryption;
    private useSQLCipher;
    private constructor();
    /**
     * 获取数据库实例（单例模式，连接池）
     *
     * 同一路径的数据库只会创建一个实例，后续调用返回缓存的实例。
     * 实例生命周期与进程生命周期一致，调用者无需手动关闭。
     *
     * @param config - 数据库配置
     * @returns 数据库实例（缓存或新建）
     */
    static getInstance(config: DatabaseConfig): CorivoDatabase;
    /**
     * 关闭所有数据库连接
     */
    static closeAll(): void;
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
    private detectAndCleanupStaleLock;
    /**
     * 初始化数据库
     */
    private initialize;
    /**
     * 尝试设置 SQLCipher 加密
     *
     * @returns 是否成功设置 SQLCipher
     */
    private trySetupSQLCipher;
    /**
     * 创建数据库表结构
     */
    private createSchema;
    /**
     * 创建 Block
     *
     * @param input - Block 创建参数
     * @returns 创建的 Block
     */
    createBlock(input: CreateBlockInput): Block;
    /**
     * 获取 Block
     *
     * @param id - Block ID
     * @returns Block 或 null
     */
    getBlock(id: string): Block | null;
    /**
     * 更新 Block
     *
     * @param id - Block ID
     * @param updates - 更新字段
     * @returns 是否更新成功
     */
    updateBlock(id: string, updates: UpdateBlockInput): boolean;
    /**
     * 批量更新 Block（vitality 和 status）
     *
     * 使用事务批量更新，比逐条更新快 10-100 倍
     *
     * @param updates - 要更新的 Block 列表，每项包含 id、vitality 和 status
     * @returns 更新成功的数量
     */
    batchUpdateVitality(updates: Array<{
        id: string;
        vitality: number;
        status: string;
    }>): number;
    /**
     * 删除 Block
     *
     * @param id - Block ID
     * @returns 是否删除成功
     */
    deleteBlock(id: string): boolean;
    /**
     * 创建关联
     *
     * @param input - 关联创建参数
     * @returns 创建的关联
     */
    createAssociation(input: CreateAssociationInput): Association;
    /**
     * 批量创建关联
     *
     * @param associations - 关联列表
     * @returns 创建成功的数量
     */
    batchCreateAssociations(associations: CreateAssociationInput[]): number;
    /**
     * 查询关联
     *
     * @param filter - 查询过滤器
     * @returns 关联列表
     */
    queryAssociations(filter?: AssociationFilter): Association[];
    /**
     * 获取 block 的所有关联（双向）
     *
     * @param blockId - Block ID
     * @param minConfidence - 最低置信度
     * @returns 关联列表
     */
    getBlockAssociations(blockId: string, minConfidence?: number): Association[];
    /**
     * 删除关联
     *
     * @param id - 关联 ID
     * @returns 是否删除成功
     */
    deleteAssociation(id: string): boolean;
    /**
     * 删除 block 的所有关联
     *
     * @param blockId - Block ID
     * @returns 删除的关联数量
     */
    deleteBlockAssociations(blockId: string): number;
    /**
     * 获取关联统计
     *
     * @returns 统计数据
     */
    getAssociationStats(): AssociationStats;
    /**
     * 查询 Blocks
     *
     * @param filter - 查询过滤器
     * @returns Block 数组
     */
    queryBlocks(filter?: BlockFilter): Block[];
    /**
     * 全文搜索 Blocks（使用 FTS5）
     *
     * 使用 FTS5 的 MATCH 运算符进行全文搜索，返回按相关性排序的结果。
     *
     * @param query - 搜索关键词
     * @param limit - 返回数量限制
     * @returns 相关 Block 数组
     */
    searchBlocks(query: string, limit?: number): Block[];
    /**
     * 获取统计信息
     *
     * @returns 统计数据
     */
    getStats(): {
        total: number;
        byStatus: Record<string, number>;
        byAnnotation: Record<string, number>;
    };
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
    };
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
    };
    /**
     * 关闭数据库连接
     *
     * SQLite 会在关闭时自动清理 WAL 文件。
     * 如果进程被 SIGKILL 杀死，WAL 文件可能残留，下次启动时会自动检测并清理。
     */
    close(): void;
    /**
     * 将数据库行转换为 Block 对象
     */
    private rowToBlock;
    /**
     * 将数据库行转换为 Association 对象
     */
    private rowToAssociation;
    /**
     * 获取加密信息（用于状态显示）
     */
    getEncryptionInfo(): {
        enabled: boolean;
        method: 'sqlcipher' | 'application' | 'none';
    };
}
/**
 * 数据库工具函数
 */
/**
 * 获取默认数据库路径
 */
export declare function getDefaultDatabasePath(): string;
/**
 * 获取 PID 文件路径
 */
export declare function getPidFilePath(): string;
/**
 * 获取配置目录路径
 */
export declare function getConfigDir(): string;
export {};
//# sourceMappingURL=database.d.ts.map