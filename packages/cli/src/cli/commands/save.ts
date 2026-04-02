/**
 * CLI command - save
 *
 * Saves information to Corivo as a memory block.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { validateAnnotation } from '../../models/index.js';
import { ConflictDetector } from '../../engine/conflict-detector.js';
import { createCliContext } from '../context/create-context.js';

interface SaveOptions {
  content?: string;
  annotation?: string;
  source?: string;
  pending?: boolean;
}

export async function saveCommand(options: SaveOptions): Promise<void> {
  const context = createCliContext();
  const output = context.output;
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
    output.warn(chalk.yellow('\n⚠️  No annotation provided, saving in pending mode'));
    output.info(chalk.gray('The heartbeat daemon will try to annotate it automatically later\n'));
  }

  // Only non-pending mode will verify the annotation format.
  if (annotation && annotation !== 'pending' && !validateAnnotation(annotation)) {
    throw new ValidationError(
      'Invalid annotation format. Expected "type · domain · tag", for example: "Decision · project · corivo"'
    );
  }

  if (config.encrypted_db_key) {
    throw new ConfigError('Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init');
  }

  // Open database
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false });

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
  output.success(chalk.green('\n✅ Memory saved\n'));
  output.info(chalk.gray('ID:       ') + chalk.white(block.id));
  output.info(chalk.gray('Content:   ') + chalk.white(block.content));
  output.info(chalk.gray('Annotation:') + chalk.cyan(block.annotation));
  output.info(chalk.gray('Vitality:  ') + chalk.yellow('100 (active)'));
  output.info('');

  // If there is any conflict, please give a friendly reminder
  if (conflictReminder && conflictReminder.hasConflict) {
    output.warn(chalk.yellow(conflictReminder.message));
    output.info('');
  }
}
