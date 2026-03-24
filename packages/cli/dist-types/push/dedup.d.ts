/**
 * 推送去重机制
 */
/**
 * 去重管理器
 */
export declare class DedupManager {
    private pushed;
    private lastPushed;
    private readonly timeWindow;
    /**
     * 生成内容哈希
     */
    private hash;
    /**
     * 检查是否应该推送
     *
     * @param content 推送内容
     * @param sessionId 会话 ID（可选，用于会话级别去重）
     * @returns 是否应该推送
     */
    shouldPush(content: string, sessionId?: string): boolean;
    /**
     * 批量过滤推送项
     *
     * @param items 推送项列表
     * @param sessionId 会话 ID（可选）
     * @returns 过滤后的推送项
     */
    filter(items: string[], sessionId?: string): string[];
    /**
     * 清空会话级别的去重记录
     *
     * @param sessionId 会话 ID
     */
    clearSession(sessionId: string): void;
    /**
     * 清空所有记录
     */
    clearAll(): void;
    /**
     * 清理过期的时间窗口记录
     */
    cleanup(): void;
}
export declare function getDedupManager(): DedupManager;
//# sourceMappingURL=dedup.d.ts.map