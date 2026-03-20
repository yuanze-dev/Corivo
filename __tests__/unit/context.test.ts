/**
 * 上下文推送模块单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { CorivoDatabase } from '../../src/storage/database';
import { KeyManager } from '../../src/crypto/keys';
import { ContextPusher } from '../../src/push/context';

describe('ContextPusher', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let pusher: ContextPusher;

  beforeEach(async () => {
    // 创建临时数据库
    dbPath = `/tmp/corivo-test-${Date.now()}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    // 初始化数据库（包括 FTS5）
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

    // 创建 FTS5 全文搜索表
    sqliteDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
        id UNINDEXED,
        content,
        annotation
      )
    `);

    // 创建触发器同步数据到 FTS5（先删除可能存在的旧触发器）
    sqliteDb.exec(`
      DROP TRIGGER IF EXISTS blocks_ai;
      DROP TRIGGER IF EXISTS blocks_au;
      DROP TRIGGER IF EXISTS blocks_ad;

      CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(id, content, annotation)
        VALUES (new.id, new.content, new.annotation);
      END;

      CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE id = old.id;
        INSERT INTO blocks_fts(id, content, annotation)
        VALUES (new.id, new.content, new.annotation);
      END;

      CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE id = old.id;
      END;
    `);

    sqliteDb.close();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    pusher = new ContextPusher(db);
  });

  afterEach(async () => {
    db.close();
    CorivoDatabase.closeAll();
    await fs.unlink(dbPath).catch(() => {});
  });

  describe('pushContext', () => {
    beforeEach(() => {
      const block1 = db.createBlock({ content: 'React 是一个流行的前端框架', annotation: '知识 · frontend · React' });
      const block2 = db.createBlock({ content: 'Vue.js 提供了渐进式架构', annotation: '知识 · frontend · Vue' });
      const block3 = db.createBlock({ content: 'Angular 是 Google 的框架', annotation: '知识 · frontend · Angular' });

      // 手动同步到 FTS5 表（因为触发器在不同连接上不会触发）
      const sqliteDb = new Database(dbPath);
      for (const block of [block1, block2, block3]) {
        // 先删除可能存在的记录，再插入新记录
        sqliteDb.exec(`DELETE FROM blocks_fts WHERE id = '${block.id}'`);
        sqliteDb.exec(`
          INSERT INTO blocks_fts(id, content, annotation)
          VALUES ('${block.id}', '${block.content.replace(/'/g, "''")}', '${block.annotation.replace(/'/g, "''")}')
        `);
      }
      sqliteDb.close();
    });

    it('should return empty string for no results', () => {
      const result = pusher.pushContext('NonExistent', 5);
      // 返回的是字符串，需要 await
      return result.then(text => {
        expect(text).toBe('');
      });
    });

    it('should find related blocks by query', async () => {
      const result = await pusher.pushContext('React', 5);
      expect(result).toContain('React');
      expect(result).toContain('[corivo]');
    });

    it('should respect limit parameter', async () => {
      const result = await pusher.pushContext('React', 1);
      expect(result).toContain('1 条');
    });

    it('should update access count', async () => {
      // 搜索包含 React 的 block
      const reactBlocks = db.searchBlocks('React', 5);
      expect(reactBlocks.length).toBeGreaterThan(0);

      const reactBlock = reactBlocks[0];
      const originalCount = reactBlock.access_count;

      await pusher.pushContext('React', 5);

      const updated = db.getBlock(reactBlock.id);
      expect(updated?.access_count).toBeGreaterThan(originalCount);
    });

    it('should format with custom config', async () => {
      const result = await pusher.pushContext('React', 5, {
        maxPreviewLength: 20,
        showAnnotation: true,
        showVitality: true,
        showTime: false
      });

      expect(result).toContain('React');
      expect(result).toContain('100'); // vitality
    });
  });

  describe('pushStats', () => {
    beforeEach(() => {
      db.createBlock({ content: 'Block 1', status: 'active' });
      db.createBlock({ content: 'Block 2', status: 'cooling' });
      db.createBlock({ content: 'Block 3', status: 'cold' });
    });

    it('should return statistics', async () => {
      const stats = await pusher.pushStats();

      expect(stats).toContain('3');
      expect(stats).toContain('活跃: 1');
      expect(stats).toContain('冷却: 1');
      expect(stats).toContain('冷冻: 1');
    });
  });

  describe('pushNeedsAttention', () => {
    it('should return empty string when no blocks need attention', async () => {
      db.createBlock({ content: 'Active block', status: 'active' });

      const result = await pusher.pushNeedsAttention();
      expect(result).toBe('');
    });

    it('should return cooling blocks', async () => {
      db.createBlock({ content: 'Cooling block', status: 'cooling', vitality: 40 });

      const result = await pusher.pushNeedsAttention();
      expect(result).toContain('Cooling block');
      expect(result).toContain('需要关注');
    });

    it('should return cold blocks', async () => {
      db.createBlock({ content: 'Cold block', status: 'cold', vitality: 20 });

      const result = await pusher.pushNeedsAttention();
      expect(result).toContain('Cold block');
      expect(result).toContain('需要关注');
    });
  });

  describe('pushPatterns', () => {
    beforeEach(() => {
      db.createBlock({
        content: '选择使用 PostgreSQL',
        annotation: '决策 · project · test'
      });
    });

    it('should return empty string when no patterns found', async () => {
      const result = await pusher.pushPatterns('NonExistent', 3);
      expect(result).toBe('');
    });

    it('should return patterns for matching query', async () => {
      // 先添加 pattern
      const blocks = db.queryBlocks({ limit: 100 });
      const block = blocks[0];
      db.updateBlock(block.id, {
        pattern: {
          type: '技术选型',
          decision: 'PostgreSQL',
          dimensions: [{ name: '可靠性', weight: 0.9, reason: 'ACID 支持' }],
          confidence: 0.9
        }
      });

      const result = await pusher.pushPatterns('PostgreSQL', 3);
      expect(result).toContain('技术选型');
      expect(result).toContain('PostgreSQL');
    });
  });
});
