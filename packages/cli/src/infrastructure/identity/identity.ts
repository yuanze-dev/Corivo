/**
 * User identity management
 *
 * Manage a user's identity across devices and platforms
 *
 * Core design:
 * - Fully transparent to the user, with automatic passive identification
 * - Supports multiple platforms (Claude Code, Cursor, Codex, Feishu, Slack, and more)
 * - Keeps historical fingerprints so token changes do not break identification
 * - Supports linking multiple devices to the same identity
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Fingerprint, PlatformType } from './fingerprint.js';
import {
  FingerprintCollector,
  FingerprintMatcher,
} from './fingerprint.js';
import { IdentityError } from '@/domain/errors/index.js';

/**
 * Supported platform type
 */
export type SupportedPlatform =
  | 'claude_code'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'windsurf'
  | 'feishu'
  | 'slack'
  | 'wechat'
  | 'dingtalk'
  | 'notion'
  | 'github'
  | 'device'
  | 'email'
  | 'custom';

/**
 * All fingerprints recorded for a single platform
 */
export interface PlatformFingerprint {
  /** Current primary fingerprint */
  current: string;
  /** Historical fingerprints (old fingerprints are moved here after token changes) */
  historical: string[];
  /** When this fingerprint was first added */
  added_at: string;
  /** Last updated */
  updated_at: string;
  /** Confidence */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Device information
 */
export interface DeviceInfo {
  id: string;
  name: string;
  platform: string;
  arch: string;
  first_seen: string;
  last_seen: string;
}

/**
 * Identity configuration
 */
export interface IdentityConfig {
  /** Virtual identity ID (UUID, does not reveal real identity) */
  identity_id: string;
  /** creation time */
  created_at: string;
  /** Last updated */
  updated_at: string;
  /** Display name (optional, visible only to the user) */
  display_name?: string;
  /** All platform fingerprints */
  fingerprints: Record<string, PlatformFingerprint>;
  /** Device list */
  devices: Record<string, DeviceInfo>;
}

/**
 * Identity match result
 */
export interface MatchResult {
  /** Whether a match was found */
  matched: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** Platforms that contributed to the match */
  matched_platforms: string[];
  /** Whether a match was found through historical fingerprints */
  matched_via_historical: boolean;
}

/**
 * Identity manager
 */
export class IdentityManager {
  private configPath: string;
  private config: IdentityConfig | null = null;

  constructor(configDir?: string) {
    const dir = configDir || this.getDefaultConfigDir();
    this.configPath = path.join(dir, 'identity.json');
  }

  private getDefaultConfigDir(): string {
    return path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.corivo'
    );
  }

  /**
   * Load identity configuration
   */
  async load(): Promise<IdentityConfig | null> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config;
    } catch {
      return null;
    }
  }

  /**
   * Save identity configuration
   */
  private async save(config: IdentityConfig): Promise<void> {
    config.updated_at = new Date().toISOString();
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    this.config = config;
  }

  /**
   * Create an identity with the specified ID (used to join an existing identity)
   */
  async createWithId(
    identityId: string,
    fingerprints: Fingerprint[],
    displayName?: string
  ): Promise<IdentityConfig> {
    const existing = await this.load();
    if (existing) {
      throw new IdentityError('身份已存在');
    }

    const fingerprintMap: Record<string, PlatformFingerprint> = {};
    const now = new Date().toISOString();

    for (const fp of fingerprints) {
      fingerprintMap[fp.platform] = {
        current: fp.value,
        historical: [],
        added_at: now,
        updated_at: now,
        confidence: fp.confidence,
      };
    }

    const config: IdentityConfig = {
      identity_id: identityId,
      created_at: now,
      updated_at: now,
      display_name: displayName,
      fingerprints: fingerprintMap,
      devices: {},
    };

    await this.save(config);
    return config;
  }

  /**
   * Create new identity
   */
  async create(
    fingerprints: Fingerprint[],
    displayName?: string
  ): Promise<IdentityConfig> {
    const existing = await this.load();
    if (existing) {
      throw new IdentityError('身份已存在');
    }

    const identityId = this.generateIdentityId();
    const fingerprintMap: Record<string, PlatformFingerprint> = {};
    const now = new Date().toISOString();

    for (const fp of fingerprints) {
      fingerprintMap[fp.platform] = {
        current: fp.value,
        historical: [],
        added_at: now,
        updated_at: now,
        confidence: fp.confidence,
      };
    }

    const config: IdentityConfig = {
      identity_id: identityId,
      created_at: now,
      updated_at: now,
      display_name: displayName,
      fingerprints: fingerprintMap,
      devices: {},
    };

    await this.save(config);
    return config;
  }

  /**
   * Add or update platform fingerprint (supports history)
   *
   * If the fingerprint value changes, the old value is automatically moved into historical
   */
  async syncFingerprint(fingerprint: Fingerprint): Promise<boolean> {
    const existing = await this.load();
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    const platform = fingerprint.platform;
    let changed = false;

    if (existing.fingerprints[platform]) {
      const fp = existing.fingerprints[platform];

      // Check whether the current fingerprint changed
      if (fp.current !== fingerprint.value) {
        // Preserve the previous value in history before rotating it out
        if (!fp.historical.includes(fp.current)) {
          fp.historical.push(fp.current);
        }

        // Check whether the new value already exists in history, which indicates token reuse
        const isInHistorical = fp.historical.includes(fingerprint.value);

        fp.current = fingerprint.value;
        fp.updated_at = now;
        changed = true;

        // If the new value came from history, remove it there to avoid duplicates
        if (isInHistorical) {
          fp.historical = fp.historical.filter(v => v !== fingerprint.value);
        }
      }
    } else {
      // First fingerprint for this platform
      existing.fingerprints[platform] = {
        current: fingerprint.value,
        historical: [],
        added_at: now,
        updated_at: now,
        confidence: fingerprint.confidence,
      };
      changed = true;
    }

    if (changed) {
      await this.save(existing);
    }

    return changed;
  }

  /**
   * Batch synchronization of fingerprints
   */
  async syncFingerprints(fingerprints: Fingerprint[]): Promise<boolean> {
    let changed = false;
    for (const fp of fingerprints) {
      if (await this.syncFingerprint(fp)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Register or update a device
   */
  async registerDevice(): Promise<string> {
    const existing = await this.load();
    if (!existing) {
      throw new IdentityError('身份不存在');
    }

    const deviceId = this.getCurrentDeviceId();
    const now = new Date().toISOString();

    if (existing.devices[deviceId]) {
      // Update last active time
      existing.devices[deviceId].last_seen = now;
    } else {
      // new equipment
      existing.devices[deviceId] = {
        id: deviceId,
        name: this.getDeviceName(),
        platform: process.platform,
        arch: process.arch,
        first_seen: now,
        last_seen: now,
      };
    }

    await this.save(existing);
    return deviceId;
  }

  /**
   * Get current device ID
   */
  private getCurrentDeviceId(): string {
    const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown';
    const platform = process.platform;
    // Use a stable device ID
    const content = `${platform}-${hostname}`;
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
    return `dev_${hash}`;
  }

  /**
   * Get device name
   */
  private getDeviceName(): string {
    const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || '未知设备';
    const platform = process.platform;
    const platformNames: Record<string, string> = {
      darwin: 'Mac',
      win32: 'Windows',
      linux: 'Linux',
    };
    return `${platformNames[platform] || platform} (${hostname})`;
  }

  /**
   * Generate identity ID
   */
  private generateIdentityId(): string {
    const random = crypto.randomBytes(16).toString('hex');
    return `id_${random.substring(0, 16)}`;
  }

  /**
   * Get current identity
   */
  async getIdentity(): Promise<IdentityConfig | null> {
    if (!this.config) {
      this.config = await this.load();
    }
    return this.config;
  }

  /**
   * Get identity ID
   */
  async getIdentityId(): Promise<string | null> {
    const identity = await this.getIdentity();
    return identity?.identity_id || null;
  }

  /**
   * Match identity (supports historical fingerprints)
   */
  matchIdentity(fingerprints: Fingerprint[]): MatchResult {
    if (!this.config) {
      return {
        matched: false,
        confidence: 0,
        matched_platforms: [],
        matched_via_historical: false,
      };
    }

    const matched_platforms: string[] = [];
    let matched_via_historical = false;
    let total_score = 0;
    let total_weight = 0;

    for (const fp of fingerprints) {
      const stored = this.config.fingerprints[fp.platform];
      if (!stored) {
        continue;
      }

      // Weight: high confidence > medium confidence > low confidence
      const weight = fp.confidence === 'high' ? 1 : fp.confidence === 'medium' ? 0.7 : 0.3;
      total_weight += weight;

      // Check current fingerprint
      if (stored.current === fp.value) {
        matched_platforms.push(fp.platform);
        total_score += weight;
        continue;
      }

      // Check historical fingerprints
      if (stored.historical.includes(fp.value)) {
        matched_platforms.push(fp.platform);
        total_score += weight * 0.8; // Historical matches are slightly less weighted
        matched_via_historical = true;
      }
    }

    const confidence = total_weight > 0 ? total_score / total_weight : 0;

    return {
      matched: matched_platforms.length > 0,
      confidence,
      matched_platforms,
      matched_via_historical,
    };
  }
}

/**
 * Initialize or load identities (completely unaware of the user)
 *
 * Automatic:
 * 1. Collect all available platform fingerprints
 * 2. Try to match an existing identity
 * 3. If the match is successful, the new fingerprint will be synchronized.
 * 4. If the match fails, create a new identity
 * 5. Automatically register the current device
 */
export async function initializeIdentity(configDir?: string): Promise<{
  identity: IdentityConfig;
  isNew: boolean;
  fingerprints: Fingerprint[];
}> {
  const manager = new IdentityManager(configDir);

  // 1. Silently collect all available fingerprints
  const fingerprints = await FingerprintCollector.collectAll();

  // 2. Try loading an existing identity
  const existing = await manager.getIdentity();

  if (!existing) {
    // 3. No existing identity, create a new identity
    const identity = await manager.create(fingerprints);
    await manager.registerDevice();

    return {
      identity,
      isNew: true,
      fingerprints,
    };
  }

  // 4. If there is an existing identity, try to match
  const matchResult = manager.matchIdentity(fingerprints);

  if (matchResult.matched && matchResult.confidence >= 0.3) {
    // 5. Matching is successful, all fingerprints are synchronized
    await manager.syncFingerprints(fingerprints);
    await manager.registerDevice();

    return {
      identity: existing,
      isNew: false,
      fingerprints,
    };
  }

  // 6. Matching failed (may be a new device or a new user)
  // Since the user cannot be asked (non-awareness principle), we handle it conservatively:
  // If there is any high-confidence fingerprint match, it is considered to be the same user
  const hasHighConfidenceMatch = matchResult.matched_platforms.some(p => {
    const fp = existing.fingerprints[p];
    return fp?.confidence === 'high';
  });

  if (hasHighConfidenceMatch) {
    await manager.syncFingerprints(fingerprints);
    await manager.registerDevice();

    return {
      identity: existing,
      isNew: false,
      fingerprints,
    };
  }

  // Unable to match at all, create a new identity
  // (This will happen when the same user uses the new platform for the first time, and can be related later through other fingerprints)
  const identity = await manager.create(fingerprints);
  await manager.registerDevice();

  return {
    identity,
    isNew: true,
    fingerprints,
  };
}

/**
 * Get identity ID (shortcut method)
 */
export async function getIdentityId(configDir?: string): Promise<string | null> {
  const manager = new IdentityManager(configDir);
  return manager.getIdentityId();
}

/**
 * Initialize local identity with specified identity_id (used to join new devices with existing identity)
 */
export async function initializeIdentityWithId(
  identityId: string,
  configDir?: string
): Promise<IdentityConfig> {
  const manager = new IdentityManager(configDir);
  const fingerprints = await FingerprintCollector.collectAll();
  const identity = await manager.createWithId(identityId, fingerprints);
  await manager.registerDevice();
  return identity;
}
