/**
 * CLI command - verify-identity
 *
 * Cross-device authentication (fingerprint + password federation)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { KeyManager } from '../../crypto/keys.js';
import { JointVerifier } from '../../identity/auth.js';
import { IdentityManager } from '../../identity/identity.js';
import { DynamicFingerprintCollector, initializeDefaultSoftwareConfigs } from '../../identity/collector.js';
import { getConfigDir } from '@/storage/database';
import { printBanner } from '@/utils/banner';
import { ConfigError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

interface VerifyIdentityOptions {
  password?: string;
  verbose?: boolean;
}

export async function verifyIdentityCommand(options: VerifyIdentityOptions = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');
  const identityPath = path.join(configDir, 'identity.json');

  // Read configuration
  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  // read identity
  let identity: any;
  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    identity = JSON.parse(content);
  } catch {
    throw new ConfigError('Identity information not found. Please run: corivo init');
  }

  printBanner('Cross-Device Identity Verification', { width: 55 });

  // Show current identity information
  console.log(chalk.gray('Current identity ID: ') + chalk.white(identity.identity_id));
  console.log(chalk.gray('Created at: ') + chalk.gray(new Date(identity.created_at).toLocaleString('en-US')));
  console.log();

  // Initialize the fingerprint collector
  initializeDefaultSoftwareConfigs();
  const currentFingerprints = await DynamicFingerprintCollector.collectAll();
  const fingerprintValues = currentFingerprints.map(fp => fp.value);

  console.log(chalk.cyan(`📸 Collected ${currentFingerprints.length} fingerprints:`));
  for (const fp of currentFingerprints) {
    const confidence = fp.confidence === 'high' ? '🔴' : fp.confidence === 'medium' ? '🟡' : '🟢';
    console.log(`  ${confidence} ${fp.platform}: ${fp.value.substring(0, 8)}...`);
  }
  console.log();

  // Load target identity
  const identityManager = new IdentityManager(configDir);
  await identityManager.load();

  // Match fingerprint
  const matchResult = identityManager.matchIdentity(currentFingerprints);

  console.log(chalk.cyan('🔍 Fingerprint match results:'));
  console.log(`  Match score: ${(matchResult.confidence * 100).toFixed(0)}/100`);
  console.log(`  Matched platforms: ${matchResult.matched_platforms.join(', ') || 'none'}`);
  console.log(`  Match status: ${matchResult.matched ? chalk.green('✓ Matched') : chalk.red('✗ Not matched')}`);
  console.log();

  // If fingerprint match is insufficient, request password verification
  if (!matchResult.matched || matchResult.confidence < 0.6) {
    console.log(chalk.yellow('⚠️  Fingerprint match is insufficient, password verification is required\\n'));

    // If a password is set
    if (config.encrypted_db_key) {
      const password = options.password || await readPassword('Enter master password: ');

      // Verify password
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);

      try {
        KeyManager.decryptDatabaseKey(config.encrypted_db_key, masterKey);

        // Password is correct, use federated authentication
        const verifier = new JointVerifier();
        const result = await verifier.verify(
          fingerprintValues,
          identity,
          password
        );

        console.log(chalk.cyan('\\n🔐 Combined verification result:'));
        console.log(`  Method: ${result.method}`);
        console.log(`  Confidence: ${result.confidence}`);
        console.log(`  Status: ${result.success ? chalk.green('✓ Passed') : chalk.red('✗ Failed')}`);

        if (result.success) {
          console.log(chalk.green('\\n✅ Identity verification successful!\\n'));
          console.log(chalk.gray('You have proven that you are the legitimate owner of this identity.'));
        } else {
          console.log(chalk.red('\\n❌ Identity verification failed\\n'));
          console.log(chalk.gray('Neither fingerprints nor password matched, so identity could not be verified.'));
        }
      } catch {
        console.log(chalk.red('\\n❌ Incorrect password\\n'));
      }
    } else {
      console.log(chalk.yellow('Tip: no master password is set yet. Please run: corivo setup-password\\n'));
    }
  } else {
    console.log(chalk.green('\\n✅ Fingerprint verification passed!\\n'));
    console.log(chalk.gray('Identity has been verified through fingerprint recognition.'));
  }
}
