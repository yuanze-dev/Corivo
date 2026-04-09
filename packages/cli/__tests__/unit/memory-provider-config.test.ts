import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorivoConfig } from '../../src/config.js';
import { loadConfig } from '../../src/config.js';
import { ConfigError } from '../../src/domain/errors/index.js';
import { resolveMemoryProvider } from '../../src/domain/memory/providers/resolve-memory-provider.js';
import { createLocalMemoryProvider } from '../../src/domain/memory/providers/local-memory-provider.js';

describe('memory provider config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-config-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(data));
  }

  it('treats missing memoryEngine as undefined when loading config', async () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'local-test',
    };
    await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(config));
    const loaded = await loadConfig(tempDir);
    expect(loaded?.memoryEngine).toBeUndefined();
  });

  it('returns null when identity_id is missing', async () => {
    const fileData = { version: '1', created_at: '2026-01-01' };
    await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(fileData));
    const loaded = await loadConfig(tempDir);
    expect(loaded).toBeNull();
  });

  it('returns parsed config with memoryEngine when valid', async () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'sm-test',
      memoryEngine: {
        provider: 'supermemory',
        supermemory: { apiKey: 'sm_test', containerTag: 'project.test.abc' },
      },
    };
    await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(config));
    const loaded = await loadConfig(tempDir);
    expect(loaded).toEqual(config);
  });

  it('rejects unknown memory engine provider strings', async () => {
    await writeConfig({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'bad-provider',
      memoryEngine: { provider: 'quantum' },
    });
    const loaded = await loadConfig(tempDir);
    expect(loaded).toBeNull();
  });

  it('rejects supermemory configs missing apiKey', async () => {
    await writeConfig({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'missing-api',
      memoryEngine: {
        provider: 'supermemory',
        supermemory: { containerTag: 'project:foo' },
      },
    });
    const loaded = await loadConfig(tempDir);
    expect(loaded).toBeNull();
  });

  it('rejects supermemory configs missing containerTag', async () => {
    await writeConfig({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'missing-tag',
      memoryEngine: {
        provider: 'supermemory',
        supermemory: { apiKey: 'sm_test' },
      },
    });
    const loaded = await loadConfig(tempDir);
    expect(loaded).toBeNull();
  });
});

describe('supermemory config command', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-sm-cmd-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('corivo supermemory set-key persists apiKey into config.json', async () => {
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { containerTag: 'project.test' },
        },
      }),
    );

    const { createProgram } = await import('../../src/cli/index.js');
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(['supermemory', 'set-key', 'sm_test_key'], { from: 'user' });

    const saved = JSON.parse(
      await fs.readFile(path.join(tempHome, '.corivo', 'config.json'), 'utf-8'),
    ) as any;

    expect(saved.memoryEngine?.supermemory?.apiKey).toBe('sm_test_key');
    expect(saved.memoryEngine?.supermemory?.containerTag).toBe('project.test');
  });

  it('corivo supermemory status reports configured when resolver accepts config', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
    );

    const { createProgram } = await import('../../src/cli/index.js');
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(['supermemory', 'status'], { from: 'user' });

    const output = log.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('configured: yes');

    log.mockRestore();
  });

  it('corivo supermemory status reports not configured when config is missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { containerTag: 'project.test' },
        },
      }),
    );

    const { createProgram } = await import('../../src/cli/index.js');
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(['supermemory', 'status'], { from: 'user' });

    const output = log.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('configured: no');

    log.mockRestore();
  });

  it('corivo supermemory status reports not configured when config is non-empty but invalid', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-test',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project:invalid' },
        },
      }),
    );

    const { createProgram } = await import('../../src/cli/index.js');
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(['supermemory', 'status'], { from: 'user' });

    const output = log.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('configured: no');

    log.mockRestore();
  });

  it('corivo supermemory status reports malformed config when config.json is broken JSON', async () => {
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      '{"version":"1","created_at":"2026-01-01","identity_id":"sm-test"',
    );

    const { createProgram } = await import('../../src/cli/index.js');
    const program = createProgram();
    program.exitOverride();

    await expect(
      program.parseAsync(['supermemory', 'status'], { from: 'user' }),
    ).rejects.toThrow('Corivo config is malformed. Please fix ~/.corivo/config.json');
  });
});

describe('createProgram wiring', () => {
  it('uses app-provided save command instead of hardcoded top-level save', async () => {
    const { createProgram } = await import('../../src/cli/index.js');
    const called: Array<string> = [];

    const save = new (await import('commander')).Command('save')
      .option('-c, --content <text>')
      .action((opts: any) => {
        called.push(String(opts.content ?? ''));
      });

    const { Command } = await import('commander');
    const app = {
      commands: {
        memory: new Command('memory'),
        host: new Command('host'),
        daemon: new Command('daemon'),
        query: new Command('query'),
        save,
        supermemory: new Command('supermemory'),
      },
      capabilities: { logger: { debug: () => {} } },
    } as any;

    const program = createProgram({ app });
    program.exitOverride();

    await program.parseAsync(['save', '--content', 'hello'], { from: 'user' });
    expect(called).toEqual(['hello']);
  });
});

describe('resolveMemoryProvider', () => {
  it('defaults to local when memoryEngine is missing', () => {
    const provider = resolveMemoryProvider({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'local-test',
    });
    expect(provider.provider).toBe('local');
  });

  it('resolves local provider explicitly', () => {
    const provider = resolveMemoryProvider({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'local-test',
      memoryEngine: { provider: 'local' },
    });
    expect(provider.provider).toBe('local');
  });

  it('throws a clear config error when supermemory config is missing', () => {
    const config = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'sm-test',
      memoryEngine: { provider: 'supermemory' },
    } as unknown as CorivoConfig;

    expect(() => resolveMemoryProvider(config)).toThrow(ConfigError);
    expect(() => resolveMemoryProvider(config)).toThrow('Supermemory is configured incorrectly');
  });

  it('returns a real supermemory provider when supermemory config is valid', () => {
    const provider = resolveMemoryProvider({
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'sm-test',
      memoryEngine: {
        provider: 'supermemory',
        supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
      },
    });

    expect(provider.provider).toBe('supermemory');
  });

  it('throws a clear config error for unknown provider strings', () => {
    const config = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'bad-provider',
      memoryEngine: { provider: 'quantum' },
    } as unknown as CorivoConfig;

    expect(() => resolveMemoryProvider(config)).toThrow(ConfigError);
  });
});

describe('local provider healthcheck', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-local-health-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('reports not ok when local config is missing', async () => {
    const provider = createLocalMemoryProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
  });

  it('reports not ok (invalid) when local config.json is malformed JSON', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      '{"version": "1",',
    );

    const provider = createLocalMemoryProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.message).toContain('invalid');
  });

  it('reports ok when local config/DB can be opened', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({ version: '1', created_at: '2026-01-01', identity_id: 'test' }),
    );

    const provider = createLocalMemoryProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('local');
  });

  it('reports not ok when local config exists but is incomplete (identity-only should not be healthy)', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({ identity_id: 'test' }),
    );

    const provider = createLocalMemoryProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
  });

  it('does not report local healthy when memoryEngine.provider is supermemory (remote-only setup)', async () => {
    await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.corivo', 'config.json'),
      JSON.stringify({
        version: '1',
        created_at: '2026-01-01',
        identity_id: 'sm-only',
        memoryEngine: {
          provider: 'supermemory',
          supermemory: { apiKey: 'sm_test', containerTag: 'project.test' },
        },
      }),
    );

    const provider = createLocalMemoryProvider();
    const result = await provider.healthcheck();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.message).toContain('disabled');
  });
});
