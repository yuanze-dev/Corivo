/**
 * 密钥管理（静态工具类）
 *
 * 提供密钥派生、加解密、恢复密钥等功能
 */

import crypto from 'node:crypto';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CryptoError, ValidationError } from '../errors';

/**
 * BIP39 词表（简化版，完整版应从 bip39 库导入）
 * 这里只提供一部分示例，实际使用时需要完整词表
 */
const BIP39_WORDLIST: string[] = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
  'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
  'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
  'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
  'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest', 'arrive',
  'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist',
  'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction', 'audit',
  'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake', 'aware',
  'away', 'awesome', 'awful', 'awkward', 'axis',
  // ... 完整词表有 2048 个词，这里省略
];

/**
 * 密钥管理静态类
 */
export class KeyManager {

  /**
   * 从密码派生主密钥（PBKDF2）
   *
   * @param password - 用户密码
   * @param salt - 盐值
   * @returns 派生的主密钥
   */
  static deriveMasterKey(password: string, salt: Buffer): Buffer {
    try {
      return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    } catch (error) {
      throw new CryptoError('密钥派生失败', { cause: error });
    }
  }

  /**
   * 生成随机盐值
   *
   * @returns 16 字节随机盐值
   */
  static generateSalt(): Buffer {
    return randomBytes(16);
  }

  /**
   * 生成随机数据库密钥
   *
   * @returns 32 字节随机密钥
   */
  static generateDatabaseKey(): Buffer {
    return randomBytes(32);
  }

  /**
   * 加密数据库密钥
   *
   * 使用 AES-256-GCM 加密
   *
   * @param dbKey - 数据库密钥
   * @param masterKey - 主密钥
   * @returns Base64 编码的密文（IV + AuthTag + 密文）
   */
  static encryptDatabaseKey(dbKey: Buffer, masterKey: Buffer): string {
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', masterKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(dbKey),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      // 格式: iv(16) + authTag(16) + encrypted
      const combined = Buffer.concat([iv, authTag, encrypted]);
      return combined.toString('base64');
    } catch (error) {
      throw new CryptoError('密钥加密失败', { cause: error });
    }
  }

  /**
   * 解密数据库密钥
   *
   * @param encrypted - Base64 编码的密文
   * @param masterKey - 主密钥
   * @returns 解密后的数据库密钥
   */
  static decryptDatabaseKey(encrypted: string, masterKey: Buffer): Buffer {
    try {
      const data = Buffer.from(encrypted, 'base64');

      if (data.length < 32) {
        throw new CryptoError('密文格式无效：长度不足');
      }

      const iv = data.subarray(0, 16);
      const authTag = data.subarray(16, 32);
      const ciphertext = data.subarray(32);

      const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted;
    } catch (error) {
      if (error instanceof CryptoError) {
        throw error;
      }
      throw new CryptoError('密钥解密失败，可能是密码错误', { cause: error });
    }
  }

  /**
   * 生成恢复密钥（16 词 BIP39 风格）
   *
   * @param masterKey - 主密钥
   * @returns 16 个空格分隔的单词
   */
  static generateRecoveryKey(masterKey: Buffer): string {
    // 从 masterKey 派生种子
    const seed = crypto.pbkdf2Sync(masterKey, 'corivo-recovery', 1000, 32, 'sha256');

    const result: string[] = [];

    // 将 32 字节转换为 8 个 32 位整数，每个整数对应一个词
    for (let i = 0; i < 8; i++) {
      const chunk = seed.subarray(i * 4, (i + 1) * 4);
      const index = chunk.readUInt32BE(0) % BIP39_WORDLIST.length;
      result.push(BIP39_WORDLIST[index]);
    }

    // 扩展到 16 个词（重复两次，实际应用可以用更复杂的方式）
    const salt2 = crypto.pbkdf2Sync(masterKey, 'corivo-recovery-2', 1000, 32, 'sha256');
    for (let i = 0; i < 8; i++) {
      const chunk = salt2.subarray(i * 4, (i + 1) * 4);
      const index = chunk.readUInt32BE(0) % BIP39_WORDLIST.length;
      result.push(BIP39_WORDLIST[index]);
    }

    return result.join(' ');
  }

  /**
   * 从恢复密钥派生主密钥
   *
   * @param recoveryKey - 16 个空格分隔的单词
   * @returns 派生的主密钥
   */
  static deriveFromRecoveryKey(recoveryKey: string): Buffer {
    const words = recoveryKey.trim().split(/\s+/);

    if (words.length !== 16) {
      throw new ValidationError('恢复密钥必须是 16 个单词');
    }

    // 验证所有词都在词表中
    const wordSet = new Set(BIP39_WORDLIST);
    for (const word of words) {
      if (!wordSet.has(word)) {
        throw new ValidationError(`无效的恢复密钥单词: ${word}`);
      }
    }

    // 将词转换回种子（前 8 个词）
    const seed1 = Buffer.alloc(32);
    for (let i = 0; i < 8; i++) {
      const index = BIP39_WORDLIST.indexOf(words[i]);
      if (index === -1) {
        throw new ValidationError(`无效的恢复密钥单词: ${words[i]}`);
      }
      seed1.writeUInt32BE(index, i * 4);
    }

    // 将词转换回种子（后 8 个词）
    const seed2 = Buffer.alloc(32);
    for (let i = 0; i < 8; i++) {
      const index = BIP39_WORDLIST.indexOf(words[i + 8]);
      if (index === -1) {
        throw new ValidationError(`无效的恢复密钥单词: ${words[i + 8]}`);
      }
      seed2.writeUInt32BE(index, i * 4);
    }

    // 合并两个种子并派生主密钥
    const combined = Buffer.concat([seed1, seed2]);
    return crypto.pbkdf2Sync(combined, 'corivo-recovery', 1000, 32, 'sha256');
  }

  /**
   * 验证密码强度
   *
   * @param password - 待验证的密码
   * @returns 是否足够强
   */
  static validatePasswordStrength(password: string): boolean {
    if (password.length < 8) {
      return false;
    }

    // 检查是否包含字母
    const hasLetter = /[a-zA-Z]/.test(password);
    // 检查是否包含数字
    const hasNumber = /[0-9]/.test(password);

    return hasLetter && hasNumber;
  }

  /**
   * 生成加密盐值提示
   *
   * @returns 用于显示的盐值提示
   */
  static getSaltHint(): string {
    const salt = this.generateSalt();
    return `SALT:${salt.toString('base64')}`;
  }
}
