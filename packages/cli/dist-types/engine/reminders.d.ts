/**
 * 主动提醒管理器
 *
 * 心跳进程将提醒写入队列，session-init.sh 读取并显示给用户
 */
/**
 * 提醒类型
 */
export declare enum ReminderType {
    FOLLOW_UP = "follow-up",// 进展提醒：决策类 block 创建 3 天后
    ATTENTION = "attention",// 需关注提醒：vitality 进入 cooling/cold
    CONFLICT = "conflict",// 矛盾提醒：检测到冲突
    WEEKLY = "weekly",// 周总结
    CUSTOM = "custom"
}
/**
 * 提醒优先级
 */
export declare enum ReminderPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high"
}
/**
 * 提醒项
 */
export interface Reminder {
    id: string;
    type: ReminderType;
    priority: ReminderPriority;
    title: string;
    message: string;
    createdAt: number;
    expiresAt: number;
    dismissed: boolean;
    metadata?: Record<string, unknown>;
}
/**
 * 提醒管理器配置
 */
export interface ReminderManagerConfig {
    /** 提醒文件路径（默认 ~/.corivo/reminders.json） */
    remindersPath?: string;
    /** 提醒保留天数（默认 30 天） */
    retentionDays?: number;
}
/**
 * 提醒管理器
 */
export declare class ReminderManager {
    private remindersPath;
    private retentionDays;
    private readonly DEFAULT_RETENTION_DAYS;
    constructor(config?: ReminderManagerConfig);
    /**
     * 添加提醒
     */
    addReminder(reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<Reminder>;
    /**
     * 获取待处理的提醒
     *
     * @param limit 最大返回数量
     * @returns 待处理的提醒列表
     */
    getPendingReminders(limit?: number): Promise<Reminder[]>;
    /**
     * 标记提醒已处理
     *
     * @param id 提醒 ID
     */
    dismissReminder(id: string): Promise<boolean>;
    /**
     * 标记所有提醒已处理
     */
    dismissAll(): Promise<number>;
    /**
     * 清理过期和已忽略的旧提醒
     *
     * @return 清理的数量
     */
    cleanup(): Promise<number>;
    /**
     * 格式化提醒为可读文本（用于 CLI 输出）
     */
    formatReminder(reminder: Reminder): string;
    /**
     * 格式化多个提醒为可读文本
     */
    formatReminders(reminders: Reminder[]): string;
    /**
     * 加载提醒存储
     */
    private loadStore;
    /**
     * 保存提醒存储
     */
    private saveStore;
    /**
     * 获取提醒文件路径（供 shell 脚本读取）
     */
    getRemindersPath(): string;
}
export default ReminderManager;
//# sourceMappingURL=reminders.d.ts.map