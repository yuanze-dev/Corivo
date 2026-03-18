/**
 * 规则引擎
 *
 * 从自然语言内容中提取结构化决策模式
 */
import type { Pattern } from '../../models/pattern.js';
/**
 * 规则接口
 */
export interface Rule {
    /** 规则名称 */
    name: string;
    /** 匹配模式列表 */
    patterns: RegExp[];
    /** 从内容中提取模式 */
    extract(content: string): Pattern | null;
}
/**
 * 规则引擎
 *
 * 管理多个规则，依次尝试匹配并提取模式
 */
export declare class RuleEngine {
    private rules;
    /**
     * 注册规则
     */
    register(rule: Rule): void;
    /**
     * 从内容中提取模式
     *
     * @param content - 自然语言内容
     * @returns 提取的模式，如果没有匹配则返回 null
     */
    extract(content: string): Pattern | null;
    /**
     * 批量提取（用于测试）
     *
     * @param contents - 内容数组
     * @returns 提取的模式数组
     */
    extractAll(contents: string[]): (Pattern | null)[];
    /**
     * 获取已注册的规则数量
     */
    get ruleCount(): number;
}
//# sourceMappingURL=index.d.ts.map