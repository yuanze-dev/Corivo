/**
 * 平台指纹生成
 *
 * 从各平台提取唯一标识，生成不可逆的用户指纹
 * 用于跨设备识别同一用户
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FingerprintError } from '../errors/index.js';

/**
 * 平台类型（可扩展）
 *
 * 设计理念：同一用户在不同设备上会使用相同的工具集合
 * 通过收集多个工具的指纹，交叉验证是同一个人
 */
export type PlatformType =
  // AI 编程工具
  | 'claude_code'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'windsurf'
  | 'copilot'
  // 开发工具
  | 'vscode'
  | 'jetbrains'
  | 'neovim'
  // 版本控制
  | 'github'
  | 'gitlab'
  | 'git'
  // 包管理
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  // 容器/虚拟化
  | 'docker'
  | 'podman'
  // 通讯/协作
  | 'feishu'
  | 'slack'
  | 'wechat'
  | 'dingtalk'
  | 'notion'
  // 云服务
  | 'aws'
  | 'aliyun'
  | 'gcp'
  // 其他
  | 'device'
  | 'email'
  | 'custom';

/**
 * Claude Code 配置
 */
interface ClaudeCodeConfig {
  env?: {
    ANTHROPIC_AUTH_TOKEN?: string;
  };
}

/**
 * 飞书配置
 */
interface FeishuConfig {
  [key: string]: unknown;
}

/**
 * 指纹结果
 */
export interface Fingerprint {
  platform: PlatformType;
  value: string;
  method: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 指纹收集器
 */
export class FingerprintCollector {

  /**
   * 收集所有可用的平台指纹
   *
   * 对用户完全透明，静默收集所有可用指纹
   *
   * 设计理念：同一用户在不同设备上会使用相同的工具集合
   * 通过收集多个工具的指纹，交叉验证是同一个人
   */
  static async collectAll(options?: {
    claudeSettingsPath?: string;
    feishuConfigPath?: string;
  }): Promise<Fingerprint[]> {
    const fingerprints: Fingerprint[] = [];

    // 辅助函数：安全添加指纹
    const addIfPresent = async (promise: Promise<Fingerprint | null>) => {
      try {
        const fp = await promise;
        if (fp) fingerprints.push(fp);
      } catch {
        // 静默失败
      }
    };

    // ========== 高置信度平台指纹 ==========
    // 这些平台的用户 ID 是稳定且唯一的

    await addIfPresent(this.getClaudeCodeFingerprint(options?.claudeSettingsPath));
    await addIfPresent(this.getCursorFingerprint());
    await addIfPresent(this.getFeishuFingerprint(options?.feishuConfigPath));
    await addIfPresent(this.getSlackFingerprint());
    await addIfPresent(this.getGitHubFingerprint());
    await addIfPresent(this.getSSHFingerprint());

    // ========== 中置信度平台指纹 ==========

    await addIfPresent(this.getVSCodeFingerprint());
    await addIfPresent(this.getJetBrainsFingerprint());
    await addIfPresent(this.getAWSFingerprint());
    await addIfPresent(this.getCodexFingerprint());
    await addIfPresent(this.getOpenCodeFingerprint());

    // ========== 低置信度指纹（辅助验证） ==========

    await addIfPresent(this.getNpmFingerprint());
    await addIfPresent(this.getDockerFingerprint());

    // 设备指纹（总是存在，作为最后备用）
    try {
      fingerprints.push(await this.getDeviceFingerprint());
    } catch {
      // 静默失败
    }

    return fingerprints;
  }

  /**
   * 从 Claude Code 提取指纹
   *
   * 读取 ANTHROPIC_AUTH_TOKEN，计算 SHA256 的前 16 位
   *
   * @param settingsPath - Claude Code settings.json 路径
   * @returns 指纹或 null
   */
  static async getClaudeCodeFingerprint(
    settingsPath?: string
  ): Promise<Fingerprint | null> {
    // 默认路径
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

      // 计算 SHA256 哈希，取前 16 位作为指纹
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
   * 从飞书 MCP 提取指纹
   *
   * @param configPath - 飞书 MCP 配置路径
   * @returns 指纹或 null
   */
  static async getFeishuFingerprint(
    configPath?: string
  ): Promise<Fingerprint | null> {
    // 尝试从 MCP 配置读取
    const defaultPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.claude',
      '.mcp.json'
    );

    try {
      const content = await fs.readFile(configPath || defaultPath, 'utf-8');
      const config = JSON.parse(content);

      // 查找 feishu-mcp 配置
      const feishuConfig = config.servers?.['feishu-mcp'] as
        | { env?: { FEISHU_USER_ID?: string; FEISHU_OPEN_ID?: string } }
        | undefined;

      const userId = feishuConfig?.env?.FEISHU_USER_ID || feishuConfig?.env?.FEISHU_OPEN_ID;

      if (!userId) {
        return null;
      }

      // 直接使用 open_id 作为指纹（飞书保证唯一性）
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
   * 从 Cursor 提取指纹
   *
   * Cursor 配置通常在 ~/.cursor/config.json
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

        // 尝试多种可能的用户 ID 字段
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
        // 继续尝试下一个路径
      }
    }

    return null;
  }

  /**
   * 从 Codex 提取指纹
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
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 从 OpenCode 提取指纹
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
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 从 Slack 提取指纹
   *
   * Slack 配置可能在多个位置
   */
  static async getSlackFingerprint(): Promise<Fingerprint | null> {
    // Slack 通常在 ~/Library/Application Support/Slack (macOS)
    const slackPaths = [
      path.join(process.env.HOME || '', 'Library', 'Application Support', 'Slack'),
      path.join(process.env.HOME || '', '.config', 'Slack'),
    ];

    for (const slackPath of slackPaths) {
      try {
        // 读取 team info 或 local storage
        const teamFile = path.join(slackPath, 'local-storage', 'leveldb');
        const stats = await fs.readFile(teamFile, 'utf-8');

        // 尝试提取 team ID 或 user ID
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
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 从 GitHub 提取指纹
   *
   * 读取 GitHub CLI 或 Git 配置
   */
  static async getGitHubFingerprint(): Promise<Fingerprint | null> {
    // 尝试 GitHub CLI 配置
    try {
      const ghConfigPath = path.join(process.env.HOME || '', '.config', 'gh', 'hosts.yml');
      const content = await fs.readFile(ghConfigPath, 'utf-8');

      // 提取用户名（不提取 token）
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
      // 继续尝试 Git 配置
    }

    // 尝试 Git 配置
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
      // 忽略
    }

    return null;
  }

  /**
   * 从 VS Code 提取指纹
   *
   * 读取 VS Code 用户设置或机器 ID
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

        // 提取机器 ID（不包含用户数据）
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
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 从 npm 提取指纹
   *
   * 读取 npm 配置获取唯一标识
   */
  static async getNpmFingerprint(): Promise<Fingerprint | null> {
    try {
      const { execSync } = await import('node:child_process');
      const npmUser = execSync('npm config get userconfig 2>/dev/null || echo')
        .toString().trim();

      // 读取 npm 配置文件
      const npmrcPath = path.join(process.env.HOME || '', '.npmrc');
      try {
        const content = await fs.readFile(npmrcPath, 'utf-8');

        // 提取唯一标识（如 npm username 或 registry url）
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
        // 继续尝试从缓存目录获取
      }

      // 从 npm 缓存目录获取特征
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
      // 忽略
    }

    return null;
  }

  /**
   * 从 Docker 提取指纹
   */
  static async getDockerFingerprint(): Promise<Fingerprint | null> {
    try {
      const { execSync } = await import('node:child_process');

      // 获取 Docker 用户 ID
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
      // 忽略
    }

    return null;
  }

  /**
   * 从 SSH 密钥提取指纹
   *
   * SSH 密钥是跨设备的强身份标识
   */
  static async getSSHFingerprint(): Promise<Fingerprint | null> {
    const sshDir = path.join(process.env.HOME || '', '.ssh');
    const keyFiles = ['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub'];

    for (const keyFile of keyFiles) {
      try {
        const keyPath = path.join(sshDir, keyFile);
        const content = await fs.readFile(keyPath, 'utf-8');

        // SSH 公钥格式: "ssh-rsa AAAA... comment"
        const keyMatch = content.match(/^(\S+)\s+(\S+)/);
        if (keyMatch) {
          const keyType = keyMatch[1];
          const publicKey = keyMatch[2];

          // 只使用前 32 个字符作为指纹（不是完整密钥，保护隐私）
          const hash = crypto.createHash('sha256').update(`${keyType}:${publicKey.substring(0, 32)}`).digest('hex');
          return {
            platform: 'custom',
            value: hash.substring(0, 16),
            method: 'sha256(ssh_public_key_prefix)[:16]',
            confidence: 'high', // SSH 密钥是强身份标识
          };
        }
      } catch {
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 从 AWS CLI 提取指纹
   */
  static async getAWSFingerprint(): Promise<Fingerprint | null> {
    const awsConfigPath = path.join(process.env.HOME || '', '.aws', 'config');

    try {
      const content = await fs.readFile(awsConfigPath, 'utf-8');

      // 提取 profile 名称（不包含凭证）
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
      // 忽略
    }

    return null;
  }

  /**
   * 从 JetBrains IDE 提取指纹
   *
   * 支持 IntelliJ, PyCharm, WebStorm 等
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
          // 读取所有产品的标识
          const hash = crypto.createHash('sha256').update(optionsPath).digest('hex');
          return {
            platform: 'jetbrains',
            value: hash.substring(0, 16),
            method: 'sha256(jetbrains_install)[:16]',
            confidence: 'medium',
          };
        }
      } catch {
        // 继续尝试
      }
    }

    return null;
  }

  /**
   * 生成设备指纹
   *
   * 基于系统信息生成，作为备用指纹
   *
   * @returns 设备指纹
   */
  static async getDeviceFingerprint(): Promise<Fingerprint> {
    // 收集系统信息
    const infos: string[] = [];

    // 操作系统
    infos.push(process.platform);
    infos.push(process.arch);

    // 用户目录
    infos.push(process.env.HOME || process.env.USERPROFILE || '');

    // 主机名
    infos.push(process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown');

    // 机器 ID（Linux）或序列号（macOS）
    try {
      if (process.platform === 'darwin') {
        // macOS: 读取硬件 UUID
        const { execSync } = await import('node:child_process');
        const uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID')
          .toString()
          .match(/"IOPlatformUUID"\s*=\s*"(.+)"/)?.[1];
        if (uuid) {
          infos.push(uuid);
        }
      } else if (process.platform === 'linux') {
        // Linux: 读取 machine-id
        try {
          const machineId = await fs.readFile('/etc/machine-id', 'utf-8');
          infos.push(machineId.trim());
        } catch {
          // 某些发行版使用 /var/lib/dbus/machine-id
          try {
            const dbusId = await fs.readFile('/var/lib/dbus/machine-id', 'utf-8');
            infos.push(dbusId.trim());
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      // 忽略错误
    }

    // 计算哈希
    const hash = crypto.createHash('sha256').update(infos.join('|')).digest('hex');
    const fingerprint = hash.substring(0, 16);

    return {
      platform: 'device',
      value: fingerprint,
      method: 'sha256(system_info)[:16]',
      confidence: 'low', // 设备指纹置信度低，因为同设备可能换用户
    };
  }

  /**
   * 从字符串生成自定义指纹
   *
   * @param value - 原始值
   * @returns 指纹
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
 * 指纹匹配器
 *
 * 用于判断两组指纹是否属于同一用户
 */
export class FingerprintMatcher {

  /**
   * 检查两组指纹是否有匹配
   *
   * @param fingerprints1 - 第一组指纹
   * @param fingerprints2 - 第二组指纹
   * @returns 是否匹配
   */
  static match(
    fingerprints1: Fingerprint[],
    fingerprints2: Fingerprint[]
  ): boolean {
    // 提取高置信度指纹
    const highConfidence1 = this.getHighConfidenceFingerprints(fingerprints1);
    const highConfidence2 = this.getHighConfidenceFingerprints(fingerprints2);

    // 检查是否有任何高置信度指纹匹配
    for (const fp1 of highConfidence1) {
      for (const fp2 of highConfidence2) {
        if (fp1.platform === fp2.platform && fp1.value === fp2.value) {
          return true;
        }
      }
    }

    // 如果没有高置信度匹配，检查中置信度
    const mediumConfidence1 = this.getMediumConfidenceFingerprints(fingerprints1);
    const mediumConfidence2 = this.getMediumConfidenceFingerprints(fingerprints2);

    for (const fp1 of mediumConfidence1) {
      for (const fp2 of mediumConfidence2) {
        if (fp1.platform === fp2.platform && fp1.value === fp2.value) {
          return true; // 中置信度匹配，可能是同一用户
        }
      }
    }

    return false;
  }

  /**
   * 计算匹配置信度
   *
   * @param fingerprints1 - 第一组指纹
   * @param fingerprints2 - 第二组指纹
   * @returns 置信度 (0-1)
   */
  static matchConfidence(
    fingerprints1: Fingerprint[],
    fingerprints2: Fingerprint[]
  ): number {
    let score = 0;
    let maxScore = 0;

    // 高置信度匹配权重
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

    // 中置信度匹配权重
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
   * 获取高置信度指纹
   */
  private static getHighConfidenceFingerprints(
    fingerprints: Fingerprint[]
  ): Fingerprint[] {
    return fingerprints.filter(fp => fp.confidence === 'high');
  }

  /**
   * 获取中置信度指纹
   */
  private static getMediumConfidenceFingerprints(
    fingerprints: Fingerprint[]
  ): Fingerprint[] {
    return fingerprints.filter(fp => fp.confidence === 'medium');
  }
}

/**
 * 指纹序列化
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
 * 指纹反序列化
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
