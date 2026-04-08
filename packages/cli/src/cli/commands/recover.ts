/**
 * CLI command-recover
 *
 * Key recovery process
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir, getDefaultDatabasePath } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { openCorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import { printBanner } from '@/utils/banner';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';
import { getCliOutput } from '@/cli/runtime';

export async function recoverCommand(): Promise<void> {
  const output = getCliOutput();
  printBanner('Data Recovery Wizard', { width: 55 });

  // Check configuration file
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Config file does not exist. If this is your first time, run: corivo init');
  }

  output.info('Choose a recovery method:\n');
  output.info('  [1] Use a recovery key (24 words, BIP39 standard)');
  output.info('  [2] Exit\n');

  const choice = await readPassword('Choose [1-2]: ');

  if (choice !== '1') {
    output.info('Cancelled');
    return;
  }

  // Enter recovery key
  output.info('\nEnter your recovery key (24 words separated by spaces):\n');

  const recoveryKey = await readPassword('Recovery key: ');
  const inputWords = recoveryKey.trim().split(/\s+/);

  if (inputWords.length !== 24) {
    output.error('❌ Recovery key must contain 24 words');
    return;
  }

  // Verify recovery key
  output.info('\nVerifying recovery key...');

  try {
    KeyManager.deriveFromRecoveryKey(recoveryKey);
  } catch (error) {
    if (error instanceof ValidationError) {
      output.error(`❌ ${error.message}`);
    } else {
      output.error('❌ Recovery key verification failed');
    }
    return;
  }

  output.success('✅ Recovery key verification passed');

  // Set new password
  output.info('\nSet a new master password (at least 8 characters, including letters and numbers)\n');

  const password1 = await readPassword('New password: ');
  if (!KeyManager.validatePasswordStrength(password1)) {
    output.error('❌ Password is too weak');
    return;
  }

  const password2 = await readPassword('Confirm new password: ');
  if (password1 !== password2) {
    output.error('❌ Password entries do not match');
    return;
  }

  // Regenerate key
  output.info('\nRegenerating key chain...');

  const salt = KeyManager.generateSalt();
  const newMasterKey = KeyManager.deriveMasterKey(password1, salt);
  const dbKey = KeyManager.generateDatabaseKey();
  const encryptedDbKey = KeyManager.encryptDatabaseKey(dbKey, newMasterKey);

  // Update configuration
  const newConfig = {
    ...config,
    salt: salt.toString('base64'),
    encrypted_db_key: encryptedDbKey,
    recovered_at: new Date().toISOString(),
  };

  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  // Verify database
  const dbPath = getDefaultDatabasePath();
  try {
    const db = openCorivoDatabase({ path: dbPath, key: dbKey });
    const health = db.checkHealth();

    if (health.ok) {
      output.success('✅ Database verification passed');
      const stats = db.getStats();
      output.info(`   Recovered ${stats.total} blocks`);
    } else {
      output.error('❌ Database verification failed');
      output.info('   Please sync the latest data from another device');
    }
  } catch {
    output.warn('⚠️  Unable to open database');
    output.info('   Please sync the latest data from another device');
  }

  // Generate new recovery key
  const newRecoveryKey = KeyManager.generateRecoveryKey(newMasterKey);
  const recoveryWords = newRecoveryKey.split(' ');

  output.success('\nKey chain updated!');
  output.warn('\n⚠️  Important: your new recovery key has been generated (24 words)\n');

  output.info(`  ${recoveryWords.slice(0, 6).join('  ')}`);
  output.info(`  ${recoveryWords.slice(6, 12).join('  ')}`);
  output.info(`  ${recoveryWords.slice(12, 18).join('  ')}`);
  output.info(`  ${recoveryWords.slice(18, 24).join('  ')}`);

  output.warn('\n⚠️  The old recovery key is no longer valid. Please save the new recovery key');

  output.info('\nNext steps:');
  output.info('  Re-authorize on other devices (the device list has been reset)');
}
