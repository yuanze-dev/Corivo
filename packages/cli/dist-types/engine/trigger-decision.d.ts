/**
 * 触发决策引擎
 *
 * 让 Corivo 自己判断什么时候需要告诉用户什么
 */
import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/block.js';
/**
 * 触发决策输入
 */
export interface TriggerInput {
    /** 当前时间戳 */
    now: number;
    /** 最近保存的 block */
    recentBlock?: Block;
    /** 当前对话上下文（如果有） */
    conversationContext?: string;
    /** 上次检查时间 */
    lastCheckTime?: number;
}
/**
 * 推送项
 */
export interface PushItem {
    id: string;
    type: 'conflict' | 'forgotten' | 'relevant' | 'attention' | 'summary';
    priority: number;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    created_at: number;
    expires_at: number;
    dismissed: boolean;
}
/**
 * 触发决策引擎
 */
export declare class TriggerDecision {
    private db;
    private readonly DECISION_DAYS;
    private readonly FORGOTTEN_THRESHOLD;
    private readonly CONFLICT_COOLDOWN;
    constructor(db: CorivoDatabase);
    /**
     * 决策是否需要推送
     *
     * @param input 触发输入
     * @returns 推送项列表（最多 2 条）
     */
    decide(input: TriggerInput): PushItem[];
    /**
     * 检查冲突
     */
    private checkConflict;
    /**
     * 检查遗忘的决策
     */
    private checkForgotten;
    /**
     * 检查需要关注的记忆
     */
    private checkAttention;
    /**
     * 提取决策关键词
     */
    private extractKeywords;
    /**
     * 提取决策内容
     */
    private extractDecision;
}
export default TriggerDecision;
//# sourceMappingURL=trigger-decision.d.ts.map