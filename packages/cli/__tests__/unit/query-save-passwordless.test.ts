import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorivoDatabase } from '@/storage/database';
import type { Block } from '../../src/domain/memory/models/block.js';
import type { MemoryProvider } from '../../src/domain/memory/providers/types.js';

const { readPassword } = vi.hoisted(() => ({
  readPassword: vi.fn(),
}));

vi.mock('../../src/cli/utils/password.js', () => ({
  readPassword,
}));

import { createCliApp } from '../../src/application/bootstrap/create-cli-app.js';

const { resolveMemoryProvider } = vi.hoisted(() => ({
  resolveMemoryProvider: vi.fn(),
}));

vi.mock('../../src/domain/memory/providers/resolve-memory-provider.js', async () => {
  const actual = await vi.importActual<object>('../../src/domain/memory/providers/resolve-memory-provider.js');
  return {
    ...actual,
    resolveMemoryProvider,
  };
});

describe('save/query commands passwordless flow', () => {
  let tempHome: string;
  let previousHome: string | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let actualResolveMemoryProvider: ((config?: unknown) => unknown) | null = null;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-query-save-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    delete process.env.CORIVO_NO_PASSWORD;

    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify(
        {
          version: '1',
          created_at: '2026-04-04',
          identity_id: 'test-id',
        },
        null,
        2,
      ),
    );

    readPassword.mockReset();
    const actual = await vi.importActual<any>('../../src/domain/memory/providers/resolve-memory-provider.js');
    actualResolveMemoryProvider = actual.resolveMemoryProvider;
    resolveMemoryProvider.mockReset();
    resolveMemoryProvider.mockImplementation((config: unknown) => actualResolveMemoryProvider?.(config));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    CorivoDatabase.closeAll();
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('saveCommand saves without prompting for a password', async () => {
    const app = createCliApp();
    await app.commands.save.parseAsync(
      ['--content', '决定继续使用 SQLite 作为本地存储', '--annotation', '决策 · project · storage'],
      { from: 'user' },
    );

    expect(readPassword).not.toHaveBeenCalled();

    const config = JSON.parse(await fs.readFile(path.join(tempHome, '.corivo', 'config.json'), 'utf-8'));
    expect(Object.keys(config)).not.toContain('db_key');
  });

  it('query command queries without prompting for a password', async () => {
    const app = createCliApp();
    await app.commands.save.parseAsync(
      ['--content', '决定继续使用 SQLite 作为本地存储', '--annotation', '决策 · project · storage'],
      { from: 'user' },
    );
    await app.commands.query.parseAsync(['SQLite', '--format', 'json'], { from: 'user' });

    expect(readPassword).not.toHaveBeenCalled();

    const config = JSON.parse(await fs.readFile(path.join(tempHome, '.corivo', 'config.json'), 'utf-8'));
    expect(Object.keys(config)).not.toContain('db_key');
  });

  it('remote-provider query runs passwordless and does not create/open the local DB', async () => {
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify(
        {
          version: '1',
          created_at: '2026-04-04',
          identity_id: 'test-id',
          memoryEngine: {
            provider: 'supermemory',
            supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
          },
        },
        null,
        2,
      ),
    );

    const blocks: Block[] = [
      {
        id: 'blk_sm_1',
        content: 'supermemory result',
        annotation: '事实 · project · test',
        refs: [],
        source: 'supermemory',
        vitality: 90,
        status: 'active',
        access_count: 0,
        last_accessed: null,
        created_at: 1_700_000_000,
        updated_at: 1_700_000_000,
      },
    ];

    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      save: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
      search: vi.fn(async () => blocks),
      recall: vi.fn(async () => null),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    } satisfies MemoryProvider);

    const app = createCliApp();
    await app.commands.query.parseAsync(['supermemory', '--format', 'json'], { from: 'user' });

    expect(readPassword).not.toHaveBeenCalled();
    await expect(fs.access(path.join(tempHome, '.corivo', 'corivo.db'))).rejects.toBeTruthy();
  });
});
