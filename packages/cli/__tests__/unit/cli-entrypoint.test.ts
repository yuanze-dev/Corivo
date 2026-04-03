import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isCliEntrypoint } from '../../src/cli/index.js';

describe('CLI entrypoint detection', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('treats a symlinked bin path as the CLI entrypoint', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-cli-entrypoint-'));
    const realBinPath = path.join(tempDir, 'lib', 'node_modules', 'corivo', 'bin', 'corivo.js');
    const symlinkBinPath = path.join(tempDir, 'bin', 'corivo');

    await fs.mkdir(path.dirname(realBinPath), { recursive: true });
    await fs.mkdir(path.dirname(symlinkBinPath), { recursive: true });
    await fs.writeFile(realBinPath, '#!/usr/bin/env node\n', 'utf8');
    await fs.symlink(realBinPath, symlinkBinPath);

    expect(await isCliEntrypoint(symlinkBinPath, realBinPath, realBinPath)).toBe(true);
  });
});
