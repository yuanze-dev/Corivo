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
import { getConfigDir } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { printBanner } from '@/utils/banner';
import { ConfigError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';
import { getCliOutput } from '@/cli/runtime';

interface VerifyIdentityOptions {
  verbose?: boolean;
}

export async function verifyIdentityCommand(options: VerifyIdentityOptions = {}): Promise<void> {
  const output = getCliOutput();
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
  output.info(chalk.gray('Current identity ID: ') + chalk.white(identity.identity_id));
  output.info(chalk.gray('Created at: ') + chalk.gray(new Date(identity.created_at).toLocaleString('en-US')));
  output.info('');

  // Initialize the fingerprint collector
  initializeDefaultSoftwareConfigs();
  const currentFingerprints = await DynamicFingerprintCollector.collectAll();
  const fingerprintValues = currentFingerprints.map(fp => fp.value);

  output.info(chalk.cyan(`📸 Collected ${currentFingerprints.length} fingerprints:`));
  for (const fp of currentFingerprints) {
    const confidence = fp.confidence === 'high' ? '🔴' : fp.confidence === 'medium' ? '🟡' : '🟢';
    output.info(`  ${confidence} ${fp.platform}: ${fp.value.substring(0, 8)}...`);
  }
  output.info('');

  // Load target identity
  const identityManager = new IdentityManager(configDir);
  await identityManager.load();

  // Match fingerprint
  const matchResult = identityManager.matchIdentity(currentFingerprints);

  output.info(chalk.cyan('🔍 Fingerprint match results:'));
  output.info(`  Match score: ${(matchResult.confidence * 100).toFixed(0)}/100`);
  output.info(`  Matched platforms: ${matchResult.matched_platforms.join(', ') || 'none'}`);
  output.info(`  Match status: ${matchResult.matched ? chalk.green('✓ Matched') : chalk.red('✗ Not matched')}`);
  output.info('');

  // If fingerprint match is insufficient, request password verification
  if (!matchResult.matched || matchResult.confidence < 0.6) {
    output.warn(chalk.yellow('⚠️  Fingerprint match is insufficient, password verification is required\\n'));

    // If a password is set
    if (config.encrypted_db_key) {
      const password = await readPassword('Enter master password: ');

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

        output.info(chalk.cyan('\\n🔐 Combined verification result:'));
        output.info(`  Method: ${result.method}`);
        output.info(`  Confidence: ${result.confidence}`);
        output.info(`  Status: ${result.success ? chalk.green('✓ Passed') : chalk.red('✗ Failed')}`);

        if (result.success) {
          output.success(chalk.green('\\n✅ Identity verification successful!\\n'));
          output.info(chalk.gray('You have proven that you are the legitimate owner of this identity.'));
        } else {
          output.error(chalk.red('\\n❌ Identity verification failed\\n'));
          output.info(chalk.gray('Neither fingerprints nor password matched, so identity could not be verified.'));
        }
      } catch {
        output.error(chalk.red('\\n❌ Incorrect password\\n'));
      }
    } else {
      output.warn(chalk.yellow('Tip: no master password is set yet. Please run: corivo setup-password\\n'));
    }
  } else {
    output.success(chalk.green('\\n✅ Fingerprint verification passed!\\n'));
    output.info(chalk.gray('Identity has been verified through fingerprint recognition.'));
  }
}
