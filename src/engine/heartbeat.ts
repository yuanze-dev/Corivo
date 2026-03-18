/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 */

import fs from 'node:fs/promises';
import { CorivoDatabase, getConfigDir } from '../storage/database.js';
import { KeyManager } from '../crypto/keys.js';
import { RuleEngine } from './rules/index.js';
import { TechChoiceRule } from './rules/tech-choice.js';
import { DatabaseError } from '../errors/index.js';
import type { BlockStatus, Pattern } from '../models/index.js';

const HEARTBEAT_INTERVAL = 5000; // 5 秒
const PENDING_BATCH_SIZE = 10; // 每次处理的 pending 数量

/**
 * 心跳引擎配置
 */
export interface HeartbeatConfig {
  /** 数据库实例（可选，用于测试） */
  db?: CorivoDatabase;
}

/**
 * 心跳引擎
 */
export class Heartbeat {
  private running = false;
  private db: CorivoDatabase | null = null;
  private ruleEngine: RuleEngine;
  private timeoutRef: NodeJS.Timeout | null = null;

  constructor(config?: HeartbeatConfig) {
    // 如果传入了 db，直接使用（用于测试）
    if (config?.db) {
      this.db = config.db;
    }

    // 初始化规则引擎
    this.ruleEngine = new RuleEngine();
    this.ruleEngine.register(new TechChoiceRule());
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
      const encryptedDbKey = process.env.CORIVO_ENCRYPTED_KEY;
      const dbPath = process.env.CORIVO_DB_PATH;
      const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();

    if (!encryptedDbKey || !dbPath) {
      throw new Error('缺少环境变量：CORIVO_ENCRYPTED_KEY 或 CORIVO_DB_PATH');
    }

    // 读取配置获取 salt
    const configPath = `${configDir}/config.json`;
    let config;
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      throw new Error('无法读取配置文件');
    }

    // 派生主密钥并解密数据库密钥
    const salt = Buffer.from(config.salt, 'base64');

    // 安全警告：守护进程模式需要用户通过环境变量传递主密码
    const daemonPassword = process.env.CORIVO_DAEMON_PASSWORD;
    if (!daemonPassword) {
      throw new Error(
        '守护进程需要主密码才能启动。请设置 CORIVO_DAEMON_PASSWORD 环境变量。\n' +
        '示例: CORIVO_DAEMON_PASSWORD="your-password" corivo start'
      );
    }

    const masterKey = KeyManager.deriveMasterKey(daemonPassword, salt);
    const dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);

    // 打开数据库
    this.db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

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

    if (this.db) {
      CorivoDatabase.closeAll();
      this.db = null;
    }
  }

  /**
   * 运行一次心跳（用于测试）
   *
   * 执行一次完整的 pending 处理和衰减检查
   */
  async runOnce(): Promise<void> {
    await this.processPendingBlocks();
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
   * 处理衰减
   */
  private async processVitalityDecay(): Promise<void> {
    if (!this.db) return;

    // 获取所有活跃 block
    const blocks = this.db.queryBlocks({ limit: 100 });
    const now = Date.now();
    const decayCount = { decayed: 0, unchanged: 0 };

    for (const block of blocks) {
      // 跳过已归档的
      if (block.status === 'archived') continue;

      // 计算距离上次访问的天数
      // 优先使用 last_accessed，其次 updated_at，最后 created_at
      const lastAccessed = block.last_accessed || (block.updated_at * 1000) || (block.created_at * 1000);
      const daysSinceAccess = (now - lastAccessed) / 86400000;

      if (daysSinceAccess < 1) {
        // 24 小时内不衰减
        decayCount.unchanged++;
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
        decayCount.unchanged++;
        continue;
      }

      // 计算新状态
      const newStatus = this.vitalityToStatus(newVitality);

      // 更新
      this.db.updateBlock(block.id, {
        vitality: newVitality,
        status: newStatus,
      });

      decayCount.decayed++;
    }

    if (decayCount.decayed > 0) {
      console.log(`[心跳] 衰减处理: ${decayCount.decayed} 个更新, ${decayCount.unchanged} 个不变`);
    }
  }

  /**
   * 生命力转状态
   */
  private vitalityToStatus(vitality: number): BlockStatus {
    if (vitality === 0) return 'archived';
    if (vitality < 30) return 'cold';
    if (vitality < 60) return 'cooling';
    return 'active';
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 如果直接运行此文件（作为守护进程）
if (import.meta.url === `file://${process.argv[1]}`) {
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
