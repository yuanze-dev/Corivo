import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/errors/index.js';
import { loadRuntimeDb } from '../../src/runtime/runtime-support.js';
import {
  getConfigDir,
  getDefaultDatabasePath,
  getPidFilePath,
} from '@/infrastructure/storage/lifecycle/database-paths.js';

describe('loadRuntimeDb', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-runtime-support-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('throws a config error when only encrypted_db_key exists in no-password mode', async () => {
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({ encrypted_db_key: 'ciphertext' }, null, 2),
    );

    await expect(loadRuntimeDb({ password: false })).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('workspace paths', () => {
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HOME;
    process.env.HOME = '/tmp/corivo-home';
  });

  afterEach(() => {
    process.env.HOME = previousHome;
  });

  it('uses ~/.corivo as the canonical config workspace', () => {
    expect(getConfigDir()).toBe('/tmp/corivo-home/.corivo');
    expect(getDefaultDatabasePath()).toBe('/tmp/corivo-home/.corivo/corivo.db');
    expect(getPidFilePath()).toBe('/tmp/corivo-home/.corivo/heartbeat.pid');
  });
});
