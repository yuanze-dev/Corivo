/**
 * CLI 命令 - start
 *
 * 启动心跳守护进程
 */

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { getDefaultDatabasePath, getConfigDir, getPidFilePath } from '../../storage/database.js';
import { ProcessError, ConfigError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

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

  // 获取主密码
  console.log('启动心跳守护进程需要主密码\n');
  const password = await readPassword('请输入主密码: ');

  console.log('正在启动心跳守护进程...');

  // 启动守护进程
  const pid = spawn(
    process.execPath,
    ['./dist/engine/heartbeat.js'],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        CORIVO_DB_PATH: getDefaultDatabasePath(),
        CORIVO_CONFIG_DIR: configDir,
        CORIVO_ENCRYPTED_KEY: config.encrypted_db_key,
        CORIVO_DAEMON_PASSWORD: password,
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
}
