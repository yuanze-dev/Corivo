/**
 * Identity authentication module
 *
 * Provides optional passphrase-based identity verification.
 *
 * Design principles:
 * - Opt-in feature; the user explicitly enables it
 * - Auth takes precedence over all fingerprint-based matching
 * - Used for cross-device identity recovery or manual identity confirmation
 *
 * Use cases:
 * 1. After switching to a new device where fingerprints cannot auto-match
 * 2. On shared devices where manual identity confirmation is needed
 * 3. Recovering control after an identity compromise
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IdentityConfig } from './identity.js';

/**
 * Identity authentication configuration stored on disk
 */
export interface IdentityAuthConfig {
  /** Whether authentication is currently enabled */
  enabled: boolean;
  /** PBKDF2-derived verifier hash of the passphrase */
  verifier: string;
  /** Random salt used for key derivation */
  salt: string;
  /** Optional hint question shown to the user before entry */
  hint?: string;
  /** ISO timestamp when the auth config was created */
  created_at: string;
  /** ISO timestamp of the most recent successful verification */
  last_used_at?: string;
}

/**
 * Result returned by a verification attempt
 */
export interface VerifyResult {
  /** Whether the verification succeeded */
  success: boolean;
  /** Remaining allowed attempts (provided on failure) */
  remaining_attempts?: number;
}

/**
 * Identity authenticator — manages passphrase setup, verification, and rotation
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
   * Returns true if authentication has been set up and is currently enabled
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
   * Sets up a new passphrase for identity authentication
   *
   * @param code - The passphrase chosen by the user
   * @param hint - Optional hint question shown before entry
   */
  async setup(code: string, hint?: string): Promise<void> {
    if (code.length < 4) {
      throw new Error('验证码至少需要 4 个字符');
    }

    // Generate a fresh random salt for this passphrase
    const salt = crypto.randomBytes(16).toString('hex');

    // Derive a verifier using PBKDF2 — same strength as the database key derivation
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
   * Verifies a passphrase against the stored verifier
   *
   * @param code - The passphrase entered by the user
   * @returns Verification result indicating success or failure
   */
  async verify(code: string): Promise<VerifyResult> {
    try {
      const content = await fs.readFile(this.authConfigPath, 'utf-8');
      const config = JSON.parse(content) as IdentityAuthConfig;

      if (!config.enabled) {
        return { success: false };
      }

      // Derive the hash from the supplied code and compare to the stored verifier
      const hash = crypto.pbkdf2Sync(code, config.salt, 100000, 32, 'sha256').toString('hex');
      const success = hash === config.verifier;

      if (success) {
        // Record the timestamp of this successful verification
        config.last_used_at = new Date().toISOString();
        await fs.writeFile(this.authConfigPath, JSON.stringify(config, null, 2));
      }

      return { success };
    } catch {
      return { success: false };
    }
  }

  /**
   * Rotates the passphrase — requires the current passphrase to authorize the change
   *
   * @param oldCode - The current passphrase (used for verification)
   * @param newCode - The new passphrase to set
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
   * Disables authentication — requires the current passphrase to authorize
   *
   * @param code - The current passphrase (required to prevent unauthorized disabling)
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
   * Returns the hint question, or null if none was set
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
   * Returns non-sensitive auth metadata (excludes verifier and salt)
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
 * Utility for merging identities via passphrase verification
 */
export class IdentityMerger {
  /**
   * Proves ownership of a target identity using a passphrase, enabling a merge
   *
   * @param targetIdentity - The identity configuration to merge into
   * @param code - The passphrase to verify
   * @param auth - The authenticator holding the stored verifier
   * @returns true if the passphrase is valid and the merge is authorized
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
   * Recover identity via verification code
   *
   * @param code - Verification code
   * @param auth - authenticator
   * @returns identity configuration (if verification is successful)
   */
  static async recoverWithAuth(
    code: string,
    auth: IdentityAuth
  ): Promise<IdentityConfig | null> {
    const verifyResult = await auth.verify(code);
    if (!verifyResult.success) {
      return null;
    }

    // Verification is successful and a temporary identity is returned.
    // In practice, the complete identity should be restored from backup or other sources
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
 * CLI helper functions
 */

/**
 * Set authentication code (interactive)
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

  // TODO: Actual implementation requires interactive input
  // Only the description is shown here
}

/**
 * Joint verification results
 */
export interface JointVerificationResult {
  /** Is the verification successful? */
  success: boolean;
  /** Fingerprint match score (0-100) */
  fingerprintScore?: number;
  /** Is the password correct? */
  passwordValid?: boolean;
  /** Overall confidence */
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  /** Verification method */
  method: 'fingerprint_only' | 'password_only' | 'joint';
}

/**
 * federated validator
 *
 * Combine fingerprint and password for authentication to provide stronger security
 */
export class JointVerifier {
  private auth: IdentityAuth;

  constructor(auth?: IdentityAuth) {
    const configDir = process.env.HOME || process.env.USERPROFILE || '.';
    this.auth = auth || new IdentityAuth(`${configDir}/.corivo`);
  }

  /**
   * Joint verification: fingerprint + password
   *
   * @param fingerprints - List of fingerprints for the current device
   * @param targetIdentity - target identity configuration
   * @param password - the password entered by the user (optional)
   * @returns verification results
   */
  async verify(
    fingerprints: string[],
    targetIdentity: IdentityConfig,
    password?: string
  ): Promise<JointVerificationResult> {
    // 1. Fingerprint matching
    const fingerprintResult = this.matchFingerprints(fingerprints, targetIdentity);

    // 2. If a password is provided, verify the password
    let passwordValid = false;
    if (password) {
      const authResult = await this.auth.verify(password);
      passwordValid = authResult.success;
    }

    // 3. Calculate comprehensive confidence
    return this.calculateConfidence(fingerprintResult, passwordValid);
  }

  /**
   * Match fingerprint
   *
   * @param currentFingerprints - Current device fingerprints
   * @param targetIdentity - target identity
   * @returns match score (0-100)
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
        // Check current and historical fingerprints
        if (storedFp.current === currentFp) {
          matchCount++;
          totalScore += this.getConfidenceScore(storedFp.confidence);
        } else if (storedFp.historical?.includes(currentFp)) {
          matchCount++;
          totalScore += this.getConfidenceScore(storedFp.confidence) * 0.5; // Historical fingerprints halved
        }
      }
    }

    return Math.min(100, totalScore);
  }

  /**
   * Get confidence score
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
   * Calculate overall confidence
   */
  private calculateConfidence(
    fingerprintScore: number,
    passwordValid: boolean
  ): JointVerificationResult {
    // Only fingerprints
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

    // only password
    if (fingerprintScore === 0) {
      return {
        success: true,
        fingerprintScore: 0,
        passwordValid: true,
        confidence: 'high',
        method: 'password_only',
      };
    }

    // Fingerprint + password joint verification
    const jointScore = fingerprintScore + 50; // Additional 50 points for password
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
   * Cross-device identity recovery
   *
   * Prove identity via password when fingerprints don't match at all
   *
   * @param password - user password
   * @param deviceId - the new device ID
   * @returns Whether the recovery is successful
   */
  async recoverAcrossDevice(
    password: string,
    deviceId: string
  ): Promise<boolean> {
    const result = await this.auth.verify(password);
    if (!result.success) {
      return false;
    }

    // Password is correct, record new device
    // The actual implementation should update the identity configuration to add the new device fingerprint
    // Returning true here indicates that the password verification is passed
    return true;
  }
}

/**
 * Verify ID code (interactive)
 */
export async function verifyAuthPrompt(hint?: string): Promise<boolean> {
  console.log('\n请输入身份验证码以确认身份');
  if (hint) {
    console.log(`提示: ${hint}`);
  }

  // TODO: Actual implementation requires interactive input
  return false;
}
