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
     * 处理衰减
     */
    private processVitalityDecay;
    /**
     * 生命力转状态
     */
    private vitalityToStatus;
    /**
     * 延迟函数
     */
    private sleep;
}
//# sourceMappingURL=heartbeat.d.ts.map