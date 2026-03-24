/**
 * 进展提醒管理器
 *
 * 对待办决策进行温和的进展提醒："那个 xxx 后来怎么样了？"
 */
import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';
/**
 * 提醒项
 */
export interface ReminderItem {
    block: Block;
    daysSinceCreation: number;
    reminderMessage: string;
}
/**
 * 进展提醒管理器
 */
export declare class FollowUpManager {
    private db;
    private static readonly FOLLOW_UP_THRESHOLD_DAYS;
    private static readonly REMINDER_COOLDOWN_DAYS;
    constructor(db: CorivoDatabase);
    /**
     * 获取需要跟进的内容
     *
     * @returns 需要提醒的项列表
     */
    getPendingItems(): ReminderItem[];
    /**
     * 获取本周需要提醒的内容（用于心跳定期检查）
     *
     * @returns 提醒消息列表
     */
    getWeeklyReminders(): string[];
    /**
     * 生成提醒语
     */
    private generateReminder;
    /**
     * 检查某个 block 是否需要提醒
     *
     * @param blockId - Block ID
     * @returns 是否需要提醒
     */
    needsReminder(blockId: string): boolean;
}
//# sourceMappingURL=follow-up.d.ts.map