/**
 * Heartbeat Daemon
 *
 * Runs in the background, automatically processing pending blocks and
 * executing vitality decay. Authentication is platform-fingerprint based;
 * no password required.
 */

import fs from 'node:fs/promises';
import { CorivoDatabase, getConfigDir } from '@/storage/database';
import { RuleEngine } from './rules/index.js';
import { TechChoiceRule } from './rules/tech-choice.js';
import { AssociationEngine } from '@/domain/memory/services/associations.js';
import { ConsolidationEngine } from '@/domain/memory/services/consolidation.js';
import { WeeklySummary } from '@/domain/memory/services/weekly-summary.js';
import { FollowUpManager } from '@/domain/memory/services/follow-up.js';
import { TriggerDecision } from '@/domain/memory/services/trigger-decision.js';
import { PushQueue } from '@/infrastructure/output/push-queue.js';
import { AutoSync } from './auto-sync.js';
import type { RealtimeCollector, CorivoPlugin } from '../ingestors/types.js';
import { DatabaseError } from '../errors/index.js';
import type { BlockStatus, Pattern } from '@/domain/memory/models/index.js';
import { vitalityToStatus } from '@/domain/memory/models/block.js';
import { loadConfig } from '../config.js';
import { getCliNow, loadCliConfig, loadCliSolver, saveCliSolver } from '@/cli/runtime';
import { createLogger, type Logger } from '../utils/logging.js';
import { runMemoryPipeline } from '../application/memory/run-memory-pipeline.js';

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const PENDING_BATCH_SIZE = 10; // Number of pending blocks processed per cycle
const HEALTH_CHECK_FILE = '.heartbeat-health'; // Health status file name
const HEALTH_CHECK_INTERVAL = 30000; // Write health status every 30 seconds
const DEFAULT_MEMORY_PIPELINE_CYCLES = 2016; // 7-day cadence (1,2,3,...)

/**
 * Heartbeat engine configuration
 */
export interface HeartbeatConfig {
  /** Database instance (optional; used for testing) */
  db?: CorivoDatabase;
  /** Database file path (optional) */
  dbPath?: string;
  /** Sync interval in seconds (optional; for testing; production reads from config.json) */
  syncIntervalSeconds?: number;
  /** Override that controls heartbeat cycles between scheduled memory pipeline runs */
  memoryPipelineCycles?: number;
  /** Logger facade (optional; defaults to the process logger) */
  logger?: Logger;
}

/**
 * First-run configuration for the accelerated bootstrap pass
 */
export interface FirstRunConfig {
  /** Maximum number of pending blocks to process (default 50) */
  maxPendingBlocks?: number;
  /** Time limit in milliseconds (default 8000) */
  timeLimit?: number;
  /** Skip vitality decay (useful when no historical data exists) */
  skipDecay?: boolean;
  /** Skip cold-zone consolidation */
  skipColdZone?: boolean;
}

/**
 * Heartbeat engine
 */
export class Heartbeat {
  private readonly logger: Logger;
  private running = false;
  private db: CorivoDatabase | null = null;
  private config?: HeartbeatConfig;
  private ruleEngine: RuleEngine;
  private associationEngine: AssociationEngine;
  private consolidationEngine: ConsolidationEngine;
  private weeklySummary: WeeklySummary | null = null;
  private followUpManager: FollowUpManager | null = null;
  private triggerDecision: TriggerDecision | null = null;
  private pushQueue: PushQueue | null = null;
  private autoSync: AutoSync | null = null;
  private plugins: RealtimeCollector[] = [];
  private timeoutRef: NodeJS.Timeout | null = null;
  private lastHealthCheck = 0;
  private cycleCount = 0;
  private syncCycles = 60; // Default 5 minutes (60 × 5s)
  private lastWeeklySummary = 0;
  private lastTriggerDecision = 0;
  private memoryPipelineCycles = DEFAULT_MEMORY_PIPELINE_CYCLES;
  private memoryPipelineRunning = false;
  private memoryPipelinePromise: Promise<void> | null = null;
  private healthFilePath: string;

  constructor(config?: HeartbeatConfig) {
    // Persist constructor config for later use
    this.config = config;
    this.logger = config?.logger ?? createLogger();

    // If a db instance was injected (test mode), use it directly
    if (config?.db) {
      this.db = config.db;
      this.weeklySummary = new WeeklySummary(config.db);
      this.followUpManager = new FollowUpManager(config.db);
    }

    // Initialize the rule engine and register built-in rules
    this.ruleEngine = new RuleEngine();
    this.ruleEngine.register(new TechChoiceRule());

    // Initialize association and consolidation engines
    this.associationEngine = new AssociationEngine();
    this.consolidationEngine = new ConsolidationEngine();

    // Resolve health file path
    const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
    this.healthFilePath = `${configDir}/${HEALTH_CHECK_FILE}`;

    if (config?.memoryPipelineCycles !== undefined) {
      const cycles = Math.round(config.memoryPipelineCycles);
      this.memoryPipelineCycles = Math.max(1, cycles);
    }

    // Test mode: inject syncIntervalSeconds directly via constructor config
    if (config?.syncIntervalSeconds !== undefined) {
      this.syncCycles = this.computeSyncCycles(config.syncIntervalSeconds);
    }
  }

  private computeSyncCycles(seconds: number | undefined): number {
    if (!Number.isFinite(seconds) || (seconds as number) <= 0) return 60;
    return Math.max(1, Math.round((seconds as number) / 5));
  }

  /**
   * Start the heartbeat loop.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.log('心跳已在运行');
      return;
    }

    // Skip DB initialization if a db was injected (test mode)
    if (!this.db) {
      // Read DB path from environment variables set by the CLI process
      const dbPath = process.env.CORIVO_DB_PATH;

      if (!dbPath) {
        throw new Error('缺少环境变量：CORIVO_DB_PATH');
      }

      // Open the database
      this.db = CorivoDatabase.getInstance({ path: dbPath });

      // Initialize managers that depend on the database
      this.weeklySummary = new WeeklySummary(this.db);
      this.followUpManager = new FollowUpManager(this.db);
      this.triggerDecision = new TriggerDecision(this.db);
      this.pushQueue = new PushQueue();
      // Load sync interval from config.json (production path; test mode uses constructor injection)
      const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
      const corivoConfig = await loadConfig(configDir);
      this.autoSync = new AutoSync(
        this.db,
        {
          logger: this.logger,
          loadConfig: () => loadCliConfig(configDir),
          loadSolver: () => loadCliSolver(configDir),
          saveSolver: (config) => saveCliSolver(config, configDir),
          now: () => getCliNow(),
        }
      );
      this.syncCycles = this.computeSyncCycles(corivoConfig?.settings?.syncIntervalSeconds);

      // Dynamically load configured plugins
      await this.loadPlugins(corivoConfig?.plugins ?? []);

      this.logger.log(`心跳守护进程启动中... (规则: ${this.ruleEngine.ruleCount})`);
    }

    this.running = true;
    this.run();
  }

  /**
   * Main heartbeat loop.
   */
  private async run(): Promise<void> {
    while (this.running) {
      const start = Date.now();

      try {
        // Annotate newly ingested blocks
        await this.processPendingBlocks();

        // Apply vitality decay
        await this.processVitalityDecay();

        // Increment cycle counter
        this.cycleCount++;

        // Association analysis (every 6 cycles = 30 seconds)
        if (this.cycleCount % 6 === 0) {
          await this.processAssociations();
        }

        // Hot-zone consolidation (every 12 cycles = 1 minute)
        if (this.cycleCount % 12 === 0) {
          await this.processConsolidation();
        }

        // Weekly summary (every 2016 cycles = 7 days)
        if (this.cycleCount % 2016 === 0 && this.db) {
          await this.sendWeeklySummary();
        }

        // Follow-up reminders (every 864 cycles = ~1 hour)
        if (this.cycleCount % 864 === 0 && this.db) {
          await this.checkFollowUps();
        }

        // Trigger decisions (every 120 cycles = 10 minutes)
        if (this.cycleCount % 120 === 0 && this.db && this.triggerDecision && this.pushQueue) {
          await this.processTriggerDecision();
        }

        // Auto-sync (every syncCycles cycles; default 60 = 5 minutes)
        if (this.cycleCount % this.syncCycles === 0 && this.db && this.autoSync) {
          await this.processSync();
        }

        // Update health status (every 6 cycles)
        if (this.cycleCount % (HEALTH_CHECK_INTERVAL / HEARTBEAT_INTERVAL) === 0) {
          await this.updateHealthCheck();
        }

        if (this.shouldTriggerMemoryPipeline()) {
          this.triggerScheduledMemoryPipeline();
        }
      } catch (error) {
        if (error instanceof DatabaseError) {
          this.logger.error('[心跳] 数据库错误:', error.message);
        } else {
          this.logger.error('[心跳] 处理错误:', error);
        }
      }

      // Wait until the next cycle is due
      const elapsed = Date.now() - start;
      const wait = Math.max(0, HEARTBEAT_INTERVAL - elapsed);

      if (this.running) {
        await this.sleep(wait);
      }
    }

    this.logger.log('心跳进程已停止');
    // Remove the health file on clean shutdown
    await this.cleanupHealthCheck();
  }

  /**
   * Dynamically load a list of plugin packages.
   *
   * Each package is imported by name; failures are logged and skipped so that
   * other plugins and the main heartbeat loop are not interrupted.
   * Plugins must be globally installed: npm install -g <package-name>
   *
   * Public for testing.
   */
  async loadPlugins(packageNames: string[]): Promise<void> {
    for (const packageName of packageNames) {
      try {
        const mod = await import(packageName);
        const plugin = (mod.default ?? mod) as CorivoPlugin;
        await this.loadPlugin(plugin);
      } catch (err) {
        this.logger.error(`[Heartbeat] 加载 ${packageName} 失败，跳过:`, err);
      }
    }
  }

  /**
   * Initialize and register a single plugin.
   *
   * Public for testing.
   */
  async loadPlugin(plugin: CorivoPlugin): Promise<void> {
    if (!this.db) {
      throw new Error('[Heartbeat] loadPlugin called before database is initialized');
    }
    const collector = plugin.create();
    await collector.startWatching(this.db);
    this.plugins.push(collector);
    this.logger.log(`[Heartbeat] 已加载插件: ${plugin.name}`);
  }

  /**
   * Stop the heartbeat loop and clean up resources.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }

    if (this.memoryPipelinePromise) {
      await this.memoryPipelinePromise;
    }

    // Stop all active plugins
    for (const plugin of this.plugins) {
      await plugin.stop();
    }
    this.plugins = [];

    if (this.db) {
      CorivoDatabase.closeAll();
      this.db = null;
    }

    // Remove health file
    await this.cleanupHealthCheck();
  }

  /**
   * First-run accelerated pass.
   *
   * Executed immediately after installation to quickly process Cold Scan results
   * without waiting for the normal heartbeat cadence.
   */
  async runFirstRun(config: FirstRunConfig = {}): Promise<{
    processedBlocks: number;
    elapsedTime: number;
  }> {
    const {
      maxPendingBlocks = 50,
      timeLimit = 8000,
      skipDecay = true,
      skipColdZone = true,
    } = config;

    this.logger.log('[corivo] 正在认识你...');

    const startTime = Date.now();
    let processedBlocks = 0;

    try {
      // Initialize the database if not already open
      if (!this.db) {
        let dbPath = process.env.CORIVO_DB_PATH;

        // Fall back to constructor-injected config
        if (!dbPath && this.config?.dbPath) {
          dbPath = this.config.dbPath;
        }

        if (!dbPath) {
          throw new Error('缺少环境变量：CORIVO_DB_PATH');
        }

        this.db = CorivoDatabase.getInstance({ path: dbPath });
      }

      // Process pending blocks with a relaxed count limit
      const pending = this.db.queryBlocks({
        annotation: 'pending',
        limit: maxPendingBlocks,
      });

      for (const block of pending) {
        // Abort if the time budget is exceeded
        if (Date.now() - startTime > timeLimit) {
          this.logger.log(`[corivo] 首次运行超时，已处理 ${processedBlocks}/${pending.length} 条`);
          break;
        }

        // Apply the rule engine to assign an annotation
        const pattern = this.ruleEngine.extract(block.content);
        const annotation = pattern
          ? `决策 · ${pattern.type} · ${pattern.decision}`
          : '知识 · 未分类 · 一般';

        // Persist the annotation and grant full vitality on first run
        this.db.updateBlock(block.id, {
          annotation,
          status: vitalityToStatus(100),
        });

        processedBlocks++;
      }

      // Build associations in fast mode (optional)
      if (!skipColdZone && this.db) {
        const blocks = this.db.queryBlocks({ limit: 100 });
        const associations = this.associationEngine.discoverByRules(blocks);

        for (const assoc of associations) {
          try {
            this.db.createAssociation(assoc);
          } catch {
            // Ignore duplicate association errors
          }
        }
      }

      // Decay is intentionally skipped on first run — no historical data exists yet

    } catch (error) {
      this.logger.error('[corivo] 首次运行出错:', error);
    }

    const elapsedTime = Date.now() - startTime;

    this.logger.log(`[corivo] 首次运行完成，处理了 ${processedBlocks} 条信息`);

    return { processedBlocks, elapsedTime };
  }

  /**
   * Write current process state to the health check file.
   *
   * The monitoring process reads this file to verify that the daemon is alive.
   */
  private async updateHealthCheck(): Promise<void> {
    try {
      const healthData = {
        pid: process.pid,
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cycleCount: this.cycleCount,
      };
      await fs.writeFile(this.healthFilePath, JSON.stringify(healthData));
      this.lastHealthCheck = Date.now();
    } catch (error) {
      this.logger.error('[心跳] 更新健康状态失败:', error);
    }
  }

  /**
   * Remove the health check file on shutdown.
   */
  private async cleanupHealthCheck(): Promise<void> {
    try {
      await fs.unlink(this.healthFilePath);
    } catch {
      // File may not exist or deletion may fail — both are acceptable
    }
  }

  /**
   * Read the health status from disk (for external health queries).
   */
  static async getHealthStatus(configDir?: string): Promise<{
    healthy: boolean;
    lastCheck: number | null;
    age: number | null;
  }> {
    try {
      const dir = configDir || getConfigDir();
      const healthPath = `${dir}/${HEALTH_CHECK_FILE}`;
      const content = await fs.readFile(healthPath, 'utf-8');
      const health = JSON.parse(content);

      const now = Date.now();
      const age = now - health.timestamp;
      const healthy = age < HEALTH_CHECK_INTERVAL * 2; // Allow up to 2x interval latency

      return {
        healthy,
        lastCheck: health.timestamp,
        age,
      };
    } catch {
      return {
        healthy: false,
        lastCheck: null,
        age: null,
      };
    }
  }

  /**
   * Execute a single heartbeat cycle (used in tests).
   *
   * Runs pending block processing, association discovery, and vitality decay once.
   */
  async runOnce(): Promise<void> {
    await this.processPendingBlocks();
    await this.processAssociations();
    await this.processVitalityDecay();
  }

  /**
   * Annotate pending blocks using the rule engine.
   */
  private async processPendingBlocks(): Promise<void> {
    if (!this.db) return;

    // Fetch the next batch of unannotated blocks
    const pending = this.db.queryBlocks({
      annotation: 'pending',
      limit: PENDING_BATCH_SIZE,
    });

    if (pending.length === 0) return;

    this.logger.log(`[心跳] 处理 ${pending.length} 个待标注 block`);

    for (const block of pending) {
      try {
        // Skip empty content — assign a placeholder annotation
        if (!block.content || block.content.trim().length === 0) {
          this.logger.log(`  ${block.id}: 跳过空内容`);
          this.db!.updateBlock(block.id, {
            annotation: '知识 · knowledge · 空',
          });
          continue;
        }

        const annotation = this.annotateBlock(block.content);
        const pattern = this.extractPattern(block.content);

        // Persist annotation and pattern
        this.db!.updateBlock(block.id, {
          annotation,
          ...(pattern && { pattern }),
        });
        this.logger.log(`  ${block.id}: ${annotation}${pattern ? ` (${pattern.type})` : ''}`);
      } catch (error) {
        this.logger.error(`  ${block.id}: 标注失败`, error);
      }
    }
  }

  /**
   * Determine the annotation for a block's content.
   *
   * Tries the rule engine first, then falls back to keyword-based heuristics.
   */
  private annotateBlock(content: string): string {
    // Rule engine takes priority
    const pattern = this.ruleEngine.extract(content);
    if (pattern) {
      // Map tech-choice decisions to a decision annotation
      if (pattern.type === '技术选型') {
        return `决策 · project · ${pattern.decision.toLowerCase()}`;
      }
    }

    // Keyword-based fallback heuristics
    const lower = content.toLowerCase();

    // Credentials / secrets
    if (/密码|token|api[- ]?key|secret|凭证|密钥/.test(lower)) {
      return '事实 · asset · 凭证';
    }

    // Explicit decisions
    if (/选择|决定|选型|采用|使用/.test(content)) {
      return '决策 · project · 项目';
    }

    // Code / programming language references
    if (/\.(js|ts|py|java|go|rs|c|cpp|h)/i.test(content) ||
        /javascript|typescript|python|golang|rust/.test(lower)) {
      return '知识 · knowledge · 代码';
    }

    // Configuration references
    if (/config|配置|设置|环境变量/.test(lower)) {
      return '知识 · knowledge · 配置';
    }

    return '知识 · knowledge · 通用';
  }

  /**
   * Extract a decision pattern from block content.
   *
   * Returns null if no pattern is recognized.
   */
  private extractPattern(content: string): Pattern | null {
    // Rule engine takes priority
    const pattern = this.ruleEngine.extract(content);
    if (pattern) {
      return pattern;
    }

    // For decision-like content not matched by any rule, build a minimal pattern
    const lower = content.toLowerCase();
    if (/选择|决定|选型|采用|使用/.test(content)) {
      // Attempt to extract the chosen item from the sentence
      const match = content.match(/(?:选择|决定|选型|采用|使用)\s+([^\u3000-\u303f\uff00-\uffef\s,。,，.]+?)(?:\s|$|，|。)/);
      if (match && match[1]) {
        return {
          type: '技术选型',
          decision: match[1].trim(),
          dimensions: [],
          context_tags: [],  // required field
          confidence: 0.6,
        };
      }
    }

    return null;
  }

  /**
   * Apply vitality decay to all active blocks in a single batch update.
   */
  private async processVitalityDecay(): Promise<void> {
    if (!this.db) return;

    // Load all non-archived blocks
    const blocks = this.db.queryBlocks({ limit: 100 });
    const now = Date.now();

    // Collect blocks that need a vitality update
    const updates: Array<{ id: string; vitality: number; status: string }> = [];
    let unchangedCount = 0;

    for (const block of blocks) {
      // Archived blocks are exempt from decay
      if (block.status === 'archived') continue;

      // Determine time since last access, preferring the most specific timestamp
      // Priority: last_accessed > updated_at > created_at
      const lastAccessed = block.last_accessed || (block.updated_at * 1000) || (block.created_at * 1000);
      const daysSinceAccess = (now - lastAccessed) / 86400000;

      if (daysSinceAccess < 1) {
        // No decay within 24 hours — recently touched blocks stay fresh
        unchangedCount++;
        continue;
      }

      // Decay rate varies by annotation type
      let decayRate = 1; // Default: 1 point per day

      if (block.annotation.includes('事实')) {
        decayRate = 0.5; // Facts decay slowly
      } else if (block.annotation.includes('知识')) {
        decayRate = 2; // Knowledge decays quickly
      } else if (block.annotation.includes('决策')) {
        decayRate = 0.3; // Decisions decay most slowly
      }

      // Compute new vitality
      const decayAmount = Math.floor(daysSinceAccess * decayRate);
      const newVitality = Math.max(0, block.vitality - decayAmount);

      // Skip if vitality has not changed
      if (newVitality === block.vitality) {
        unchangedCount++;
        continue;
      }

      // Derive new status from vitality
      const newStatus = vitalityToStatus(newVitality);

      updates.push({
        id: block.id,
        vitality: newVitality,
        status: newStatus,
      });
    }

    // Flush batch updates to the database
    if (updates.length > 0) {
      const updatedCount = this.db.batchUpdateVitality(updates);
      this.logger.log(`[心跳] 衰减处理: ${updatedCount} 个更新, ${unchangedCount} 个不变`);
    }
  }

  /**
   * Discover and persist associations among active blocks.
   *
   * Runs periodically to keep the knowledge graph up to date.
   */
  private async processAssociations(): Promise<void> {
    if (!this.db) return;

    try {
      // Load a sample of currently active blocks
      const activeBlocks = this.db.queryBlocks({
        status: 'active',
        limit: 50,
      });

      if (activeBlocks.length < 2) {
        return; // Need at least 2 blocks to form an association
      }

      // Discover new associations
      const associations = this.associationEngine.discoverByRules(activeBlocks);

      if (associations.length > 0) {
        // Persist all discovered associations in one batch
        this.db.batchCreateAssociations(associations);
        this.logger.log(`[心跳] 关联分析: 发现 ${associations.length} 个新关联`);
      }
    } catch (error) {
      this.logger.error('[心跳] 关联分析失败:', error);
    }
  }

  /**
   * Merge duplicate content and repair missing reference links.
   *
   * Runs periodically to keep the hot zone clean and well-connected.
   */
  private async processConsolidation(): Promise<void> {
    if (!this.db) return;

    try {
      // Load a sample of active blocks
      const activeBlocks = this.db.queryBlocks({
        status: 'active',
        limit: 20,
      });

      if (activeBlocks.length < 2) {
        return; // Need at least 2 blocks for consolidation
      }

      // Deduplicate: merge highly similar blocks
      const mergeResults = this.consolidationEngine.deduplicateBlocks(activeBlocks);

      for (const result of mergeResults) {
        if (result.result) {
          // Update the surviving block with merged refs and max vitality
          this.db.updateBlock(result.result.id, {
            refs: result.result.refs,
            vitality: result.result.vitality,
          });

          // Archive all absorbed blocks
          for (const otherId of result.blocks) {
            if (otherId !== result.result!.id) {
              this.db.updateBlock(otherId, { status: 'archived' });
            }
          }

          this.logger.log(`[心跳] 整合: 合并了 ${result.blocks.length} 个相似内容`);
        }
      }

      // Link repair: add refs that associations imply but are missing
      const existingAssociations = this.db.queryAssociations({ limit: 100 });
      const missingLinks = this.consolidationEngine.findMissingLinks(
        activeBlocks,
        existingAssociations
      );

      for (const [blockId, newRefs] of missingLinks.entries()) {
        const block = this.db.getBlock(blockId);
        if (block) {
          const mergedRefs = [...new Set([...block.refs, ...newRefs])];
          this.db.updateBlock(blockId, { refs: mergedRefs });
        }
      }

      if (missingLinks.size > 0) {
        this.logger.log(`[心跳] 整合: 为 ${missingLinks.size} 个 block 补充了关联`);
      }
    } catch (error) {
      this.logger.error('[心跳] 热区整合失败:', error);
    }
  }

  /**
   * Generate and emit the weekly summary.
   *
   * Typically triggered on Mondays via the cycle counter.
   */
  private async sendWeeklySummary(): Promise<void> {
    if (!this.db) return;

    try {
      // Lazy-initialize the weekly summary manager
      if (!this.weeklySummary) {
        this.weeklySummary = new WeeklySummary(this.db);
      }

      const summary = this.weeklySummary.generateSummary();
      if (summary) {
        this.logger.log(`\n${summary}\n`);
      }
    } catch (error) {
      this.logger.error('[心跳] 周总结失败:', error);
    }
  }

  /**
   * Check for pending follow-up reminders and emit them.
   *
   * Runs roughly hourly to surface unresolved decisions.
   */
  private async checkFollowUps(): Promise<void> {
    if (!this.db) return;

    try {
      // Lazy-initialize the follow-up manager
      if (!this.followUpManager) {
        this.followUpManager = new FollowUpManager(this.db);
      }

      const reminders = this.followUpManager.getWeeklyReminders();
      if (reminders.length > 0) {
        for (const reminder of reminders) {
          this.logger.log(`\n${reminder}\n`);
        }
      }
    } catch (error) {
      this.logger.error('[心跳] 进展提醒失败:', error);
    }
  }

  /**
   * Run the trigger-decision engine and enqueue any resulting push items.
   *
   * Checks roughly every 10 minutes whether any memories warrant proactive alerts.
   */
  private async processTriggerDecision(): Promise<void> {
    if (!this.db || !this.triggerDecision || !this.pushQueue) {
      return;
    }

    try {
      // Ensure the push queue is loaded from disk
      await this.pushQueue.load();

      // Ask the trigger engine to evaluate current state
      const items = this.triggerDecision.decide({
        now: Date.now(),
      });

      // Enqueue any generated push items
      if (items.length > 0) {
        await this.pushQueue.addAll(items);
        this.logger.log(`[心跳] 触发决策: 生成了 ${items.length} 条推送`);
      }
    } catch (error) {
      this.logger.error('[心跳] 触发决策失败:', error);
    }
  }

  /**
   * Run a background push/pull sync cycle.
   *
   * Silently skipped if the user has not registered with a sync server.
   */
  private async processSync(): Promise<void> {
    if (!this.autoSync) return;
    try {
      const result = await this.autoSync.run();
      if (result) {
        this.logger.log(`[心跳] 自动同步: Push ${result.pushed}, Pull ${result.pulled}`);
      }
    } catch (error) {
      this.logger.error('[心跳] 自动同步失败:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Promise-based sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldTriggerMemoryPipeline(): boolean {
    if (!this.running) {
      return false;
    }
    if (!Number.isFinite(this.memoryPipelineCycles) || this.memoryPipelineCycles <= 0) {
      return false;
    }
    if (this.cycleCount === 0) {
      return false;
    }
    if (this.memoryPipelineRunning) {
      return false;
    }

    return this.cycleCount % this.memoryPipelineCycles === 0;
  }

  private triggerScheduledMemoryPipeline(): void {
    if (this.memoryPipelineRunning) {
      return;
    }

    const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
    const dbPath = process.env.CORIVO_DB_PATH || this.config?.dbPath;
    if (!dbPath) {
      this.logger.error('[心跳] scheduled memory pipeline 跳过: 缺少数据库路径');
      return;
    }

    this.memoryPipelineRunning = true;
    this.memoryPipelinePromise = runMemoryPipeline({
      mode: 'incremental',
      dependencies: {
        runtime: {
          resolveConfigDir: () => configDir,
          resolveDatabasePath: () => dbPath,
        },
        createTrigger: () => ({
          type: 'scheduled',
          runAt: Date.now(),
          requestedBy: 'heartbeat',
        }),
      },
    })
      .then(() => {})
      .catch((error) => {
        this.logger.error('[心跳] scheduled memory pipeline 触发失败:', error);
      })
      .finally(() => {
        this.memoryPipelineRunning = false;
        this.memoryPipelinePromise = null;
      });
  }
}

// Direct-run entry point (when this file is executed as the daemon process).
// Detection: both the current file path and argv[1] must end with 'heartbeat.js'.
// Note: cannot compare currentFilePath === argv1 because tsup bundles everything
// into dist/cli/index.js, making both paths identical after bundling.
const isDirectRun = () => {
  try {
    const currentFilePath = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1];
    return currentFilePath.endsWith('/heartbeat.js') && argv1.endsWith('heartbeat.js');
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  const processLogger = createLogger();
  const heartbeat = new Heartbeat({ logger: processLogger });

  heartbeat.start().catch((error) => {
    processLogger.error('启动失败:', error);
    process.exit(1);
  });

  /**
   * Graceful shutdown handler.
   *
   * Node.js signal handlers cannot be async, so we wrap the async cleanup
   * in a regular function to ensure it completes before exiting.
   */
  const gracefulShutdown = async (signal: string): Promise<void> => {
    processLogger.log(`\n收到 ${signal} 信号，正在停止...`);
    try {
      await heartbeat.stop();
      processLogger.log('清理完成，退出中...');
      process.exit(0);
    } catch (error) {
      processLogger.error('清理失败:', error);
      process.exit(1);
    }
  };

  // Register signal handlers (sync wrappers around async shutdown logic)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
