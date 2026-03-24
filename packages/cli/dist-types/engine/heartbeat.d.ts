/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 * 无需密码，基于平台指纹认证
 */
import { CorivoDatabase } from '../storage/database.js';
import type { IngestorPlugin } from '../ingestors/types.js';
/**
 * 心跳引擎配置
 */
export interface HeartbeatConfig {
    /** 数据库实例（可选，用于测试） */
    db?: CorivoDatabase;
    /** 数据库密钥（可选，base64 编码） */
    dbKey?: Buffer | string;
    /** 数据库路径（可选） */
    dbPath?: string;
    /** 同步间隔秒数（可选，用于测试；生产环境从 config.json 读取） */
    syncIntervalSeconds?: number;
}
/**
 * 首次运行配置
 */
export interface FirstRunConfig {
    /** 最大 pending blocks 数量（默认 50） */
    maxPendingBlocks?: number;
    /** 时间限制（毫秒，默认 8000） */
    timeLimit?: number;
    /** 是否跳过衰减 */
    skipDecay?: boolean;
    /** 是否跳过冷区整合 */
    skipColdZone?: boolean;
}
/**
 * 心跳引擎
 */
export declare class Heartbeat {
    private running;
    private db;
    private config?;
    private ruleEngine;
    private associationEngine;
    private consolidationEngine;
    private weeklySummary;
    private followUpManager;
    private triggerDecision;
    private pushQueue;
    private autoSync;
    private ingestors;
    private timeoutRef;
    private lastHealthCheck;
    private cycleCount;
    private syncCycles;
    private lastWeeklySummary;
    private lastTriggerDecision;
    private healthFilePath;
    constructor(config?: HeartbeatConfig);
    private computeSyncCycles;
    /**
     * 启动心跳循环
     */
    start(): Promise<void>;
    /**
     * 主循环
     */
    private run;
    /**
     * 动态加载 ingestor 插件列表
     *
     * 依次 import 每个包名，失败则跳过，不中断其他 ingestor 和心跳主循环。
     * 插件包需全局安装：npm install -g <package-name>
     *
     * Public for testing.
     */
    loadIngestors(packageNames: string[]): Promise<void>;
    /**
     * 初始化并注册单个 ingestor 插件
     *
     * Public for testing.
     */
    loadPlugin(plugin: IngestorPlugin): Promise<void>;
    /**
     * 停止心跳
     */
    stop(): Promise<void>;
    /**
     * 首次运行 - 加速模式
     *
     * 用于安装后立即执行一轮心跳，快速处理 Cold Scan 的结果
     */
    runFirstRun(config?: FirstRunConfig): Promise<{
        processedBlocks: number;
        elapsedTime: number;
    }>;
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
     * 执行一次完整的 pending 处理、关联发现和衰减检查
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
     * 处理关联分析
     *
     * 定期分析活跃 block 之间的关系，建立知识网络
     */
    private processAssociations;
    /**
     * 处理热区整合
     *
     * 定期合并重复内容、提炼摘要
     */
    private processConsolidation;
    /**
     * 发送周总结
     *
     * 每周一发送简短总结
     */
    private sendWeeklySummary;
    /**
     * 检查进展提醒
     *
     * 定期检查待办决策，发送温和提醒
     */
    private checkFollowUps;
    /**
     * 处理触发决策
     *
     * 定期检查是否需要向用户推送提醒
     */
    private processTriggerDecision;
    /**
     * 处理自动同步
     *
     * 后台静默执行 push/pull，未注册时跳过
     */
    private processSync;
    /**
     * 延迟函数
     */
    private sleep;
}
//# sourceMappingURL=heartbeat.d.ts.map