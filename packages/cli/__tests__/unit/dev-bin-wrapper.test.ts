import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dev bin wrapper', () => {
  it('provides an executable corivo wrapper alongside corivo.js', async () => {
    const wrapperPath = path.resolve(process.cwd(), 'bin', 'corivo');
    const body = await readFile(wrapperPath, 'utf8');

    await expect(access(wrapperPath, constants.X_OK)).resolves.toBeUndefined();
    expect(body).toContain('corivo.js');
  });
});
