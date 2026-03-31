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

export async function doctorCommand(): Promise<void> {
  console.log('\nRunning Corivo health checks...\n');

  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.log('❌ Config file not found');
    console.log('   Please run: corivo init');
    return;
  }

  console.log('✅ Config file looks good');

  // Check database
  const dbPath = getDefaultDatabasePath();
  let dbExists = false;

  try {
    await fs.access(dbPath);
    dbExists = true;
  } catch {}

  if (dbExists) {
    console.log('✅ Database file exists');

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
        console.log('✅ Database integrity check passed');

        const stats = db.getStats();
        console.log(`   Stored ${stats.total} blocks`);
      } else {
        console.log('❌ Database integrity check failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.log(`❌ Failed to open database: ${error.message}`);
      } else {
        console.log('❌ Failed to open database');
      }
    }
  } else {
    console.log('⚠️  Database file does not exist');
    console.log('   It will be created automatically on first use');
  }

  // Check daemon
  const pidPath = path.join(configDir, 'heartbeat.pid');
  try {
    const pidStr = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(pidStr);
    process.kill(pid, 0);
    console.log(`✅ Heartbeat daemon is running (PID: ${pid})`);
  } catch {
    console.log('⚪ Heartbeat daemon is not running');
  }

  console.log('\nHealth check complete');
}
