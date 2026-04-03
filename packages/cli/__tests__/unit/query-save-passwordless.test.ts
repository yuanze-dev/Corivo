import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorivoDatabase } from '../../src/storage/database.js';

const { readPassword } = vi.hoisted(() => ({
  readPassword: vi.fn(),
}));

vi.mock('../../src/cli/utils/password.js', () => ({
  readPassword,
}));

import { saveCommand } from '../../src/cli/commands/save.js';
import { createQueryCommand } from '../../src/cli/commands/query.js';
import { runSearchQueryCommand } from '../../src/application/bootstrap/query-execution.js';

describe('save/query commands passwordless flow', () => {
  let tempHome: string;
  let previousHome: string | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-query-save-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    delete process.env.CORIVO_NO_PASSWORD;

    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({}, null, 2),
    );

    readPassword.mockReset();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    CorivoDatabase.closeAll();
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('saveCommand saves without prompting for a password', async () => {
    await saveCommand({
      content: '决定继续使用 SQLite 作为本地存储',
      annotation: '决策 · project · storage',
    });

    expect(readPassword).not.toHaveBeenCalled();

    const config = JSON.parse(await fs.readFile(path.join(tempHome, '.corivo', 'config.json'), 'utf-8'));
    expect(Object.keys(config)).not.toContain('db_key');
  });

  it('query command queries without prompting for a password', async () => {
    await saveCommand({
      content: '决定继续使用 SQLite 作为本地存储',
      annotation: '决策 · project · storage',
    });

    const queryCommand = createQueryCommand({
      runPromptQuery: async () => '',
      runSearchQuery: (input) => runSearchQueryCommand(input),
      writeOutput: () => {},
    });
    await queryCommand.parseAsync(['SQLite'], { from: 'user' });

    expect(readPassword).not.toHaveBeenCalled();

    const config = JSON.parse(await fs.readFile(path.join(tempHome, '.corivo', 'config.json'), 'utf-8'));
    expect(Object.keys(config)).not.toContain('db_key');
  });
});
