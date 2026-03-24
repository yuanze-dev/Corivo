/**
 * 周总结模块
 *
 * 每周一发送简短总结："上周做了 3 个决策"
 */
import type { CorivoDatabase } from '../storage/database.js';
/**
 * 周统计
 */
export interface WeeklyStats {
    decisions: number;
    implementations: number;
    knowledge: number;
    total: number;
}
/**
 * 周总结
 */
export declare class WeeklySummary {
    private db;
    constructor(db: CorivoDatabase);
    /**
     * 生成周总结
     *
     * @returns 总结消息
     */
    generateSummary(): string | null;
    /**
     * 获取上周统计
     */
    private getWeeklyStats;
    /**
     * 检查是否应该发送周总结
     *
     * 简单实现：每周一（根据日期判断）
     *
     * @returns 是否应该发送
     */
    shouldSend(): boolean;
    /**
     * 获取下一次发送时间
     *
     * @returns 下次周一的 0 点
     */
    getNextSendTime(): Date;
}
//# sourceMappingURL=weekly-summary.d.ts.map