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
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  // Check daemon status (via ServiceManager)
  const serviceManager = getServiceManager()
  const serviceStatus = await serviceManager.getStatus()

  const dbKey = await getDatabaseKey(configDir);
  if (!dbKey) {
    throw new ConfigError('Unable to get database key. Please re-initialize with: corivo init');
  }

  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey, enableEncryption: config.encrypted_db_key !== undefined });

  const stats = db.getStats();
  const health = db.checkHealth();
  const solverConfig = await loadSolverConfig(configDir);

  console.log('');
  console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
  console.log(chalk.cyan('                     Corivo Status'));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));

  console.log(chalk.cyan('📊 Memory Stats'));
  console.log(chalk.gray('  Total:    ') + chalk.white(stats.total.toString()));
  console.log(chalk.gray('  Active:   ') + chalk.green((stats.byStatus.active || 0).toString()));
  console.log(chalk.gray('  Cooling:  ') + chalk.yellow((stats.byStatus.cooling || 0).toString()));
  console.log(chalk.gray('  Cold:     ') + chalk.hex('#FF9500')((stats.byStatus.cold || 0).toString()));
  console.log(chalk.gray('  Archived: ') + chalk.gray((stats.byStatus.archived || 0).toString()));

  const annotations = Object.entries(stats.byAnnotation);
  if (annotations.length > 0) {
    console.log(chalk.cyan('\n🏷️  Annotation Distribution'));
    for (const [annotation, count] of annotations) {
      console.log(chalk.gray(`  ${annotation}: `) + chalk.white(count.toString()));
    }
  }

  console.log(chalk.cyan('\n💾 Database'));
  console.log(chalk.gray('  Path:    ') + chalk.white(dbPath));
  console.log(chalk.gray('  Status:  ') + (health.ok ? chalk.green('✅ OK') : chalk.red('❌ Error')));
  if (health.size) {
    console.log(chalk.gray('  Size:    ') + chalk.white(`${(health.size / 1024 / 1024).toFixed(2)} MB`));
  }

  console.log(chalk.cyan('\n⚡ Heartbeat Daemon'))
  console.log(chalk.gray('  Status:  ') + (serviceStatus.running ? chalk.green('🟢 Running') : chalk.gray('⚪ Not started')))
  if (serviceStatus.pid) {
    console.log(chalk.gray('  PID:    ') + chalk.white(serviceStatus.pid.toString()))
  }

  console.log(chalk.cyan('\n🔗 Sync'));
  if (solverConfig) {
    console.log(chalk.gray('  Server:  ') + chalk.white(solverConfig.server_url));
    console.log(chalk.gray('  Pushed:  ') + chalk.white(solverConfig.last_push_version.toString()) + chalk.gray(' items'));
    console.log(chalk.gray('  Pulled:  ') + chalk.white(solverConfig.last_pull_version.toString()) + chalk.gray(' items'));
  } else {
    console.log(chalk.gray('  Status:  ') + chalk.gray('⚪ Not registered'));
  }

  const pusher = new ContextPusher(db);
  const needsAttention = await pusher.pushNeedsAttention();
  if (needsAttention) {
    console.log(needsAttention);
  }

  console.log(chalk.cyan('\n🚀 Next steps:'));
  console.log(chalk.gray('  corivo save --content "..." --annotation "..."'));
  console.log(chalk.gray('  corivo save --pending --content "..."'));
  console.log(chalk.gray('  corivo query "..."'));
  console.log(chalk.gray('  corivo start | stop'));
  console.log('');
}
