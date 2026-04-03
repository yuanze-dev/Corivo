/**
 * Edge case tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CorivoDatabase } from '@/storage/database';
import { KeyManager } from '../../src/crypto/keys.js';
import { validateAnnotation } from '../../src/models/block.js';

describe('Edge Cases', () => {
  let db: CorivoDatabase;
  let tempDir: string;
  let dbPath: string;
  let dbKey: Buffer;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = `${os.tmpdir()}/corivo-edge-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    dbPath = path.join(tempDir, 'corivo.db');
    dbKey = KeyManager.generateDatabaseKey();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
  });

  afterEach(async () => {
    CorivoDatabase.closeAll();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('空数据库状态', () => {
    it('should handle empty database gracefully', () => {
      const blocks = db.queryBlocks({ limit: 100 });
      expect(blocks).toHaveLength(0);

      const stats = db.getStats();
      expect(stats.total).toBe(0);

      const searchResults = db.searchBlocks('test', 10);
      expect(searchResults).toHaveLength(0);
    });

    it('should return null for non-existent block', () => {
      const block = db.getBlock('blk_nonexistent');
      expect(block).toBeNull();
    });

    it('should return false for updating non-existent block', () => {
      const result = db.updateBlock('blk_nonexistent', { content: 'test' });
      expect(result).toBe(false);
    });

    it('should return false for deleting non-existent block', () => {
      const result = db.deleteBlock('blk_nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('超长内容', () => {
    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000); // 10KB
      const block = db.createBlock({ content: longContent });

      expect(block.content).toBe(longContent);
      expect(block.content.length).toBe(10000);
    });

    it('should handle content at 1MB limit', () => {
      const largeContent = 'B'.repeat(1024 * 1024); // 1MB
      const block = db.createBlock({ content: largeContent });

      expect(block.content.length).toBe(1024 * 1024);
    });
  });

  describe('特殊字符', () => {
    it('should handle quotes in content', () => {
      const contents = [
        'Content with "double quotes"',
        "Content with 'single quotes'",
        'Content with `backticks`',
        'Content with "mixed \'quotes\'"',
      ];

      for (const content of contents) {
        const block = db.createBlock({ content });
        expect(block.content).toBe(content);

        const retrieved = db.getBlock(block.id);
        expect(retrieved?.content).toBe(content);
      }
    });

    it('should handle unicode characters', () => {
      const unicodeContents = [
        '中文内容测试',
        '日本語テスト',
        '한국어 테스트',
        'עברית בדיקה',
        '🚀 🎉 ⭐',
        'Mix of 中文 and English 🚀',
      ];

      for (const content of unicodeContents) {
        const block = db.createBlock({ content });
        expect(block.content).toBe(content);

        const retrieved = db.getBlock(block.id);
        expect(retrieved?.content).toBe(content);
      }
    });

    it('should handle newlines and tabs', () => {
      const content = 'Line 1\nLine 2\rLine 3\r\nTab\there';
      const block = db.createBlock({ content });

      expect(block.content).toBe(content);

      const retrieved = db.getBlock(block.id);
      expect(retrieved?.content).toBe(content);
    });

    it('should handle backslashes', () => {
      const content = 'Path: C:\\Users\\Test\\file.txt\nEscaped: \\n \\r \\t';
      const block = db.createBlock({ content });

      expect(block.content).toBe(content);
    });
  });

  describe('annotation 验证', () => {
    it('should reject invalid annotation formats', () => {
      const invalidAnnotations = [
        '', // null
        '事实', // only part
        '事实 · asset', // only two parts
        ' · asset · test', // The first part is empty
        '事实 ·  · test', // The second part is empty
        '事实 · asset · ', // The third part is empty
        // NOTE: leading and trailing spaces are now accepted (user friendly), add trim check if strict validation is required
      ];

      for (const annotation of invalidAnnotations) {
        const isValid = validateAnnotation(annotation);
        expect(isValid).toBe(false);
      }
    });

    it('should accept valid annotation formats', () => {
      const validAnnotations = [
        '事实 · asset · 凭证',
        '知识 · knowledge · 代码',
        '决策 · project · 项目',
        '指令 · self · 偏好',
        '事实 · people · 生日',
      ];

      for (const annotation of validAnnotations) {
        const isValid = validateAnnotation(annotation);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('边界数值', () => {
    it('should handle vitality at boundaries', () => {
      const vitalities = [0, 1, 29, 30, 31, 59, 60, 61, 99, 100];

      for (const vitality of vitalities) {
        const block = db.createBlock({
          content: `Test vitality ${vitality}`,
          vitality,
        });

        expect(block.vitality).toBe(vitality);
      }
    });

    it('should handle zero access count', () => {
      const block = db.createBlock({ content: 'Test', access_count: 0 });
      expect(block.access_count).toBe(0);
    });

    it('should handle null last_accessed', () => {
      const block = db.createBlock({ content: 'Test', last_accessed: null });
      expect(block.last_accessed).toBeNull();
    });
  });

  describe('refs 数组', () => {
    it('should handle empty refs array', () => {
      const block = db.createBlock({ content: 'Test', refs: [] });
      expect(block.refs).toHaveLength(0);
    });

    it('should handle single ref', () => {
      const refs = ['blk_abc123'];
      const block = db.createBlock({ content: 'Test', refs });
      expect(block.refs).toEqual(refs);
    });

    it('should handle multiple refs', () => {
      const refs = ['blk_abc123', 'blk_def456', 'lk_ghi789'];
      const block = db.createBlock({ content: 'Test', refs });
      expect(block.refs).toEqual(refs);
    });
  });
});
