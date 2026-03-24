/**
 * Context Suggestion Engine
 *
 * 基于长期记忆预测用户下一步会输入什么
 *
 * 核心哲学（参考 Claude Code v2）：
 * "预测用户会打什么，不是你觉得他们该做什么"
 */
import type { CorivoDatabase } from '../storage/database.js';
/**
 * 上下文类型
 */
export declare enum SuggestionContext {
    SESSION_START = "session-start",
    POST_REQUEST = "post-request"
}
/**
 * 建议生成配置
 */
export interface SuggestionConfig {
    /** 最大建议数量 */
    maxSuggestions?: number;
    /** 优先考虑的天数范围（天） */
    preferredAgeDays?: [number, number];
    /** 最小生命力 */
    minVitality?: number;
}
/**
 * 建议结果
 */
export interface Suggestion {
    /** 建议内容（不含 [corivo] 前缀） */
    content: string;
    /** 来源 Block ID */
    blockId: string;
    /** 置信度 */
    confidence: 'high' | 'medium' | 'low';
}
/**
 * 建议引擎
 */
export declare class SuggestionEngine {
    private db;
    private config;
    constructor(db: CorivoDatabase, config?: SuggestionConfig);
    /**
     * 生成建议
     *
     * @param context 上下文类型
     * @param lastMessage Claude 最后的回复（用于判断是否应该让出）
     * @returns 建议内容（含 [corivo] 前缀）或空
     */
    generate(context: SuggestionContext, lastMessage?: string): string;
    /**
     * 判断 Claude 的回复是否有明显的下一步
     */
    private hasObviousNextStep;
    /**
     * 获取候选 Block
     */
    private getCandidateBlocks;
    /**
     * 构建建议内容
     */
    private buildSuggestion;
    /**
     * 决策类建议
     */
    private buildDecisionSuggestion;
    /**
     * 人员相关建议
     */
    private buildPeopleSuggestion;
    /**
     * 通用建议
     */
    private buildGenericSuggestion;
}
export default SuggestionEngine;
//# sourceMappingURL=suggestion.d.ts.map