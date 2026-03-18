/**
 * 数据库存储层
 *
 * 使用 SQLCipher 提供加密的本地存储，支持 WAL 模式和连接池
 */
import type { Block, CreateBlockInput, UpdateBlockInput, BlockFilter } from '../models';
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
 */
export declare class CorivoDatabase {
    private config;
    private db;
    private static instances;
    private constructor();
    /**
     * 获取数据库实例（单例模式，连接池）
     *
     * @param config - 数据库配置
     * @returns 数据库实例
     */
    static getInstance(config: DatabaseConfig): CorivoDatabase;
    /**
     * 关闭所有数据库连接
     */
    static closeAll(): void;
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
     * 全文搜索 Blocks（FTS5）
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
     * 健康检查
     *
     * @returns 健康检查结果
     */
    checkHealth(): {
        ok: boolean;
        integrity?: string;
        size?: number;
        path?: string;
    };
    /**
     * 关闭数据库连接
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