/**
 * 关联引擎
 *
 * 发现 block 之间的关系，建立知识网络
 * 基于规则的关联发现，零 LLM 依赖
 */
import type { Block } from '../models/index.js';
import { type Association } from '../models/association.js';
/**
 * 关联配置
 */
interface AssociationConfig {
    /** 相似度阈值（高于此值认为是相似内容） */
    similarityThreshold: number;
    /** 关键词匹配权重 */
    keywordWeight: number;
    /** 标注匹配权重 */
    annotationWeight: number;
    /** 时间关联窗口（毫秒，同一时间段内的内容可能相关） */
    timeWindowMs: number;
}
/**
 * 关联引擎
 */
export declare class AssociationEngine {
    private config;
    constructor(config?: Partial<AssociationConfig>);
    /**
     * 基于规则发现关联
     *
     * @param blocks - 待分析的 block 列表
     * @returns 发现的关联列表
     */
    discoverByRules(blocks: Block[]): Association[];
    /**
     * 检测矛盾关联
     *
     * 主要检测决策类 block 的冲突：
     * - 相同领域（domain）但决策不同
     * - 相同主题但结论相反
     */
    private detectConflicts;
    /**
     * 检测替代/更新关联
     *
     * 检测条件：
     * - 相同标注
     * - 后创建的内容提到/修正前创建的内容
     * - 或者后创建的内容是前创建的更完整版本
     */
    private detectSupersedes;
    /**
     * 检测细化/补充关联
     *
     * 检测条件：
     * - 标注相同领域
     * - 一个内容更短/更抽象，一个内容更长/更具体
     * - 时间接近
     */
    private detectRefines;
    /**
     * 检测相似关联
     *
     * 检测条件：
     * - 标注相同
     * - 内容相似度高于阈值
     */
    private detectSimilar;
    /**
     * 检测相关关联
     *
     * 检测条件：
     * - 领域相同
     * - 共享关键词
     */
    private detectRelated;
    /**
     * 计算两个文本的相似度
     *
     * 使用简化的 Jaccard 相似度
     */
    private calculateSimilarity;
    /**
     * 提取文本中的关键词
     *
     * 简单实现：提取中文词汇和英文单词
     */
    private extractKeywords;
    /**
     * 提取文本中的所有词语
     */
    private extractWords;
    /**
     * 从 annotation 中提取领域
     *
     * annotation 格式: "性质 · 领域 · 标签"
     */
    private extractDomain;
}
export {};
//# sourceMappingURL=associations.d.ts.map