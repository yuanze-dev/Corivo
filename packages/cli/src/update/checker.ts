/**
 * 版本检查器
 * 定期检查新版本并触发更新流程
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';
import https from 'node:https';
import { SemVer, parseSemVer, compareSemVer } from '../utils/semver.js';
import type { VersionInfo, UpdateStatus, UpdateConfig, Platform, BinaryInfo } from './types.js';

const VERSION_URL = 'https://corivo.ai/version.json';
const FALLBACK_VERSION_URL = 'https://raw.githubusercontent.com/xiaolin26/Corivo/main/version.json';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时
const REQUEST_TIMEOUT = 5000; // 5 秒

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    // 如果在开发环境，尝试读取 package.json
    // 否则使用版本常量
    return '0.11.0'; // TODO: 从动态导入获取
  } catch {
    return '0.11.0';
  }
}

/**
 * 获取版本信息（从远程）
 */
export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  const fetch = (url: string): Promise<VersionInfo | null> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, REQUEST_TIMEOUT);

      https.get(url, (res) => {
        clearTimeout(timeout);

        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data) as VersionInfo;
            resolve(json);
          } catch {
            resolve(null);
          }
        });
      }).on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  };

  // 先尝试主 URL，失败则尝试 fallback
  let result = await fetch(VERSION_URL);
  if (!result) {
    result = await fetch(FALLBACK_VERSION_URL);
  }

  return result;
}

/**
 * 检查是否有更新
 */
export async function checkForUpdate(config: UpdateConfig = {}): Promise<UpdateStatus> {
  const currentVersion = getCurrentVersion();
  const lastCheck = await getLastCheckTime();
  const now = Date.now();

  // 检查是否需要跳过（固定版本范围）
  if (config.pin) {
    const pinnedRange = config.pin;
    if (!isVersionInRange(currentVersion, pinnedRange)) {
      // 当前版本不在固定范围内，允许更新
    } else {
      // 在固定范围内，不更新
      return {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        isBreaking: false,
        lastCheck,
        nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
      };
    }
  }

  // 获取最新版本信息
  const latestInfo = await fetchVersionInfo();

  if (!latestInfo) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      isBreaking: false,
      lastCheck: now,
      nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
    };
  }

  const latestVersion = latestInfo.version;
  const hasUpdate = compareSemVer(latestVersion, currentVersion) > 0;
  const isBreaking = latestInfo.breaking;

  // 破坏性更新处理：如果用户禁用自动更新，则不触发自动更新
  // 允许更新的条件：(1) 非破坏性更新 OR (2) 用户启用了自动更新
  const shouldAutoUpdate = !isBreaking || config.auto !== false;

  await saveLastCheckTime(now);

  return {
    currentVersion,
    latestVersion,
    hasUpdate: hasUpdate && shouldAutoUpdate,
    isBreaking,
    lastCheck: now,
    nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
  };
}

/**
 * 执行更新
 */
export async function performUpdate(
  versionInfo: VersionInfo,
  platform: Platform
): Promise<{ success: boolean; error?: string }> {
  const binDir = path.join(os.homedir(), '.corivo', 'bin');
  const currentBin = path.join(binDir, 'corivo');
  const newBin = path.join(binDir, 'corivo.new');
  const oldBin = path.join(binDir, 'corivo.old');

  try {
    const binary = versionInfo.binaries[platform] as BinaryInfo | undefined;
    if (!binary) {
      return { success: false, error: `不支持的平台: ${platform}` };
    }

    // 下载新版本
    const data = await downloadBinary(binary.url);

    // 校验 checksum
    const hash = await sha256(data);
    if (hash !== binary.checksum.replace(/^sha256:/i, '')) {
      return { success: false, error: `校验和不匹配: ${hash} !== ${binary.checksum}` };
    }

    // 写入临时文件
    await fs.writeFile(newBin, data);
    await fs.chmod(newBin, 0o755);

    // 原子替换
    if (await fileExists(oldBin)) {
      await fs.unlink(oldBin);
    }
    await fs.rename(currentBin, oldBin);
    await fs.rename(newBin, currentBin);

    // 记录更新
    await saveUpdateRecord({
      from: getCurrentVersion(),
      to: versionInfo.version,
      at: new Date().toISOString(),
      changelog: versionInfo.changelog,
    });

    return { success: true };
  } catch (error) {
    // 尝试回滚
    try {
      if (await fileExists(newBin)) {
        await fs.unlink(newBin);
      }
      if (!(await fileExists(currentBin)) && (await fileExists(oldBin))) {
        await fs.rename(oldBin, currentBin);
      }
    } catch {
      // 回滚也失败了
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 获取当前平台
 */
export function getPlatform(): Platform {
  const platform = os.platform() as string;
  const arch = os.arch() as string;

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'Darwin-arm64' : 'Darwin-x64';
  }

  if (platform === 'linux') {
    return 'Linux-x64';
  }

  return 'Darwin-arm64'; // 默认
}

/**
 * 下载二进制文件
 */
async function downloadBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 计算 SHA256
 */
async function sha256(data: Buffer): Promise<string> {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查版本是否在范围内
 */
function isVersionInRange(version: string, range: string): boolean {
  // 简单实现：检查 "0.10.x" 这样的范围
  const parts = version.split('.');
  const rangeParts = range.split('.');

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const rangeMajor = parseInt(rangeParts[0], 10);
  const rangeMinor = rangeParts[1];

  if (!isNaN(rangeMajor) && major !== rangeMajor) {
    return false;
  }

  if (rangeMinor !== 'x' && !isNaN(minor) && !isNaN(parseInt(rangeMinor, 10))) {
    if (minor !== parseInt(rangeMinor, 10)) {
      return false;
    }
  }

  return true;
}

/**
 * 获取上次检查时间
 */
async function getLastCheckTime(): Promise<number | null> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    const lastUpdatePath = path.join(updateDir, 'last-update.json');

    const content = await fs.readFile(lastUpdatePath, 'utf-8');
    const record = JSON.parse(content);
    return record.checked_at || null;
  } catch {
    return null;
  }
}

/**
 * 保存上次检查时间
 */
async function saveLastCheckTime(time: number): Promise<void> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    await fs.mkdir(updateDir, { recursive: true });

    const lastUpdatePath = path.join(updateDir, 'last-update.json');
    const record = await fs.readFile(lastUpdatePath, 'utf-8').then(JSON.parse).catch(() => ({}));

    record.checked_at = time;
    await fs.writeFile(lastUpdatePath, JSON.stringify(record, null, 2));
  } catch {
    // 忽略错误
  }
}

/**
 * 保存更新记录
 */
async function saveUpdateRecord(record: {
  from: string;
  to: string;
  at: string;
  changelog: string;
}): Promise<void> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    await fs.mkdir(updateDir, { recursive: true });

    const lastUpdatePath = path.join(updateDir, 'last-update.json');
    await fs.writeFile(lastUpdatePath, JSON.stringify(record, null, 2));
  } catch {
    // 忽略错误
  }
}

/**
 * 获取更新记录
 */
export async function getUpdateRecord(): Promise<{
  from?: string;
  to?: string;
  at?: string;
  changelog?: string;
} | null> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    const lastUpdatePath = path.join(updateDir, 'last-update.json');

    const content = await fs.readFile(lastUpdatePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export default {
  getCurrentVersion,
  fetchVersionInfo,
  checkForUpdate,
  performUpdate,
  getPlatform,
  getUpdateRecord,
};
