import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyHostAsset } from './host-assets.js';
import type { HostDoctorResult, HostInstallResult } from '../hosts/types.js';

type ClaudeSettings = {
  hooks?: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>;
};

export interface ClaudeCodePaths {
  homeDir: string;
  claudeDir: string;
  hooksDir: string;
  settingsPath: string;
  skillsDir: string;
}

const REQUIRED_CLAUDE_HOOK_SCRIPTS = [
  'session-init.sh',
  'ingest-turn.sh',
  'session-carry-over.sh',
  'prompt-recall.sh',
  'stop-review.sh',
] as const;

const REQUIRED_CLAUDE_SKILL_FILES = [
  ['corivo-save', 'SKILL.md'],
  ['corivo-query', 'SKILL.md'],
] as const;

function getClaudeDirCandidates(homeDir: string): string[] {
  return [
    path.join(homeDir, '.claude'),
    path.join(homeDir, '.config', 'claude'),
    path.join(homeDir, 'Library', 'Application Support', 'claude'),
  ];
}

export async function getClaudeCodePaths(homeDir: string = process.env.HOME || os.homedir()): Promise<ClaudeCodePaths> {
  const claudeDir = await resolveClaudeDir(homeDir);

  return {
    homeDir,
    claudeDir,
    hooksDir: path.join(homeDir, '.corivo', 'hooks'),
    settingsPath: path.join(claudeDir, 'settings.json'),
    skillsDir: path.join(claudeDir, 'skills'),
  };
}

export async function injectGlobalClaudeCodeHost(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const result = await installClaudeCodeHost();
  return {
    success: result.success,
    path: result.path,
    error: result.error,
  };
}

export async function installClaudeCodeHost(homeDir?: string): Promise<HostInstallResult> {
  try {
    const paths = await getClaudeCodePaths(homeDir);

    await ensureMemoryWorkspace(paths.homeDir);
    await installClaudeHookScripts(paths.hooksDir);
    await installClaudeSkills(paths.skillsDir);
    await installClaudeHookConfig(paths.settingsPath, paths.hooksDir);

    return {
      success: true,
      host: 'claude-code',
      path: paths.settingsPath,
      summary: 'Claude Code host installed',
    };
  } catch (error) {
    const home = homeDir || process.env.HOME || os.homedir();
    const fallbackSettingsPath = path.join(home, '.claude', 'settings.json');
    return {
      success: false,
      host: 'claude-code',
      path: fallbackSettingsPath,
      summary: 'Claude Code host install failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function isClaudeCodeInstalled(homeDir?: string): Promise<HostDoctorResult> {
  const paths = await getClaudeCodePaths(homeDir);
  const settings = await readClaudeSettings(paths.settingsPath);
  const memoryRoot = path.join(paths.homeDir, '.corivo', 'memory');

  const hookScriptsOk = await Promise.all(
    REQUIRED_CLAUDE_HOOK_SCRIPTS.map((fileName) => pathExists(path.join(paths.hooksDir, fileName))),
  );
  const skillsOk = await Promise.all(
    REQUIRED_CLAUDE_SKILL_FILES.map((parts) => pathExists(path.join(paths.skillsDir, ...parts))),
  );

  const checks = [
    {
      label: 'hooks',
      ok: hookScriptsOk.every(Boolean),
      detail: paths.hooksDir,
    },
    {
      label: 'skills',
      ok: skillsOk.every(Boolean),
      detail: paths.skillsDir,
    },
    {
      label: 'settings.json hooks',
      ok: hasRequiredClaudeHooks(settings, paths.hooksDir),
      detail: paths.settingsPath,
    },
    {
      label: 'memory workspace',
      ok: await pathExists(memoryRoot),
      detail: memoryRoot,
    },
    {
      label: 'memory index',
      ok: await hasReadableMemoryIndex(paths.homeDir),
      detail: path.join(memoryRoot, 'final'),
    },
  ];

  return {
    ok: checks.every((item) => item.ok),
    host: 'claude-code',
    checks,
  };
}

async function ensureMemoryWorkspace(homeDir: string): Promise<void> {
  const memoryRoot = path.join(homeDir, '.corivo', 'memory', 'final');
  for (const scope of ['private', 'team'] as const) {
    const scopeDir = path.join(memoryRoot, scope);
    await fs.mkdir(scopeDir, { recursive: true });
    const indexPath = path.join(scopeDir, 'MEMORY.md');
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, '', 'utf8');
    }
  }
}

async function hasReadableMemoryIndex(homeDir: string): Promise<boolean> {
  const required = [
    path.join(homeDir, '.corivo', 'memory', 'final', 'private', 'MEMORY.md'),
    path.join(homeDir, '.corivo', 'memory', 'final', 'team', 'MEMORY.md'),
  ];

  const checks = await Promise.all(required.map((filePath) => pathExists(filePath)));
  return checks.every(Boolean);
}

export async function uninstallClaudeCodeHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = await getClaudeCodePaths(homeDir);

  try {
    for (const fileName of REQUIRED_CLAUDE_HOOK_SCRIPTS) {
      await fs.rm(path.join(paths.hooksDir, fileName), { force: true });
    }
    await fs.rm(path.join(paths.skillsDir, 'corivo-save'), { recursive: true, force: true });
    await fs.rm(path.join(paths.skillsDir, 'corivo-query'), { recursive: true, force: true });
    await removeClaudeHookConfig(paths.settingsPath, paths.hooksDir);

    return {
      success: true,
      host: 'claude-code',
      path: paths.settingsPath,
      summary: 'Claude Code host uninstalled',
    };
  } catch (error) {
    return {
      success: false,
      host: 'claude-code',
      path: paths.settingsPath,
      summary: 'Claude Code host uninstall failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveClaudeDir(homeDir: string): Promise<string> {
  const candidates = getClaudeDirCandidates(homeDir);

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  const fallback = candidates[0];
  await fs.mkdir(fallback, { recursive: true });
  return fallback;
}

async function installClaudeHookScripts(hooksDir: string): Promise<void> {
  const scripts = [
    'session-init.sh',
    'ingest-turn.sh',
    'session-carry-over.sh',
    'prompt-recall.sh',
    'stop-review.sh',
  ];

  for (const fileName of scripts) {
    await copyHostAsset('claude-code', `hooks/scripts/${fileName}`, path.join(hooksDir, fileName), {
      mode: 0o755,
    });
  }
}

async function installClaudeSkills(skillsDir: string): Promise<void> {
  const targets: Array<[string, string]> = [
    ['skills/corivo-save/skill.md', 'corivo-save/SKILL.md'],
    ['skills/corivo-query/skill.md', 'corivo-query/SKILL.md'],
  ];

  for (const [sourcePath, targetPath] of targets) {
    await copyHostAsset('claude-code', sourcePath, path.join(skillsDir, targetPath));
  }
}

async function installClaudeHookConfig(settingsPath: string, hooksDir: string): Promise<void> {
  const settings = await readClaudeSettings(settingsPath);

  if (!settings.hooks) {
    settings.hooks = {};
  }

  upsertClaudeHook(settings.hooks, 'SessionStart', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'session-init.sh')}`, timeout: 5 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'session-carry-over.sh')}`, timeout: 5 },
  ]);
  upsertClaudeHook(settings.hooks, 'UserPromptSubmit', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'ingest-turn.sh')} user`, timeout: 10 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'prompt-recall.sh')}`, timeout: 10 },
  ]);
  upsertClaudeHook(settings.hooks, 'Stop', [
    { type: 'command', command: `bash ${path.join(hooksDir, 'ingest-turn.sh')} assistant`, timeout: 10 },
    { type: 'command', command: `bash ${path.join(hooksDir, 'stop-review.sh')}`, timeout: 5 },
  ]);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function upsertClaudeHook(
  hooks: NonNullable<ClaudeSettings['hooks']>,
  event: string,
  commands: Array<{ type: string; command: string; timeout: number }>,
): void {
  const groups = hooks[event] ?? [{ hooks: [] }];
  const firstGroup = groups[0] ?? { hooks: [] };
  const existing = firstGroup.hooks ?? [];

  for (const command of commands) {
    if (!existing.some((hook) => hook.command === command.command)) {
      existing.push(command);
    }
  }

  firstGroup.hooks = existing;
  groups[0] = firstGroup;
  hooks[event] = groups;
}

function removeClaudeHook(
  hooks: NonNullable<ClaudeSettings['hooks']>,
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

function hasHookCommand(
  hooks: NonNullable<ClaudeSettings['hooks']> | undefined,
  event: string,
  command: string,
): boolean {
  if (!hooks) {
    return false;
  }

  const groups = hooks[event] ?? [];
  return groups.some((group) => (group.hooks ?? []).some((hook) => hook.command === command));
}

function hasRequiredClaudeHooks(settings: ClaudeSettings, hooksDir: string): boolean {
  const expected = [
    ['SessionStart', `bash ${path.join(hooksDir, 'session-init.sh')}`],
    ['SessionStart', `bash ${path.join(hooksDir, 'session-carry-over.sh')}`],
    ['UserPromptSubmit', `bash ${path.join(hooksDir, 'ingest-turn.sh')} user`],
    ['UserPromptSubmit', `bash ${path.join(hooksDir, 'prompt-recall.sh')}`],
    ['Stop', `bash ${path.join(hooksDir, 'ingest-turn.sh')} assistant`],
    ['Stop', `bash ${path.join(hooksDir, 'stop-review.sh')}`],
  ] as const;

  return expected.every(([event, command]) => hasHookCommand(settings.hooks, event, command));
}

async function removeClaudeHookConfig(settingsPath: string, hooksDir: string): Promise<void> {
  const settings = await readClaudeSettings(settingsPath);
  if (!settings.hooks) {
    return;
  }

  removeClaudeHook(settings.hooks, 'SessionStart', `bash ${path.join(hooksDir, 'session-init.sh')}`);
  removeClaudeHook(settings.hooks, 'SessionStart', `bash ${path.join(hooksDir, 'session-carry-over.sh')}`);
  removeClaudeHook(settings.hooks, 'UserPromptSubmit', `bash ${path.join(hooksDir, 'ingest-turn.sh')} user`);
  removeClaudeHook(settings.hooks, 'UserPromptSubmit', `bash ${path.join(hooksDir, 'prompt-recall.sh')}`);
  removeClaudeHook(settings.hooks, 'Stop', `bash ${path.join(hooksDir, 'ingest-turn.sh')} assistant`);
  removeClaudeHook(settings.hooks, 'Stop', `bash ${path.join(hooksDir, 'stop-review.sh')}`);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

async function readClaudeSettings(settingsPath: string): Promise<ClaudeSettings> {
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
