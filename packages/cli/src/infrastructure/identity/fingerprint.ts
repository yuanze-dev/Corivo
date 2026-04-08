/**
 * Platform fingerprint generation
 *
 * Extract unique identifiers from each platform to generate irreversible user fingerprints
 * Used to identify the same user across devices
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FingerprintError } from '@/domain/errors/index.js';

/**
 * Supported platform type
 *
 * Design principle: the same user tends to use a similar toolchain across devices.
 * Cross-check those tool fingerprints to recognize the same person.
 */
export type PlatformType =
  // AI programming tools
  | 'claude_code'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'windsurf'
  | 'copilot'
  // development tools
  | 'vscode'
  | 'jetbrains'
  | 'neovim'
  // version control
  | 'github'
  | 'gitlab'
  | 'git'
  // Package management
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  // Containers/Virtualization
  | 'docker'
  | 'podman'
  // Communication/Collaboration
  | 'feishu'
  | 'slack'
  | 'wechat'
  | 'dingtalk'
  | 'notion'
  // cloud services
  | 'aws'
  | 'aliyun'
  | 'gcp'
  // Others
  | 'device'
  | 'email'
  | 'custom';

/**
 * Claude Code configuration
 */
interface ClaudeCodeConfig {
  env?: {
    ANTHROPIC_AUTH_TOKEN?: string;
  };
}

/**
 * Feishu configuration
 */
interface FeishuConfig {
  [key: string]: unknown;
}

/**
 * Fingerprint results
 */
export interface Fingerprint {
  platform: PlatformType;
  value: string;
  method: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Fingerprint collector
 */
export class FingerprintCollector {

  /**
   * Collect all available platform fingerprints
   *
   * Runs passively without interrupting the user while collecting every available fingerprint
   *
   * Design principle: the same user tends to use a similar toolchain across devices.
   * Cross-check those tool fingerprints to recognize the same person.
   */
  static async collectAll(options?: {
    claudeSettingsPath?: string;
    feishuConfigPath?: string;
  }): Promise<Fingerprint[]> {
    const fingerprints: Fingerprint[] = [];

    // Helper: add a fingerprint without letting one failure abort the full collection pass
    const addIfPresent = async (promise: Promise<Fingerprint | null>) => {
      try {
        const fp = await promise;
        if (fp) fingerprints.push(fp);
      } catch {
        // Silently fails
      }
    };

    // ========== High-confidence platform fingerprints ==========
    // These platforms usually expose stable, user-specific identifiers

    await addIfPresent(this.getClaudeCodeFingerprint(options?.claudeSettingsPath));
    await addIfPresent(this.getCursorFingerprint());
    await addIfPresent(this.getFeishuFingerprint(options?.feishuConfigPath));
    await addIfPresent(this.getSlackFingerprint());
    await addIfPresent(this.getGitHubFingerprint());
    await addIfPresent(this.getSSHFingerprint());

    // ========== Medium-confidence platform fingerprints ==========

    await addIfPresent(this.getVSCodeFingerprint());
    await addIfPresent(this.getJetBrainsFingerprint());
    await addIfPresent(this.getAWSFingerprint());
    await addIfPresent(this.getCodexFingerprint());
    await addIfPresent(this.getOpenCodeFingerprint());

    // ========== Low-confidence fingerprints (used as supporting evidence) ==========

    await addIfPresent(this.getNpmFingerprint());
    await addIfPresent(this.getDockerFingerprint());

    // Device fingerprint is always available and acts as the fallback signal
    try {
      fingerprints.push(await this.getDeviceFingerprint());
    } catch {
        // Ignore individual collection failures
    }

    return fingerprints;
  }

  /**
   * Extract fingerprints from Claude Code
   *
   * Read ANTHROPIC_AUTH_TOKEN and calculate the first 16 bits of SHA256
   *
   * @param settingsPath - Claude Code settings.json path
   * @returns fingerprint or null
   */
  static async getClaudeCodeFingerprint(
    settingsPath?: string
  ): Promise<Fingerprint | null> {
    // Default path
    const defaultPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.claude',
      'settings.json'
    );
    const targetPath = settingsPath || defaultPath;

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const config = JSON.parse(content) as ClaudeCodeConfig;

      const token = config.env?.ANTHROPIC_AUTH_TOKEN;
      if (!token) {
        return null;
      }

      // Use the first 16 hex characters of the SHA256 hash as the fingerprint
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const fingerprint = hash.substring(0, 16);

      return {
        platform: 'claude_code',
        value: fingerprint,
        method: 'sha256(ANTHROPIC_AUTH_TOKEN)[:16]',
        confidence: 'high',
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract fingerprints from Feishu MCP
   *
   * @param configPath - Feishu MCP configuration path
   * @returns fingerprint or null
   */
  static async getFeishuFingerprint(
    configPath?: string
  ): Promise<Fingerprint | null> {
    // Try to read from MCP configuration
    const defaultPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.claude',
      '.mcp.json'
    );

    try {
      const content = await fs.readFile(configPath || defaultPath, 'utf-8');
      const config = JSON.parse(content);

      // Find feishu-mcp configuration
      const feishuConfig = config.servers?.['feishu-mcp'] as
        | { env?: { FEISHU_USER_ID?: string; FEISHU_OPEN_ID?: string } }
        | undefined;

      const userId = feishuConfig?.env?.FEISHU_USER_ID || feishuConfig?.env?.FEISHU_OPEN_ID;

      if (!userId) {
        return null;
      }

      // Directly use open_id as fingerprint (Feishu guarantees uniqueness)
      return {
        platform: 'feishu',
        value: userId,
        method: 'feishu open_id',
        confidence: 'high',
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract fingerprints from Cursor
   *
   * Cursor configuration is usually in ~/.cursor/config.json
   */
  static async getCursorFingerprint(): Promise<Fingerprint | null> {
    const configPaths = [
      path.join(process.env.HOME || '', '.cursor', 'config.json'),
      path.join(process.env.HOME || '', '.config', 'Cursor', 'config.json'),
    ];

    for (const configPath of configPaths) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);

        // Try multiple possible user ID fields
        const userId =
          config.user_id ||
          config.userId ||
          config.account_id ||
          config.accountId ||
          config.token;

        if (userId) {
          const hash = crypto.createHash('sha256').update(String(userId)).digest('hex');
          return {
            platform: 'cursor',
            value: hash.substring(0, 16),
            method: 'sha256(cursor_user_id)[:16]',
            confidence: 'high',
          };
        }
      } catch {
        // Keep trying the next path
      }
    }

    return null;
  }

  /**
   * Extract fingerprints from Codex
   */
  static async getCodexFingerprint(): Promise<Fingerprint | null> {
    const configPaths = [
      path.join(process.env.HOME || '', '.codex', 'config.toml'),
      path.join(process.env.HOME || '', '.codex', 'config.json'),
      path.join(process.env.HOME || '', '.config', 'Codex', 'config.json'),
    ];

    for (const configPath of configPaths) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = configPath.endsWith('.toml')
          ? parseTomlLike(content)
          : JSON.parse(content);

        const userId = config.user_id || config.userId || config.token;
        if (userId) {
          const hash = crypto.createHash('sha256').update(String(userId)).digest('hex');
          return {
            platform: 'codex',
            value: hash.substring(0, 16),
            method: 'sha256(codex_user_id)[:16]',
            confidence: 'medium',
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Extract fingerprints from OpenCode
   */
  static async getOpenCodeFingerprint(): Promise<Fingerprint | null> {
    const configPaths = [
      path.join(process.env.HOME || '', '.config', 'opencode', 'opencode.json'),
      path.join(process.env.HOME || '', '.opencode', 'config.json'),
      path.join(process.env.HOME || '', '.config', 'OpenCode', 'config.json'),
    ];

    for (const configPath of configPaths) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);

        const userId = config.user_id || config.userId || config.token;
        if (userId) {
          const hash = crypto.createHash('sha256').update(String(userId)).digest('hex');
          return {
            platform: 'opencode',
            value: hash.substring(0, 16),
            method: 'sha256(opencode_user_id)[:16]',
            confidence: 'medium',
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Fingerprinting from Slack
   *
   * Slack configuration may be in multiple locations
   */
  static async getSlackFingerprint(): Promise<Fingerprint | null> {
    // Slack is usually found in ~/Library/Application Support/Slack (macOS)
    const slackPaths = [
      path.join(process.env.HOME || '', 'Library', 'Application Support', 'Slack'),
      path.join(process.env.HOME || '', '.config', 'Slack'),
    ];

    for (const slackPath of slackPaths) {
      try {
        // Read team info or local storage
        const teamFile = path.join(slackPath, 'local-storage', 'leveldb');
        const stats = await fs.readFile(teamFile, 'utf-8');

        // Try to extract team ID or user ID
        const teamMatch = stats.match(/team_id["\s:]+([a-zA-Z0-9]+)/);
        const userMatch = stats.match(/user_id["\s:]+([a-zA-Z0-9]+)/);

        const identifier = teamMatch?.[1] || userMatch?.[1];
        if (identifier) {
          return {
            platform: 'slack',
            value: identifier,
            method: 'slack team/user id',
            confidence: 'high',
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Extract fingerprints from GitHub
   *
   * Read the GitHub CLI or Git configuration
   */
  static async getGitHubFingerprint(): Promise<Fingerprint | null> {
    // Try the GitHub CLI configuration
    try {
      const ghConfigPath = path.join(process.env.HOME || '', '.config', 'gh', 'hosts.yml');
      const content = await fs.readFile(ghConfigPath, 'utf-8');

      // Extract username (do not extract token)
      const userMatch = content.match(/user:\s*(\S+)/);
      if (userMatch) {
        const hash = crypto.createHash('sha256').update(userMatch[1]).digest('hex');
        return {
          platform: 'github',
          value: hash.substring(0, 16),
          method: 'sha256(github_username)[:16]',
          confidence: 'medium',
        };
      }
    } catch {
      // Continue trying Git configuration
    }

    // Try Git configuration
    try {
      const { execSync } = await import('node:child_process');
      const gitEmail = execSync('git config --global user.email 2>/dev/null || echo')
        .toString().trim();

      if (gitEmail && gitEmail !== '') {
        const hash = crypto.createHash('sha256').update(gitEmail).digest('hex');
        return {
          platform: 'github',
          value: hash.substring(0, 16),
          method: 'sha256(git_email)[:16]',
          confidence: 'medium',
        };
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Extract fingerprints from VS Code
   *
   * Read VS Code user settings or machine ID
   */
  static async getVSCodeFingerprint(): Promise<Fingerprint | null> {
    const vscodePaths = [
      path.join(process.env.HOME || '', 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'storage.json'),
      path.join(process.env.HOME || '', '.vscode', 'data', 'globalStorage', 'storage.json'),
    ];

    for (const vsPath of vscodePaths) {
      try {
        const content = await fs.readFile(vsPath, 'utf-8');
        const data = JSON.parse(content);

        // Extract machine ID (without user data)
        const machineId = data.machineId || data.telemetryMachineId;
        if (machineId) {
          const hash = crypto.createHash('sha256').update(machineId).digest('hex');
          return {
            platform: 'vscode',
            value: hash.substring(0, 16),
            method: 'sha256(vscode_machineId)[:16]',
            confidence: 'medium',
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Extract fingerprints from npm
   *
   * Read npm configuration to get unique identifier
   */
  static async getNpmFingerprint(): Promise<Fingerprint | null> {
    try {
      const { execSync } = await import('node:child_process');
      const npmUser = execSync('npm config get userconfig 2>/dev/null || echo')
        .toString().trim();

      // Read npm configuration file
      const npmrcPath = path.join(process.env.HOME || '', '.npmrc');
      try {
        const content = await fs.readFile(npmrcPath, 'utf-8');

        // Extract a unique identifier (such as npm username or registry url)
        const lines = content.split('\n').filter(l => l.includes('//registry.npmjs.org/') || l.includes('_auth'));

        if (lines.length > 0) {
          const hash = crypto.createHash('sha256').update(lines.join('')).digest('hex');
          return {
            platform: 'npm',
            value: hash.substring(0, 16),
            method: 'sha256(npm_config)[:16]',
            confidence: 'low',
          };
        }
      } catch {
        // Continue trying to get from the cache directory
      }

      // Get features from npm cache directory
      const npmCache = execSync('npm config get cache 2>/dev/null || echo').toString().trim();
      if (npmCache && npmCache !== '' && npmCache !== 'null' && npmCache !== 'undefined') {
        const hash = crypto.createHash('sha256').update(npmCache).digest('hex');
        return {
          platform: 'npm',
          value: hash.substring(0, 16),
          method: 'sha256(npm_cache_path)[:16]',
          confidence: 'low',
        };
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Extract fingerprints from Docker
   */
  static async getDockerFingerprint(): Promise<Fingerprint | null> {
    try {
      const { execSync } = await import('node:child_process');

      // Get Docker user ID
      const userId = execSync('docker info 2>/dev/null | grep -i "ID:" | head -1 || echo')
        .toString().trim();

      if (userId && userId !== '') {
        const hash = crypto.createHash('sha256').update(userId).digest('hex');
        return {
          platform: 'docker',
          value: hash.substring(0, 16),
          method: 'sha256(docker_user_id)[:16]',
          confidence: 'low',
        };
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Extract fingerprints from SSH keys
   *
   * SSH keys are strong identities across devices
   */
  static async getSSHFingerprint(): Promise<Fingerprint | null> {
    const sshDir = path.join(process.env.HOME || '', '.ssh');
    const keyFiles = ['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub'];

    for (const keyFile of keyFiles) {
      try {
        const keyPath = path.join(sshDir, keyFile);
        const content = await fs.readFile(keyPath, 'utf-8');

        // SSH public key format: "ssh-rsa AAAA... comment"
        const keyMatch = content.match(/^(\S+)\s+(\S+)/);
        if (keyMatch) {
          const keyType = keyMatch[1];
          const publicKey = keyMatch[2];

          // Only use the first 32 characters as the fingerprint (not the full key to protect privacy)
          const hash = crypto.createHash('sha256').update(`${keyType}:${publicKey.substring(0, 32)}`).digest('hex');
          return {
            platform: 'custom',
            value: hash.substring(0, 16),
            method: 'sha256(ssh_public_key_prefix)[:16]',
            confidence: 'high', // SSH keys are strong identities
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Extract fingerprints from the AWS CLI
   */
  static async getAWSFingerprint(): Promise<Fingerprint | null> {
    const awsConfigPath = path.join(process.env.HOME || '', '.aws', 'config');

    try {
      const content = await fs.readFile(awsConfigPath, 'utf-8');

      // Extract profile name (without credentials)
      const profileMatches = content.match(/\[profile\s([^\]]+)\]/g);
      if (profileMatches && profileMatches.length > 0) {
        const profiles = profileMatches.map(p => p.replace(/\[profile\s|\]/g, '')).sort();
        const hash = crypto.createHash('sha256').update(profiles.join(',')).digest('hex');
        return {
          platform: 'aws',
          value: hash.substring(0, 16),
          method: 'sha256(aws_profiles)[:16]',
          confidence: 'medium',
        };
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Extract fingerprints from JetBrains IDE
   *
   * Support IntelliJ, PyCharm, WebStorm, etc.
   */
  static async getJetBrainsFingerprint(): Promise<Fingerprint | null> {
    const jbPaths = [
      path.join(process.env.HOME || '', 'Library', 'Application Support', 'JetBrains'),
      path.join(process.env.HOME || '', '.config', 'JetBrains'),
    ];

    for (const jbPath of jbPaths) {
      try {
        const files = await fs.readdir(jbPath, { withFileTypes: true });
        const optionsDir = files.find(f => f.name.includes('options') && f.isDirectory());

        if (optionsDir) {
          const optionsPath = path.join(jbPath, optionsDir.name);
          // Read the IDs of all products
          const hash = crypto.createHash('sha256').update(optionsPath).digest('hex');
          return {
            platform: 'jetbrains',
            value: hash.substring(0, 16),
            method: 'sha256(jetbrains_install)[:16]',
            confidence: 'medium',
          };
        }
      } catch {
        // keep trying
      }
    }

    return null;
  }

  /**
   * Generate device fingerprint
   *
   * Generated based on system information as a backup fingerprint
   *
   * @returns device fingerprint
   */
  static async getDeviceFingerprint(): Promise<Fingerprint> {
    // Gather system information
    const infos: string[] = [];

    // operating system
    infos.push(process.platform);
    infos.push(process.arch);

    // User directory
    infos.push(process.env.HOME || process.env.USERPROFILE || '');

    // hostname
    infos.push(process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown');

    // Machine ID (Linux) or serial number (macOS)
    try {
      if (process.platform === 'darwin') {
        // macOS: Reading hardware UUID
        const { execSync } = await import('node:child_process');
        const uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID')
          .toString()
          .match(/"IOPlatformUUID"\s*=\s*"(.+)"/)?.[1];
        if (uuid) {
          infos.push(uuid);
        }
      } else if (process.platform === 'linux') {
        // Linux: read machine-id
        try {
          const machineId = await fs.readFile('/etc/machine-id', 'utf-8');
          infos.push(machineId.trim());
        } catch {
          // Some distributions use /var/lib/dbus/machine-id
          try {
            const dbusId = await fs.readFile('/var/lib/dbus/machine-id', 'utf-8');
            infos.push(dbusId.trim());
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore errors
    }

    // Calculate hash
    const hash = crypto.createHash('sha256').update(infos.join('|')).digest('hex');
    const fingerprint = hash.substring(0, 16);

    return {
      platform: 'device',
      value: fingerprint,
      method: 'sha256(system_info)[:16]',
      confidence: 'low', // Device fingerprint confidence is low because users of the same device may change
    };
  }

  /**
   * Generate custom fingerprint from string
   *
   * @param value - original value
   * @returns fingerprint
   */
  static generateCustomFingerprint(value: string): Fingerprint {
    const hash = crypto.createHash('sha256').update(value).digest('hex');
    return {
      platform: 'custom',
      value: hash.substring(0, 16),
      method: 'sha256(custom)[:16]',
      confidence: 'medium',
    };
  }
}

function parseTomlLike(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*\"?(.+?)\"?$/);
    if (!match) {
      continue;
    }

    result[match[1]] = match[2].replace(/^\"|\"$/g, '');
  }

  return result;
}

/**
 * fingerprint matcher
 *
 * Used to determine whether two sets of fingerprints belong to the same user
 */
export class FingerprintMatcher {

  /**
   * Check whether the two sets of fingerprints match
   *
   * @param fingerprints1 - the first set of fingerprints
   * @param fingerprints2 - second set of fingerprints
   * Does @returns match
   */
  static match(
    fingerprints1: Fingerprint[],
    fingerprints2: Fingerprint[]
  ): boolean {
    // Extract high-confidence fingerprints
    const highConfidence1 = this.getHighConfidenceFingerprints(fingerprints1);
    const highConfidence2 = this.getHighConfidenceFingerprints(fingerprints2);

    // Check if there are any high confidence fingerprint matches
    for (const fp1 of highConfidence1) {
      for (const fp2 of highConfidence2) {
        if (fp1.platform === fp2.platform && fp1.value === fp2.value) {
          return true;
        }
      }
    }

    // If there is no high confidence match, check for medium confidence
    const mediumConfidence1 = this.getMediumConfidenceFingerprints(fingerprints1);
    const mediumConfidence2 = this.getMediumConfidenceFingerprints(fingerprints2);

    for (const fp1 of mediumConfidence1) {
      for (const fp2 of mediumConfidence2) {
        if (fp1.platform === fp2.platform && fp1.value === fp2.value) {
          return true; // Medium confidence match, probably the same user
        }
      }
    }

    return false;
  }

  /**
   * Calculate match confidence
   *
   * @param fingerprints1 - the first set of fingerprints
   * @param fingerprints2 - second set of fingerprints
   * @returns Confidence (0-1)
   */
  static matchConfidence(
    fingerprints1: Fingerprint[],
    fingerprints2: Fingerprint[]
  ): number {
    let score = 0;
    let maxScore = 0;

    // High confidence match weighting
    const high1 = this.getHighConfidenceFingerprints(fingerprints1);
    const high2 = this.getHighConfidenceFingerprints(fingerprints2);

    for (const fp1 of high1) {
      for (const fp2 of high2) {
        if (fp1.platform === fp2.platform) {
          maxScore += 1;
          if (fp1.value === fp2.value) {
            score += 1;
          }
        }
      }
    }

    // medium confidence match weight
    const medium1 = this.getMediumConfidenceFingerprints(fingerprints1);
    const medium2 = this.getMediumConfidenceFingerprints(fingerprints2);

    for (const fp1 of medium1) {
      for (const fp2 of medium2) {
        if (fp1.platform === fp2.platform) {
          maxScore += 0.5;
          if (fp1.value === fp2.value) {
            score += 0.5;
          }
        }
      }
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Obtain high-confidence fingerprints
   */
  private static getHighConfidenceFingerprints(
    fingerprints: Fingerprint[]
  ): Fingerprint[] {
    return fingerprints.filter(fp => fp.confidence === 'high');
  }

  /**
   * Get medium confidence fingerprints
   */
  private static getMediumConfidenceFingerprints(
    fingerprints: Fingerprint[]
  ): Fingerprint[] {
    return fingerprints.filter(fp => fp.confidence === 'medium');
  }
}

/**
 * Fingerprint serialization
 */
export function serializeFingerprints(fingerprints: Fingerprint[]): string {
  return JSON.stringify(
    fingerprints.map(fp => ({
      p: fp.platform,
      v: fp.value,
      m: fp.method,
      c: fp.confidence,
    }))
  );
}

/**
 * Fingerprint deserialization
 */
export function deserializeFingerprints(data: string): Fingerprint[] {
  try {
    const parsed = JSON.parse(data);
    return parsed.map((item: { p: string; v: string; m: string; c: string }) => ({
      platform: item.p as PlatformType,
      value: item.v,
      method: item.m,
      confidence: item.c as 'high' | 'medium' | 'low',
    }));
  } catch {
    return [];
  }
}
