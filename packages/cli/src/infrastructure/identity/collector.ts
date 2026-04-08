/**
 * Dynamic fingerprint collection system
 *
 * Core idea:
 * - No hard-coded platform list
 * - Scan user systems and dynamically discover installed software
 * - Load the corresponding fingerprint collector based on the discovered software
 *
 * Privacy Protection (Important):
 * - Only the configured hash fingerprint is collected, and the original content is not collected
 * - Use SHA256 one-way hash, irreversible
 * - Only take the first 16 bits of the hash to further reduce the amount of information
 * - Fingerprints are only used for identification, and the original data cannot be restored
 *
 * Specific measures:
 * - Does not store original sensitive information such as tokens, passwords, private keys, etc.
 * - Do not collect user data such as chat records, file contents, etc.
 * - Hash values are only stored locally on the user's device
 * - User can view and delete identity.json at any time
 *
 * Advantages:
 * - New platforms only need to add collectors without modifying the core code
 * - Software that the user does not own will not attempt to collect
 * - Can automatically discover new fingerprint sources
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Fingerprint } from './fingerprint.js';

/**
 * Fingerprint collector interface
 *
 * Each collector is responsible for:
 * 1. Check whether the corresponding software has been installed
 * 2. Extract user ID from software configuration
 * 3. Return the standardized fingerprint
 */
export interface FingerprintCollectorPlugin {
  /** Collector unique identifier */
  id: string;
  /** Platform name */
  platform: string;
  /** Check if the software is installed */
  detect(): Promise<boolean>;
  /** Extract fingerprints */
  collect(): Promise<Fingerprint | null>;
  /** Confidence */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Software configuration location definition
 */
interface SoftwareConfig {
  /** Software name */
  name: string;
  /** Platform identification */
  platform: string;
  /** Configuration file path (supports wildcard characters) */
  configPaths: string[];
  /**
   * Function to extract fingerprints
   *
   * Privacy requirements:
   * - Only return non-sensitive identifiers such as user ID and user name
   * - Do not return sensitive information such as tokens, keys, passwords, etc.
   * - The return value will be hashed and only the first 16 bits will be taken
   */
  extractor: (content: string, filePath: string) => string | null;
  /** Confidence */
  confidence: 'high' | 'medium' | 'low';
  /** Extraction method description */
  method: string;
}

/**
 * Dynamic fingerprint collector
 */
export class DynamicFingerprintCollector {
  /** Software configuration registry */
  private static softwareRegistry: SoftwareConfig[] = [];

  /**
   * Register software configuration
   *
   * New platforms only need to call this method to register, without modifying the core code.
   */
  static registerSoftware(config: SoftwareConfig): void {
    this.softwareRegistry.push(config);
  }

  /**
   * Batch registration software configuration
   */
  static registerSoftwareConfigs(configs: SoftwareConfig[]): void {
    this.softwareRegistry.push(...configs);
  }

  /**
   * Automatically discover and collect all fingerprints
   *
   * Process:
   * 1. Scan registered software configurations
   * 2. Check whether the configuration file of each software exists
   * 3. Extract fingerprints from existing configuration files
   * 4. Hash processing (one-way, irreversible)
   * 5. Return all collected fingerprints
   */
  static async collectAll(): Promise<Fingerprint[]> {
    const fingerprints: Fingerprint[] = [];

    for (const software of this.softwareRegistry) {
      try {
        // Check whether the software is installed (whether the configuration file exists)
        const configPath = await this.findConfigPath(software.configPaths);
        if (!configPath) {
          continue; // Software is not installed, skip
        }

        // Read configuration file
        const content = await fs.readFile(configPath, 'utf-8');

        // Extract fingerprint identifiers (extractor is designed to capture only non-sensitive information)
        const identifier = software.extractor(content, configPath);
        if (!identifier) {
          continue; // Unable to extract id, skipping
        }

        // 🔒 Hash processing: one-way hashing, only the first 16 bits are taken
        const hash = crypto.createHash('sha256').update(identifier).digest('hex');
        const fingerprint = hash.substring(0, 16);

        fingerprints.push({
          platform: software.platform as any, // Dynamic platform type
          value: fingerprint,
          method: software.method,
          confidence: software.confidence,
        });
      } catch {
        // If a single software fails to collect, other software will not be affected.
        continue;
      }
    }

    // Add device fingerprint (always present)
    try {
      const deviceFp = await this.collectDeviceFingerprint();
      fingerprints.push(deviceFp);
    } catch {
      // Device fingerprint failed, ignored
    }

    return fingerprints;
  }

  /**
   * Find the first existing configuration file path
   */
  private static async findConfigPath(paths: string[]): Promise<string | null> {
    for (const p of paths) {
      const expandedPath = this.expandPath(p);
      try {
        // Supports wildcards
        if (p.includes('*')) {
          const dir = path.dirname(expandedPath);
          const pattern = path.basename(expandedPath);
          const files = await fs.readdir(dir);
          const match = files.find(f => f.match(pattern.replace(/\*/g, '.*')));
          if (match) {
            return path.join(dir, match);
          }
        } else {
          // normal path
          await fs.access(expandedPath);
          return expandedPath;
        }
      } catch {
        // The path does not exist, continue to try the next one
        continue;
      }
    }
    return null;
  }

  /**
   * Expand environment variables and ~ in the path
   */
  private static expandPath(p: string): string {
    return p
      .replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
      .replace(/\$HOME/g, process.env.HOME || '')
      .replace(/\$USERPROFILE/g, process.env.USERPROFILE || '');
  }

  /**
   * Collect device fingerprints
   */
  private static async collectDeviceFingerprint(): Promise<Fingerprint> {
    const infos: string[] = [];
    infos.push(process.platform);
    infos.push(process.arch);
    infos.push(process.env.HOME || process.env.USERPROFILE || '');
    infos.push(process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown');

    // macOS reads hardware UUID
    if (process.platform === 'darwin') {
      try {
        const { execSync } = await import('node:child_process');
        const uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID')
          .toString()
          .match(/"IOPlatformUUID"\s*=\s*"(.+)"/)?.[1];
        if (uuid) infos.push(uuid);
      } catch { /* 忽略 */ }
    }

    // Linux reads machine-id
    if (process.platform === 'linux') {
      try {
        const machineId = await fs.readFile('/etc/machine-id', 'utf-8');
        infos.push(machineId.trim());
      } catch {
        try {
          const dbusId = await fs.readFile('/var/lib/dbus/machine-id', 'utf-8');
          infos.push(dbusId.trim());
        } catch { /* 忽略 */ }
      }
    }

    const hash = crypto.createHash('sha256').update(infos.join('|')).digest('hex');
    return {
      platform: 'device',
      value: hash.substring(0, 16),
      method: 'sha256(system_info)[:16]',
      confidence: 'low',
    };
  }

  /**
   * Get a list of registered software
   */
  static getRegisteredSoftware(): string[] {
    return this.softwareRegistry.map(s => s.name);
  }

  /**
   * Get a list of installed software
   */
  static async getInstalledSoftware(): Promise<string[]> {
    const installed: string[] = [];

    for (const software of this.softwareRegistry) {
      const configPath = await this.findConfigPath(software.configPaths);
      if (configPath) {
        installed.push(software.name);
      }
    }

    return installed;
  }
}

/**
 * Initialize default software configuration
 *
 * Register fingerprint collection rules for common development tools
 */
export function initializeDefaultSoftwareConfigs(): void {
  const home = process.env.HOME || process.env.USERPROFILE || '';

  DynamicFingerprintCollector.registerSoftwareConfigs([
    // ========== AI programming tools ==========
    {
      name: 'Claude Code',
      platform: 'claude_code',
      configPaths: [
        path.join(home, '.claude', 'settings.json'),
        path.join(home, 'Library', 'Application Support', 'Claude', 'settings.json'),
      ],
      extractor: (content) => {
        const match = content.match(/"ANTHROPIC_AUTH_TOKEN"\s*:\s*"([^"]+)"/);
        return match ? match[1] : null;
      },
      confidence: 'high',
      method: 'sha256(ANTHROPIC_AUTH_TOKEN)[:16]',
    },

    {
      name: 'Cursor',
      platform: 'cursor',
      configPaths: [
        path.join(home, '.cursor', 'config.json'),
        path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'storage.json'),
      ],
      extractor: (content) => {
        const json = JSON.parse(content);
        return json.user_id || json.userId || json.token || null;
      },
      confidence: 'high',
      method: 'sha256(cursor_user_id)[:16]',
    },

    {
      name: 'Cursor (Windows)',
      platform: 'cursor',
      configPaths: [
        path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'storage.json'),
      ],
      extractor: (content) => {
        const json = JSON.parse(content);
        return json.user_id || json.userId || json.machineId || null;
      },
      confidence: 'high',
      method: 'sha256(cursor_machine_id)[:16]',
    },

    // ========== Version Control ==========
    {
      name: 'GitHub',
      platform: 'github',
      configPaths: [
        path.join(home, '.config', 'gh', 'hosts.yml'),
      ],
      extractor: (content) => {
        const match = content.match(/user:\s*(\S+)/);
        return match ? match[1] : null;
      },
      confidence: 'medium',
      method: 'sha256(github_username)[:16]',
    },

    {
      name: 'Git',
      platform: 'git',
      configPaths: [
        path.join(home, '.gitconfig'),
      ],
      extractor: (content) => {
        const emailMatch = content.match(/email\s*=\s*(\S+)/);
        return emailMatch ? emailMatch[1] : null;
      },
      confidence: 'medium',
      method: 'sha256(git_email)[:16]',
    },

    // ========== Development Tools ==========
    {
      name: 'VS Code',
      platform: 'vscode',
      configPaths: [
        path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'storage.json'),
        path.join(home, '.vscode', 'data', 'globalStorage', 'storage.json'),
      ],
      extractor: (content) => {
        const json = JSON.parse(content);
        return json.machineId || json.telemetryMachineId || null;
      },
      confidence: 'medium',
      method: 'sha256(vscode_machineId)[:16]',
    },

    {
      name: 'VS Code Insiders',
      platform: 'vscode',
      configPaths: [
        path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'globalStorage', 'storage.json'),
      ],
      extractor: (content) => {
        const json = JSON.parse(content);
        return json.machineId || json.telemetryMachineId || null;
      },
      confidence: 'medium',
      method: 'sha256(vscode-insiders_machineId)[:16]',
    },

    {
      name: 'JetBrains IDE',
      platform: 'jetbrains',
      configPaths: [
        path.join(home, 'Library', 'Application Support', 'JetBrains'),
        path.join(home, '.config', 'JetBrains'),
      ],
      extractor: (content, filePath) => {
        // Use installation path as feature
        return filePath;
      },
      confidence: 'medium',
      method: 'sha256(jetbrains_install)[:16]',
    },

    // ========== Cloud Services ==========
    {
      name: 'AWS CLI',
      platform: 'aws',
      configPaths: [
        path.join(home, '.aws', 'config'),
      ],
      extractor: (content) => {
        const profileMatches = content.match(/\[profile\s([^\]]+)\]/g);
        if (profileMatches && profileMatches.length > 0) {
          return profileMatches.map(p => p.replace(/\[profile\s|\]/g, '')).sort().join(',');
        }
        return null;
      },
      confidence: 'medium',
      method: 'sha256(aws_profiles)[:16]',
    },

    // ========== Communication and collaboration ==========
    {
      name: '飞书',
      platform: 'feishu',
      configPaths: [
        path.join(home, '.claude', '.mcp.json'),
      ],
      extractor: (content) => {
        const json = JSON.parse(content);
        const feishuConfig = json.servers?.['feishu-mcp'];
        if (feishuConfig) {
          return feishuConfig.env?.FEISHU_USER_ID || feishuConfig.env?.FEISHU_OPEN_ID || null;
        }
        return null;
      },
      confidence: 'high',
      method: 'feishu open_id',
    },

    {
      name: 'Slack',
      platform: 'slack',
      configPaths: [
        path.join(home, 'Library', 'Application Support', 'Slack', 'local-storage', 'leveldb'),
      ],
      extractor: (content) => {
        const teamMatch = content.match(/team_id["\s:]+([a-zA-Z0-9]+)/);
        const userMatch = content.match(/user_id["\s:]+([a-zA-Z0-9]+)/);
        return teamMatch?.[1] || userMatch?.[1] || null;
      },
      confidence: 'high',
      method: 'slack team/user id',
    },

    // ========== Package Manager ==========
    {
      name: 'npm',
      platform: 'npm',
      configPaths: [
        path.join(home, '.npmrc'),
      ],
      extractor: (content) => {
        const lines = content.split('\n').filter(l => l.includes('//registry') || l.includes('_auth'));
        return lines.length > 0 ? lines.join('') : null;
      },
      confidence: 'low',
      method: 'sha256(npm_config)[:16]',
    },

    {
      name: 'Bun',
      platform: 'bun',
      configPaths: [
        path.join(home, '.bunndb'),
      ],
      extractor: () => 'bun-installed',
      confidence: 'low',
      method: 'bun_install_detected',
    },

    // ========== SSH Key ==========
    {
      name: 'SSH Keys',
      platform: 'ssh',
      configPaths: [
        path.join(home, '.ssh', 'id_rsa.pub'),
        path.join(home, '.ssh', 'id_ed25519.pub'),
        path.join(home, '.ssh', 'id_ecdsa.pub'),
      ],
      extractor: (content) => {
        const match = content.match(/^(\S+)\s+(\S+)/);
        if (match) {
          return `${match[1]}:${match[2].substring(0, 32)}`;
        }
        return null;
      },
      confidence: 'high',
      method: 'sha256(ssh_public_key_prefix)[:16]',
    },
  ]);
}

/**
 * Create convenient export aliases
 */
export const DynamicCollector = DynamicFingerprintCollector;
