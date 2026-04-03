import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { ConfigError } from '@/errors/index.js';

export interface RuntimeCommandOptions {
  password?: boolean;
  format?: 'text' | 'json' | 'hook-text';
}

export async function loadRuntimeDb(_options: RuntimeCommandOptions = {}): Promise<CorivoDatabase | null> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');
  const dbPath = getDefaultDatabasePath();

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    return null;
  }

  if (config.encrypted_db_key) {
    throw new ConfigError('Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init');
  }

  return CorivoDatabase.getInstance({
    path: dbPath,
    enableEncryption: false,
  });
}
