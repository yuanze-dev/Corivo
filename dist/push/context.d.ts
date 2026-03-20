/**
 * 上下文推送模块
 *
 * 在查询时自动推送相关记忆
 */
import type { CorivoDatabase } from '../storage/database.js';
/**
 * 推送配置
 */
export interface PushConfig {
    /** 最大显示长度 */
    maxPreviewLength?: number;
    /** 是否显示标注 */
    showAnnotation?: boolean;
    /** 是否显示生命力 */
    showVitality?: boolean;
    /** 是否显示时间 */
    showTime?: boolean;
}
/**
 * 上下文推送器
 */
export declare class ContextPusher {
    private db;
    constructor(db: CorivoDatabase);
    /**
     * 查询时附加相关记忆
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @param config - 推送配置
     * @returns 格式化的推送文本
     */
    pushContext(query: string, limit?: number, config?: PushConfig): Promise<string>;
    /**
     * 格式化单个 block
     */
    private formatBlock;
    /**
     * 统计信息推送
     *
     * 使用 SQL GROUP BY 在数据库层面聚合，避免读取全部数据到内存
     */
    pushStats(): Promise<string>;
    /**
     * 获取状态图标
     */
    private getStatusIcon;
    /**
     * 推送需要关注的 block
     *
     * @returns 冷却或冷冻的 block 列表
     */
    pushNeedsAttention(): Promise<string>;
    /**
     * 推送相关决策模式
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @returns 决策模式推送文本
     */
    pushPatterns(query: string, limit?: number): Promise<string>;
    /**
     * 基于关联推送相关记忆
     *
     * 不同于 pushContext 的全文搜索，这里基于已建立的关联关系
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @returns 关联记忆推送文本
     */
    pushRelated(query: string, limit?: number): Promise<string>;
    /**
     * 推送矛盾提醒
     *
     * 检测当前内容与已有决策的冲突
     *
     * @param content - 当前内容
     * @returns 矛盾提醒文本
     */
    pushConflicts(content: string): Promise<string>;
    /**
     * 推送相关决策（增强版）
     *
     * 结合关联关系的决策推送
     *
     * @param context - 上下文描述
     * @returns 决策建议文本
     */
    pushDecisions(context: string): Promise<string>;
    /**
     * 推送摘要
     *
     * 基于主题推送相关内容的摘要
     *
     * @param topic - 主题关键词
     * @returns 摘要文本
     */
    pushSummary(topic: string): Promise<string>;
    /**
     * 提取关键词
     */
    private extractKeywords;
    /**
     * 计算相关性
     */
    private calculateRelevance;
    /**
     * 获取关联类型标签
     */
    private getAssociationTypeLabel;
}
//# sourceMappingURL=context.d.ts.map