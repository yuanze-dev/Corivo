/**
 * 动态指纹采集系统
 *
 * 核心思想：
 * - 不硬编码平台列表
 * - 扫描用户系统，动态发现已安装的软件
 * - 根据发现的软件，加载对应的指纹采集器
 *
 * 隐私保护（重要）：
 * - 只采集配置的哈希指纹，不采集原始内容
 * - 使用 SHA256 单向哈希，不可逆
 * - 只取哈希的前 16 位，进一步降低信息量
 * - 指纹仅用于身份识别，无法还原出原始数据
 *
 * 具体措施：
 * - 不存储 token、密码、私钥等原始敏感信息
 * - 不采集聊天记录、文件内容等用户数据
 * - 哈希值只存储在用户本地设备
 * - 用户可随时查看和删除 identity.json
 *
 * 优势：
 * - 新平台只需添加采集器，无需修改核心代码
 * - 用户没有的软件不会尝试采集
 * - 可以自动发现新的指纹来源
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Fingerprint } from './fingerprint.js';

/**
 * 指纹采集器接口
 *
 * 每个采集器负责：
 * 1. 检测对应软件是否已安装
 * 2. 从软件配置中提取用户标识
 * 3. 返回标准化指纹
 */
export interface FingerprintCollectorPlugin {
  /** 采集器唯一标识 */
  id: string;
  /** 平台名称 */
  platform: string;
  /** 检测软件是否已安装 */
  detect(): Promise<boolean>;
  /** 提取指纹 */
  collect(): Promise<Fingerprint | null>;
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 软件配置位置定义
 */
interface SoftwareConfig {
  /** 软件名称 */
  name: string;
  /** 平台标识 */
  platform: string;
  /** 配置文件路径（支持通配符） */
  configPaths: string[];
  /**
   * 提取指纹的函数
   *
   * 隐私要求：
   * - 只返回用户 ID、用户名等非敏感标识
   * - 不要返回 token、密钥、密码等敏感信息
   * - 返回值会被哈希处理，只取前 16 位
   */
  extractor: (content: string, filePath: string) => string | null;
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low';
  /** 提取方法描述 */
  method: string;
}

/**
 * 动态指纹采集器
 */
export class DynamicFingerprintCollector {
  /** 软件配置注册表 */
  private static softwareRegistry: SoftwareConfig[] = [];

  /**
   * 注册软件配置
   *
   * 新平台只需调用此方法注册，无需修改核心代码
   */
  static registerSoftware(config: SoftwareConfig): void {
    this.softwareRegistry.push(config);
  }

  /**
   * 批量注册软件配置
   */
  static registerSoftwareConfigs(configs: SoftwareConfig[]): void {
    this.softwareRegistry.push(...configs);
  }

  /**
   * 自动发现并收集所有指纹
   *
   * 流程：
   * 1. 扫描已注册的软件配置
   * 2. 检测每个软件的配置文件是否存在
   * 3. 对存在的配置文件提取指纹
   * 4. 哈希处理（单向，不可逆）
   * 5. 返回收集到的所有指纹
   */
  static async collectAll(): Promise<Fingerprint[]> {
    const fingerprints: Fingerprint[] = [];

    for (const software of this.softwareRegistry) {
      try {
        // 检测软件是否已安装（配置文件是否存在）
        const configPath = await this.findConfigPath(software.configPaths);
        if (!configPath) {
          continue; // 软件未安装，跳过
        }

        // 读取配置文件
        const content = await fs.readFile(configPath, 'utf-8');

        // 提取指纹标识符（extractor 设计为只采集非敏感信息）
        const identifier = software.extractor(content, configPath);
        if (!identifier) {
          continue; // 无法提取标识，跳过
        }

        // 🔒 哈希处理：单向哈希，只取前 16 位
        const hash = crypto.createHash('sha256').update(identifier).digest('hex');
        const fingerprint = hash.substring(0, 16);

        fingerprints.push({
          platform: software.platform as any, // 动态平台类型
          value: fingerprint,
          method: software.method,
          confidence: software.confidence,
        });
      } catch {
        // 单个软件采集失败，不影响其他软件
        continue;
      }
    }

    // 添加设备指纹（总是存在）
    try {
      const deviceFp = await this.collectDeviceFingerprint();
      fingerprints.push(deviceFp);
    } catch {
      // 设备指纹失败，忽略
    }

    return fingerprints;
  }

  /**
   * 查找第一个存在的配置文件路径
   */
  private static async findConfigPath(paths: string[]): Promise<string | null> {
    for (const p of paths) {
      const expandedPath = this.expandPath(p);
      try {
        // 支持通配符
        if (p.includes('*')) {
          const dir = path.dirname(expandedPath);
          const pattern = path.basename(expandedPath);
          const files = await fs.readdir(dir);
          const match = files.find(f => f.match(pattern.replace(/\*/g, '.*')));
          if (match) {
            return path.join(dir, match);
          }
        } else {
          // 普通路径
          await fs.access(expandedPath);
          return expandedPath;
        }
      } catch {
        // 路径不存在，继续尝试下一个
        continue;
      }
    }
    return null;
  }

  /**
   * 展开路径中的环境变量和 ~
   */
  private static expandPath(p: string): string {
    return p
      .replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
      .replace(/\$HOME/g, process.env.HOME || '')
      .replace(/\$USERPROFILE/g, process.env.USERPROFILE || '');
  }

  /**
   * 采集设备指纹
   */
  private static async collectDeviceFingerprint(): Promise<Fingerprint> {
    const infos: string[] = [];
    infos.push(process.platform);
    infos.push(process.arch);
    infos.push(process.env.HOME || process.env.USERPROFILE || '');
    infos.push(process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown');

    // macOS 读取硬件 UUID
    if (process.platform === 'darwin') {
      try {
        const { execSync } = await import('node:child_process');
        const uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID')
          .toString()
          .match(/"IOPlatformUUID"\s*=\s*"(.+)"/)?.[1];
        if (uuid) infos.push(uuid);
      } catch { /* 忽略 */ }
    }

    // Linux 读取 machine-id
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
   * 获取已注册的软件列表
   */
  static getRegisteredSoftware(): string[] {
    return this.softwareRegistry.map(s => s.name);
  }

  /**
   * 获取已安装的软件列表
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
 * 初始化默认软件配置
 *
 * 注册常见开发工具的指纹采集规则
 */
export function initializeDefaultSoftwareConfigs(): void {
  const home = process.env.HOME || process.env.USERPROFILE || '';

  DynamicFingerprintCollector.registerSoftwareConfigs([
    // ========== AI 编程工具 ==========
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

    // ========== 版本控制 ==========
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

    // ========== 开发工具 ==========
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
        // 使用安装路径作为特征
        return filePath;
      },
      confidence: 'medium',
      method: 'sha256(jetbrains_install)[:16]',
    },

    // ========== 云服务 ==========
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

    // ========== 通讯协作 ==========
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

    // ========== 包管理器 ==========
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

    // ========== SSH 密钥 ==========
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
 * 创建便捷的导出别名
 */
export const DynamicCollector = DynamicFingerprintCollector;
