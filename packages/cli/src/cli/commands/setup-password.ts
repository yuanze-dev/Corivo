/**
 * CLI command - setup-password
 *
 * Set a master password for database encryption and cross-device authentication
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { KeyManager } from '../../crypto/keys.js';
import { getConfigDir } from '@/storage/database';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

interface SetupPasswordOptions {
  force?: boolean;
}

export async function setupPasswordCommand(options: SetupPasswordOptions = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  // Read existing configuration
  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  // Check if a password has been set
  const hasPassword = config.encrypted_db_key !== undefined;

  if (hasPassword && !options.force) {
    console.log(chalk.yellow('\\n⚠️  Master password is already set'));
    console.log(chalk.gray('To change it, run: corivo setup-password --force\\n'));
    return;
  }

  console.log('\\n═══════════════════════════════════════════════════════');
  console.log('           Set Master Password');
  console.log('═══════════════════════════════════════════════════════\\n');

  console.log('The master password is used for:');
  console.log('  • Protecting database encryption (for cloud sync security)');
  console.log('  • Cross-device identity verification');
  console.log('  • Identity recovery credentials\\n');

  console.log(chalk.gray('Tips:'));
  console.log(chalk.gray('  • Use at least 8 characters, including letters and numbers'));
  console.log(chalk.gray('  • Pick something memorable but hard to guess'));
  console.log(chalk.gray('  • Forgotten passwords cannot be recovered, so keep it safe\\n'));

  // If you already have a password, you need to verify it first
  if (hasPassword && options.force) {
    const oldPassword = await readPassword('Enter current password: ');
    const salt = Buffer.from(config.salt, 'base64');
    const masterKey = KeyManager.deriveMasterKey(oldPassword, salt);

    try {
      KeyManager.decryptDatabaseKey(config.encrypted_db_key, masterKey);
    } catch {
      throw new ValidationError('Current password is incorrect');
    }
  }

  // Enter new password
  const newPassword = await readPassword('Enter new password: ');
  if (!KeyManager.validatePasswordStrength(newPassword)) {
    throw new ValidationError('Password is too weak: use at least 8 characters, including letters and numbers');
  }

  const confirmPassword = await readPassword('Confirm password: ');
  if (newPassword !== confirmPassword) {
    throw new ValidationError('Passwords do not match');
  }

  // Generate new encryption key
  const salt = KeyManager.generateSalt();
  const masterKey = KeyManager.deriveMasterKey(newPassword, salt);

  // Generate new database key
  const dbKey = KeyManager.generateDatabaseKey();
  const encryptedDbKey = KeyManager.encryptDatabaseKey(dbKey, masterKey);

  // Update configuration
  config.salt = salt.toString('base64');
  config.encrypted_db_key = encryptedDbKey;

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green('\\n✅ Master password set successfully!\\n'));
  console.log(chalk.gray('From now on, you will need to enter the password when using Corivo.'));
  console.log(chalk.gray('Database contents are now encrypted.\\n'));
}
