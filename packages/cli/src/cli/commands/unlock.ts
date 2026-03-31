/**
 * CLI command - unlock
 *
 * Unlock and view database contents
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { KeyManager } from '../../crypto/keys.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

/**
 * Simple form printing
 */
function printTable(headers: string[], rows: string[][]): void {
  // Calculate the maximum width of each column
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => r[i]?.length || 0));
    return Math.max(h.length, maxRowWidth);
  });

  // Print header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '─'.repeat(w)).join('─┼─');

  console.log(chalk.gray(headerRow));
  console.log(chalk.gray(separator));

  // Print data lines
  for (const row of rows) {
    const paddedRow = row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' | ');
    console.log(paddedRow);
  }
}

interface UnlockOptions {
  raw?: boolean;
  limit?: number;
}

export async function unlockCommand(options: UnlockOptions = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  // Read configuration
  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  // Check if a password is required
  const needsPassword = config.encrypted_db_key !== undefined;

  let dbKey: Buffer;

  if (needsPassword) {
    console.log('\\nThe database is encrypted. Enter the password to unlock it.\\n');
    const password = await readPassword('Password: ');

    const salt = Buffer.from(config.salt, 'base64');
    const masterKey = KeyManager.deriveMasterKey(password, salt);

    try {
      dbKey = KeyManager.decryptDatabaseKey(config.encrypted_db_key, masterKey);
    } catch {
      throw new ValidationError('Incorrect password');
    }
  } else {
    dbKey = KeyManager.generateDatabaseKey();
  }

  // Open database
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({
    path: dbPath,
    key: dbKey,
    enableEncryption: needsPassword,
  });

  // Get all blocks
  const blocks = db.queryBlocks({ limit: options.limit || 100 });

  console.log(chalk.green(`\\n✓ Found ${blocks.length} memories\\n`));

  if (options.raw) {
    // raw output
    for (const block of blocks) {
      console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.gray('ID:       ') + chalk.white(block.id));
      console.log(chalk.gray('Content:   ') + chalk.white(block.content));
      console.log(chalk.gray('Annotation:') + chalk.cyan(block.annotation));
      console.log(chalk.gray('Source:    ') + chalk.yellow(block.source));
      console.log(chalk.gray('Vitality:  ') + chalk.green(String(block.vitality)));
      console.log(chalk.gray('Status:    ') + chalk.blue(block.status));
      console.log(chalk.gray('Created at:') + chalk.gray(new Date(block.created_at * 1000).toLocaleString('en-US')));
      console.log();
    }
  } else {
    // Table output
    const headers = ['ID', 'Content', 'Annotation', 'Vitality'];
    const rows = blocks.map(b => [
      b.id.slice(0, 12),
      b.content.length > 40 ? b.content.slice(0, 40) + '...' : b.content,
      b.annotation,
      String(b.vitality),
    ]);
    printTable(headers, rows);
    console.log();
  }
}
