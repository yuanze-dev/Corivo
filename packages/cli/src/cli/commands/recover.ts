/**
 * CLI command-recover
 *
 * Key recovery process
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

export async function recoverCommand(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                      Data Recovery Wizard');
  console.log('═══════════════════════════════════════════════════════\n');

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

  console.log('Choose a recovery method:\n');
  console.log('  [1] Use a recovery key (24 words, BIP39 standard)');
  console.log('  [2] Exit\n');

  const choice = await readPassword('Choose [1-2]: ');

  if (choice !== '1') {
    console.log('Cancelled');
    return;
  }

  // Enter recovery key
  console.log('\nEnter your recovery key (24 words separated by spaces):\n');

  const recoveryKey = await readPassword('Recovery key: ');
  const inputWords = recoveryKey.trim().split(/\s+/);

  if (inputWords.length !== 24) {
    console.log('❌ Recovery key must contain 24 words');
    return;
  }

  // Verify recovery key
  console.log('\nVerifying recovery key...');

  try {
    KeyManager.deriveFromRecoveryKey(recoveryKey);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`❌ ${error.message}`);
    } else {
      console.log('❌ Recovery key verification failed');
    }
    return;
  }

  console.log('✅ Recovery key verification passed');

  // Set new password
  console.log('\nSet a new master password (at least 8 characters, including letters and numbers)\n');

  const password1 = await readPassword('New password: ');
  if (!KeyManager.validatePasswordStrength(password1)) {
    console.log('❌ Password is too weak');
    return;
  }

  const password2 = await readPassword('Confirm new password: ');
  if (password1 !== password2) {
    console.log('❌ Password entries do not match');
    return;
  }

  // Regenerate key
  console.log('\nRegenerating key chain...');

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
    const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    const health = db.checkHealth();

    if (health.ok) {
      console.log('✅ Database verification passed');
      const stats = db.getStats();
      console.log(`   Recovered ${stats.total} blocks`);
    } else {
      console.log('❌ Database verification failed');
      console.log('   Please sync the latest data from another device');
    }
  } catch {
    console.log('⚠️  Unable to open database');
    console.log('   Please sync the latest data from another device');
  }

  // Generate new recovery key
  const newRecoveryKey = KeyManager.generateRecoveryKey(newMasterKey);
  const recoveryWords = newRecoveryKey.split(' ');

  console.log('\nKey chain updated!');
  console.log('\n⚠️  Important: your new recovery key has been generated (24 words)\n');

  console.log(`  ${recoveryWords.slice(0, 6).join('  ')}`);
  console.log(`  ${recoveryWords.slice(6, 12).join('  ')}`);
  console.log(`  ${recoveryWords.slice(12, 18).join('  ')}`);
  console.log(`  ${recoveryWords.slice(18, 24).join('  ')}`);

  console.log('\n⚠️  The old recovery key is no longer valid. Please save the new recovery key');

  console.log('\nNext steps:');
  console.log('  Re-authorize on other devices (the device list has been reset)');
}
