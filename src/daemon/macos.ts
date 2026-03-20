/**
 * macOS launchd 守护进程管理
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';
import { execSync } from 'node:child_process';

const PLIST_NAME = 'com.corivo.daemon.plist';
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME);

interface PlistConfig {
  /** corivo 二进制路径 */
  corivoBin: string;
  /** 数据库密钥（base64） */
  dbKey: string;
  /** 数据库路径 */
  dbPath: string;
}

/**
 * 生成 launchd plist 文件内容
 */
function generatePlist(config: PlistConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.corivo.daemon</string>

  <key>ProgramArguments</key>
  <array>
    <string>${config.corivoBin}</string>
    <string>daemon</string>
    <string>run</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>CORIVO_DB_KEY</key>
    <string>${config.dbKey}</string>
    <key>CORIVO_DB_PATH</key>
    <string>${config.dbPath}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>

  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.log')}</string>

  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.err')}</string>

  <key>ProcessType</key>
  <string>Interactive</string>

</dict>
</plist>
`;
}

/**
 * 安装 launchd 服务
 */
export async function install(config: PlistConfig): Promise<{ success: boolean; error?: string }> {
  try {
    // 确保 LaunchAgents 目录存在
    await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });

    // 写入 plist 文件
    const plistContent = generatePlist(config);
    await fs.writeFile(PLIST_PATH, plistContent, { mode: 0o644 });

    // 加载服务
    execSync(`launchctl load "${PLIST_PATH}"`, { encoding: 'utf-8' });

    // 启动服务
    execSync(`launchctl start com.corivo.daemon`, { encoding: 'utf-8' });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 卸载 launchd 服务
 */
export async function uninstall(): Promise<{ success: boolean; error?: string }> {
  try {
    // 尝试停止服务
    try {
      execSync(`launchctl stop com.corivo.daemon`, { encoding: 'utf-8' });
    } catch {
      // 服务可能没有运行，忽略
    }

    // 尝试卸载服务
    try {
      execSync(`launchctl unload "${PLIST_PATH}"`, { encoding: 'utf-8' });
    } catch {
      // 服务可能没有加载，忽略
    }

    // 删除 plist 文件
    await fs.unlink(PLIST_PATH).catch(() => {
      // 文件可能不存在，忽略
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 检查服务状态
 */
export async function getStatus(): Promise<{
  running: boolean;
  loaded: boolean;
  pid?: number;
}> {
  try {
    // 检查 plist 文件是否存在
    const loaded = await fs.access(PLIST_PATH).then(() => true).catch(() => false);

    if (!loaded) {
      return { running: false, loaded: false };
    }

    // 尝试获取 PID
    const output = execSync(`launchctl list | grep com.corivo.daemon`, {
      encoding: 'utf-8',
    });

    // 输出格式: "com.corivo.daemon\tPID\t..."
    const match = output.match(/com\.corivo\.daemon\s+(\d+)/);
    const pid = match ? parseInt(match[1], 10) : undefined;

    // 如果 PID 是 "-" 或没有，说明服务没有运行
    const running = pid !== undefined && pid > 0;

    return { running, loaded: true, pid };
  } catch {
    return { running: false, loaded: false };
  }
}

/**
 * 检查是否为 macOS
 */
export function isSupported(): boolean {
  return process.platform === 'darwin';
}

export default { install, uninstall, getStatus, isSupported };
