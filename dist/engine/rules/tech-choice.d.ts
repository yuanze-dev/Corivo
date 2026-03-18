/**
 * 技术选型规则
 *
 * 从自然语言中提取技术选型决策
 */
import type { Pattern } from '../../models/pattern.js';
import type { Rule } from './index.js';
/**
 * 技术选型规则
 *
 * 识别技术选型决策并提取结构化信息
 */
export declare class TechChoiceRule implements Rule {
    name: string;
    /** 决策关键词匹配模式 */
    patterns: RegExp[];
    /**
     * 从内容中提取技术选型模式
     */
    extract(content: string): Pattern | null;
    /**
     * 提取决策理由
     */
    private extractReason;
    /**
     * 推断决策维度
     */
    private inferDimensions;
    /**
     * 提取被拒绝的选项
     */
    private extractRejected;
    /**
     * 提取上下文标签
     */
    private extractTags;
    /**
     * 计算置信度
     */
    private calculateConfidence;
}
//# sourceMappingURL=tech-choice.d.ts.map