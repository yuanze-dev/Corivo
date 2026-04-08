import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { ConfigError } from '@/domain/errors/index.js';
import { getConfigDir } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';

export interface SupermemoryCommandDeps {
  writeInfo?: (text: string) => void;
  writeError?: (text: string) => void;
  writeSuccess?: (text: string) => void;
  logger?: { debug: (...args: unknown[]) => void };
}

function defaultWrite(text: string) {
  console.log(text);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getSupermemoryConfigured(config: any): { configured: boolean; error?: string } {
  const supermemory = config?.memoryEngine?.supermemory;
  if (!supermemory || typeof supermemory !== 'object') {
    return { configured: false };
  }

  try {
    const provider = resolveMemoryProvider({
      ...(typeof config === 'object' && config !== null ? config : {}),
      memoryEngine: { provider: 'supermemory', supermemory },
    } as any);

    if (provider.provider !== 'supermemory') {
      return { configured: false };
    }

    return { configured: true };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readRawConfigOrThrow(configDir: string): Promise<any> {
  const configPath = path.join(configDir, 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as any;
    if (parsed?.encrypted_db_key) {
      throw new ConfigError(
        'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init',
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }
}

async function writeRawConfig(configDir: string, config: unknown): Promise<void> {
  const configPath = path.join(configDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

export function createSupermemoryCommand(deps: SupermemoryCommandDeps = {}): Command {
  const resolved = {
    writeInfo: deps.writeInfo ?? defaultWrite,
    writeError: deps.writeError ?? defaultWrite,
    writeSuccess: deps.writeSuccess ?? defaultWrite,
    logger: deps.logger ?? { debug: () => {} },
  };

  const command = new Command('supermemory');
  command.description('Configure and diagnose the Supermemory memory engine');

  command
    .command('set-key')
    .description('Set Supermemory API key in config.json')
    .argument('<apiKey>', 'Supermemory API key')
    .action(async (apiKey: string) => {
      const configDir = getConfigDir();
      const config = await readRawConfigOrThrow(configDir);

      if (typeof config !== 'object' || config === null) {
        throw new ConfigError('Corivo config is invalid. Please run: corivo init');
      }

      config.memoryEngine = config.memoryEngine ?? { provider: 'local' };
      config.memoryEngine.supermemory = config.memoryEngine.supermemory ?? {};
      config.memoryEngine.supermemory.apiKey = apiKey;

      await writeRawConfig(configDir, config);
      resolved.writeSuccess('Supermemory API key saved to config.json.');
    });

  command
    .command('status')
    .description('Check whether Supermemory is configured')
    .action(async () => {
      const configDir = getConfigDir();
      const config = await readRawConfigOrThrow(configDir);

      const { configured, error } = getSupermemoryConfigured(config);

      const enabled = config?.memoryEngine?.provider === 'supermemory';
      const enabledText = enabled ? 'enabled' : 'not enabled';

      resolved.writeInfo(
        `Supermemory configured: ${configured ? 'yes' : 'no'} (${enabledText}).`,
      );

      if (!configured) {
        if (isNonEmptyString(error)) {
          resolved.writeInfo(`Reason: ${error}`);
        } else {
          resolved.writeInfo(
            'Missing/invalid supermemory settings: memoryEngine.supermemory.apiKey and/or memoryEngine.supermemory.containerTag.',
          );
        }
      }
    });

  return command;
}

export const supermemoryCommand = createSupermemoryCommand();
