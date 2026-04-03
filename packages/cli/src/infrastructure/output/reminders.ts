/**
 * Proactive reminder manager
 *
 * The heartbeat process writes reminders to the queue, and session-init.sh reads and displays them to the user.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '@/storage/database';

/**
 * Reminder type
 */
export enum ReminderType {
  FOLLOW_UP = 'follow-up',       // Progress reminder: 3 days after the creation of the decision-making block
  ATTENTION = 'attention',       // Note: vitality enters cooling/cold
  CONFLICT = 'conflict',         // Conflict reminder: conflict detected
  WEEKLY = 'weekly',             // Weekly summary
  CUSTOM = 'custom',             // Custom reminder
}

/**
 * Reminder priority
 */
export enum ReminderPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * reminder items
 */
export interface Reminder {
  id: string;                    // Unique ID: rem_<timestamp>_<random>
  type: ReminderType;            // Reminder type
  priority: ReminderPriority;    // priority
  title: string;                 // Title (short)
  message: string;               // Complete message content
  createdAt: number;             // Creation time (Unix seconds)
  expiresAt: number;             // Expiration time (Unix seconds, 0=never expires)
  dismissed: boolean;            // Has it been ignored/processed?
  metadata?: Record<string, unknown>; // Additional metadata (such as blockId)
}

/**
 * reminder queue storage
 */
interface ReminderStore {
  reminders: Reminder[];
  lastUpdated: number;           // Last updated
}

/**
 * Reminder Manager Configuration
 */
export interface ReminderManagerConfig {
  /** Reminder file path (default ~/.corivo/reminders.json) */
  remindersPath?: string;
  /** Number of days to keep reminders (default 30 days) */
  retentionDays?: number;
}

/**
 * reminder manager
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
   * Add reminder
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
   * Get pending reminders
   *
   * @param limit the maximum number of returns
   * @returns list of pending reminders
   */
  async getPendingReminders(limit = 5): Promise<Reminder[]> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);

    // Filter: not ignored, not expired
    const pending = store.reminders.filter((r) => {
      if (r.dismissed) return false;
      if (r.expiresAt > 0 && r.expiresAt < now) return false;
      return true;
    });

    // Sort by priority: HIGH > MEDIUM > LOW
    const priorityOrder = { [ReminderPriority.HIGH]: 0, [ReminderPriority.MEDIUM]: 1, [ReminderPriority.LOW]: 2 };

    pending.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt; // Sort by time with same priority
    });

    return pending.slice(0, limit);
  }

  /**
   * Mark reminder processed
   *
   * @param id reminder ID
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
   * Mark all reminders as processed
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
   * Clean up expired and ignored old reminders
   *
   * @return the number of cleanups
   */
  async cleanup(): Promise<number> {
    const store = await this.loadStore();
    const now = Math.floor(Date.now() / 1000);
    const cutoffTime = now - (this.retentionDays * 86400);

    const originalLength = store.reminders.length;

    // Retention: not ignored and (not expired or created within the retention period)
    store.reminders = store.reminders.filter((r) => {
      if (!r.dismissed && (r.expiresAt === 0 || r.expiresAt >= now)) {
        return true; // Active reminder retention
      }
      return r.createdAt > cutoffTime; // Keep records within the retention period
    });

    const cleanedCount = originalLength - store.reminders.length;

    if (cleanedCount > 0) {
      store.lastUpdated = now;
      await this.saveStore(store);
    }

    return cleanedCount;
  }

  /**
   * Format alerts as readable text (for CLI output)
   */
  formatReminder(reminder: Reminder): string {
    const lines: string[] = [];

    // priority icon
    const priorityIcon = {
      [ReminderPriority.HIGH]: '🔴',
      [ReminderPriority.MEDIUM]: '🟡',
      [ReminderPriority.LOW]: '🟢',
    }[reminder.priority];

    // type icon
    const typeIcon = {
      [ReminderType.FOLLOW_UP]: '📋',
      [ReminderType.ATTENTION]: '⚠️',
      [ReminderType.CONFLICT]: '⚡',
      [ReminderType.WEEKLY]: '📊',
      [ReminderType.CUSTOM]: '📌',
    }[reminder.type];

    lines.push(`${priorityIcon} ${typeIcon} ${reminder.title}`);

    // Multi-line message indentation display
    if (reminder.message) {
      const messageLines = reminder.message.split('\n');
      for (const line of messageLines) {
        lines.push(`   ${line}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format multiple reminders as readable text
   */
  formatReminders(reminders: Reminder[]): string {
    if (reminders.length === 0) {
      return '';
    }

    const lines: string[] = [];

    for (const reminder of reminders) {
      lines.push(this.formatReminder(reminder));
      lines.push(''); // Blank line separated
    }

    return lines.join('\n');
  }

  /**
   * Load reminder storage
   */
  private async loadStore(): Promise<ReminderStore> {
    try {
      const content = await fs.readFile(this.remindersPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // The file does not exist or the read fails, and empty storage is returned.
      return {
        reminders: [],
        lastUpdated: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * Save reminder storage
   */
  private async saveStore(store: ReminderStore): Promise<void> {
    const dir = path.dirname(this.remindersPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.remindersPath, JSON.stringify(store, null, 2));
  }

  /**
   * Get reminder file path (readable by shell script)
   */
  getRemindersPath(): string {
    return this.remindersPath;
  }
}

export default ReminderManager;
