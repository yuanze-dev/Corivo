import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigError } from '@/domain/errors/index.js';

export async function readMemoryPipelineConfig(
  configDir: string,
): Promise<{ encrypted_db_key?: string }> {
  const configPath = path.join(configDir, 'config.json');
  let payload: string;

  try {
    payload = await fs.readFile(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new ConfigError('Corivo is not initialized. Please run: corivo init');
    }
    throw error;
  }

  let config: { encrypted_db_key?: string };
  try {
    config = JSON.parse(payload) as { encrypted_db_key?: string };
  } catch (error) {
    throw new ConfigError(
      `Unable to parse Corivo config: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (config.encrypted_db_key) {
    throw new ConfigError(
      'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init'
    );
  }

  return config;
}
