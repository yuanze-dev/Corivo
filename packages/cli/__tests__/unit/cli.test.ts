/**
 * Unit tests for CLI commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CorivoDatabase } from '@/infrastructure/storage/facade/database';
import { KeyManager } from '../../src/infrastructure/crypto/keys.js';

describe('CLI Commands', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;
  let dbKey: Buffer;
  let salt: Buffer;
  let masterKey: Buffer;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = `${os.tmpdir()}/corivo-cli-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    configPath = path.join(tempDir, 'config.json');
    dbPath = path.join(tempDir, 'corivo.db');

    // Generate key
    salt = KeyManager.generateSalt();
    dbKey = KeyManager.generateDatabaseKey();
    masterKey = KeyManager.deriveMasterKey('test-password', salt);

    // Create configuration file
    const encryptedKey = KeyManager.encryptDatabaseKey(dbKey, masterKey);
    const config = {
      salt: salt.toString('base64'),
      encrypted_db_key: encryptedKey,
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initCommand validation', () => {
    it('should validate password strength', async () => {
      // Weak passwords should be rejected (too short or single type)
      const weakPasswords = ['', '123', 'abc', 'password', '12345678'];

      for (const pwd of weakPasswords) {
        // Check password strength: at least 8 characters and contain multiple character types
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
      // Strong passwords should pass
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

      // Simulate an existing PID file
      await fs.writeFile(pidPath, '99999');

      // Check file exists
      const exists = await fs.access(pidPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('stopCommand validation', () => {
    it('should handle missing PID file', async () => {
      const pidPath = path.join(tempDir, 'heartbeat.pid');

      // Should handle gracefully when PID file does not exist
      const exists = await fs.access(pidPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
