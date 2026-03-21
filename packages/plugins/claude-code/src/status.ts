/**
 * Corivo Status Line
 * 显示记忆统计信息
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface CorivoStats {
  total: number;
  active: number;
  cooling: number;
  cold: number;
  recentCount: number;
}

interface StatusContext {
  cwd: string;
  transcript_path?: string;
}

export async function getCorivoStatus(context: StatusContext): Promise<string> {
  try {
    // 默认配置目录
    const configDir = join(homedir(), '.corivo');
    const dbPath = join(configDir, 'corivo.db');

    // 检查数据库是否存在
    const { existsSync } = await import('node:fs');
    if (!existsSync(dbPath)) {
      return '[corivo] 未初始化';
    }

    // 查找 corivo 命令
    const { execSync } = await import('node:child_process');
    let corivoCmd = 'corivo';

    // 尝试从 npm 全局路径查找
    try {
      const npmPrefix = execSync('npm config get prefix', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      const corivoBinPath = join(npmPrefix, 'bin', 'corivo');
      if (existsSync(corivoBinPath)) {
        corivoCmd = corivoBinPath;
      }
    } catch {
      // 使用系统 PATH 中的 corivo
    }

    const output = execSync(`${corivoCmd} status --no-password`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, CORIVO_NO_PASSWORD: '1' }
    });

    // 解析输出获取关键信息
    const lines = output.split('\n');
    let total = 0;
    let active = 0;

    for (const line of lines) {
      if (line.includes('总数:')) {
        const match = line.match(/总数:\s*(\d+)/);
        if (match) total = parseInt(match[1], 10);
      }
      if (line.includes('活跃:')) {
        const match = line.match(/活跃:\s*(\d+)/);
        if (match) active = parseInt(match[1], 10);
      }
    }

    // 计算健康度
    const health = total > 0 ? Math.round((active / total) * 100) : 0;
    const healthIcon = health >= 70 ? '🟢' : health >= 40 ? '🟡' : '🔴';

    return `[corivo] ${total}块 ${healthIcon}${health}%`;

  } catch (error) {
    // CLI 不可用，返回简化状态
    return '[corivo] ●';
  }
}

export async function main() {
  const context: StatusContext = {
    cwd: process.cwd(),
  };

  try {
    const stdin = await readStdin();
    if (stdin) {
      context.cwd = stdin.cwd;
      context.transcript_path = stdin.transcript_path;
    }
  } catch {
    // stdin 不可用，使用默认值
  }

  const status = await getCorivoStatus(context);
  console.log(status);
}

async function readStdin(): Promise<StatusContext | null> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => resolve(null));

    // 超时保护
    setTimeout(() => resolve(null), 1000);
  });
}

// 直接运行时执行
main().catch(console.error);
