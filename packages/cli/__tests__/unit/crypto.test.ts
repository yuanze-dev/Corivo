/**
 * Unit tests for key management (KeyManager)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { KeyManager } from '../../src/crypto/keys.js';

describe('KeyManager', () => {
  describe('password validation', () => {
    it('should accept strong password', () => {
      const result = KeyManager.validatePasswordStrength('Abc12345');
      expect(result).toBe(true);
    });

    it('should reject short password', () => {
      const result = KeyManager.validatePasswordStrength('Abc1');
      expect(result).toBe(false);
    });

    it('should reject password without letters', () => {
      const result = KeyManager.validatePasswordStrength('12345678');
      expect(result).toBe(false);
    });

    it('should reject password without numbers', () => {
      const result = KeyManager.validatePasswordStrength('Abcdefgh');
      expect(result).toBe(false);
    });
  });

  describe('salt generation', () => {
    it('should generate unique salts', () => {
      const salt1 = KeyManager.generateSalt();
      const salt2 = KeyManager.generateSalt();

      expect(salt1).not.toEqual(salt2);
    });

    it('should generate 16-byte salt', () => {
      const salt = KeyManager.generateSalt();
      expect(salt).toHaveLength(16);
    });
  });

  describe('master key derivation', () => {
    it('should derive consistent key from same password', () => {
      const password = 'TestPassword123';
      const salt = KeyManager.generateSalt();

      const key1 = KeyManager.deriveMasterKey(password, salt);
      const key2 = KeyManager.deriveMasterKey(password, salt);

      expect(key1).toEqual(key2);
    });

    it('should derive different keys from different passwords', () => {
      const salt = KeyManager.generateSalt();

      const key1 = KeyManager.deriveMasterKey('Password1', salt);
      const key2 = KeyManager.deriveMasterKey('Password2', salt);

      expect(key1).not.toEqual(key2);
    });

    it('should derive different keys from different salts', () => {
      const password = 'TestPassword123';
      const salt1 = KeyManager.generateSalt();
      const salt2 = KeyManager.generateSalt();

      const key1 = KeyManager.deriveMasterKey(password, salt1);
      const key2 = KeyManager.deriveMasterKey(password, salt2);

      expect(key1).not.toEqual(key2);
    });
  });

  describe('database key encryption', () => {
    it('should encrypt and decrypt database key', () => {
      const password = 'TestPassword123';
      const salt = KeyManager.generateSalt();
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const dbKey = KeyManager.generateDatabaseKey();

      const encrypted = KeyManager.encryptDatabaseKey(dbKey, masterKey);
      const decrypted = KeyManager.decryptDatabaseKey(encrypted, masterKey);

      expect(decrypted).toEqual(dbKey);
    });

    it('should fail to decrypt with wrong key', () => {
      const password1 = 'TestPassword123';
      const password2 = 'DifferentPassword456';
      const salt = KeyManager.generateSalt();
      const masterKey1 = KeyManager.deriveMasterKey(password1, salt);
      const masterKey2 = KeyManager.deriveMasterKey(password2, salt);
      const dbKey = KeyManager.generateDatabaseKey();

      const encrypted = KeyManager.encryptDatabaseKey(dbKey, masterKey1);

      expect(() => {
        KeyManager.decryptDatabaseKey(encrypted, masterKey2);
      }).toThrow();
    });
  });

  describe('recovery key', () => {
    it('should generate valid recovery key format', () => {
      const masterKey = crypto.randomBytes(32); // Proper 32-byte master key
      const recoveryKey = KeyManager.generateRecoveryKey(masterKey);

      // Recovery key should be 24 words separated by spaces
      const words = recoveryKey.split(' ');
      expect(words).toHaveLength(24);

      // All words should be lowercase alphabetic
      for (const word of words) {
        expect(word).toMatch(/^[a-z]+$/);
      }
    });

    it('should derive same master key from recovery key', () => {
      const masterKey = crypto.randomBytes(32);
      const recoveryKey = KeyManager.generateRecoveryKey(masterKey);

      const derivedMasterKey = KeyManager.deriveFromRecoveryKey(recoveryKey);

      expect(derivedMasterKey).toEqual(masterKey);
    });

    it('should reject invalid recovery key format', () => {
      expect(() => {
        KeyManager.deriveFromRecoveryKey('invalid recovery key');
      }).toThrow();
    });

    it('should reject recovery key with wrong word count', () => {
      expect(() => {
        KeyManager.deriveFromRecoveryKey('word1 word2 word3');
      }).toThrow();
    });

    it('should validate recovery key with incorrect checksum', () => {
      const masterKey = crypto.randomBytes(32);
      const recoveryKey = KeyManager.generateRecoveryKey(masterKey);
      const words = recoveryKey.split(' ');

      // Change the last word to invalidate checksum
      words[23] = words[22]; // Duplicate last word

      expect(() => {
        KeyManager.deriveFromRecoveryKey(words.join(' '));
      }).toThrow();
    });
  });
});
