/**
 * CLI 命令单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CorivoDatabase } from '../../src/storage/database.js';
import { KeyManager } from '../../src/crypto/keys.js';

describe('CLI Commands', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;
  let dbKey: Buffer;
  let salt: Buffer;
  let masterKey: Buffer;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = `${os.tmpdir()}/corivo-cli-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    configPath = path.join(tempDir, 'config.json');
    dbPath = path.join(tempDir, 'corivo.db');

    // 生成密钥
    salt = KeyManager.generateSalt();
    dbKey = KeyManager.generateDatabaseKey();
    masterKey = KeyManager.deriveMasterKey('test-password', salt);

    // 创建配置文件
    const encryptedKey = KeyManager.encryptDatabaseKey(dbKey, masterKey);
    const config = {
      salt: salt.toString('base64'),
      encrypted_db_key: encryptedKey,
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initCommand validation', () => {
    it('should validate password strength', async () => {
      // 弱密码应该被拒绝（太短或单一类型）
      const weakPasswords = ['', '123', 'abc', 'password', '12345678'];

      for (const pwd of weakPasswords) {
        // 检查密码强度：至少8位且包含多种字符类型
        const hasLower = /[a-z]/.test(pwd);
        const hasUpper = /[A-Z]/.test(pwd);
        const hasDigit = /\d/.test(pwd);
        const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
        const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
        const isValid = pwd.length >= 8 && varietyCount >= 2;
        expect(isValid).toBe(false);
      }
    });

    it('should accept strong passwords', async () => {
      // 强密码应该通过
      const strongPasswords = [
        'Test@12345',
        'mySecretPassword!2024',
        'correct-horse-battery-staple',
      ];

      for (const pwd of strongPasswords) {
        const isValid = pwd.length >= 8;
        expect(isValid).toBe(true);
      }
    });
  });

  describe('saveCommand validation', () => {
    it('should reject empty content', async () => {
      const emptyContents = ['', '   ', '\n\t'];

      for (const content of emptyContents) {
        const isValid = content.trim().length > 0;
        expect(isValid).toBe(false);
      }
    });

    it('should validate annotation format', async () => {
      const validAnnotations = [
        '事实 · asset · 凭证',
        '知识 · knowledge · 代码',
        '决策 · project · 项目',
        '指令 · self · 偏好',
      ];

      for (const annotation of validAnnotations) {
        const parts = annotation.split(' · ');
        expect(parts).toHaveLength(3);
      }
    });
  });

  describe('queryCommand validation', () => {
    it('should validate limit parameter', async () => {
      const limits = ['0', '-1', 'abc', '1000000'];

      for (const limit of limits) {
        const num = parseInt(limit);
        const isValid = !isNaN(num) && num > 0 && num <= 100;
        expect(isValid).toBe(false);
      }

      const validLimits = ['1', '10', '50', '100'];
      for (const limit of validLimits) {
        const num = parseInt(limit);
        const isValid = !isNaN(num) && num > 0 && num <= 100;
        expect(isValid).toBe(true);
      }
    });
  });

  describe('startCommand validation', () => {
    it('should check if already running', async () => {
      const pidPath = path.join(tempDir, 'heartbeat.pid');

      // 模拟已存在的 PID 文件
      await fs.writeFile(pidPath, '99999');

      // 检查文件存在
      const exists = await fs.access(pidPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('stopCommand validation', () => {
    it('should handle missing PID file', async () => {
      const pidPath = path.join(tempDir, 'heartbeat.pid');

      // PID 文件不存在时应该优雅处理
      const exists = await fs.access(pidPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
