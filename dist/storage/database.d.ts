/**
 * 数据库存储层
 *
 * 使用 SQLCipher 提供加密的本地存储，支持 WAL 模式和连接池
 */
import type { Block, CreateBlockInput, UpdateBlockInput, BlockFilter } from '../models/index.js';
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
export declare class CorivoDatabase {
    private config;
    private db;
    private static instances;
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
     * 删除 Block
     *
     * @param id - Block ID
     * @returns 是否删除成功
     */
    deleteBlock(id: string): boolean;
    /**
     * 查询 Blocks
     *
     * @param filter - 查询过滤器
     * @returns Block 数组
     */
    queryBlocks(filter?: BlockFilter): Block[];
    /**
     * 全文搜索 Blocks（使用 LIKE，暂不支持 FTS5）
     *
     * TODO: FTS5 有虚拟表腐烂问题，待修复后改回 FTS5
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