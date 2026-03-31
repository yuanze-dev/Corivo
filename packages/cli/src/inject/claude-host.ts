import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyHostAsset } from './host-assets.js';

type ClaudeSettings = {
  hooks?: Record<string, Array<{ hooks?: Array<{ type: string; command: string; timeout: number }> }>>;
};

export async function injectGlobalClaudeCodeHost(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    const claudeDir = await resolveClaudeDir();
    const home = process.env.HOME || os.homedir();
    const hooksDir = path.join(home, '.corivo', 'hooks');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const skillsDir = path.join(claudeDir, 'skills');

    await installClaudeHookScripts(hooksDir);
    await installClaudeSkills(skillsDir);
    await installClaudeHookConfig(settingsPath, hooksDir);

    return {
      success: true,
      path: settingsPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveClaudeDir(): Promise<string> {
  const home = process.env.HOME || os.homedir();
  const candidates = [
    path.join(home, '.claude'),
    path.join(home, '.config', 'claude'),
    path.join(home, 'Library', 'Application Support', 'claude'),
  ];

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
  let settings: ClaudeSettings = {};

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    settings = JSON.parse(content) as ClaudeSettings;
  } catch {
    settings = {};
  }

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
