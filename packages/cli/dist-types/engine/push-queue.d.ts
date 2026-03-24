/**
 * 推送队列管理
 *
 * 持久化存储推送项，供会话启动时读取
 */
import type { PushItem } from '../engine/trigger-decision.js';
/**
 * 推送队列管理器
 */
export declare class PushQueue {
    private queuePath;
    private store;
    constructor();
    /**
     * 加载队列
     */
    load(): Promise<void>;
    /**
     * 保存队列
     */
    save(): Promise<void>;
    /**
     * 添加推送项
     */
    add(item: PushItem): Promise<void>;
    /**
     * 批量添加推送项
     */
    addAll(items: PushItem[]): Promise<void>;
    /**
     * 获取待显示的推送
     *
     * 过滤规则：
     * - 已忽略的不显示
     * - 过期的不显示
     * - 创建时间超过 24 小时的 "上下文" 类推送不显示（避免过时）
     */
    getPending(limit?: number): PushItem[];
    /**
     * 标记推送已显示
     */
    markShown(id: string): Promise<void>;
    /**
     * 标记所有推送已显示
     */
    markAllShown(): Promise<void>;
    /**
     * 清理过期和已忽略的项
     */
    private cleanup;
    /**
     * 清空队列
     */
    clear(): Promise<void>;
    /**
     * 获取队列统计
     */
    getStats(): {
        total: number;
        pending: number;
        dismissed: number;
    };
    /**
     * 创建空队列
     */
    private emptyStore;
}
export default PushQueue;
//# sourceMappingURL=push-queue.d.ts.map