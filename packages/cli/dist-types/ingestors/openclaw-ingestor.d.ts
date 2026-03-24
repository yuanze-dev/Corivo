/**
 * OpenClaw 历史采集器 - 无感采集 OpenClaw 对话和活动记录
 *
 * 【事件驱动模式】监听 ~/.openclaw/logs/gateway.log 文件变化，实时采集
 * 【降级模式】如果监听失败，回退到定时轮询
 */
import type { CorivoDatabase } from '../storage/database.js';
/**
 * 采集配置
 */
export interface OpenClawIngestorConfig {
    /** OpenClaw 配置目录（默认 ~/.openclaw） */
    openclawConfigDir?: string;
    /** 每次采集的最大条数 */
    maxEntries?: number;
    /** 采集间隔（毫秒），仅用于降级模式，默认 60 秒 */
    ingestInterval?: number;
    /** 防抖延迟（毫秒），默认 500ms */
    debounceMs?: number;
}
/**
 * 采集结果
 */
export interface IngestResult {
    processed: number;
    saved: number;
    skipped: number;
    errors: number;
}
/**
 * OpenClaw 历史采集器
 */
export declare class OpenClawIngestor {
    private openclawConfigDir;
    private gatewayLogPath;
    private lastIngestPosition;
    private lastIngestTime;
    private maxEntries;
    private debounceMs;
    private db;
    private watcher;
    private debounceTimer;
    private pollTimer;
    private isWatching;
    private usePolling;
    constructor(config?: OpenClawIngestorConfig);
    /**
     * 启动监听（事件驱动模式）
     */
    startWatching(database: CorivoDatabase): Promise<void>;
    /**
     * 停止监听
     */
    stop(): Promise<void>;
    /**
     * 设置文件监听器
     */
    private setupFileWatcher;
    /**
     * 监听文件创建（用于日志文件尚不存在的情况）
     */
    private watchForFileCreation;
    /**
     * 防抖调度采集
     */
    private scheduleIngest;
    /**
     * 启动轮询模式（降级）
     */
    private startPolling;
    /**
     * 采集新日志记录（兼容两种模式）
     *
     * @param db - 数据库实例
     * @returns 采集结果
     */
    ingest(db: CorivoDatabase): Promise<IngestResult>;
    /**
     * 解析日志行
     */
    private parseLogLine;
    /**
     * 判断是否值得保存
     */
    private shouldSaveEntry;
    /**
     * 为日志条目生成标注
     */
    private annotateEntry;
    /**
     * 检查文件是否存在
     */
    private fileExists;
    /**
     * 获取日志文件状态
     */
    getStatus(): Promise<{
        exists: boolean;
        size: number;
        lastModified: number | null;
        isWatching: boolean;
        mode: 'watch' | 'poll';
        processedLines: number;
    }>;
}
//# sourceMappingURL=openclaw-ingestor.d.ts.map