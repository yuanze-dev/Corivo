/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 */
import { CorivoDatabase } from '../storage/database.js';
/**
 * 心跳引擎配置
 */
export interface HeartbeatConfig {
    /** 数据库实例（可选，用于测试） */
    db?: CorivoDatabase;
}
/**
 * 心跳引擎
 */
export declare class Heartbeat {
    private running;
    private db;
    private ruleEngine;
    private timeoutRef;
    private lastHealthCheck;
    private cycleCount;
    private healthFilePath;
    constructor(config?: HeartbeatConfig);
    /**
     * 启动心跳循环
     */
    start(): Promise<void>;
    /**
     * 主循环
     */
    private run;
    /**
     * 停止心跳
     */
    stop(): Promise<void>;
    /**
     * 更新健康检查文件
     *
     * 写入当前时间戳和进程状态，供监控进程检查
     */
    private updateHealthCheck;
    /**
     * 清理健康检查文件
     */
    private cleanupHealthCheck;
    /**
     * 获取健康状态（用于外部查询）
     */
    static getHealthStatus(configDir?: string): Promise<{
        healthy: boolean;
        lastCheck: number | null;
        age: number | null;
    }>;
    /**
     * 运行一次心跳（用于测试）
     *
     * 执行一次完整的 pending 处理和衰减检查
     */
    runOnce(): Promise<void>;
    /**
     * 处理 pending block
     */
    private processPendingBlocks;
    /**
     * 标注 block
     */
    private annotateBlock;
    /**
     * 提取决策模式
     */
    private extractPattern;
    /**
     * 处理衰减（批量更新版本）
     */
    private processVitalityDecay;
    /**
     * 延迟函数
     */
    private sleep;
}
//# sourceMappingURL=heartbeat.d.ts.map