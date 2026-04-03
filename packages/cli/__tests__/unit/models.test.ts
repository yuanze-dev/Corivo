/**
 * Phase 1: Infrastructure tests
 *
 * Covers data models, error handling, and key management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateBlockId,
  validateAnnotation,
  vitalityToStatus,
  inferDecayRate,
  NATURE_TYPES,
  DOMAIN_TYPES,
} from '../../src/domain/memory/models/block.js';
import { Pattern, validatePattern, DECISION_TYPES } from '../../src/domain/memory/models/pattern.js';
import { isCorivoError, wrapError, ERROR_CODES } from '../../src/errors/index.js';
import { KeyManager } from '../../src/crypto/keys.js';

// Mock BIP39 wordlist for testing
const TEST_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  // ...a full list of at least 2048 words is required, simplified testing here
];

describe('Block Model', () => {
  describe('generateBlockId', () => {
    it('should generate valid block ID', () => {
      const id = generateBlockId();
      expect(id).toMatch(/^blk_[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        const id = generateBlockId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });
  });

  describe('validateAnnotation', () => {
    it('should validate correct annotation', () => {
      expect(validateAnnotation('事实 · asset · AWS')).toBe(true);
      expect(validateAnnotation('知识 · knowledge · 通用')).toBe(true);
      expect(validateAnnotation('决策 · project · corivo')).toBe(true);
    });

    it('should reject invalid annotation', () => {
      expect(validateAnnotation('invalid')).toBe(false);
      expect(validateAnnotation('事实 · asset')).toBe(false); // only two parts
      expect(validateAnnotation('事实 · asset · ')).toBe(false); // Tag is empty
    });
  });

  describe('vitalityToStatus', () => {
    it('should convert vitality to status', () => {
      expect(vitalityToStatus(100)).toBe('active');
      expect(vitalityToStatus(70)).toBe('active');
      expect(vitalityToStatus(50)).toBe('cooling');
      expect(vitalityToStatus(20)).toBe('cold');
      expect(vitalityToStatus(0)).toBe('archived');
    });
  });

  describe('inferDecayRate', () => {
    it('should infer decay rate from annotation', () => {
      expect(inferDecayRate('事实 · asset · 密码')).toBe(0.5);
      expect(inferDecayRate('知识 · knowledge · 通用')).toBe(2);
      expect(inferDecayRate('决策 · project · 项目')).toBe(1);
    });
  });
});

describe('Pattern Model', () => {
  describe('validatePattern', () => {
    it('should validate correct pattern', () => {
      const pattern: Pattern = {
        type: '技术选型',
        decision: 'PostgreSQL',
        dimensions: [
          { name: '安全性', weight: 0.9, reason: '规则推断' },
        ],
        context_tags: ['前端', 'web'],
        confidence: 0.7,
      };
      expect(validatePattern(pattern)).toBe(true);
    });

    it('should reject invalid pattern', () => {
      expect(validatePattern(null)).toBe(false);
      expect(validatePattern({})).toBe(false);
      expect(validatePattern({ type: 'test', decision: '', dimensions: [], confidence: -1 })).toBe(false);
    });
  });
});

describe('Error Handling', () => {
  describe('isCorivoError', () => {
    it('should identify CorivoError', () => {
      const error = new Error('test');
      expect(isCorivoError(error)).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('should wrap unknown error', () => {
      const wrapped = wrapError('test', ERROR_CODES.UNKNOWN);
      expect(isCorivoError(wrapped)).toBe(true);
      expect(wrapped.code).toBe(ERROR_CODES.UNKNOWN);
    });
  });
});

describe('KeyManager', () => {
  describe('password validation', () => {
    it('should validate strong password', () => {
      expect(KeyManager.validatePasswordStrength('Abc12345')).toBe(true);
      expect(KeyManager.validatePasswordStrength('password123')).toBe(true);
    });

    it('should reject weak password', () => {
      expect(KeyManager.validatePasswordStrength('123')).toBe(false);
      expect(KeyManager.validatePasswordStrength('abcdef')).toBe(false);
      expect(KeyManager.validatePasswordStrength('1234')).toBe(false);
    });
  });

  describe('key operations', () => {
    it('should derive consistent key from same password', () => {
      const password = 'testPassword123';
      const salt = Buffer.from('testsalt');
      const key1 = KeyManager.deriveMasterKey(password, salt);
      const key2 = KeyManager.deriveMasterKey(password, salt);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys from different passwords', () => {
      const salt = Buffer.from('testsalt');
      const key1 = KeyManager.deriveMasterKey('password1', salt);
      const key2 = KeyManager.deriveMasterKey('password2', salt);
      expect(key1.equals(key2)).toBe(false);
    });

    it('should encrypt and decrypt database key', () => {
      const dbKey = KeyManager.generateDatabaseKey();
      const masterKey = KeyManager.generateDatabaseKey();

      const encrypted = KeyManager.encryptDatabaseKey(dbKey, masterKey);
      const decrypted = KeyManager.decryptDatabaseKey(encrypted, masterKey);

      expect(decrypted.equals(dbKey)).toBe(true);
    });
  });
});
