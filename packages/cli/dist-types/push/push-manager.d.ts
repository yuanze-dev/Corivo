/**
 * 推送管理器
 *
 * 统一 Corivo 的所有推送逻辑
 */
import type { CorivoDatabase } from '../storage/database.js';
import { PushContext, PushResult } from './push-types.js';
import { getDedupManager } from './dedup.js';
/**
 * 推送管理器配置
 */
export interface PushManagerConfig {
    /** 数据库实例 */
    db: CorivoDatabase;
    /** 去重管理器（可选，默认使用全局单例） */
    dedup?: ReturnType<typeof getDedupManager>;
    /** 会话 ID（可选，用于去重） */
    sessionId?: string;
}
/**
 * 推送管理器
 *
 * 统一入口，根据上下文生成推送内容
 */
export declare class PushManager {
    private db;
    private dedup;
    private sessionId?;
    private suggestionEngine;
    private contextPusher;
    constructor(config: PushManagerConfig);
    /**
     * 生成推送
     *
     * @param context 推送上下文
     * @param options 额外选项
     * @returns 推送结果
     */
    push(context: PushContext, options?: {
        lastMessage?: string;
        query?: string;
        maxItems?: number;
    }): Promise<PushResult>;
    /**
     * 格式化推送结果为文本
     */
    format(result: PushResult): string;
    /**
     * 格式化单个推送项
     */
    private formatItem;
    /**
     * 获取推送类型图标
     */
    private getIcon;
    /**
     * SessionStart 推送
     */
    private pushSessionStart;
    /**
     * PostRequest 推送
     */
    private pushPostRequest;
    /**
     * Query 推送
     */
    private pushQuery;
    /**
     * Status 推送
     */
    private pushStatus;
    /**
     * Save 推送（保存后的推送）
     */
    private pushSave;
    /**
     * 判断是否有明显的下一步
     */
    private hasObviousNextStep;
    /**
     * 去重过滤
     */
    private dedupFilter;
    /**
     * 获取默认最大推送数量
     */
    private getDefaultMaxItems;
}
export default PushManager;
//# sourceMappingURL=push-manager.d.ts.map