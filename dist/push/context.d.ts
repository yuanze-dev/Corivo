/**
 * 上下文推送模块
 *
 * 在查询时自动推送相关记忆
 */
import type { CorivoDatabase } from '../storage/database';
export declare class ContextPusher {
    private db;
    constructor(db: CorivoDatabase);
    /**
     * 查询时附加相关记忆
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @returns 格式化的推送文本
     */
    pushContext(query: string, limit?: number): Promise<string>;
    /**
     * 统计信息推送
     *
     * @returns 格式化的统计文本
     */
    pushStats(): Promise<string>;
}
//# sourceMappingURL=context.d.ts.map