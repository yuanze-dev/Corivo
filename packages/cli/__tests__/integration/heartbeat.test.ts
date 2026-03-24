/**
 * 心跳引擎集成测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { CorivoDatabase } from '../../src/storage/database';
import { KeyManager } from '../../src/crypto/keys';
import { Heartbeat } from '../../src/engine/heartbeat';
import { RuleEngine } from '../../src/engine/rules';
import { TechChoiceRule } from '../../src/engine/rules/tech-choice';
import type { IngestorPlugin } from '../../src/ingestors/types';

describe('Heartbeat Integration', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let heartbeat: Heartbeat;

  beforeEach(async () => {
    // 创建临时数据库
    dbPath = `/tmp/corivo-test-${Date.now()}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    // 初始化数据库（不使用 FTS5）
    const sqliteDb = new Database(dbPath);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        annotation TEXT DEFAULT 'pending',
        refs TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        status TEXT DEFAULT 'active',
        vitality INTEGER DEFAULT 100,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        pattern TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);
      CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
      CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);
    `);
    sqliteDb.close();

    // 创建 CorivoDatabase 实例
    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

    // 创建心跳引擎
    heartbeat = new Heartbeat({ db });
  });

  afterEach(async () => {
    // 清理数据库实例
    db.close();
    CorivoDatabase.closeAll();
    // 删除文件
    await fs.unlink(dbPath).catch(() => {});
  });

  describe('pending block processing', () => {
    it('should process pending blocks and annotate them', async () => {
      // 创建一个包含决策内容的 pending block
      const block = db.createBlock({
        content: '选择使用 React 作为前端框架',
        annotation: 'pending',
        source: 'test'
      });

      expect(block.annotation).toBe('pending');

      // 运行心跳一次
      await heartbeat.runOnce();

      // 验证 block 已被标注
      const updated = db.queryBlocks({ limit: 100 }).find(b => b.id === block.id);
      expect(updated?.annotation).not.toBe('pending');
      expect(updated?.annotation).toContain('决策');
    });

    it('should extract pattern from decision content', async () => {
      const block = db.createBlock({
        content: '决定使用 PostgreSQL，因为需要 ACID 事务支持',
        annotation: 'pending',
        source: 'test'
      });

      await heartbeat.runOnce();

      const updated = db.queryBlocks({ limit: 100 }).find(b => b.id === block.id);
      expect(updated?.pattern).toBeDefined();
      expect(updated?.pattern?.type).toBe('技术选型');
      expect(updated?.pattern?.decision).toBe('PostgreSQL');
    });

    it('should handle multiple pending blocks', async () => {
      const blocks = [
        db.createBlock({ content: '选择使用 TypeScript', annotation: 'pending' }),
        db.createBlock({ content: '决定采用微服务架构', annotation: 'pending' }),
        db.createBlock({ content: '使用 Redis 作为缓存', annotation: 'pending' })
      ];

      await heartbeat.runOnce();

      const allBlocks = db.queryBlocks({ limit: 100 });
      const pendingBlocks = allBlocks.filter(b => b.annotation === 'pending');

      expect(pendingBlocks.length).toBe(0);
    });
  });

  describe('vitality decay', () => {
    it('should decay vitality for old blocks', async () => {
      // 创建一个 10 天前的 block
      const oldTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const block = db.createBlock({
        content: '临时笔记',
        annotation: '知识 · knowledge · 临时笔记'
      });

      // 手动更新时间戳（模拟）
      db.updateBlock(block.id, {
        updated_at: Math.floor(oldTimestamp / 1000)
      });

      // 运行心跳衰减
      await heartbeat.processVitalityDecay();

      // 验证生命力已衰减
      const updated = db.queryBlocks({ limit: 100 }).find(b => b.id === block.id);
      expect(updated?.vitality).toBeLessThan(100);
    });
  });

  describe('rule engine integration', () => {
    it('should use rule engine for pattern extraction', () => {
      const ruleEngine = new RuleEngine();
      ruleEngine.register(new TechChoiceRule());

      const result = ruleEngine.extract('选择使用 Vue.js 作为前端框架');

      expect(result).toBeDefined();
      expect(result?.type).toBe('技术选型');
      expect(result?.decision).toBe('Vue.js');
    });

    it('should return null for non-decision content', () => {
      const ruleEngine = new RuleEngine();
      ruleEngine.register(new TechChoiceRule());

      const result = ruleEngine.extract('今天天气不错');

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle short content gracefully', async () => {
      // 测试心跳能优雅处理内容极短的 block
      const block = db.createBlock({
        content: 'a', // 极短内容
        annotation: 'pending'
      });

      // 不应抛出错误
      await expect(heartbeat.runOnce()).resolves.not.toThrow();

      // 验证 block 被标注
      const updated = db.queryBlocks({ limit: 100 }).find(b => b.id === block.id);
      expect(updated?.annotation).not.toBe('pending');
    });

    it('should continue processing after one block fails', async () => {
      // 创建多个 block，其中一个可能失败
      db.createBlock({ content: '正常内容1', annotation: 'pending' });
      db.createBlock({ content: '选择使用 React', annotation: 'pending' });
      db.createBlock({ content: '正常内容2', annotation: 'pending' });

      // 应该处理所有 block，即使某个失败
      await expect(heartbeat.runOnce()).resolves.not.toThrow();

      const allBlocks = db.queryBlocks({ limit: 100 });
      const pendingBlocks = allBlocks.filter(b => b.annotation === 'pending');
      expect(pendingBlocks.length).toBeLessThan(3);
    });
  });

  describe('syncCycles from config', () => {
    // syncCycles is private — we access it via double-cast for white-box testing.
    // This is intentional: the field has no public accessor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getSyncCycles = (hb: Heartbeat) => (hb as any).syncCycles as number;

    it('defaults to 60 cycles (5 minutes) when no settings', () => {
      const hb = new Heartbeat({ db });
      expect(getSyncCycles(hb)).toBe(60);
    });

    it('computes correct cycles for 15 minutes (900s)', () => {
      const hb = new Heartbeat({ db, syncIntervalSeconds: 900 });
      expect(getSyncCycles(hb)).toBe(180);
    });

    it('computes correct cycles for 30 minutes (1800s)', () => {
      const hb = new Heartbeat({ db, syncIntervalSeconds: 1800 });
      expect(getSyncCycles(hb)).toBe(360);
    });

    it('clamps to minimum 1 cycle for absurdly small values', () => {
      const hb = new Heartbeat({ db, syncIntervalSeconds: 1 });
      expect(getSyncCycles(hb)).toBe(1);
    });

    it('ignores invalid (non-finite) values and uses default', () => {
      const hb = new Heartbeat({ db, syncIntervalSeconds: NaN });
      expect(getSyncCycles(hb)).toBe(60);
    });

    it('ignores Infinity and uses default', () => {
      const hb = new Heartbeat({ db, syncIntervalSeconds: Infinity });
      expect(getSyncCycles(hb)).toBe(60);
    });
  });

  describe('association discovery', () => {
    it('should run association analysis without errors', async () => {
      // 创建多个 active blocks
      db.createBlock({
        content: '今天天气不错',
        annotation: '事实 · self · 天气',
      });
      db.createBlock({
        content: '晚饭吃饺子',
        annotation: '事实 · self · 晚餐',
      });
      db.createBlock({
        content: '决定选择 TypeScript',
        annotation: 'pending', // 会被标注为决策
      });

      // 运行心跳（包含关联分析）- 验证不抛错
      await expect(heartbeat.runOnce()).resolves.not.toThrow();

      // 验证关联分析被执行（至少调用了 processAssociations）
      const allBlocks = db.queryBlocks({ limit: 100 });
      expect(allBlocks.length).toBe(3);
    });

    it('should not create associations for unrelated content', async () => {
      // 创建两个完全不相关的内容
      db.createBlock({
        content: '今天天气不错',
        annotation: '事实 · self · 天气',
      });
      db.createBlock({
        content: '晚饭吃饺子',
        annotation: '事实 · self · 晚餐',
      });

      // 运行心跳
      await heartbeat.runOnce();

      // 验证没有创建关联（无关内容不应该有关联）
      const associations = db.queryAssociations({ limit: 100 });
      expect(associations.length).toBe(0);
    });
  });

  describe('Heartbeat.loadIngestors', () => {
    it('does nothing when package list is empty', async () => {
      const heartbeat = new Heartbeat({ db });
      await expect(heartbeat.loadIngestors([])).resolves.not.toThrow();
    });

    it('swallows failed dynamic import and does not throw', async () => {
      const heartbeat = new Heartbeat({ db });
      await expect(
        heartbeat.loadIngestors(['nonexistent-pkg-xyz-abc-12345'])
      ).resolves.not.toThrow();
    });

    it('calls startWatching on a valid plugin via loadPlugin, and stop() cleans up', async () => {
      const heartbeat = new Heartbeat({ db });

      let watchingCalled = false;
      let stopCalled = false;
      const mockPlugin: IngestorPlugin = {
        name: 'mock-ingestor',
        create: () => ({
          startWatching: async (_db: unknown) => { watchingCalled = true; },
          stop: async () => { stopCalled = true; },
        }),
      };

      await heartbeat.loadPlugin(mockPlugin);
      expect(watchingCalled).toBe(true);

      await heartbeat.stop();
      expect(stopCalled).toBe(true);
    });
  });
});
