/**
 * OpenClaw historical ingestor for passively collecting conversations and activity logs
 *
 * Event-driven mode watches `~/.openclaw/logs/gateway.log` and ingests new entries in real time.
 * If file watching fails, it falls back to polling on an interval.
 */

import fs from 'node:fs/promises';
import { watch, existsSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CorivoDatabase } from 'corivo';

/**
 * Ingestor configuration
 */
export interface OpenClawIngestorConfig {
  /** OpenClaw configuration directory (default ~/.openclaw) */
  openclawConfigDir?: string;
  /** Maximum number of entries to process per run */
  maxEntries?: number;
  /** Polling interval in milliseconds, used only in fallback mode */
  ingestInterval?: number;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

/**
 * Ingestion result
 */
export interface IngestResult {
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
}

/**
 * OpenClaw log entry format
 */
interface LogEntry {
  timestamp: string;
  level?: string;
  module?: string;
  message: string;
}

/**
 * OpenClaw historical ingestor
 */
export class OpenClawIngestor {
  private openclawConfigDir: string;
  private gatewayLogPath: string;
  private lastIngestPosition = 0; // Byte offset after the last processed entry
  private lastIngestTime = 0; // Timestamp of the last ingest run
  private maxEntries: number;
  private debounceMs: number;
  private db: CorivoDatabase | null = null;
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private isWatching = false;
  private usePolling = false; // Whether the ingestor is currently using polling fallback

  constructor(config: OpenClawIngestorConfig = {}) {
    this.openclawConfigDir = config.openclawConfigDir || path.join(os.homedir(), '.openclaw');
    this.gatewayLogPath = path.join(this.openclawConfigDir, 'logs', 'gateway.log');
    this.maxEntries = config.maxEntries || 50;
    this.debounceMs = config.debounceMs || 500;
  }

  /**
   * Start listening (event-driven mode)
   */
  async startWatching(database: CorivoDatabase): Promise<void> {
    if (this.isWatching) {
      console.log('[OpenClaw采集] 已在运行中');
      return;
    }

    this.db = database;

    // Wait for the log file if OpenClaw has not created it yet
    if (!existsSync(this.gatewayLogPath)) {
      console.log('[OpenClaw采集] 日志文件不存在，等待文件创建...');
      // Watch for the log file to appear
      this.watchForFileCreation();
      return;
    }

    // Start watching the log file
    try {
      this.setupFileWatcher();
    } catch (error) {
      console.error('[OpenClaw采集] 监听启动失败，回退到轮询模式:', error);
      this.startPolling();
    }
  }

  /**
   * Stop watching for new log entries
   */
  async stop(): Promise<void> {
    this.isWatching = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    console.log('[OpenClaw采集] 已停止');
  }

  /**
   * Set up the file watcher
   */
  private setupFileWatcher(): void {
    this.watcher = watch(this.gatewayLogPath, { persistent: false }, (eventType, filename) => {
      if (eventType === 'change') {
        this.scheduleIngest();
      }
    });

    this.isWatching = true;
    console.log('[OpenClaw采集] 文件监听已启动');

    // Run one initial ingest on startup
    this.scheduleIngest();
  }

  /**
   * Wait for the log file to be created when it does not exist yet
   */
  private watchForFileCreation(): void {
    // Poll until the log file appears
    const checkInterval = setInterval(async () => {
      if (existsSync(this.gatewayLogPath)) {
        clearInterval(checkInterval);
        console.log('[OpenClaw采集] 日志文件已创建，启动监听');
        this.setupFileWatcher();
      }
    }, 5000);

    // Give up after 30 minutes
    setTimeout(() => clearInterval(checkInterval), 30 * 60 * 1000);
  }

  /**
   * Debounce ingest scheduling
   */
  private scheduleIngest(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      if (this.db) {
        await this.ingest(this.db);
      }
    }, this.debounceMs);
  }

  /**
   * Start polling fallback mode
   */
  private startPolling(): void {
    this.usePolling = true;
    const interval = 60000; // 60 seconds

    this.pollTimer = setInterval(async () => {
      if (this.db) {
        await this.ingest(this.db);
      }
    }, interval);

    this.isWatching = true;
    console.log(`[OpenClaw采集] 轮询模式已启动 (${interval}ms)`);
  }

  /**
   * Ingest newly appended log records in either watch or polling mode
   *
   * @param db - database instance
   * @returns Ingestion result
   */
  async ingest(db: CorivoDatabase): Promise<IngestResult> {
    // Persist the database handle the first time ingest runs
    if (!this.db) {
      this.db = db;
    }
    const result: IngestResult = {
      processed: 0,
      saved: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      // Skip cleanly if the log file still does not exist
      const exists = await this.fileExists();
      if (!exists) {
        return result; // File does not exist, skip
      }

      // Read the full log file
      const content = await fs.readFile(this.gatewayLogPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Parse only entries that were appended after the last ingest position
      const newEntries: LogEntry[] = [];
      for (let i = this.lastIngestPosition; i < lines.length; i++) {
        const entry = this.parseLogLine(lines[i]);
        if (entry) {
          const entryTime = new Date(entry.timestamp).getTime();
          // Only process the most recent new records
          if (entryTime > this.lastIngestTime) {
            newEntries.push(entry);
          }
        }
      }

      // Update location
      this.lastIngestPosition = lines.length;
      if (newEntries.length > 0) {
        const lastEntry = newEntries[newEntries.length - 1];
        this.lastIngestTime = new Date(lastEntry.timestamp).getTime();
      }

      result.processed = newEntries.length;

      // Process each record
      for (const entry of newEntries.slice(-this.maxEntries)) {
        try {
          const shouldSave = this.shouldSaveEntry(entry);
          if (!shouldSave) {
            result.skipped++;
            continue;
          }

          // Check if it already exists
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

          // Save to database
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
   * Parse log lines
   */
  private parseLogLine(line: string): LogEntry | null {
    // OpenClaw log format: 2026-03-23T14:36:24.014+08:00 [feishu] message...
    // Or: 2026-03-23T14:36:24.014+08:00 [error]: ...
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:+.]+)\s*(?:\[([^\]]+)\])?\s*(?:\[([^\]]+)\])?\s*(.+)$/);
    if (!match) return null;

    const [, timestamp, level, module, message] = match;
    return { timestamp, level, module, message: message.trim() };
  }

  /**
   * Determine whether it is worth saving
   */
  private shouldSaveEntry(entry: LogEntry): boolean {
    const message = entry.message.trim();

    // filter conditions

    // 1. Too short to save
    if (message.length < 10) {
      return false;
    }

    // 2. Pure testing/debugging content is not saved
    if (/^(test|测试|debug|ping|pong|heartbeat)/i.test(message)) {
      return false;
    }

    // 3. Pure punctuation or numbers are not saved
    if (/^[0-9\s\-,.!?]+$/.test(message)) {
      return false;
    }

    // Conditions worth saving

    // 1. Error log
    if (entry.level === 'error' || message.includes('error')) {
      return true;
    }

    // 2. Include decision-making keywords
    if (/决定|选择|选|采用|使用/i.test(message)) {
      return true;
    }

    // 3. Include memorize/save keywords
    if (/记住|保存|记录|记忆|memory/i.test(message)) {
      return true;
    }

    // 4. Include questions
    if (message.includes('怎么') || message.includes('如何') || message.includes('?') || message.includes('？')) {
      return true;
    }

    // 5. feishu/message related
    if (/feishu|message|received|sent/i.test(message) && message.length > 20) {
      return true;
    }

    // 6. Long enough meaningful sentences
    if (message.length > 30 && message.split(/\s+/).length >= 5) {
      return true;
    }

    return false;
  }

  /**
   * Generate annotations for log entries
   */
  private annotateEntry(entry: LogEntry): string {
    const message = entry.message.toLowerCase();

    // Error class
    if (entry.level === 'error' || message.includes('error')) {
      return `问题 · 工具 · OpenClaw`;
    }

    // Decision making
    if (/决定|选择|选|采用|使用/i.test(message)) {
      return `决策 · self · OpenClaw`;
    }

    // Questions/knowledge
    if (/怎么|如何|什么|为什么|\?|？/.test(message)) {
      return `知识 · self · OpenClaw`;
    }

    // Message class
    if (/feishu|message|received|sent/i.test(message)) {
      return `事实 · 工作流 · OpenClaw`;
    }

    // default
    return `事实 · self · OpenClaw`;
  }

  /**
   * Check if the file exists
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
   * Get log file status
   */
  async getStatus(): Promise<{
    exists: boolean;
    size: number;
    lastModified: number | null;
    isWatching: boolean;
    mode: 'watch' | 'poll';
    processedLines: number;
  }> {
    try {
      const stats = await fs.stat(this.gatewayLogPath);
      return {
        exists: true,
        size: stats.size,
        lastModified: stats.mtimeMs,
        isWatching: this.isWatching,
        mode: this.usePolling ? 'poll' : 'watch',
        processedLines: this.lastIngestPosition,
      };
    } catch {
      return {
        exists: false,
        size: 0,
        lastModified: null,
        isWatching: this.isWatching,
        mode: this.usePolling ? 'poll' : 'watch',
        processedLines: this.lastIngestPosition,
      };
    }
  }
}
