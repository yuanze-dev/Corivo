/**
 * Integration tests for the Claude Code ingestor
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
    // Create temporary directory
    tempDir = `${os.tmpdir()}/corivo-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    // Create CLAUDE.md file
    claudeMdPath = path.join(tempDir, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, '# 项目配置\n\n原始内容\n');

    ingestor = new ClaudeCodeIngestor();
  });

  afterEach(async () => {
    // Clean up temporary directory
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
      // first injection
      await ingestor.injectRules(tempDir);
      const firstContent = await fs.readFile(claudeMdPath, 'utf-8');

      // secondary injection
      await ingestor.injectRules(tempDir);
      const secondContent = await fs.readFile(claudeMdPath, 'utf-8');

      // The content should be the same (the rules are not added repeatedly)
      expect(secondContent).toBe(firstContent);
    });

    it('should handle missing CLAUDE.md gracefully', async () => {
      // Delete CLAUDE.md
      await fs.unlink(claudeMdPath);

      // should throw an error or fail silently
      await expect(ingestor.injectRules(tempDir)).resolves.toBeUndefined();
    });

    it('should append rules to existing content', async () => {
      const originalContent = await fs.readFile(claudeMdPath, 'utf-8');

      await ingestor.injectRules(tempDir);

      const newContent = await fs.readFile(claudeMdPath, 'utf-8');

      // Original content should be retained
      expect(newContent).toContain('原始内容');
      // New rules should be added
      expect(newContent).toContain('## Corivo 记忆层');
      expect(newContent.length).toBeGreaterThan(originalContent.length);
    });
  });

  describe('generateRules', () => {
    it('should generate complete rule documentation', async () => {
      await ingestor.injectRules(tempDir);

      const content = await fs.readFile(claudeMdPath, 'utf-8');

      // Check the key parts
      expect(content).toContain('nature - required');
      expect(content).toContain('事实');
      expect(content).toContain('知识');
      expect(content).toContain('决策');
      expect(content).toContain('指令');

      expect(content).toContain('domain - required');
      expect(content).toContain('self');
      expect(content).toContain('people');
      expect(content).toContain('project');
    });
  });
});
