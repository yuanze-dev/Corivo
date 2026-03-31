import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError } from '../../errors/index.js';

export interface RuntimeCommandOptions {
  password?: boolean;
  format?: 'text' | 'json' | 'hook-text';
}

export async function loadRuntimeDb(options: RuntimeCommandOptions = {}): Promise<CorivoDatabase | null> {
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

  const skipPassword = options.password === false || process.env.CORIVO_NO_PASSWORD === '1';
  if (!skipPassword) {
    throw new ConfigError('Runtime memory commands require no-password mode or an external database key');
  }

  let dbKey: Buffer;
  const envDbKey = process.env.CORIVO_DB_KEY;
  if (envDbKey) {
    dbKey = Buffer.from(envDbKey, 'base64');
  } else if (config.db_key) {
    dbKey = Buffer.from(config.db_key, 'base64');
  } else if (config.encrypted_db_key) {
    throw new ConfigError('The database is encrypted. Provide CORIVO_DB_KEY or remove --no-password');
  } else {
    dbKey = KeyManager.generateDatabaseKey();
    config.db_key = dbKey.toString('base64');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  return CorivoDatabase.getInstance({
    path: dbPath,
    key: dbKey,
    enableEncryption: config.encrypted_db_key !== undefined,
  });
}
