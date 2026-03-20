/**
 * 用户身份管理
 *
 * 管理用户的跨设备、跨平台身份
 *
 * 核心设计：
 * - 对用户完全透明，无感知自动识别
 * - 支持多平台（Claude Code, Cursor, Codex, 飞书, Slack 等）
 * - 支持历史指纹（token 变化后仍能识别）
 * - 支持多设备关联
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Fingerprint, PlatformType } from './fingerprint.js';
import {
  FingerprintCollector,
  FingerprintMatcher,
} from './fingerprint.js';
import { IdentityError } from '../errors/index.js';

/**
 * 平台类型（可扩展）
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
 * 单个平台的所有指纹（支持历史记录）
 */
export interface PlatformFingerprint {
  /** 当前主指纹 */
  current: string;
  /** 历史指纹（token 变化后旧指纹移入这里） */
  historical: string[];
  /** 首次添加时间 */
  added_at: string;
  /** 最后更新时间 */
  updated_at: string;
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 设备信息
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
 * 身份配置
 */
export interface IdentityConfig {
  /** 虚拟身份 ID（UUID，不暴露真实身份） */
  identity_id: string;
  /** 创建时间 */
  created_at: string;
  /** 最后更新时间 */
  updated_at: string;
  /** 显示名称（可选，仅供用户自己看） */
  display_name?: string;
  /** 所有平台指纹 */
  fingerprints: Record<string, PlatformFingerprint>;
  /** 设备列表 */
  devices: Record<string, DeviceInfo>;
}

/**
 * 匹配结果
 */
export interface MatchResult {
  /** 是否匹配 */
  matched: boolean;
  /** 置信度 (0-1) */
  confidence: number;
  /** 匹配的平台 */
  matched_platforms: string[];
  /** 是否通过历史指纹匹配 */
  matched_via_historical: boolean;
}

/**
 * 身份管理器
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
   * 加载身份配置
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
   * 保存身份配置
   */
  private async save(config: IdentityConfig): Promise<void> {
    config.updated_at = new Date().toISOString();
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    this.config = config;
  }

  /**
   * 创建新身份
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
   * 添加或更新平台指纹（支持历史记录）
   *
   * 如果指纹值变化，旧值自动移入 historical
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

      // 检查当前指纹是否变化
      if (fp.current !== fingerprint.value) {
        // 当前值不在历史记录中，先移入历史
        if (!fp.historical.includes(fp.current)) {
          fp.historical.push(fp.current);
        }

        // 检查新值是否在历史记录中（token 复用情况）
        const isInHistorical = fp.historical.includes(fingerprint.value);

        fp.current = fingerprint.value;
        fp.updated_at = now;
        changed = true;

        // 如果新值在历史中，说明是 token 轮换复用，清理历史
        if (isInHistorical) {
          fp.historical = fp.historical.filter(v => v !== fingerprint.value);
        }
      }
    } else {
      // 新平台
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
   * 批量同步指纹
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
   * 注册或更新设备
   */
  async registerDevice(): Promise<string> {
    const existing = await this.load();
    if (!existing) {
      throw new IdentityError('身份不存在');
    }

    const deviceId = this.getCurrentDeviceId();
    const now = new Date().toISOString();

    if (existing.devices[deviceId]) {
      // 更新最后活跃时间
      existing.devices[deviceId].last_seen = now;
    } else {
      // 新设备
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
   * 获取当前设备 ID
   */
  private getCurrentDeviceId(): string {
    const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown';
    const platform = process.platform;
    // 使用稳定的设备 ID
    const content = `${platform}-${hostname}`;
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
    return `dev_${hash}`;
  }

  /**
   * 获取设备名称
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
   * 生成身份 ID
   */
  private generateIdentityId(): string {
    const random = crypto.randomBytes(16).toString('hex');
    return `id_${random.substring(0, 16)}`;
  }

  /**
   * 获取当前身份
   */
  async getIdentity(): Promise<IdentityConfig | null> {
    if (!this.config) {
      this.config = await this.load();
    }
    return this.config;
  }

  /**
   * 获取身份 ID
   */
  async getIdentityId(): Promise<string | null> {
    const identity = await this.getIdentity();
    return identity?.identity_id || null;
  }

  /**
   * 匹配身份（支持历史指纹）
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

      // 权重：高置信度 > 中置信度 > 低置信度
      const weight = fp.confidence === 'high' ? 1 : fp.confidence === 'medium' ? 0.7 : 0.3;
      total_weight += weight;

      // 检查当前指纹
      if (stored.current === fp.value) {
        matched_platforms.push(fp.platform);
        total_score += weight;
        continue;
      }

      // 检查历史指纹
      if (stored.historical.includes(fp.value)) {
        matched_platforms.push(fp.platform);
        total_score += weight * 0.8; // 历史匹配略低权重
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
 * 初始化或加载身份（对用户完全无感知）
 *
 * 自动：
 * 1. 收集所有可用平台指纹
 * 2. 尝试匹配现有身份
 * 3. 匹配成功则同步新指纹
 * 4. 匹配失败则创建新身份
 * 5. 自动注册当前设备
 */
export async function initializeIdentity(configDir?: string): Promise<{
  identity: IdentityConfig;
  isNew: boolean;
  fingerprints: Fingerprint[];
}> {
  const manager = new IdentityManager(configDir);

  // 1. 静默收集所有可用指纹
  const fingerprints = await FingerprintCollector.collectAll();

  // 2. 尝试加载现有身份
  const existing = await manager.getIdentity();

  if (!existing) {
    // 3. 无现有身份，创建新身份
    const identity = await manager.create(fingerprints);
    await manager.registerDevice();

    return {
      identity,
      isNew: true,
      fingerprints,
    };
  }

  // 4. 有现有身份，尝试匹配
  const matchResult = manager.matchIdentity(fingerprints);

  if (matchResult.matched && matchResult.confidence >= 0.3) {
    // 5. 匹配成功，同步所有指纹
    await manager.syncFingerprints(fingerprints);
    await manager.registerDevice();

    return {
      identity: existing,
      isNew: false,
      fingerprints,
    };
  }

  // 6. 匹配失败（可能是全新设备或全新用户）
  // 由于无法询问用户（无感知原则），保守处理：
  // 如果有任意高置信度指纹匹配，认为是同一用户
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

  // 完全无法匹配，创建新身份
  // （这在同一用户首次在新平台使用时会发生，后续可通过其他指纹关联）
  const identity = await manager.create(fingerprints);
  await manager.registerDevice();

  return {
    identity,
    isNew: true,
    fingerprints,
  };
}

/**
 * 获取身份 ID（快捷方法）
 */
export async function getIdentityId(configDir?: string): Promise<string | null> {
  const manager = new IdentityManager(configDir);
  return manager.getIdentityId();
}
