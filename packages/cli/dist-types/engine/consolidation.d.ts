/**
 * 整合引擎
 *
 * 负责合并重复内容、提炼上层知识、补全关联链
 * 模拟人脑在睡眠时整理记忆的过程
 */
import type { Block } from '../models/index.js';
/**
 * 整合结果
 */
export interface ConsolidationResult {
    /** 执行的操作类型 */
    action: 'merged' | 'created_summary' | 'linked';
    /** 涉及的 block ID */
    blocks: string[];
    /** 结果 block（如果有） */
    result?: Block;
    /** 理由说明 */
    reason?: string;
}
/**
 * 整合配置
 */
interface ConsolidationConfig {
    /** 相似度阈值（高于此值认为需要合并） */
    mergeThreshold: number;
    /** 摘要最小关联数量 */
    summaryMinRelated: number;
    /** 自动补链置信度阈值 */
    linkThreshold: number;
}
/**
 * 整合引擎
 */
export declare class ConsolidationEngine {
    private config;
    constructor(config?: Partial<ConsolidationConfig>);
    /**
     * 去重：合并高度相似的 block
     *
     * @param candidates - 待检查的 block 列表
     * @returns 合并结果列表
     */
    deduplicateBlocks(candidates: Block[]): ConsolidationResult[];
    /**
     * 提炼：为相关 block 创建摘要
     *
     * @param relatedBlocks - 相关的 block 列表
     * @returns 摘要 block 或 null
     */
    createSummary(relatedBlocks: Block[]): Block | null;
    /**
     * 补链：为相关但无 refs 的 block 添加关联
     *
     * @param blocks - block 列表
     * @param associations - 现有关联列表
     * @returns 需要更新的 block ID 映射
     */
    findMissingLinks(blocks: Block[], associations: Array<{
        from_id: string;
        to_id: string;
        confidence: number;
    }>): Map<string, string[]>;
    /**
     * 查找相似 block
     */
    private findSimilarBlocks;
    /**
     * 合并 block
     *
     * 保留内容最长、最新的那个作为主 block，其他的记录到 consolidated_from
     */
    private mergeBlocks;
    /**
     * 计算两个文本的相似度
     */
    private calculateSimilarity;
    /**
     * 生成摘要内容
     */
    private generateSummaryContent;
    /**
     * 提取文本中的关键词
     */
    private extractKeywords;
    /**
     * 提取文本中的所有词语
     */
    private extractWords;
    /**
     * 从 annotation 中提取领域
     */
    private extractDomain;
}
export {};
//# sourceMappingURL=consolidation.d.ts.map