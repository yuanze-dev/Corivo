/**
 * 矛盾检测器
 *
 * 检测新保存的内容是否与已有内容矛盾
 * 像朋友一样提醒："不过你之前说的是..."
 */
import type { Block } from '../models/index.js';
/**
 * 矛盾提醒
 */
export interface ConflictReminder {
    hasConflict: boolean;
    message: string;
    conflictingBlocks: Block[];
}
/**
 * 矛盾检测器
 */
export declare class ConflictDetector {
    /**
     * 检测新内容是否与已有内容矛盾
     *
     * @param newContent - 新保存的内容
     * @param existingBlocks - 已有的 block 列表
     * @returns 矛盾提醒，如果没有矛盾返回 null
     */
    detect(newContent: string, existingBlocks: Block[]): ConflictReminder | null;
    /**
     * 检测是否是决策变更
     *
     * 规则：之前说"选择 X"，现在说"选择 Y"（X ≠ Y）
     */
    private isDecisionChange;
    /**
     * 提取决策内容
     */
    private extractDecision;
    /**
     * 提取领域
     */
    private extractDomain;
    /**
     * 判断是否是相似主题
     */
    private isSimilarTopic;
    /**
     * 提取词语
     */
    private extractWords;
    /**
     * 生成友好的提醒语
     */
    private generateReminderMessage;
}
//# sourceMappingURL=conflict-detector.d.ts.map