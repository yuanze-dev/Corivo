/**
 * CLI command-doctor
 *
 * health check
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { KeyManager } from '../../crypto/keys.js';
import { readPassword } from '../utils/password.js';
import { getCliOutput } from '@/cli/runtime';

export async function doctorCommand(): Promise<void> {
  const output = getCliOutput();
  output.info('\nRunning Corivo health checks...\n');

  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    output.error('❌ Config file not found');
    output.info('   Please run: corivo init');
    return;
  }

  output.success('✅ Config file looks good');

  // Check database
  const dbPath = getDefaultDatabasePath();
  let dbExists = false;

  try {
    await fs.access(dbPath);
    dbExists = true;
  } catch {}

  if (dbExists) {
    output.success('✅ Database file exists');

    // Try to open the database
    try {
      const password = await readPassword('Enter the master password to verify the database: ');
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const encryptedDbKey = config.encrypted_db_key;
      const dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);

      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
      const health = db.checkHealth();

      if (health.ok) {
        output.success('✅ Database integrity check passed');

        const stats = db.getStats();
        output.info(`   Stored ${stats.total} blocks`);
      } else {
        output.error('❌ Database integrity check failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        output.error(`❌ Failed to open database: ${error.message}`);
      } else {
        output.error('❌ Failed to open database');
      }
    }
  } else {
    output.warn('⚠️  Database file does not exist');
    output.info('   It will be created automatically on first use');
  }

  // Check daemon
  const pidPath = path.join(configDir, 'heartbeat.pid');
  try {
    const pidStr = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(pidStr);
    process.kill(pid, 0);
    output.success(`✅ Heartbeat daemon is running (PID: ${pid})`);
  } catch {
    output.info('⚪ Heartbeat daemon is not running');
  }

  output.info('\nHealth check complete');
}
