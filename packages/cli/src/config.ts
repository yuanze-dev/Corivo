/**
 * Configuration management module
 *
 * Centralized loading and validation for Corivo configuration files
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from './storage/database.js';

/**
 * Feature flags (opt-out model: missing key = true = enabled)
 */
export interface CorivoFeatures {
  /** Multi-device sync */
  sync?: boolean;
  /** Automatically push when saving */
  autoPushOnSave?: boolean;
  /** Sync on wake up */
  syncOnWake?: boolean;
  /** Heartbeat engine */
  heartbeatEngine?: boolean;
  /** Automatically start on login */
  autoStartOnLogin?: boolean;
  /** Passive listening (Claude Code / Cursor dialogue) */
  passiveListening?: boolean;
  /** Association discovery */
  associationDiscovery?: boolean;
  /** Consolidation and deduplication */
  consolidation?: boolean;
  /** CJK full-text-search fallback */
  cjkFtsFallback?: boolean;
  /** Claude Code integration */
  claudeCode?: boolean;
  /** Cursor integration */
  cursor?: boolean;
  /** Feishu integration */
  feishu?: boolean;
  /** Database encryption */
  dbEncryption?: boolean;
  /** Telemetry */
  telemetry?: boolean;
}

/**
 * Corivo numerical configuration
 */
export interface CorivoSettings {
  /** Auto-sync interval (seconds), default 300 (5 minutes) */
  syncIntervalSeconds?: number;
  /** Log level */
  logLevel?: 'error' | 'info' | 'debug';
}

/**
 * Corivo configuration
 */
export interface CorivoConfig {
  /** Configuration version */
  version: string;
  /** Creation time */
  created_at: string;
  /** Identity ID */
  identity_id: string;
  features?: CorivoFeatures;
  settings?: CorivoSettings;
  /** Enabled plugin package names (installed globally via `npm install -g <pkg>`) */
  plugins?: string[];
}

/**
 * Load configuration file
 *
 * @param configDir - Configuration directory, defaults to `~/.corivo`
 * @returns Configuration object, or `null` if the file is missing or invalid
 */
export async function loadConfig(configDir?: string): Promise<CorivoConfig | null> {
  const dir = configDir || getConfigDir();
  const configPath = path.join(dir, 'config.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as CorivoConfig;

    // Validate required fields
    if (!config.identity_id) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save configuration file
 *
 * @param config - Configuration object
 * @param configDir - Configuration directory, defaults to `~/.corivo`
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
 * Check if Corivo has been initialized
 *
 * @param configDir - configuration directory
 * @returns whether it has been initialized
 */
export async function isInitialized(configDir?: string): Promise<boolean> {
  const config = await loadConfig(configDir);
  return config !== null;
}

/**
 * Solver synchronization configuration (stored in ~/.corivo/solver.json)
 */
export interface SolverConfig {
  server_url: string;
  shared_secret: string;
  site_id: string;
  last_push_version: number;
  last_pull_version: number;
}

/**
 * Load solver configuration
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
 * Save solver configuration
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
  isInitialized
};
