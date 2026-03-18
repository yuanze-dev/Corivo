/**
 * CLI E2E 测试
 *
 * 测试完整的 CLI 流程
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const CLI = path.join(process.cwd(), 'dist/cli/index.js');
const TEST_DIR = `/tmp/corivo-e2e-${Date.now()}`;

describe('E2E: CLI Basic Workflow', () => {
  beforeAll(async () => {
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // 清理
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it('should display help', () => {
    const result = execSync(`node ${CLI} --help`, { encoding: 'utf-8' });
    expect(result).toContain('Corivo');
    expect(result).toContain('init');
    expect(result).toContain('save');
    expect(result).toContain('query');
    expect(result).toContain('status');
  });

  it('should show version', () => {
    const result = execSync(`node ${CLI} --version`, { encoding: 'utf-8' });
    expect(result).toContain('0.10.0-mvp');
  });

  it('should run doctor command (no config)', () => {
    const result = execSync(`node ${CLI} doctor`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, HOME: TEST_DIR }
    });
    expect(result).toContain('配置文件不存在');
  });

  it('should show error for missing init', () => {
    // CLI exits with code 1 when not initialized
    expect(() => {
      execSync(`node ${CLI} status`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, HOME: TEST_DIR }
      });
    }).toThrow();
  });
});
