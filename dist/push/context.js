/**
 * 上下文推送模块
 *
 * 在查询时自动推送相关记忆
 */
/**
 * 上下文推送器
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
     * @param config - 推送配置
     * @returns 格式化的推送文本
     */
    async pushContext(query, limit = 5, config = {}) {
        const { maxPreviewLength = 80, showAnnotation = true, showVitality = false, showTime = false, } = config;
        // 使用 FTS5 搜索相关内容
        const related = this.db.searchBlocks(query, limit);
        if (related.length === 0) {
            return '';
        }
        // 更新访问计数
        // TODO: 优化为批量 UPDATE ... CASE 语句，避免 N+1 问题
        // MVP 阶段记录量小，当前实现可接受
        for (const block of related) {
            this.db.updateBlock(block.id, {
                access_count: block.access_count + 1,
                last_accessed: Date.now(),
            });
        }
        // 格式化输出
        const lines = related.map((block) => this.formatBlock(block, {
            maxPreviewLength,
            showAnnotation,
            showVitality,
            showTime,
        }));
        return `\n\n---\n📚 [corivo] 相关记忆 (${related.length} 条)\n${lines.join('\n')}\n`;
    }
    /**
     * 格式化单个 block
     */
    formatBlock(block, config) {
        const { maxPreviewLength, showAnnotation, showVitality, showTime } = config;
        // 预览内容
        const preview = block.content.length > maxPreviewLength
            ? block.content.slice(0, maxPreviewLength) + '...'
            : block.content;
        // 元信息
        const meta = [];
        if (showAnnotation && block.annotation && block.annotation !== 'pending') {
            meta.push(`[${block.annotation}]`);
        }
        if (showVitality) {
            const statusIcon = this.getStatusIcon(block.vitality);
            meta.push(`${statusIcon} ${block.vitality}`);
        }
        if (showTime && block.updated_at) {
            const date = new Date(block.updated_at * 1000);
            const daysAgo = Math.floor((Date.now() - block.updated_at * 1000) / 86400000);
            if (daysAgo === 0) {
                meta.push('今天');
            }
            else if (daysAgo === 1) {
                meta.push('昨天');
            }
            else if (daysAgo < 30) {
                meta.push(`${daysAgo}天前`);
            }
            else {
                meta.push(date.toLocaleDateString('zh-CN'));
            }
        }
        const metaStr = meta.length > 0 ? ` ${meta.join(' ')}` : '';
        return `• ${preview}${metaStr}`;
    }
    /**
     * 统计信息推送
     *
     * 使用 SQL GROUP BY 在数据库层面聚合，避免读取全部数据到内存
     */
    async pushStats() {
        const stats = this.db.getStatusBreakdown();
        return `\n\n---\n📊 [corivo] 记忆统计\n总计: ${stats.total} | 活跃: ${stats.active} | 冷却: ${stats.cooling} | 冷冻: ${stats.cold} | 归档: ${stats.archived}\n`;
    }
    /**
     * 获取状态图标
     */
    getStatusIcon(vitality) {
        if (vitality >= 80)
            return '🟢';
        if (vitality >= 60)
            return '🟡';
        if (vitality >= 30)
            return '🟠';
        return '⚫';
    }
    /**
     * 推送需要关注的 block
     *
     * @returns 冷却或冷冻的 block 列表
     */
    async pushNeedsAttention() {
        const blocks = this.db.queryBlocks({ limit: 100 });
        const needsAttention = blocks.filter((b) => b.status === 'cooling' || b.status === 'cold');
        if (needsAttention.length === 0) {
            return '';
        }
        const lines = needsAttention.map((block) => {
            const preview = block.content.length > 60 ? block.content.slice(0, 60) + '...' : block.content;
            return `• ${preview} (${block.annotation}, 生命力: ${block.vitality})`;
        });
        return `\n\n---\n⚠️  [corivo] 需要关注 (${needsAttention.length} 条)\n${lines.join('\n')}\n`;
    }
    /**
     * 推送相关决策模式
     *
     * @param query - 查询关键词
     * @param limit - 返回数量限制
     * @returns 决策模式推送文本
     */
    async pushPatterns(query, limit = 3) {
        const related = this.db.searchBlocks(query, limit);
        // 筛选包含 pattern 的 block
        const withPatterns = related.filter((b) => b.pattern && b.annotation.includes('决策'));
        if (withPatterns.length === 0) {
            return '';
        }
        const lines = withPatterns.map((block) => {
            const pattern = block.pattern;
            const dimensions = pattern.dimensions
                .map((d) => `${d.name}(${Math.round(d.weight * 100)}%)`)
                .join(', ');
            return `• ${pattern.type}: ${pattern.decision}\n  考量: ${dimensions}`;
        });
        return `\n\n---\n💡 [corivo] 相关决策 (${withPatterns.length} 条)\n${lines.join('\n')}\n`;
    }
}
//# sourceMappingURL=context.js.map