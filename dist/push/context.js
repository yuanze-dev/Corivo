/**
 * 上下文推送模块
 *
 * 在查询时自动推送相关记忆
 */
export class ContextPusher {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * 查询时附加相关记忆
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @returns 格式化的推送文本
     */
    async pushContext(query, limit = 5) {
        // 使用 FTS5 搜索相关内容
        const related = this.db.searchBlocks(query, limit);
        if (related.length === 0) {
            return '';
        }
        // 格式化输出
        const lines = related.map((block) => {
            const preview = block.content.length > 50 ? block.content.slice(0, 50) + '...' : block.content;
            return `- ${preview}`;
        });
        return `
\\n\\n---
\\n[corivo] 相关记忆 (${related.length} 条)
\\n${lines.join('\\n')}
`;
    }
    /**
     * 统计信息推送
     *
     * @returns 格式化的统计文本
     */
    async pushStats() {
        const blocks = this.db.queryBlocks({ limit: 10000 });
        const total = blocks.length;
        const byStatus = {
            active: blocks.filter((b) => b.status === 'active').length,
            cooling: blocks.filter((b) => b.status === 'cooling').length,
            cold: blocks.filter((b) => b.status === 'cold').length,
            archived: blocks.filter((b) => b.status === 'archived').length,
        };
        return `
\\n\\n---
\\n[corivo] 记忆统计
\\n总计: ${total} | 活跃: ${byStatus.active} | 冷却: ${byStatus.cooling} | 冷冻: ${byStatus.cold} | 归档: ${byStatus.archived}
`;
    }
}
//# sourceMappingURL=context.js.map