/**
 * 推送类型定义
 */
/**
 * 推送触发上下文
 */
export declare enum PushContext {
    SESSION_START = "session-start",
    POST_REQUEST = "post-request",
    QUERY = "query",
    STATUS = "status",
    SAVE = "save"
}
/**
 * 推送类型
 */
export declare enum PushType {
    SUGGEST = "suggest",// 建议下一步
    CONFLICT = "conflict",// 矛盾提醒
    DECISION = "decision",// 决策经验
    ATTENTION = "attention",// 需要关注
    CONTEXT = "context",// 相关记忆
    RELATED = "related",// 关联记忆
    STATS = "stats",// 统计信息
    SUMMARY = "summary"
}
/**
 * 推送优先级
 */
export declare enum PushPriority {
    SUGGEST = 0,// P0 - 建议
    CONFLICT = 1,// P1 - 矛盾
    DECISION = 2,// P2 - 决策
    ATTENTION = 3,// P3 - 需关注
    CONTEXT = 4,// P4 - 上下文
    STATS = 5
}
/**
 * 推送项
 */
export interface PushItem {
    type: PushType;
    priority: PushPriority;
    content: string;
    metadata?: {
        blockId?: string;
        confidence?: number;
        reason?: string;
    };
}
/**
 * 推送配置
 */
export interface PushConfig {
    /** 最大推送数量 */
    maxItems?: number;
    /** 是否包含统计 */
    includeStats?: boolean;
    /** 是否包含建议 */
    includeSuggest?: boolean;
    /** 是否包含矛盾 */
    includeConflict?: boolean;
    /** 输出格式 */
    format?: 'text' | 'json';
}
/**
 * 推送结果
 */
export interface PushResult {
    items: PushItem[];
    total: number;
    truncated: boolean;
}
//# sourceMappingURL=push-types.d.ts.map