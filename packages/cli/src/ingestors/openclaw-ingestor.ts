/**
 * OpenClaw 历史采集器 - 无感采集 OpenClaw 对话和活动记录
 *
 * 定期读取 ~/.openclaw/logs/gateway.log，提取有价值的信息自动保存到 Corivo
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { CorivoDatabase } from '../storage/database.js';

/**
 * 采集配置
 */
export interface OpenClawIngestorConfig {
  /** OpenClaw 配置目录（默认 ~/.openclaw） */
  openclawConfigDir?: string;
  /** 每次采集的最大条数 */
  maxEntries?: number;
  /** 采集间隔（毫秒），默认 60 秒 */
  ingestInterval?: number;
}

/**
 * 采集结果
 */
export interface IngestResult {
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
}

/**
 * OpenClaw 日志条目格式
 */
interface LogEntry {
  timestamp: string;
  level?: string;
  module?: string;
  message: string;
}

/**
 * OpenClaw 历史采集器
 */
export class OpenClawIngestor {
  private openclawConfigDir: string;
  private gatewayLogPath: string;
  private lastIngestPosition = 0; // 记录上次采集到第几行
  private lastIngestTime = 0; // 记录上次采集的时间戳
  private maxEntries: number;

  constructor(config: OpenClawIngestorConfig = {}) {
    this.openclawConfigDir = config.openclawConfigDir || path.join(os.homedir(), '.openclaw');
    this.gatewayLogPath = path.join(this.openclawConfigDir, 'logs', 'gateway.log');
    this.maxEntries = config.maxEntries || 50;
  }

  /**
   * 采集新日志记录
   *
   * @param db - 数据库实例
   * @returns 采集结果
   */
  async ingest(db: CorivoDatabase): Promise<IngestResult> {
    const result: IngestResult = {
      processed: 0,
      saved: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      // 检查日志文件是否存在
      const exists = await this.fileExists();
      if (!exists) {
        return result; // 文件不存在，跳过
      }

      // 读取日志文件
      const content = await fs.readFile(this.gatewayLogPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // 找出新的记录（从上次位置开始）
      const newEntries: LogEntry[] = [];
      for (let i = this.lastIngestPosition; i < lines.length; i++) {
        const entry = this.parseLogLine(lines[i]);
        if (entry) {
          const entryTime = new Date(entry.timestamp).getTime();
          // 只处理最近的新记录
          if (entryTime > this.lastIngestTime) {
            newEntries.push(entry);
          }
        }
      }

      // 更新位置
      this.lastIngestPosition = lines.length;
      if (newEntries.length > 0) {
        const lastEntry = newEntries[newEntries.length - 1];
        this.lastIngestTime = new Date(lastEntry.timestamp).getTime();
      }

      result.processed = newEntries.length;

      // 处理每条记录
      for (const entry of newEntries.slice(-this.maxEntries)) {
        try {
          const shouldSave = this.shouldSaveEntry(entry);
          if (!shouldSave) {
            result.skipped++;
            continue;
          }

          // 检查是否已存在
          const existing = db.queryBlocks({
            limit: 1,
            source: 'openclaw-logs',
          });

          const alreadyExists = existing.some(b =>
            b.content === entry.message && b.source === 'openclaw-logs'
          );

          if (alreadyExists) {
            result.skipped++;
            continue;
          }

          // 保存到数据库
          const annotation = this.annotateEntry(entry);
          db.createBlock({
            content: entry.message,
            annotation,
            source: 'openclaw-logs',
          });

          result.saved++;
        } catch {
          result.errors++;
        }
      }

    } catch (error) {
      console.error('[OpenClaw采集] 读取失败:', error);
      result.errors++;
    }

    return result;
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string): LogEntry | null {
    // OpenClaw 日志格式: 2026-03-23T14:36:24.014+08:00 [feishu] message...
    // 或: 2026-03-23T14:36:24.014+08:00 [error]: ...
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:+.]+)\s*(?:\[([^\]]+)\])?\s*(?:\[([^\]]+)\])?\s*(.+)$/);
    if (!match) return null;

    const [, timestamp, level, module, message] = match;
    return { timestamp, level, module, message: message.trim() };
  }

  /**
   * 判断是否值得保存
   */
  private shouldSaveEntry(entry: LogEntry): boolean {
    const message = entry.message.trim();

    // 过滤条件

    // 1. 太短不保存
    if (message.length < 10) {
      return false;
    }

    // 2. 纯测试/调试内容不保存
    if (/^(test|测试|debug|ping|pong|heartbeat)/i.test(message)) {
      return false;
    }

    // 3. 纯标点或数字不保存
    if (/^[0-9\s\-,.!?]+$/.test(message)) {
      return false;
    }

    // 值得保存的条件

    // 1. 错误日志
    if (entry.level === 'error' || message.includes('error')) {
      return true;
    }

    // 2. 包含决策关键词
    if (/决定|选择|选|采用|使用/i.test(message)) {
      return true;
    }

    // 3. 包含记忆/保存关键词
    if (/记住|保存|记录|记忆|memory/i.test(message)) {
      return true;
    }

    // 4. 包含问题
    if (message.includes('怎么') || message.includes('如何') || message.includes('?') || message.includes('？')) {
      return true;
    }

    // 5. feishu/消息相关
    if (/feishu|message|received|sent/i.test(message) && message.length > 20) {
      return true;
    }

    // 6. 足够长的有意义句子
    if (message.length > 30 && message.split(/\s+/).length >= 5) {
      return true;
    }

    return false;
  }

  /**
   * 为日志条目生成标注
   */
  private annotateEntry(entry: LogEntry): string {
    const message = entry.message.toLowerCase();

    // 错误类
    if (entry.level === 'error' || message.includes('error')) {
      return `问题 · 工具 · OpenClaw`;
    }

    // 决策类
    if (/决定|选择|选|采用|使用/i.test(message)) {
      return `决策 · self · OpenClaw`;
    }

    // 问题/知识类
    if (/怎么|如何|什么|为什么|\?|？/.test(message)) {
      return `知识 · self · OpenClaw`;
    }

    // 消息类
    if (/feishu|message|received|sent/i.test(message)) {
      return `事实 · 工作流 · OpenClaw`;
    }

    // 默认
    return `事实 · self · OpenClaw`;
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.gatewayLogPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取日志文件状态
   */
  async getStatus(): Promise<{
    exists: boolean;
    size: number;
    lastModified: number | null;
  }> {
    try {
      const stats = await fs.stat(this.gatewayLogPath);
      return {
        exists: true,
        size: stats.size,
        lastModified: stats.mtimeMs,
      };
    } catch {
      return {
        exists: false,
        size: 0,
        lastModified: null,
      };
    }
  }
}
