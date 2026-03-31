/**
 * CLI command - save
 *
 * Saves information to Corivo as a memory block.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { validateAnnotation } from '../../models/index.js';
import { readPassword } from '../utils/password.js';
import { ConflictDetector } from '../../engine/conflict-detector.js';

interface SaveOptions {
  content?: string;
  annotation?: string;
  source?: string;
  pending?: boolean;
  noPassword?: boolean;
}

export async function saveCommand(options: SaveOptions): Promise<void> {
  // Read configuration
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  // Validate input
  if (!options.content) {
    throw new ValidationError('Missing --content argument');
  }

  // If there is no label and it is not in pending mode, prompt the user
  const annotation = options.annotation || (options.pending ? 'pending' : '');

  if (!options.pending && !annotation) {
    console.log(chalk.yellow('\n⚠️  No annotation provided, saving in pending mode'));
    console.log(chalk.gray('The heartbeat daemon will try to annotate it automatically later\n'));
  }

  // Only non-pending mode will verify the annotation format.
  if (annotation && annotation !== 'pending' && !validateAnnotation(annotation)) {
    throw new ValidationError(
      'Invalid annotation format. Expected "type · domain · tag", for example: "Decision · project · corivo"'
    );
  }

  // Decrypt database key (optional password)
  let dbKey: Buffer;
  const skipPassword = options.password === false || process.env.CORIVO_NO_PASSWORD === '1';

  if (skipPassword) {
    // Passwordless mode: use db_key from config if available
    if (config.db_key) {
      dbKey = Buffer.from(config.db_key, 'base64');
    } else if (config.encrypted_db_key) {
      // Encryption key available but password skipped: prompt user
      throw new ConfigError('The database is encrypted. Enter a password or remove --no-password');
    } else {
      // Old version compatibility: generate and save new keys
      dbKey = KeyManager.generateDatabaseKey();
      config.db_key = dbKey.toString('base64');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } else {
    const password = await readPassword('Enter master password: ', { allowEmpty: !process.stdin.isTTY });
    if (password === '') {
      // Empty password: try using db_key from config
      if (config.db_key) {
        dbKey = Buffer.from(config.db_key, 'base64');
      } else if (config.encrypted_db_key) {
        throw new ConfigError('The database is encrypted. Please enter the password');
      } else {
        dbKey = KeyManager.generateDatabaseKey();
        config.db_key = dbKey.toString('base64');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      }
    } else {
      // Decrypt using password
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const encryptedDbKey = config.encrypted_db_key;
      if (!encryptedDbKey) {
        throw new ConfigError('Password is not set. Please run: corivo setup-password');
      }
      dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);
    }
  }

  // Open database
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey, enableEncryption: config.encrypted_db_key !== undefined });

  // Create Block
  const block = db.createBlock({
    content: options.content,
    annotation: annotation || 'pending',
    source: options.source || 'cli',
  });

  // Detect inconsistencies (alert like a friend)
  const conflictDetector = new ConflictDetector();
  const existingBlocks = db.queryBlocks({ limit: 50 });
  const conflictReminder = conflictDetector.detect(options.content, existingBlocks);

  // Show results
  console.log(chalk.green('\n✅ Memory saved\n'));
  console.log(chalk.gray('ID:       ') + chalk.white(block.id));
  console.log(chalk.gray('Content:   ') + chalk.white(block.content));
  console.log(chalk.gray('Annotation:') + chalk.cyan(block.annotation));
  console.log(chalk.gray('Vitality:  ') + chalk.yellow('100 (active)'));
  console.log();

  // If there is any conflict, please give a friendly reminder
  if (conflictReminder && conflictReminder.hasConflict) {
    console.log(chalk.yellow(conflictReminder.message));
    console.log();
  }
}
