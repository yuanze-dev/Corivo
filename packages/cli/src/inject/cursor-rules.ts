import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyHostAsset, readHostTemplateText } from './host-assets.js';
import type { HostDoctorResult, HostInstallResult } from '../hosts/types.js';

export async function getCursorRuleTemplate(): Promise<string> {
  return readHostTemplateText('cursor', 'templates/corivo.mdc');
}

const CURSOR_PERMISSION = 'Shell(corivo)';

type CursorHookCommand = { type: string; command: string; timeout: number };
type CursorHookGroups = Record<string, Array<{ hooks?: CursorHookCommand[] }>>;
type CursorSettings = {
  hooks?: CursorHookGroups;
  [key: string]: unknown;
};

export interface CursorPaths {
  homeDir: string;
  cursorDir: string;
  rulesDir: string;
  rulePath: string;
  cliConfigPath: string;
  settingsPath: string;
  adapterDir: string;
}

export function getCursorPaths(homeDir: string = process.env.HOME || os.homedir()): CursorPaths {
  const cursorDir = path.join(homeDir, '.cursor');
  const rulesDir = path.join(cursorDir, 'rules');

  return {
    homeDir,
    cursorDir,
    rulesDir,
    rulePath: path.join(rulesDir, 'corivo.mdc'),
    cliConfigPath: path.join(cursorDir, 'cli-config.json'),
    settingsPath: path.join(cursorDir, 'settings.json'),
    adapterDir: path.join(cursorDir, 'corivo'),
  };
}

export async function injectGlobalCursorRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const result = await installCursorHost();
  return {
    success: result.success,
    path: result.path,
    error: result.error,
  };
}

export async function installCursorHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getCursorPaths(homeDir);

  try {
    const template = await getCursorRuleTemplate();
    await fs.mkdir(paths.rulesDir, { recursive: true });
    await fs.writeFile(paths.rulePath, template, 'utf8');
    await installCursorHookScripts(paths.adapterDir);
    await ensureCursorCliPermissions(paths.cliConfigPath);
    await ensureCursorHooks(paths.settingsPath, paths.adapterDir);
    return {
      success: true,
      host: 'cursor',
      path: paths.rulePath,
      summary: 'Cursor host installed',
    };
  } catch (error) {
    return {
      success: false,
      host: 'cursor',
      path: paths.rulePath,
      summary: 'Cursor host install failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function isCursorInstalled(homeDir?: string): Promise<HostDoctorResult> {
  const paths = getCursorPaths(homeDir);
  const [ruleContent, settings, cliConfig] = await Promise.all([
    readFileIfExists(paths.rulePath),
    readCursorSettings(paths.settingsPath),
    readCursorCliConfig(paths.cliConfigPath),
  ]);

  const checks = [
    {
      label: 'corivo.mdc',
      ok: ruleContent.includes('# Corivo 记忆层（Cursor）'),
      detail: paths.rulePath,
    },
    {
      label: 'settings.json hooks',
      ok: hasRequiredCursorHooks(settings.hooks, paths.adapterDir),
      detail: paths.settingsPath,
    },
    {
      label: 'cli-config.json permissions',
      ok: Array.isArray(cliConfig.permissions?.allow) && cliConfig.permissions.allow.includes(CURSOR_PERMISSION),
      detail: paths.cliConfigPath,
    },
    {
      label: 'adapter scripts',
      ok: await hasRequiredCursorScripts(paths.adapterDir),
      detail: paths.adapterDir,
    },
  ];

  return {
    ok: checks.every((item) => item.ok),
    host: 'cursor',
    checks,
  };
}

export async function uninstallCursorHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getCursorPaths(homeDir);

  try {
    await fs.rm(paths.rulePath, { force: true });
    await fs.rm(paths.adapterDir, { recursive: true, force: true });
    await removeCursorHooks(paths.settingsPath, paths.adapterDir);
    await removeCursorCliPermission(paths.cliConfigPath);

    return {
      success: true,
      host: 'cursor',
      path: paths.rulePath,
      summary: 'Cursor host uninstalled',
    };
  } catch (error) {
    return {
      success: false,
      host: 'cursor',
      path: paths.rulePath,
      summary: 'Cursor host uninstall failed',
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
  allow.add(CURSOR_PERMISSION);

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
  const settings = await readCursorSettings(settingsPath);

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
  hooks: CursorHookGroups,
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

function removeHookCommand(
  hooks: CursorHookGroups,
  event: string,
  command: string,
): void {
  const groups = hooks[event];
  if (!groups) {
    return;
  }

  for (const group of groups) {
    if (!group.hooks) {
      continue;
    }
    group.hooks = group.hooks.filter((hook) => hook.command !== command);
  }
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readCursorSettings(settingsPath: string): Promise<CursorSettings> {
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(content) as CursorSettings;
  } catch {
    return {};
  }
}

async function readCursorCliConfig(
  cliConfigPath: string,
): Promise<{ permissions?: { allow?: string[]; deny?: string[] }; [key: string]: unknown }> {
  try {
    const content = await fs.readFile(cliConfigPath, 'utf8');
    return JSON.parse(content) as { permissions?: { allow?: string[]; deny?: string[] }; [key: string]: unknown };
  } catch {
    return {};
  }
}

function hasRequiredCursorHooks(hooks: CursorHookGroups | undefined, adapterDir: string): boolean {
  if (!hooks) {
    return false;
  }

  const requiredCommands = [
    `bash ${path.join(adapterDir, 'session-carry-over.sh')}`,
    `bash ${path.join(adapterDir, 'prompt-recall.sh')}`,
    `bash ${path.join(adapterDir, 'stop-review.sh')}`,
  ];

  return requiredCommands.every((required) =>
    Object.values(hooks).some((groups) =>
      groups.some((group) => (group.hooks ?? []).some((hook) => hook.command === required)),
    ),
  );
}

async function hasRequiredCursorScripts(adapterDir: string): Promise<boolean> {
  const scriptPaths = [
    path.join(adapterDir, 'session-carry-over.sh'),
    path.join(adapterDir, 'prompt-recall.sh'),
    path.join(adapterDir, 'stop-review.sh'),
  ];

  const states = await Promise.all(
    scriptPaths.map(async (scriptPath) => {
      try {
        await fs.stat(scriptPath);
        return true;
      } catch {
        return false;
      }
    }),
  );

  return states.every(Boolean);
}

async function removeCursorHooks(settingsPath: string, adapterDir: string): Promise<void> {
  const settings = await readCursorSettings(settingsPath);
  if (!settings.hooks) {
    return;
  }

  removeHookCommand(settings.hooks, 'SessionStart', `bash ${path.join(adapterDir, 'session-carry-over.sh')}`);
  removeHookCommand(settings.hooks, 'UserPromptSubmit', `bash ${path.join(adapterDir, 'prompt-recall.sh')}`);
  removeHookCommand(settings.hooks, 'Stop', `bash ${path.join(adapterDir, 'stop-review.sh')}`);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

async function removeCursorCliPermission(cliConfigPath: string): Promise<void> {
  const config = await readCursorCliConfig(cliConfigPath);
  if (!Array.isArray(config.permissions?.allow)) {
    return;
  }

  config.permissions.allow = config.permissions.allow.filter((item) => item !== CURSOR_PERMISSION);
  await fs.mkdir(path.dirname(cliConfigPath), { recursive: true });
  await fs.writeFile(cliConfigPath, JSON.stringify(config, null, 2), 'utf8');
}
