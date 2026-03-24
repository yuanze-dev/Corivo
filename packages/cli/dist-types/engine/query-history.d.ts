/**
 * 查询历史追踪器
 *
 * 记录用户的查询，用于"你之前也查过类似的"提醒
 */
import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';
/**
 * 查询记录
 */
export interface QueryRecord {
    id: string;
    timestamp: number;
    query: string;
    resultCount: number;
    resultIds: string[];
}
/**
 * 相似查询提醒
 */
export interface SimilarQueryReminder {
    hasSimilar: boolean;
    message: string;
    similarQueries: Array<{
        query: string;
        timestamp: number;
    }>;
}
/**
 * 查询历史追踪器
 */
export declare class QueryHistoryTracker {
    private db;
    constructor(db: CorivoDatabase);
    /**
     * 记录查询
     */
    recordQuery(query: string, results: Block[]): void;
    /**
     * 查找相似的历史查询
     *
     * @param currentQuery - 当前查询
     * @returns 相似查询提醒
     */
    findSimilarQueries(currentQuery: string): SimilarQueryReminder;
    /**
     * 判断两个查询是否相似
     */
    private isSimilarQuery;
    /**
     * 提取词语
     */
    private extractWords;
    /**
     * 生成友好的提醒语
     */
    private generateReminderMessage;
    /**
     * 清理旧记录（保留最近 30 天）
     */
    cleanupOldRecords(): void;
}
//# sourceMappingURL=query-history.d.ts.map