/**
 * 配置管理模块
 *
 * 统一管理 Corivo 的配置文件读取和验证
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';
import { getConfigDir } from './storage/database.js';

/**
 * Feature flags (opt-out model: missing key = true = enabled)
 */
export interface CorivoFeatures {
  /** 多设备同步 */
  sync?: boolean;
  /** 保存时自动推送 */
  autoPushOnSave?: boolean;
  /** 唤醒时同步 */
  syncOnWake?: boolean;
  /** 心跳引擎 */
  heartbeatEngine?: boolean;
  /** 登录时自动启动 */
  autoStartOnLogin?: boolean;
  /** 被动监听（Claude Code / Cursor 对话） */
  passiveListening?: boolean;
  /** 关联发现 */
  associationDiscovery?: boolean;
  /** 整合去重 */
  consolidation?: boolean;
  /** CJK 全文搜索降级 */
  cjkFtsFallback?: boolean;
  /** Claude Code 集成 */
  claudeCode?: boolean;
  /** Cursor 集成 */
  cursor?: boolean;
  /** 飞书集成 */
  feishu?: boolean;
  /** 数据库加密 */
  dbEncryption?: boolean;
  /** 遥测 */
  telemetry?: boolean;
}

/**
 * Corivo 数值型配置
 */
export interface CorivoSettings {
  /** 自动同步间隔（秒），默认 300（5 分钟） */
  syncIntervalSeconds?: number;
}

/**
 * Corivo 配置
 */
export interface CorivoConfig {
  /** 配置版本 */
  version: string;
  /** 创建时间 */
  created_at: string;
  /** 身份 ID */
  identity_id: string;
  /** 数据库密钥（base64 编码） */
  db_key: string;
  features?: CorivoFeatures;
  settings?: CorivoSettings;
}

/**
 * 加载配置文件
 *
 * @param configDir - 配置目录，默认为 ~/.corivo
 * @returns 配置对象，如果文件不存在或无效则返回 null
 */
export async function loadConfig(configDir?: string): Promise<CorivoConfig | null> {
  const dir = configDir || getConfigDir();
  const configPath = path.join(dir, 'config.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as CorivoConfig;

    // 验证必需字段
    if (!config.db_key || !config.identity_id) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * 保存配置文件
 *
 * @param config - 配置对象
 * @param configDir - 配置目录，默认为 ~/.corivo
 */
export async function saveConfig(
  config: CorivoConfig,
  configDir?: string
): Promise<{ success: boolean; error?: string }> {
  const dir = configDir || getConfigDir();

  try {
    await fs.mkdir(dir, { recursive: true });
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 获取数据库密钥
 *
 * @param configDir - 配置目录
 * @returns 数据库密钥（Buffer），如果配置无效则返回 null
 */
export async function getDatabaseKey(configDir?: string): Promise<Buffer | null> {
  const config = await loadConfig(configDir);
  if (!config) {
    return null;
  }

  try {
    return Buffer.from(config.db_key, 'base64');
  } catch {
    return null;
  }
}

/**
 * 检查 Corivo 是否已初始化
 *
 * @param configDir - 配置目录
 * @returns 是否已初始化
 */
export async function isInitialized(configDir?: string): Promise<boolean> {
  const config = await loadConfig(configDir);
  return config !== null;
}

/**
 * Solver 同步配置（存于 ~/.corivo/solver.json）
 */
export interface SolverConfig {
  server_url: string;
  shared_secret: string;
  site_id: string;
  last_push_version: number;
  last_pull_version: number;
}

/**
 * 加载 solver 配置
 */
export async function loadSolverConfig(configDir?: string): Promise<SolverConfig | null> {
  const dir = configDir || getConfigDir();
  const solverPath = path.join(dir, 'solver.json');
  try {
    const content = await fs.readFile(solverPath, 'utf-8');
    const config = JSON.parse(content) as SolverConfig;
    if (!config.server_url || !config.shared_secret || !config.site_id) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * 保存 solver 配置
 */
export async function saveSolverConfig(
  config: SolverConfig,
  configDir?: string
): Promise<void> {
  const dir = configDir || getConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const solverPath = path.join(dir, 'solver.json');
  await fs.writeFile(solverPath, JSON.stringify(config, null, 2));
}

export default {
  loadConfig,
  saveConfig,
  getDatabaseKey,
  isInitialized
};
