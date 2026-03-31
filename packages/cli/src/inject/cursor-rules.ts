import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyHostAsset, readHostTemplateText } from './host-assets.js';

export async function getCursorRuleTemplate(): Promise<string> {
  return readHostTemplateText('cursor', 'templates/corivo.mdc');
}

export async function injectGlobalCursorRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const cursorDir = path.join(home, '.cursor');
  const rulesDir = path.join(home, '.cursor', 'rules');
  const filePath = path.join(rulesDir, 'corivo.mdc');
  const cliConfigPath = path.join(cursorDir, 'cli-config.json');
  const settingsPath = path.join(cursorDir, 'settings.json');
  const adapterDir = path.join(cursorDir, 'corivo');

  try {
    const template = await getCursorRuleTemplate();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, template, 'utf8');
    await installCursorHookScripts(adapterDir);
    await ensureCursorCliPermissions(cliConfigPath);
    await ensureCursorHooks(settingsPath, adapterDir);
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensureCursorCliPermissions(cliConfigPath: string): Promise<void> {
  let config: {
    version?: number;
    permissions?: {
      allow?: string[];
      deny?: string[];
    };
    [key: string]: unknown;
  } = {};

  try {
    const content = await fs.readFile(cliConfigPath, 'utf8');
    config = JSON.parse(content);
  } catch {
    config = {
      version: 1,
      editor: {
        vimMode: false,
      },
      hasChangedDefaultModel: false,
    };
  }

  const allow = new Set(config.permissions?.allow ?? []);
  allow.add('Shell(corivo)');

  config.permissions = {
    allow: Array.from(allow),
    deny: config.permissions?.deny ?? [],
  };

  if (!('editor' in config) || typeof config.editor !== 'object' || config.editor === null) {
    config.editor = {
      vimMode: false,
    };
  }

  if (typeof (config.editor as { vimMode?: unknown }).vimMode !== 'boolean') {
    (config.editor as { vimMode: boolean }).vimMode = false;
  }

  if (typeof config.hasChangedDefaultModel !== 'boolean') {
    config.hasChangedDefaultModel = false;
  }

  await fs.mkdir(path.dirname(cliConfigPath), { recursive: true });
  await fs.writeFile(cliConfigPath, JSON.stringify(config, null, 2), 'utf8');
}

async function installCursorHookScripts(adapterDir: string): Promise<void> {
  const files = [
    'session-carry-over.sh',
    'prompt-recall.sh',
    'stop-review.sh',
  ];

  for (const fileName of files) {
    await copyHostAsset('cursor', `hooks/scripts/${fileName}`, path.join(adapterDir, fileName), {
      mode: 0o755,
    });
  }
}

async function ensureCursorHooks(settingsPath: string, adapterDir: string): Promise<void> {
  let settings: {
    hooks?: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>;
    [key: string]: unknown;
  } = {};

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    settings = JSON.parse(content);
  } catch {
    settings = {};
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  upsertHookCommand(settings.hooks, 'SessionStart', `bash ${path.join(adapterDir, 'session-carry-over.sh')}`, 5);
  upsertHookCommand(settings.hooks, 'UserPromptSubmit', `bash ${path.join(adapterDir, 'prompt-recall.sh')}`, 10);
  upsertHookCommand(settings.hooks, 'Stop', `bash ${path.join(adapterDir, 'stop-review.sh')}`, 5);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function upsertHookCommand(
  hooks: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>,
  event: string,
  command: string,
  timeout: number,
): void {
  const groups = hooks[event] ?? [{ hooks: [] }];
  const firstGroup = groups[0] ?? { hooks: [] };
  const commands = firstGroup.hooks ?? [];

  if (!commands.some((hook) => hook.command === command)) {
    commands.push({
      type: 'command',
      command,
      timeout,
    });
  }

  firstGroup.hooks = commands;
  groups[0] = firstGroup;
  hooks[event] = groups;
}
