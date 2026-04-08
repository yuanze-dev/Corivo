import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../src/domain/errors/index.js';
import { createSaveMemoryUseCase } from '../../src/application/memory/save-memory.js';
import type { MemoryProvider } from '../../src/domain/memory/providers/types.js';
import { createSaveCommand } from '../../src/cli/commands/save.js';
import { createCliApp } from '../../src/application/bootstrap/create-cli-app.js';
import type { Block } from '../../src/domain/memory/models/block.js';

const { resolveMemoryProvider } = vi.hoisted(() => ({
  resolveMemoryProvider: vi.fn(),
}));

vi.mock('../../src/domain/memory/providers/resolve-memory-provider.js', () => ({
  resolveMemoryProvider,
}));

describe('save-memory use-case', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-save-memory-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
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
    resolveMemoryProvider.mockReset();
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('sends content/annotation/source to the resolved provider', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_123',
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'supermemory',
          save: providerSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'supermemory' }),
        };
        return provider;
      },
    });

    const result = await saveMemory({
      content: '决定继续使用 SQLite 作为本地存储',
      annotation: '决策 · project · storage',
      source: 'cli',
    });

    expect(providerSave).toHaveBeenCalledTimes(1);
    expect(providerSave).toHaveBeenCalledWith({
      content: '决定继续使用 SQLite 作为本地存储',
      annotation: '决策 · project · storage',
      source: 'cli',
    });
    expect(result.provider).toBe('supermemory');
    expect(result.id).toBe('sm_123');
    expect(result.local).toBeUndefined();
  });

  it('rejects whitespace-only content with the same validation error as missing content', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_456',
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'supermemory',
          save: providerSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'supermemory' }),
        };
        return provider;
      },
    });

    await expect(
      saveMemory({
        content: '   ',
        annotation: '事实 · project · remote',
        source: 'cli',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(providerSave).not.toHaveBeenCalled();
  });

  it('fails invalid annotation before provider write', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_123',
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'supermemory',
          save: providerSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'supermemory' }),
        };
        return provider;
      },
    });

    await expect(
      saveMemory({
        content: 'some content',
        annotation: 'invalid annotation',
        source: 'cli',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(providerSave).not.toHaveBeenCalled();
  });

  it('falls back to pending annotation (trimmed) before calling provider.save', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_pending',
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'supermemory',
          save: providerSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'supermemory' }),
        };
        return provider;
      },
    });

    await saveMemory({
      content: 'content',
      annotation: '   ',
      source: 'cli',
    });

    expect(providerSave).toHaveBeenCalledWith({
      content: 'content',
      annotation: 'pending',
      source: 'cli',
    });
  });

  it('--pending takes precedence over provided annotation and saves as pending', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_force_pending',
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'supermemory',
          save: providerSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'supermemory' }),
        };
        return provider;
      },
    });

    await saveMemory({
      content: 'content',
      annotation: '决策 · project · storage',
      source: 'cli',
      pending: true,
    });

    expect(providerSave).toHaveBeenCalledWith({
      content: 'content',
      annotation: 'pending',
      source: 'cli',
    });
  });

  it('stays provider-agnostic for local saves by carrying local-only fields through provider.save', async () => {
    const localProviderSave = vi.fn(async () => ({
      ok: true,
      provider: 'local' as const,
      id: 'blk_local_1',
      local: { id: 'blk_local_1', vitality: 77, status: 'active' as const },
      conflictReminder: {
        hasConflict: true,
        message: 'conflict detected',
        conflictingBlocks: [
          {
            id: 'blk_existing',
            content: 'old decision',
            annotation: '决策 · project · storage',
            refs: [],
            source: 'test',
            vitality: 90,
            status: 'active',
            access_count: 0,
            last_accessed: null,
            created_at: 1_700_000_000,
            updated_at: 1_700_000_000,
          } satisfies Block,
        ],
      },
    }));

    const saveMemory = createSaveMemoryUseCase({
      loadConfig: async () => ({
        version: '1',
        created_at: '2026-04-04',
        identity_id: 'test-id',
      }),
      resolveProvider: () => {
        const provider: MemoryProvider = {
          provider: 'local',
          save: localProviderSave,
          search: async () => [],
          recall: async () => null,
          healthcheck: async () => ({ ok: true, provider: 'local' }),
        };
        return provider;
      },
    });

    const result = await saveMemory({
      content: 'new decision',
      annotation: '决策 · project · storage',
      source: 'cli',
    });

    expect(localProviderSave).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('local');
    expect(result.local?.vitality).toBe(77);
    expect(result.conflictReminder?.hasConflict).toBe(true);
    expect(result.conflictReminder?.message).toBe('conflict detected');
  });
});

describe('save command UX + wiring', () => {
  let tempHome: string;
  let previousHome: string | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-save-wiring-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
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
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('warns when annotation is blank/whitespace-only and falls back to pending', async () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    };
    const saveMemory = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_ux',
      content: 'content',
      annotation: 'pending',
      source: 'cli',
      warnings: { pendingFallback: true },
    }));

    const cmd = createSaveCommand({ output, saveMemory });
    await cmd.parseAsync(['--content', 'content', '--annotation', '   '], { from: 'user' });

    expect(output.warn).toHaveBeenCalled();
    expect(saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        annotation: '   ',
        pending: undefined,
      }),
    );
  });

  it('createCliApp wires save command to provider boundary (non-local provider avoids local DB writes)', async () => {
    const providerSave = vi.fn(async () => ({
      ok: true,
      provider: 'supermemory' as const,
      id: 'sm_wired',
    }));

    resolveMemoryProvider.mockReturnValue({
      provider: 'supermemory',
      save: providerSave,
      search: vi.fn(async () => []),
      recall: vi.fn(async () => null),
      healthcheck: vi.fn(async () => ({ ok: true, provider: 'supermemory' })),
    } satisfies MemoryProvider);

    const app = createCliApp();
    await app.commands.save.parseAsync(
      ['--content', 'wired save', '--annotation', '事实 · project · wiring'],
      { from: 'user' },
    );

    expect(providerSave).toHaveBeenCalledTimes(1);

    const dbPath = path.join(tempHome, '.corivo', 'corivo.db');
    await expect(fs.access(dbPath)).rejects.toBeTruthy();
  });
});
