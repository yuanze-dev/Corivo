/**
 * 身份验证模块
 *
 * 提供可选的找回密码/身份验证功能
 *
 * 设计理念：
 * - 可选功能，用户主动选择是否设置
 * - 验证优先级高于所有指纹采集
 * - 用于跨设备身份恢复或手动身份确认
 *
 * 使用场景：
 * 1. 换新设备后，指纹无法自动匹配时
 * 2. 多人共用设备时，手动确认身份
 * 3. 身份被盗时，通过验证码夺回控制权
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IdentityConfig } from './identity.js';

/**
 * 身份验证配置
 */
export interface IdentityAuthConfig {
  /** 是否启用身份验证 */
  enabled: boolean;
  /** 验证码哈希（经过 PBKDF2 处理） */
  verifier: string;
  /** 盐值 */
  salt: string;
  /** 提示问题（可选） */
  hint?: string;
  /** 设置时间 */
  created_at: string;
  /** 最后使用时间 */
  last_used_at?: string;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  /** 是否验证成功 */
  success: boolean;
  /** 剩余尝试次数（失败时） */
  remaining_attempts?: number;
}

/**
 * 身份验证器
 */
export class IdentityAuth {
  private authConfigPath: string;

  constructor(configDir?: string) {
    const dir = configDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.corivo'
    );
    this.authConfigPath = path.join(dir, 'auth.json');
  }

  /**
   * 检查是否已设置身份验证
   */
  async isEnabled(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;
      return config.enabled;
    } catch {
      return false;
    }
  }

  /**
   * 设置身份验证码
   *
   * @param code - 验证码（用户提供的密码/短语）
   * @param hint - 提示问题（可选）
   */
  async setup(code: string, hint?: string): Promise<void> {
    if (code.length < 4) {
      throw new Error('验证码至少需要 4 个字符');
    }

    // 生成盐值
    const salt = crypto.randomBytes(16).toString('hex');

    // 使用 PBKDF2 派生密钥（与数据库密钥相同的强度）
    const verifier = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256').toString('hex');

    const config: IdentityAuthConfig = {
      enabled: true,
      verifier,
      salt,
      hint,
      created_at: new Date().toISOString(),
    };

    await fs.mkdir(path.dirname(this.authConfigPath), { recursive: true });
    await fs.writeFile(this.authConfigPath, JSON.stringify(config, null, 2));
  }

  /**
   * 验证身份验证码
   *
   * @param code - 用户输入的验证码
   * @returns 验证结果
   */
  async verify(code: string): Promise<VerifyResult> {
    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;

      if (!config.enabled) {
        return { success: false };
      }

      // 验证码匹配
      const hash = crypto.pbkdf2Sync(code, config.salt, 100000, 32, 'sha256').toString('hex');
      const success = hash === config.verifier;

      if (success) {
        // 更新最后使用时间
        config.last_used_at = new Date().toISOString();
        await fs.writeFile(this.authConfigPath, JSON.stringify(config, null, 2));
      }

      return { success };
    } catch {
      return { success: false };
    }
  }

  /**
   * 更新验证码
   *
   * @param oldCode - 旧验证码（用于验证）
   * @param newCode - 新验证码
   */
  async update(oldCode: string, newCode: string): Promise<boolean> {
    const verifyResult = await this.verify(oldCode);
    if (!verifyResult.success) {
      return false;
    }

    await this.setup(newCode);
    return true;
  }

  /**
   * 禁用身份验证
   *
   * @param code - 当前验证码（需要验证）
   */
  async disable(code: string): Promise<boolean> {
    const verifyResult = await this.verify(code);
    if (!verifyResult.success) {
      return false;
    }

    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;
      config.enabled = false;
      await fs.writeFile(this.authConfigPath, JSON.stringify(config, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取提示问题
   */
  async getHint(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;
      return config.hint || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取验证配置（不包含敏感信息）
   */
  async getPublicInfo(): Promise<{
    enabled: boolean;
    has_hint: boolean;
    created_at?: string;
    last_used_at?: string;
  } | null> {
    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;

      return {
        enabled: config.enabled,
        has_hint: !!config.hint,
        created_at: config.created_at,
        last_used_at: config.last_used_at,
      };
    } catch {
      return null;
    }
  }
}

/**
 * 身份合并器
 *
 * 使用验证码合并身份
 */
export class IdentityMerger {
  /**
   * 通过验证码证明身份并合并
   *
   * @param targetIdentity - 目标身份配置
   * @param code - 验证码
   * @param auth - 身份验证器
   * @returns 是否合并成功
   */
  static async mergeWithAuth(
    targetIdentity: IdentityConfig,
    code: string,
    auth: IdentityAuth
  ): Promise<boolean> {
    const verifyResult = await auth.verify(code);
    return verifyResult.success;
  }

  /**
   * 通过验证码恢复身份
   *
   * @param code - 验证码
   * @param auth - 身份验证器
   * @returns 身份配置（如果验证成功）
   */
  static async recoverWithAuth(
    code: string,
    auth: IdentityAuth
  ): Promise<IdentityConfig | null> {
    const verifyResult = await auth.verify(code);
    if (!verifyResult.success) {
      return null;
    }

    // 验证成功，返回一个临时身份标识
    // 实际使用中，应该从备份或其他来源恢复完整身份
    return {
      identity_id: `id_recovered_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      fingerprints: {},
      devices: {},
    };
  }
}

/**
 * CLI 辅助函数
 */

/**
 * 设置身份验证码（交互式）
 */
export async function setupAuthPrompt(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('           设置身份验证码（可选）');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('身份验证码用于：');
  console.log('  • 换设备时证明你的身份');
  console.log('  • 指纹无法匹配时手动确认');
  console.log('  • 身份被盗时夺回控制权\n');

  console.log('⚠️  重要：');
  console.log('  • 验证码只存储在本地，经过哈希加密');
  console.log('  • 请使用容易记住但不易被猜到的短语');
  console.log('  • 忘记验证码无法找回，只能禁用后重新设置\n');

  // TODO: 实际实现需要交互式输入
  // 这里只展示说明
}

/**
 * 联合验证结果
 */
export interface JointVerificationResult {
  /** 是否验证成功 */
  success: boolean;
  /** 指纹匹配分数 (0-100) */
  fingerprintScore?: number;
  /** 密码是否正确 */
  passwordValid?: boolean;
  /** 综合置信度 */
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  /** 验证方法 */
  method: 'fingerprint_only' | 'password_only' | 'joint';
}

/**
 * 联合验证器
 *
 * 结合指纹和密码进行身份验证，提供更强的安全保障
 */
export class JointVerifier {
  private auth: IdentityAuth;

  constructor(auth?: IdentityAuth) {
    const configDir = process.env.HOME || process.env.USERPROFILE || '.';
    this.auth = auth || new IdentityAuth(`${configDir}/.corivo`);
  }

  /**
   * 联合验证：指纹 + 密码
   *
   * @param fingerprints - 当前设备的指纹列表
   * @param targetIdentity - 目标身份配置
   * @param password - 用户输入的密码（可选）
   * @returns 验证结果
   */
  async verify(
    fingerprints: string[],
    targetIdentity: IdentityConfig,
    password?: string
  ): Promise<JointVerificationResult> {
    // 1. 指纹匹配
    const fingerprintResult = this.matchFingerprints(fingerprints, targetIdentity);

    // 2. 如果提供了密码，验证密码
    let passwordValid = false;
    if (password) {
      const authResult = await this.auth.verify(password);
      passwordValid = authResult.success;
    }

    // 3. 计算综合置信度
    return this.calculateConfidence(fingerprintResult, passwordValid);
  }

  /**
   * 匹配指纹
   *
   * @param currentFingerprints - 当前设备指纹
   * @param targetIdentity - 目标身份
   * @returns 匹配分数 (0-100)
   */
  private matchFingerprints(
    currentFingerprints: string[],
    targetIdentity: IdentityConfig
  ): number {
    if (!currentFingerprints.length || !targetIdentity.fingerprints) {
      return 0;
    }

    let matchCount = 0;
    let totalScore = 0;

    for (const currentFp of currentFingerprints) {
      for (const [platform, storedFp] of Object.entries(targetIdentity.fingerprints)) {
        // 检查当前指纹和历史指纹
        if (storedFp.current === currentFp) {
          matchCount++;
          totalScore += this.getConfidenceScore(storedFp.confidence);
        } else if (storedFp.historical?.includes(currentFp)) {
          matchCount++;
          totalScore += this.getConfidenceScore(storedFp.confidence) * 0.5; // 历史指纹减半
        }
      }
    }

    return Math.min(100, totalScore);
  }

  /**
   * 获取置信度分数
   */
  private getConfidenceScore(confidence: string): number {
    switch (confidence) {
      case 'high': return 40;
      case 'medium': return 20;
      case 'low': return 10;
      default: return 5;
    }
  }

  /**
   * 计算综合置信度
   */
  private calculateConfidence(
    fingerprintScore: number,
    passwordValid: boolean
  ): JointVerificationResult {
    // 只有指纹
    if (!passwordValid) {
      if (fingerprintScore >= 80) {
        return {
          success: true,
          fingerprintScore,
          confidence: 'high',
          method: 'fingerprint_only',
        };
      } else if (fingerprintScore >= 40) {
        return {
          success: true,
          fingerprintScore,
          confidence: 'medium',
          method: 'fingerprint_only',
        };
      }
      return {
        success: false,
        fingerprintScore,
        confidence: 'low',
        method: 'fingerprint_only',
      };
    }

    // 只有密码
    if (fingerprintScore === 0) {
      return {
        success: true,
        fingerprintScore: 0,
        passwordValid: true,
        confidence: 'high',
        method: 'password_only',
      };
    }

    // 指纹 + 密码联合验证
    const jointScore = fingerprintScore + 50; // 密码额外加 50 分
    if (jointScore >= 130) {
      return {
        success: true,
        fingerprintScore,
        passwordValid: true,
        confidence: 'very_high',
        method: 'joint',
      };
    }
    return {
      success: true,
      fingerprintScore,
      passwordValid: true,
      confidence: 'high',
      method: 'joint',
    };
  }

  /**
   * 跨设备身份恢复
   *
   * 当指纹完全不匹配时，通过密码证明身份
   *
   * @param password - 用户密码
   * @param deviceId - 新设备 ID
   * @returns 是否恢复成功
   */
  async recoverAcrossDevice(
    password: string,
    deviceId: string
  ): Promise<boolean> {
    const result = await this.auth.verify(password);
    if (!result.success) {
      return false;
    }

    // 密码正确，记录新设备
    // 实际实现应该更新身份配置，添加新设备指纹
    // 这里返回 true 表示密码验证通过
    return true;
  }
}

/**
 * 验证身份码（交互式）
 */
export async function verifyAuthPrompt(hint?: string): Promise<boolean> {
  console.log('\n请输入身份验证码以确认身份');
  if (hint) {
    console.log(`提示: ${hint}`);
  }

  // TODO: 实际实现需要交互式输入
  return false;
}
