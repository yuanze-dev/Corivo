/**
 * 主动提醒管理器
 *
 * 心跳进程将提醒写入队列，session-init.sh 读取并显示给用户
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '../storage/database.js';

/**
 * 提醒类型
 */
export enum ReminderType {
  FOLLOW_UP = 'follow-up',       // 进展提醒：决策类 block 创建 3 天后
  ATTENTION = 'attention',       // 需关注提醒：vitality 进入 cooling/cold
  CONFLICT = 'conflict',         // 矛盾提醒：检测到冲突
  WEEKLY = 'weekly',             // 周总结
  CUSTOM = 'custom',             // 自定义提醒
}

/**
 * 提醒优先级
 */
export enum ReminderPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * 提醒项
 */
export interface Reminder {
  id: string;                    // 唯一ID: rem_<timestamp>_<random>
  type: ReminderType;            // 提醒类型
  priority: ReminderPriority;    // 优先级
  title: string;                 // 标题（简短）
  message: string;               // 完整消息内容
  createdAt: number;             // 创建时间（Unix 秒）
  expiresAt: number;             // 过期时间（Unix 秒，0=永不过期）
  dismissed: boolean;            // 是否已忽略/已处理
  metadata?: Record<string, unknown>; // 附加元数据（如 blockId）
}

/**
 * 提醒队列存储
 */
interface ReminderStore {
  reminders: Reminder[];
  lastUpdated: number;           // 最后更新时间
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
export class ReminderManager {
  private remindersPath: string;
  private retentionDays: number;
  private readonly DEFAULT_RETENTION_DAYS = 30;

  constructor(config: ReminderManagerConfig = {}) {
    const configDir = config.remindersPath || getConfigDir();
    this.remindersPath = path.join(configDir, 'reminders.json');
    this.retentionDays = config.retentionDays ?? this.DEFAULT_RETENTION_DAYS;
  }

  /**
   * 添加提醒
   */
  async addReminder(reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<Reminder> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);

    const newReminder: Reminder = {
      id: `rem_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      ...reminder,
    };

    store.reminders.push(newReminder);
    store.lastUpdated = now;

    await this.saveStore(store);

    return newReminder;
  }

  /**
   * 获取待处理的提醒
   *
   * @param limit 最大返回数量
   * @returns 待处理的提醒列表
   */
  async getPendingReminders(limit = 5): Promise<Reminder[]> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);

    // 过滤：未忽略、未过期
    const pending = store.reminders.filter((r) => {
      if (r.dismissed) return false;
      if (r.expiresAt > 0 && r.expiresAt < now) return false;
      return true;
    });

    // 按优先级排序：HIGH > MEDIUM > LOW
    const priorityOrder = { [ReminderPriority.HIGH]: 0, [ReminderPriority.MEDIUM]: 1, [ReminderPriority.LOW]: 2 };

    pending.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt; // 同优先级按时间排序
    });

    return pending.slice(0, limit);
  }

  /**
   * 标记提醒已处理
   *
   * @param id 提醒 ID
   */
  async dismissReminder(id: string): Promise<boolean> {
    const store = await this.loadStore();
    const reminder = store.reminders.find((r) => r.id === id);

    if (!reminder) return false;

    reminder.dismissed = true;
    store.lastUpdated = Math.floor(Date.now() / 1000);

    await this.saveStore(store);

    return true;
  }

  /**
   * 标记所有提醒已处理
   */
  async dismissAll(): Promise<number> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);

    let count = 0;
    for (const reminder of store.reminders) {
      if (!reminder.dismissed) {
        reminder.dismissed = true;
        count++;
      }
    }

    if (count > 0) {
      store.lastUpdated = now;
      await this.saveStore(store);
    }

    return count;
  }

  /**
   * 清理过期和已忽略的旧提醒
   *
   * @return 清理的数量
   */
  async cleanup(): Promise<number> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);
    const cutoffTime = now - (this.retentionDays * 86400);

    const originalLength = store.reminders.length;

    // 保留：未忽略 且（未过期 或 创建时间在保留期内）
    store.reminders = store.reminders.filter((r) => {
      if (!r.dismissed && (r.expiresAt === 0 || r.expiresAt >= now)) {
        return true; // 活跃提醒保留
      }
      return r.createdAt > cutoffTime; // 保留保留期内的记录
    });

    const cleanedCount = originalLength - store.reminders.length;

    if (cleanedCount > 0) {
      store.lastUpdated = now;
      await this.saveStore(store);
    }

    return cleanedCount;
  }

  /**
   * 格式化提醒为可读文本（用于 CLI 输出）
   */
  formatReminder(reminder: Reminder): string {
    const lines: string[] = [];

    // 优先级图标
    const priorityIcon = {
      [ReminderPriority.HIGH]: '🔴',
      [ReminderPriority.MEDIUM]: '🟡',
      [ReminderPriority.LOW]: '🟢',
    }[reminder.priority];

    // 类型图标
    const typeIcon = {
      [ReminderType.FOLLOW_UP]: '📋',
      [ReminderType.ATTENTION]: '⚠️',
      [ReminderType.CONFLICT]: '⚡',
      [ReminderType.WEEKLY]: '📊',
      [ReminderType.CUSTOM]: '📌',
    }[reminder.type];

    lines.push(`${priorityIcon} ${typeIcon} ${reminder.title}`);

    // 多行消息缩进显示
    if (reminder.message) {
      const messageLines = reminder.message.split('\n');
      for (const line of messageLines) {
        lines.push(`   ${line}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化多个提醒为可读文本
   */
  formatReminders(reminders: Reminder[]): string {
    if (reminders.length === 0) {
      return '';
    }

    const lines: string[] = [];

    for (const reminder of reminders) {
      lines.push(this.formatReminder(reminder));
      lines.push(''); // 空行分隔
    }

    return lines.join('\n');
  }

  /**
   * 加载提醒存储
   */
  private async loadStore(): Promise<ReminderStore> {
    try {
      const content = await fs.readFile(this.remindersPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // 文件不存在或读取失败，返回空存储
      return {
        reminders: [],
        lastUpdated: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * 保存提醒存储
   */
  private async saveStore(store: ReminderStore): Promise<void> {
    const dir = path.dirname(this.remindersPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.remindersPath, JSON.stringify(store, null, 2));
  }

  /**
   * 获取提醒文件路径（供 shell 脚本读取）
   */
  getRemindersPath(): string {
    return this.remindersPath;
  }
}

export default ReminderManager;
