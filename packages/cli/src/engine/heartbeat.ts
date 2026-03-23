/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 * 无需密码，基于平台指纹认证
 */

import fs from 'node:fs/promises';
import { CorivoDatabase, getConfigDir } from '../storage/database.js';
import { RuleEngine } from './rules/index.js';
import { TechChoiceRule } from './rules/tech-choice.js';
import { AssociationEngine } from './associations.js';
import { ConsolidationEngine } from './consolidation.js';
import { WeeklySummary } from './weekly-summary.js';
import { FollowUpManager } from './follow-up.js';
import { TriggerDecision } from './trigger-decision.js';
import { PushQueue } from './push-queue.js';
import { AutoSync } from './auto-sync.js';
import { OpenClawIngestor } from '../ingestors/openclaw-ingestor.js';
import { DatabaseError } from '../errors/index.js';
import type { BlockStatus, Pattern } from '../models/index.js';
import { vitalityToStatus } from '../models/block.js';
import { loadConfig } from '../config.js';

const HEARTBEAT_INTERVAL = 5000; // 5 秒
const PENDING_BATCH_SIZE = 10; // 每次处理的 pending 数量
const HEALTH_CHECK_FILE = '.heartbeat-health'; // 健康检查文件
const HEALTH_CHECK_INTERVAL = 30000; // 30 秒写入一次健康状态

/**
 * 心跳引擎配置
 */
export interface HeartbeatConfig {
  /** 数据库实例（可选，用于测试） */
  db?: CorivoDatabase;
  /** 数据库密钥（可选，base64 编码） */
  dbKey?: Buffer | string;
  /** 数据库路径（可选） */
  dbPath?: string;
  /** 同步间隔秒数（可选，用于测试；生产环境从 config.json 读取） */
  syncIntervalSeconds?: number;
}

/**
 * 首次运行配置
 */
export interface FirstRunConfig {
  /** 最大 pending blocks 数量（默认 50） */
  maxPendingBlocks?: number;
  /** 时间限制（毫秒，默认 8000） */
  timeLimit?: number;
  /** 是否跳过衰减 */
  skipDecay?: boolean;
  /** 是否跳过冷区整合 */
  skipColdZone?: boolean;
}

/**
 * 心跳引擎
 */
export class Heartbeat {
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
  private openclawIngestor: OpenClawIngestor | null = null;
  private timeoutRef: NodeJS.Timeout | null = null;
  private lastHealthCheck = 0;
  private cycleCount = 0;
  private syncCycles = 60; // 默认 5 分钟（60 × 5s）
  private lastWeeklySummary = 0;
  private lastTriggerDecision = 0;
  private healthFilePath: string;

  constructor(config?: HeartbeatConfig) {
    // 保存配置
    this.config = config;

    // 如果传入了 db，直接使用（用于测试）
    if (config?.db) {
      this.db = config.db;
      this.weeklySummary = new WeeklySummary(config.db);
      this.followUpManager = new FollowUpManager(config.db);
    }

    // 初始化规则引擎
    this.ruleEngine = new RuleEngine();
    this.ruleEngine.register(new TechChoiceRule());

    // 初始化关联和整合引擎
    this.associationEngine = new AssociationEngine();
    this.consolidationEngine = new ConsolidationEngine();

    // 健康文件路径
    const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
    this.healthFilePath = `${configDir}/${HEALTH_CHECK_FILE}`;

    // 测试模式：从 config 直接注入 syncIntervalSeconds
    if (config?.syncIntervalSeconds !== undefined) {
      this.syncCycles = this.computeSyncCycles(config.syncIntervalSeconds);
    }
  }

  private computeSyncCycles(seconds: number | undefined): number {
    if (!Number.isFinite(seconds) || (seconds as number) <= 0) return 60;
    return Math.max(1, Math.round((seconds as number) / 5));
  }

  /**
   * 启动心跳循环
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('心跳已在运行');
      return;
    }

    // 如果已经设置了 db（测试模式），跳过初始化
    if (!this.db) {
      // 从环境变量获取密钥（由 CLI 进程传入）
      const dbKeyBase64 = process.env.CORIVO_DB_KEY;
      const dbPath = process.env.CORIVO_DB_PATH;

      if (!dbKeyBase64 || !dbPath) {
        throw new Error('缺少环境变量：CORIVO_DB_KEY 或 CORIVO_DB_PATH');
      }

      // 将 base64 密钥转换为 Buffer
      const dbKey = Buffer.from(dbKeyBase64, 'base64');

      // 打开数据库
      this.db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

      // 初始化依赖 db 的 managers
      this.weeklySummary = new WeeklySummary(this.db);
      this.followUpManager = new FollowUpManager(this.db);
      this.triggerDecision = new TriggerDecision(this.db);
      this.pushQueue = new PushQueue();
      this.autoSync = new AutoSync(this.db);

      // 初始化 OpenClaw 采集器（事件驱动模式）
      this.openclawIngestor = new OpenClawIngestor();
      await this.openclawIngestor.startWatching(this.db);

      // 从 config.json 读取同步间隔（生产路径；测试模式走构造函数注入，不会进入此块）
      const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
      const corivoConfig = await loadConfig(configDir);
      this.syncCycles = this.computeSyncCycles(corivoConfig?.settings?.syncIntervalSeconds);

      console.log(`心跳守护进程启动中... (规则: ${this.ruleEngine.ruleCount})`);
    }

    this.running = true;
    this.run();
  }

  /**
   * 主循环
   */
  private async run(): Promise<void> {
    while (this.running) {
      const start = Date.now();

      try {
        // 处理待标注的 block
        await this.processPendingBlocks();

        // 处理衰减
        await this.processVitalityDecay();

        // 更新周期计数
        this.cycleCount++;

        // 关联分析（每 6 个周期 = 30 秒）
        if (this.cycleCount % 6 === 0) {
          await this.processAssociations();
        }

        // 热区整合（每 12 个周期 = 1 分钟）
        if (this.cycleCount % 12 === 0) {
          await this.processConsolidation();
        }

        // 每周总结（每 2016 个周期 = 7 天）
        if (this.cycleCount % 2016 === 0 && this.db) {
          await this.sendWeeklySummary();
        }

        // 进展提醒（每 864 个周期 = 1 小时，检查一次）
        if (this.cycleCount % 864 === 0 && this.db) {
          await this.checkFollowUps();
        }

        // 触发决策（每 120 个周期 = 10 分钟，检查一次）
        if (this.cycleCount % 120 === 0 && this.db && this.triggerDecision && this.pushQueue) {
          await this.processTriggerDecision();
        }

        // 自动同步（每 syncCycles 个周期，默认 60 = 5 分钟）
        if (this.cycleCount % this.syncCycles === 0 && this.db && this.autoSync) {
          await this.processSync();
        }

        // 更新健康状态（每 6 个周期更新一次）
        if (this.cycleCount % (HEALTH_CHECK_INTERVAL / HEARTBEAT_INTERVAL) === 0) {
          await this.updateHealthCheck();
        }
      } catch (error) {
        if (error instanceof DatabaseError) {
          console.error('[心跳] 数据库错误:', error.message);
        } else {
          console.error('[心跳] 处理错误:', error);
        }
      }

      // 等待下一个周期
      const elapsed = Date.now() - start;
      const wait = Math.max(0, HEARTBEAT_INTERVAL - elapsed);

      if (this.running) {
        await this.sleep(wait);
      }
    }

    console.log('心跳进程已停止');
    // 清理健康文件
    await this.cleanupHealthCheck();
  }

  /**
   * 停止心跳
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }

    // 停止 OpenClaw 采集器
    if (this.openclawIngestor) {
      await this.openclawIngestor.stop();
      this.openclawIngestor = null;
    }

    if (this.db) {
      CorivoDatabase.closeAll();
      this.db = null;
    }

    // 清理健康文件
    await this.cleanupHealthCheck();
  }

  /**
   * 首次运行 - 加速模式
   *
   * 用于安装后立即执行一轮心跳，快速处理 Cold Scan 的结果
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

    console.log('[corivo] 正在认识你...');

    const startTime = Date.now();
    let processedBlocks = 0;

    try {
      // 初始化数据库（如果还没有）
      if (!this.db) {
        let dbKeyBase64 = process.env.CORIVO_DB_KEY;
        let dbPath = process.env.CORIVO_DB_PATH;

        // 从构造函数的配置中获取
        if (!dbKeyBase64 && this.config?.dbKey) {
          const key = this.config.dbKey;
          dbKeyBase64 = Buffer.isBuffer(key) ? key.toString('base64') : key;
        }
        if (!dbPath && this.config?.dbPath) {
          dbPath = this.config.dbPath;
        }

        if (!dbKeyBase64 || !dbPath) {
          throw new Error('缺少环境变量：CORIVO_DB_KEY 或 CORIVO_DB_PATH');
        }

        const dbKey = Buffer.from(dbKeyBase64, 'base64');
        this.db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
      }

      // 处理 pending blocks（放宽数量限制）
      const pending = this.db.queryBlocks({
        annotation: 'pending',
        limit: maxPendingBlocks,
      });

      for (const block of pending) {
        // 检查时间限制
        if (Date.now() - startTime > timeLimit) {
          console.log(`[corivo] 首次运行超时，已处理 ${processedBlocks}/${pending.length} 条`);
          break;
        }

        // 应用规则引擎标注
        const pattern = this.ruleEngine.extract(block.content);
        const annotation = pattern
          ? `决策 · ${pattern.type} · ${pattern.decision}`
          : '知识 · 未分类 · 一般';

        // 更新 block
        this.db.updateBlock(block.id, {
          annotation,
          status: vitalityToStatus(100), // 首次运行给予高生命力
        });

        processedBlocks++;
      }

      // 创建关联（快速模式）
      if (!skipColdZone && this.db) {
        const blocks = this.db.queryBlocks({ limit: 100 });
        const associations = this.associationEngine.discoverByRules(blocks);

        for (const assoc of associations) {
          try {
            this.db.createAssociation(assoc);
          } catch {
            // 忽略重复关联错误
          }
        }
      }

      // 跳过衰减（首次运行没有历史数据）

    } catch (error) {
      console.error('[corivo] 首次运行出错:', error);
    }

    const elapsedTime = Date.now() - startTime;

    console.log(`[corivo] 首次运行完成，处理了 ${processedBlocks} 条信息`);

    return { processedBlocks, elapsedTime };
  }

  /**
   * 更新健康检查文件
   *
   * 写入当前时间戳和进程状态，供监控进程检查
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
      console.error('[心跳] 更新健康状态失败:', error);
    }
  }

  /**
   * 清理健康检查文件
   */
  private async cleanupHealthCheck(): Promise<void> {
    try {
      await fs.unlink(this.healthFilePath);
    } catch {
      // 文件不存在或其他错误，忽略
    }
  }

  /**
   * 获取健康状态（用于外部查询）
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
      const healthy = age < HEALTH_CHECK_INTERVAL * 2; // 允许 2 倍间隔的延迟

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
   * 运行一次心跳（用于测试）
   *
   * 执行一次完整的 pending 处理、关联发现和衰减检查
   */
  async runOnce(): Promise<void> {
    await this.processPendingBlocks();
    await this.processAssociations();
    await this.processVitalityDecay();
  }

  /**
   * 处理 pending block
   */
  private async processPendingBlocks(): Promise<void> {
    if (!this.db) return;

    // 查询待标注的 block
    const pending = this.db.queryBlocks({
      annotation: 'pending',
      limit: PENDING_BATCH_SIZE,
    });

    if (pending.length === 0) return;

    console.log(`[心跳] 处理 ${pending.length} 个待标注 block`);

    for (const block of pending) {
      try {
        // 跳过空内容
        if (!block.content || block.content.trim().length === 0) {
          console.log(`  ${block.id}: 跳过空内容`);
          this.db!.updateBlock(block.id, {
            annotation: '知识 · knowledge · 空',
          });
          continue;
        }

        const annotation = this.annotateBlock(block.content);
        const pattern = this.extractPattern(block.content);

        // 更新标注和模式
        this.db!.updateBlock(block.id, {
          annotation,
          ...(pattern && { pattern }),
        });
        console.log(`  ${block.id}: ${annotation}${pattern ? ` (${pattern.type})` : ''}`);
      } catch (error) {
        console.error(`  ${block.id}: 标注失败`, error);
      }
    }
  }

  /**
   * 标注 block
   */
  private annotateBlock(content: string): string {
    // 先尝试规则引擎
    const pattern = this.ruleEngine.extract(content);
    if (pattern) {
      // 根据决策类型返回标注
      if (pattern.type === '技术选型') {
        return `决策 · project · ${pattern.decision.toLowerCase()}`;
      }
    }

    // 关键词标注
    const lower = content.toLowerCase();

    // 密码/凭证
    if (/密码|token|api[- ]?key|secret|凭证|密钥/.test(lower)) {
      return '事实 · asset · 凭证';
    }

    // 决策
    if (/选择|决定|选型|采用|使用/.test(content)) {
      return '决策 · project · 项目';
    }

    // 代码
    if (/\.(js|ts|py|java|go|rs|c|cpp|h)/i.test(content) ||
        /javascript|typescript|python|golang|rust/.test(lower)) {
      return '知识 · knowledge · 代码';
    }

    // 配置
    if (/config|配置|设置|环境变量/.test(lower)) {
      return '知识 · knowledge · 配置';
    }

    return '知识 · knowledge · 通用';
  }

  /**
   * 提取决策模式
   */
  private extractPattern(content: string): Pattern | null {
    // 先尝试规则引擎
    const pattern = this.ruleEngine.extract(content);
    if (pattern) {
      return pattern;
    }

    // 对于没有匹配规则的决策内容，构造简单的模式
    const lower = content.toLowerCase();
    if (/选择|决定|选型|采用|使用/.test(content)) {
      // 尝试提取被选中的事物
      const match = content.match(/(?:选择|决定|选型|采用|使用)\s+([^\u3000-\u303f\uff00-\uffef\s,。,，.]+?)(?:\s|$|，|。)/);
      if (match && match[1]) {
        return {
          type: '技术选型',
          decision: match[1].trim(),
          dimensions: [],
          context_tags: [],  // 必需字段
          confidence: 0.6,
        };
      }
    }

    return null;
  }

  /**
   * 处理衰减（批量更新版本）
   */
  private async processVitalityDecay(): Promise<void> {
    if (!this.db) return;

    // 获取所有活跃 block
    const blocks = this.db.queryBlocks({ limit: 100 });
    const now = Date.now();

    // 收集需要更新的 block
    const updates: Array<{ id: string; vitality: number; status: string }> = [];
    let unchangedCount = 0;

    for (const block of blocks) {
      // 跳过已归档的
      if (block.status === 'archived') continue;

      // 计算距离上次访问的天数
      // 优先使用 last_accessed，其次 updated_at，最后 created_at
      const lastAccessed = block.last_accessed || (block.updated_at * 1000) || (block.created_at * 1000);
      const daysSinceAccess = (now - lastAccessed) / 86400000;

      if (daysSinceAccess < 1) {
        // 24 小时内不衰减
        unchangedCount++;
        continue;
      }

      // 根据标注推断衰减率
      let decayRate = 1; // 每天 1 点（默认）

      if (block.annotation.includes('事实')) {
        decayRate = 0.5; // 事实衰减慢
      } else if (block.annotation.includes('知识')) {
        decayRate = 2; // 知识衰减快
      } else if (block.annotation.includes('决策')) {
        decayRate = 0.3; // 决策衰减最慢
      }

      // 计算新的生命力
      const decayAmount = Math.floor(daysSinceAccess * decayRate);
      const newVitality = Math.max(0, block.vitality - decayAmount);

      // 如果生命力没变，跳过
      if (newVitality === block.vitality) {
        unchangedCount++;
        continue;
      }

      // 计算新状态
      const newStatus = vitalityToStatus(newVitality);

      // 添加到批量更新列表
      updates.push({
        id: block.id,
        vitality: newVitality,
        status: newStatus,
      });
    }

    // 批量更新
    if (updates.length > 0) {
      const updatedCount = this.db.batchUpdateVitality(updates);
      console.log(`[心跳] 衰减处理: ${updatedCount} 个更新, ${unchangedCount} 个不变`);
    }
  }

  /**
   * 处理关联分析
   *
   * 定期分析活跃 block 之间的关系，建立知识网络
   */
  private async processAssociations(): Promise<void> {
    if (!this.db) return;

    try {
      // 获取活跃 block
      const activeBlocks = this.db.queryBlocks({
        status: 'active',
        limit: 50,
      });

      if (activeBlocks.length < 2) {
        return; // 至少需要 2 个 block 才能建立关联
      }

      // 发现关联
      const associations = this.associationEngine.discoverByRules(activeBlocks);

      if (associations.length > 0) {
        // 批量保存关联
        this.db.batchCreateAssociations(associations);
        console.log(`[心跳] 关联分析: 发现 ${associations.length} 个新关联`);
      }
    } catch (error) {
      console.error('[心跳] 关联分析失败:', error);
    }
  }

  /**
   * 处理热区整合
   *
   * 定期合并重复内容、提炼摘要
   */
  private async processConsolidation(): Promise<void> {
    if (!this.db) return;

    try {
      // 获取活跃 block
      const activeBlocks = this.db.queryBlocks({
        status: 'active',
        limit: 20,
      });

      if (activeBlocks.length < 2) {
        return; // 至少需要 2 个 block 才能整合
      }

      // 去重
      const mergeResults = this.consolidationEngine.deduplicateBlocks(activeBlocks);

      for (const result of mergeResults) {
        if (result.result) {
          // 更新主 block，将其他 block 标记为 archived
          this.db.updateBlock(result.result.id, {
            refs: result.result.refs,
            vitality: result.result.vitality,
          });

          // 归档被合并的 block
          for (const otherId of result.blocks) {
            if (otherId !== result.result!.id) {
              this.db.updateBlock(otherId, { status: 'archived' });
            }
          }

          console.log(`[心跳] 整合: 合并了 ${result.blocks.length} 个相似内容`);
        }
      }

      // 提炼摘要
      const summaryBlock = this.consolidationEngine.createSummary(activeBlocks);
      if (summaryBlock) {
        this.db.createBlock({
          content: summaryBlock.content,
          annotation: summaryBlock.annotation,
          refs: summaryBlock.refs,
          source: summaryBlock.source,
        });
        console.log(`[心跳] 整合: 创建了摘要 ${summaryBlock.id}`);
      }

      // 补链：更新 refs
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
        console.log(`[心跳] 整合: 为 ${missingLinks.size} 个 block 补充了关联`);
      }
    } catch (error) {
      console.error('[心跳] 热区整合失败:', error);
    }
  }

  /**
   * 发送周总结
   *
   * 每周一发送简短总结
   */
  private async sendWeeklySummary(): Promise<void> {
    if (!this.db) return;

    try {
      // 初始化 managers（如果还没有）
      if (!this.weeklySummary) {
        this.weeklySummary = new WeeklySummary(this.db);
      }

      const summary = this.weeklySummary.generateSummary();
      if (summary) {
        console.log(`\n${summary}\n`);
      }
    } catch (error) {
      console.error('[心跳] 周总结失败:', error);
    }
  }

  /**
   * 检查进展提醒
   *
   * 定期检查待办决策，发送温和提醒
   */
  private async checkFollowUps(): Promise<void> {
    if (!this.db) return;

    try {
      // 初始化 manager（如果还没有）
      if (!this.followUpManager) {
        this.followUpManager = new FollowUpManager(this.db);
      }

      const reminders = this.followUpManager.getWeeklyReminders();
      if (reminders.length > 0) {
        for (const reminder of reminders) {
          console.log(`\n${reminder}\n`);
        }
      }
    } catch (error) {
      console.error('[心跳] 进展提醒失败:', error);
    }
  }

  /**
   * 处理触发决策
   *
   * 定期检查是否需要向用户推送提醒
   */
  private async processTriggerDecision(): Promise<void> {
    if (!this.db || !this.triggerDecision || !this.pushQueue) {
      return;
    }

    try {
      // 加载推送队列
      await this.pushQueue.load();

      // 执行触发决策
      const items = this.triggerDecision.decide({
        now: Date.now(),
      });

      // 添加到队列
      if (items.length > 0) {
        await this.pushQueue.addAll(items);
        console.log(`[心跳] 触发决策: 生成了 ${items.length} 条推送`);
      }
    } catch (error) {
      console.error('[心跳] 触发决策失败:', error);
    }
  }

  /**
   * 处理自动同步
   *
   * 后台静默执行 push/pull，未注册时跳过
   */
  private async processSync(): Promise<void> {
    if (!this.autoSync) return;
    try {
      const result = await this.autoSync.run();
      if (result) {
        console.log(`[心跳] 自动同步: Push ${result.pushed}, Pull ${result.pulled}`);
      }
    } catch (error) {
      console.error('[心跳] 自动同步失败:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 如果直接运行此文件（作为守护进程）
// 检测方式：当前文件路径和入口脚本路径都以 heartbeat.js 结尾
// 注意：不能用 currentFilePath === argv1，因为 tsup 打包后两者都指向 dist/cli/index.js
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
  const heartbeat = new Heartbeat();

  heartbeat.start().catch((error) => {
    console.error('启动失败:', error);
    process.exit(1);
  });

  /**
   * 优雅退出处理器
   *
   * Node.js 信号处理器不支持 async，使用包装函数确保清理完成
   */
  const gracefulShutdown = async (signal: string): Promise<void> => {
    console.log(`\n收到 ${signal} 信号，正在停止...`);
    try {
      await heartbeat.stop();
      console.log('清理完成，退出中...');
      process.exit(0);
    } catch (error) {
      console.error('清理失败:', error);
      process.exit(1);
    }
  };

  // 注册信号处理器（不支持 async，使用包装函数处理）
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
