/**
 * Claude Code 采集器集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ClaudeCodeIngestor } from '../../src/ingestors/claude-code.js';

describe('ClaudeCodeIngestor (Integration)', () => {
  let ingestor: ClaudeCodeIngestor;
  let tempDir: string;
  let claudeMdPath: string;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = `${os.tmpdir()}/corivo-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    // 创建 CLAUDE.md 文件
    claudeMdPath = path.join(tempDir, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, '# 项目配置\n\n原始内容\n');

    ingestor = new ClaudeCodeIngestor();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('injectRules', () => {
    it('should inject rules into CLAUDE.md', async () => {
      await ingestor.injectRules(tempDir);

      const content = await fs.readFile(claudeMdPath, 'utf-8');

      expect(content).toContain('## Corivo 记忆层');
      expect(content).toContain('corivo save');
    });

    it('should not inject rules if already present', async () => {
      // 首次注入
      await ingestor.injectRules(tempDir);
      const firstContent = await fs.readFile(claudeMdPath, 'utf-8');

      // 二次注入
      await ingestor.injectRules(tempDir);
      const secondContent = await fs.readFile(claudeMdPath, 'utf-8');

      // 内容应该相同（规则没有重复添加）
      expect(secondContent).toBe(firstContent);
    });

    it('should handle missing CLAUDE.md gracefully', async () => {
      // 删除 CLAUDE.md
      await fs.unlink(claudeMdPath);

      // 应该抛出错误或静默失败
      await expect(ingestor.injectRules(tempDir)).resolves.toBeUndefined();
    });

    it('should append rules to existing content', async () => {
      const originalContent = await fs.readFile(claudeMdPath, 'utf-8');

      await ingestor.injectRules(tempDir);

      const newContent = await fs.readFile(claudeMdPath, 'utf-8');

      // 原始内容应该保留
      expect(newContent).toContain('原始内容');
      // 新规则应该添加
      expect(newContent).toContain('## Corivo 记忆层');
      expect(newContent.length).toBeGreaterThan(originalContent.length);
    });
  });

  describe('generateRules', () => {
    it('should generate complete rule documentation', async () => {
      await ingestor.injectRules(tempDir);

      const content = await fs.readFile(claudeMdPath, 'utf-8');

      // 检查关键部分
      expect(content).toContain('性质（nature）');
      expect(content).toContain('事实');
      expect(content).toContain('知识');
      expect(content).toContain('决策');
      expect(content).toContain('指令');

      expect(content).toContain('领域（domain）');
      expect(content).toContain('self');
      expect(content).toContain('people');
      expect(content).toContain('project');
    });
  });
});
