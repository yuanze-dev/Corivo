/**
 * 数据库存储层单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { CorivoDatabase } from '../../src/storage/database';
import { KeyManager } from '../../src/crypto/keys';

describe('CorivoDatabase', () => {
  let db: CorivoDatabase;
  let dbPath: string;

  beforeEach(async () => {
    // 创建临时数据库
    dbPath = `/tmp/corivo-test-${Date.now()}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    // 初始化数据库（不使用 FTS5 以避免腐烂问题）
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
  });

  afterEach(async () => {
    // 清理
    await fs.unlink(dbPath).catch(() => {});
  });

  describe('createBlock', () => {
    it('should create a block with minimal fields', () => {
      const block = db.createBlock({
        content: 'Test content'
      });

      expect(block.id).toMatch(/^blk_/);
      expect(block.content).toBe('Test content');
      expect(block.annotation).toBe('pending');
      expect(block.vitality).toBe(100);
      expect(block.status).toBe('active');
    });

    it('should create a block with all fields', () => {
      const block = db.createBlock({
        content: 'Test content',
        annotation: '决策 · project · test',
        source: 'test',
        vitality: 80
      });

      expect(block.annotation).toBe('决策 · project · test');
      expect(block.source).toBe('test');
      expect(block.vitality).toBe(80);
    });

    it('should reject empty content', () => {
      expect(() => {
        db.createBlock({ content: '' });
      }).toThrow();
    });
  });

  describe('getBlock', () => {
    it('should retrieve an existing block', () => {
      const created = db.createBlock({ content: 'Test content' });
      const retrieved = db.getBlock(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.content).toBe('Test content');
    });

    it('should return null for non-existent block', () => {
      const retrieved = db.getBlock('blk_nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateBlock', () => {
    it('should update block fields', () => {
      const block = db.createBlock({ content: 'Original content' });

      const success = db.updateBlock(block.id, {
        content: 'Updated content',
        annotation: '决策 · project · test'
      });

      expect(success).toBe(true);

      const updated = db.getBlock(block.id);
      expect(updated?.content).toBe('Updated content');
      expect(updated?.annotation).toBe('决策 · project · test');
    });

    it('should increment access_count', () => {
      const block = db.createBlock({ content: 'Test' });

      // First get the current block to see its access_count
      const current = db.getBlock(block.id);
      const initialCount = current?.access_count || 0;

      const success = db.updateBlock(block.id, {
        access_count: initialCount + 1
      });

      expect(success).toBe(true);

      const updated = db.getBlock(block.id);
      expect(updated?.access_count).toBe(1);
    });

    it('should return false for non-existent block', () => {
      const result = db.updateBlock('blk_nonexistent', { content: 'New content' });
      expect(result).toBe(false);
    });
  });

  describe('deleteBlock', () => {
    it('should delete an existing block', () => {
      const block = db.createBlock({ content: 'Test' });

      const deleted = db.deleteBlock(block.id);
      expect(deleted).toBe(true);

      const retrieved = db.getBlock(block.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent block', () => {
      const deleted = db.deleteBlock('blk_nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('queryBlocks', () => {
    beforeEach(() => {
      // 创建测试数据
      db.createBlock({ content: 'Active block 1', status: 'active', vitality: 90 });
      db.createBlock({ content: 'Active block 2', status: 'active', vitality: 70 });
      db.createBlock({ content: 'Cooling block', status: 'cooling', vitality: 40 });
      db.createBlock({ content: 'Cold block', status: 'cold', vitality: 20 });
    });

    it('should return all blocks when no filter provided', () => {
      const blocks = db.queryBlocks({ limit: 100 });
      expect(blocks.length).toBe(4);
    });

    it('should filter by status', () => {
      const activeBlocks = db.queryBlocks({ status: 'active', limit: 100 });
      expect(activeBlocks.length).toBe(2);

      const coolingBlocks = db.queryBlocks({ status: 'cooling', limit: 100 });
      expect(coolingBlocks.length).toBe(1);
    });

    it('should filter by vitality range', () => {
      const blocks = db.queryBlocks({ minVitality: 50, limit: 100 });
      expect(blocks.length).toBe(2);
    });

    it('should respect limit parameter', () => {
      const blocks = db.queryBlocks({ limit: 2 });
      expect(blocks.length).toBe(2);
    });
  });

  describe('searchBlocks', () => {
    beforeEach(() => {
      db.createBlock({ content: '使用 React 作为前端框架' });
      db.createBlock({ content: 'Vue.js 是另一个选择' });
      db.createBlock({ content: 'PostgreSQL 数据库选型' });
    });

    it('should search by content', () => {
      const results = db.searchBlocks('React', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('React');
    });

    it('should return empty array for no matches', () => {
      const results = db.searchBlocks('NonExistentTerm', 10);
      expect(results).toHaveLength(0);
    });

    it('should respect limit parameter', () => {
      const results = db.searchBlocks('选择', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      db.createBlock({ content: 'Active 1', status: 'active' });
      db.createBlock({ content: 'Active 2', status: 'active' });
      db.createBlock({ content: 'Cooling', status: 'cooling' });
      db.createBlock({ content: 'Cold', status: 'cold' });
    });

    it('should return correct statistics', () => {
      const stats = db.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byStatus.active).toBe(2);
      expect(stats.byStatus.cooling).toBe(1);
      expect(stats.byStatus.cold).toBe(1);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status for good database', () => {
      // Create a block first so blockCount > 0
      db.createBlock({ content: 'Health check test' });

      const health = db.checkHealth();

      expect(health.ok).toBe(true);
      expect(health.blockCount).toBeGreaterThan(0);
    });

    it('should include database size', () => {
      const health = db.checkHealth();

      expect(health.size).toBeDefined();
      expect(health.size).toBeGreaterThan(0);
    });
  });
});
