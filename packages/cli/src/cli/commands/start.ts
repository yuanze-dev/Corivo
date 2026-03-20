/**
 * CLI 命令 - start
 *
 * 启动心跳守护进程（无需密码，基于平台指纹认证）
 */

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { getDefaultDatabasePath, getConfigDir, getPidFilePath } from '../../storage/database.js';
import { ProcessError, ConfigError } from '../../errors/index.js';

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY = 5000; // 5 秒

export async function startCommand(): Promise<void> {
  // 读取配置
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  let dbKey = config.db_key;

  // 如果是旧格式（有 encrypted_db_key 但没有 db_key），提示用户重新初始化
  if (!dbKey && config.encrypted_db_key) {
    console.log('⚠️  检测到旧版配置格式（需要密码）');
    console.log('');
    console.log('Corivo v0.10+ 已移除密码系统，改为基于平台指纹认证。');
    console.log('请按以下步骤迁移：');
    console.log('');
    console.log('  1. 备份数据库：cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup');
    console.log('  2. 重新初始化：corivo init');
    console.log('  3. 恢复数据：cp ~/.corivo/corivo.db.backup ~/.corivo/corivo.db');
    console.log('');
    console.log('或者直接删除旧配置重新开始：');
    console.log('  rm ~/.corivo/config.json && corivo init');
    return;
  }

  if (!dbKey) {
    throw new ConfigError('配置文件无效：缺少 db_key');
  }

  // 检查是否已在运行
  const pidPath = getPidFilePath();
  try {
    const existingPid = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(existingPid);
    try {
      process.kill(pid, 0);
      throw new ProcessError('心跳进程已在运行', { pid });
    } catch {
      // 进程不存在，删除旧的 PID 文件
      await fs.unlink(pidPath);
    }
  } catch {}

  console.log('正在启动心跳守护进程...');

  // 启动守护进程（无需密码）
  const pid = spawn(
    process.execPath,
    ['./dist/engine/heartbeat.js'],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CORIVO_DB_PATH: getDefaultDatabasePath(),
        CORIVO_CONFIG_DIR: configDir,
        CORIVO_DB_KEY: dbKey,
        NODE_ENV: 'production',
      },
    }
  );

  pid.unref();

  // 写入 PID 文件
  const childPid = pid.pid;
  if (!childPid) {
    throw new ProcessError('启动心跳进程失败：无法获取 PID');
  }
  await fs.writeFile(pidPath, childPid.toString());

  console.log(`✅ 心跳守护进程已启动 (PID: ${childPid})`);
  console.log('\n提示: 心跳进程会自动处理待标注的 block 和执行衰减');
  console.log('如需启用自动重启功能，请使用: corivo start --watch');
}

/**
 * 启动心跳守护进程（带监控模式）
 */
export async function startWatchCommand(): Promise<void> {
  // 读取配置
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // 检查密钥
  const dbKey = config.db_key || config.encrypted_db_key;
  if (!dbKey) {
    throw new ConfigError('配置文件无效：缺少 db_key');
  }

  console.log('正在启动心跳守护进程（监控模式）...');
  console.log('监控模式会在心跳进程崩溃时自动重启\n');

  let restartCount = 0;

  // 启动循环
  while (restartCount < MAX_RESTART_ATTEMPTS) {
    const childPid = await spawnHeartbeat(configDir, dbKey);

    // 监控子进程
    const exitCode = await waitForExit(childPid);

    if (exitCode === 0) {
      // 正常退出
      console.log('心跳进程已正常退出');
      break;
    }

    // 异常退出，尝试重启
    restartCount++;
    if (restartCount < MAX_RESTART_ATTEMPTS) {
      console.log(`\n⚠️  心跳进程异常退出 (代码: ${exitCode})`);
      console.log(`将在 ${RESTART_DELAY / 1000} 秒后重启 (${restartCount}/${MAX_RESTART_ATTEMPTS})...`);

      await new Promise(resolve => setTimeout(resolve, RESTART_DELAY));
      console.log('正在重启...\n');
    } else {
      console.log(`\n❌ 心跳进程在 ${MAX_RESTART_ATTEMPTS} 次尝试后仍无法稳定运行`);
      console.log('请检查日志并手动重启');
      process.exit(1);
    }
  }
}

/**
 * 生成心跳子进程
 */
async function spawnHeartbeat(
  configDir: string,
  dbKey: string
): Promise<number> {
  const pidPath = getPidFilePath();

  // 检查是否已在运行
  try {
    const existingPid = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(existingPid);
    try {
      process.kill(pid, 0);
      throw new ProcessError('心跳进程已在运行', { pid });
    } catch {
      // 进程不存在，删除旧的 PID 文件
      await fs.unlink(pidPath);
    }
  } catch {}

  const pid = spawn(
    process.execPath,
    ['./dist/engine/heartbeat.js'],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CORIVO_DB_PATH: getDefaultDatabasePath(),
        CORIVO_CONFIG_DIR: configDir,
        CORIVO_DB_KEY: dbKey,
        NODE_ENV: 'production',
      },
    }
  );

  // 监听子进程输出
  if (pid.stdout) {
    pid.stdout.on('data', (data) => {
      console.log(data.toString().trim());
    });
  }
  if (pid.stderr) {
    pid.stderr.on('data', (data) => {
      console.error(data.toString().trim());
    });
  }

  const childPid = pid.pid;
  if (!childPid) {
    throw new ProcessError('启动心跳进程失败：无法获取 PID');
  }

  await fs.writeFile(pidPath, childPid.toString());

  return childPid;
}

/**
 * 等待子进程退出
 */
function waitForExit(childPid: number): Promise<number | null> {
  return new Promise((resolve) => {
    // 检查进程是否还在运行
    const checkInterval = setInterval(() => {
      try {
        process.kill(childPid, 0);
        // 进程还在运行，继续等待
      } catch {
        // 进程已退出
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 1000);

    // 也监听 SIGTERM 以便优雅退出
    process.once('SIGTERM', () => {
      clearInterval(checkInterval);
      try {
        process.kill(childPid, 'SIGTERM');
      } catch {}
      resolve(null);
    });

    process.once('SIGINT', () => {
      clearInterval(checkInterval);
      try {
        process.kill(childPid, 'SIGTERM');
      } catch {}
      console.log('\n收到退出信号，正在停止监控...');
      resolve(0);
    });
  });
}
