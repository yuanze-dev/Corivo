/**
 * CLI command - status (plain-text output mode)
 *
 * TUI mode is handled by renderTui() in src/tui/index.ts,
 * dynamically imported via the --tui flag in index.ts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { ConfigError } from '../../errors/index.js';
import { getDatabaseKey, loadSolverConfig } from '../../config.js';
import { ContextPusher } from '../../push/context.js';
import { getServiceManager } from '../../service/index.js';

export async function statusCommand(_options: { noPassword?: boolean } = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // Check daemon status (via ServiceManager)
  const serviceManager = getServiceManager()
  const serviceStatus = await serviceManager.getStatus()

  const dbKey = await getDatabaseKey(configDir);
  if (!dbKey) {
    throw new ConfigError('无法获取数据库密钥，请重新初始化: corivo init');
  }

  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey, enableEncryption: config.encrypted_db_key !== undefined });

  const stats = db.getStats();
  const health = db.checkHealth();
  const solverConfig = await loadSolverConfig(configDir);

  console.log('');
  console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
  console.log(chalk.cyan('                      Corivo 状态'));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));

  console.log(chalk.cyan('📊 记忆统计'));
  console.log(chalk.gray('  总数:   ') + chalk.white(stats.total.toString()));
  console.log(chalk.gray('  活跃:   ') + chalk.green((stats.byStatus.active || 0).toString()));
  console.log(chalk.gray('  冷却:   ') + chalk.yellow((stats.byStatus.cooling || 0).toString()));
  console.log(chalk.gray('  冷冻:   ') + chalk.hex('#FF9500')((stats.byStatus.cold || 0).toString()));
  console.log(chalk.gray('  归档:   ') + chalk.gray((stats.byStatus.archived || 0).toString()));

  const annotations = Object.entries(stats.byAnnotation);
  if (annotations.length > 0) {
    console.log(chalk.cyan('\n🏷️  标注分布'));
    for (const [annotation, count] of annotations) {
      console.log(chalk.gray(`  ${annotation}: `) + chalk.white(count.toString()));
    }
  }

  console.log(chalk.cyan('\n💾 数据库'));
  console.log(chalk.gray('  路径:   ') + chalk.white(dbPath));
  console.log(chalk.gray('  状态:   ') + (health.ok ? chalk.green('✅ 正常') : chalk.red('❌ 异常')));
  if (health.size) {
    console.log(chalk.gray('  大小:   ') + chalk.white(`${(health.size / 1024 / 1024).toFixed(2)} MB`));
  }

  console.log(chalk.cyan('\n⚡ 心跳守护进程'))
  console.log(chalk.gray('  状态:   ') + (serviceStatus.running ? chalk.green('🟢 运行中') : chalk.gray('⚪ 未启动')))
  if (serviceStatus.pid) {
    console.log(chalk.gray('  PID:    ') + chalk.white(serviceStatus.pid.toString()))
  }

  console.log(chalk.cyan('\n🔗 同步'));
  if (solverConfig) {
    console.log(chalk.gray('  服务器: ') + chalk.white(solverConfig.server_url));
    console.log(chalk.gray('  已推送: ') + chalk.white(solverConfig.last_push_version.toString()) + chalk.gray(' 条'));
    console.log(chalk.gray('  已拉取: ') + chalk.white(solverConfig.last_pull_version.toString()) + chalk.gray(' 条'));
  } else {
    console.log(chalk.gray('  状态:   ') + chalk.gray('⚪ 未注册'));
  }

  const pusher = new ContextPusher(db);
  const needsAttention = await pusher.pushNeedsAttention();
  if (needsAttention) {
    console.log(needsAttention);
  }

  console.log(chalk.cyan('\n🚀 下一步：'));
  console.log(chalk.gray('  corivo save --content "..." --annotation "..."'));
  console.log(chalk.gray('  corivo save --pending --content "..."'));
  console.log(chalk.gray('  corivo query "..."'));
  console.log(chalk.gray('  corivo start | stop'));
  console.log('');
}
