import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyHostAsset, readHostTemplateText } from './host-assets.js';
import type { HostDoctorResult, HostInstallResult } from '../hosts/types.js';

const START_MARKER = '<!-- CORIVO CODEX START -->';
const END_MARKER = '<!-- CORIVO CODEX END -->';
const REVIEW_SCRIPT_NAME = 'notify-review.sh';
const DISPATCH_SCRIPT_NAME = 'notify-dispatch.sh';
const NOTIFY_BACKUP_NAME = 'notify-original.json';
const REQUIRED_CODEX_HOOK_SCRIPTS = [
  'session-init.sh',
  'ingest-turn.sh',
  'user-prompt-submit.sh',
  'stop.sh',
] as const;

type CodexHookCommand = {
  type: string;
  command: string;
  statusMessage?: string;
  timeout: number;
};

type CodexHookGroups = Record<string, Array<{ matcher?: string; hooks?: CodexHookCommand[] }>>;
type CodexHooksSettings = {
  hooks?: CodexHookGroups;
};

export async function getCodexRules(): Promise<string> {
  const templateText = (await readHostTemplateText('codex', 'templates/AGENTS.codex.md')).trim();
  return `
${START_MARKER}
${templateText}
${END_MARKER}
`.trim();
}

export interface CodexPaths {
  homeDir: string;
  codexDir: string;
  agentsPath: string;
  configPath: string;
  hooksPath: string;
  adapterDir: string;
  dispatchPath: string;
  reviewPath: string;
  notifyBackupPath: string;
}

export function getCodexPaths(homeDir: string = process.env.HOME || os.homedir()): CodexPaths {
  const codexDir = path.join(homeDir, '.codex');
  const adapterDir = path.join(codexDir, 'corivo');

  return {
    homeDir,
    codexDir,
    agentsPath: path.join(codexDir, 'AGENTS.md'),
    configPath: path.join(codexDir, 'config.toml'),
    hooksPath: path.join(codexDir, 'hooks.json'),
    adapterDir,
    dispatchPath: path.join(adapterDir, DISPATCH_SCRIPT_NAME),
    reviewPath: path.join(adapterDir, REVIEW_SCRIPT_NAME),
    notifyBackupPath: path.join(adapterDir, NOTIFY_BACKUP_NAME),
  };
}

export async function injectCodexRules(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const codexRules = await getCodexRules();
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      // ignore
    }

    if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
      const regex = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}`, 'g');
      content = content.replace(regex, codexRules);
    } else {
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += `\n${codexRules}\n`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function injectGlobalCodexRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const result = await installCodexHost();
  return {
    success: result.success,
    path: result.path,
    error: result.error,
  };
}

export async function installCodexHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getCodexPaths(homeDir);

  try {
    await fs.mkdir(paths.adapterDir, { recursive: true });

    const existingConfig = await readFileIfExists(paths.configPath);
    const existingNotify = extractNotifyCommand(existingConfig);
    const wrappedNotify = shouldWrapNotify(existingNotify, paths.dispatchPath) ? existingNotify : null;
    const existingDispatch = await readFileIfExists(paths.dispatchPath);

    if (wrappedNotify) {
      await writeNotifyBackup(paths.notifyBackupPath, wrappedNotify);
    } else if (!existingNotify || !existingNotify.includes(paths.dispatchPath)) {
      await fs.rm(paths.notifyBackupPath, { force: true });
    }

    await copyHostAsset('codex', 'adapters/notify-review.sh', paths.reviewPath, { mode: 0o755 });
    await installCodexHookScripts(paths.adapterDir);

    const dispatchContent = wrappedNotify
      ? buildDispatchScript(wrappedNotify)
      : (existingDispatch || buildDispatchScript(null));
    await fs.writeFile(paths.dispatchPath, dispatchContent, 'utf8');
    await fs.chmod(paths.dispatchPath, 0o755);

    let updatedConfig = upsertNotifyCommand(existingConfig, ['bash', paths.dispatchPath]);
    updatedConfig = upsertSandboxWritableRoot(updatedConfig, path.join(paths.homeDir, '.corivo'));
    await fs.mkdir(paths.codexDir, { recursive: true });
    await fs.writeFile(paths.configPath, updatedConfig, 'utf8');
    await installCodexHooksConfig(paths.hooksPath, paths.adapterDir);

    const result = await injectCodexRules(paths.agentsPath);

    return {
      success: result.success,
      host: 'codex',
      path: paths.agentsPath,
      summary: result.success ? 'Codex host installed' : 'Codex host install failed',
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      host: 'codex',
      path: paths.agentsPath,
      summary: 'Codex host install failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function isCodexInstalled(homeDir?: string): Promise<HostDoctorResult> {
  const paths = getCodexPaths(homeDir);
  const corivoRoot = path.join(paths.homeDir, '.corivo');
  const [agentsContent, configContent, hooksSettings, reviewContent, dispatchContent, hookScriptsOk] = await Promise.all([
    readFileIfExists(paths.agentsPath),
    readFileIfExists(paths.configPath),
    readCodexHooksSettings(paths.hooksPath),
    readFileIfExists(paths.reviewPath),
    readFileIfExists(paths.dispatchPath),
    hasRequiredCodexScripts(paths.adapterDir),
  ]);
  const notify = extractNotifyCommand(configContent);

  const checks = [
    {
      label: 'AGENTS.md',
      ok: agentsContent.includes(START_MARKER) && agentsContent.includes(END_MARKER),
      detail: paths.agentsPath,
    },
    {
      label: 'config.toml',
      ok: Boolean(
        notify
        && notify.includes(paths.dispatchPath)
        && hasSandboxWritableRoot(configContent, corivoRoot),
      ),
      detail: paths.configPath,
    },
    {
      label: 'hooks.json hooks',
      ok: hasRequiredCodexHooks(hooksSettings.hooks, paths.adapterDir),
      detail: paths.hooksPath,
    },
    {
      label: 'notify-review.sh',
      ok: reviewContent.includes('corivo review'),
      detail: paths.reviewPath,
    },
    {
      label: 'notify-dispatch.sh',
      ok: dispatchContent.includes('notify-review.sh'),
      detail: paths.dispatchPath,
    },
    {
      label: 'hook scripts',
      ok: hookScriptsOk,
      detail: paths.adapterDir,
    },
  ];

  return {
    ok: checks.every((item) => item.ok),
    host: 'codex',
    checks,
  };
}

export async function uninstallCodexHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getCodexPaths(homeDir);

  try {
    await removeCodexRuleBlock(paths.agentsPath);
    await removeCodexNotifyConfig(paths.configPath, paths.dispatchPath, paths.notifyBackupPath);
    await removeCodexWritableRoot(paths.configPath, path.join(paths.homeDir, '.corivo'));
    await removeCodexHooksConfig(paths.hooksPath, paths.adapterDir);
    for (const fileName of REQUIRED_CODEX_HOOK_SCRIPTS) {
      await fs.rm(path.join(paths.adapterDir, fileName), { force: true });
    }
    await fs.rm(paths.dispatchPath, { force: true });
    await fs.rm(paths.reviewPath, { force: true });
    await fs.rm(paths.notifyBackupPath, { force: true });
    await fs.rm(paths.adapterDir, { recursive: true, force: true });

    return {
      success: true,
      host: 'codex',
      path: paths.agentsPath,
      summary: 'Codex host uninstalled',
    };
  } catch (error) {
    return {
      success: false,
      host: 'codex',
      path: paths.agentsPath,
      summary: 'Codex host uninstall failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function installCodexHookScripts(adapterDir: string): Promise<void> {
  for (const fileName of REQUIRED_CODEX_HOOK_SCRIPTS) {
    await copyHostAsset('codex', `hooks/scripts/${fileName}`, path.join(adapterDir, fileName), {
      mode: 0o755,
    });
  }
}

async function hasRequiredCodexScripts(adapterDir: string): Promise<boolean> {
  const checks = await Promise.all(
    REQUIRED_CODEX_HOOK_SCRIPTS.map(async (fileName) => {
      try {
        await fs.access(path.join(adapterDir, fileName));
        return true;
      } catch {
        return false;
      }
    }),
  );

  return checks.every(Boolean);
}

async function readCodexHooksSettings(hooksPath: string): Promise<CodexHooksSettings> {
  const content = await readFileIfExists(hooksPath);
  if (!content) {
    return {};
  }

  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null ? parsed as CodexHooksSettings : {};
  } catch {
    return {};
  }
}

async function installCodexHooksConfig(hooksPath: string, adapterDir: string): Promise<void> {
  const settings = await readCodexHooksSettings(hooksPath);
  if (!settings.hooks) {
    settings.hooks = {};
  }

  upsertCodexHook(settings.hooks, 'SessionStart', {
    matcher: 'startup|resume',
    hooks: [
      {
        type: 'command',
        command: `bash "${path.join(adapterDir, 'session-init.sh')}"`,
        statusMessage: 'Loading Corivo memory',
        timeout: 5,
      },
    ],
  });
  upsertCodexHook(settings.hooks, 'UserPromptSubmit', {
    hooks: [
      {
        type: 'command',
        command: `bash "${path.join(adapterDir, 'ingest-turn.sh')}" user`,
        statusMessage: 'Saving Corivo memory',
        timeout: 10,
      },
      {
        type: 'command',
        command: `bash "${path.join(adapterDir, 'user-prompt-submit.sh')}"`,
        statusMessage: 'Checking Corivo recall',
        timeout: 10,
      },
    ],
  });
  upsertCodexHook(settings.hooks, 'Stop', {
    hooks: [
      {
        type: 'command',
        command: `bash "${path.join(adapterDir, 'ingest-turn.sh')}" assistant`,
        statusMessage: 'Saving Corivo response',
        timeout: 10,
      },
      {
        type: 'command',
        command: `bash "${path.join(adapterDir, 'stop.sh')}"`,
        statusMessage: 'Reviewing Corivo follow-up',
        timeout: 10,
      },
    ],
  });

  await fs.mkdir(path.dirname(hooksPath), { recursive: true });
  await fs.writeFile(hooksPath, JSON.stringify(settings, null, 2), 'utf8');
}

function hasRequiredCodexHooks(hooks: CodexHookGroups | undefined, adapterDir: string): boolean {
  if (!hooks) {
    return false;
  }

  const expected = [
    ['SessionStart', `bash "${path.join(adapterDir, 'session-init.sh')}"`],
    ['UserPromptSubmit', `bash "${path.join(adapterDir, 'ingest-turn.sh')}" user`],
    ['UserPromptSubmit', `bash "${path.join(adapterDir, 'user-prompt-submit.sh')}"`],
    ['Stop', `bash "${path.join(adapterDir, 'ingest-turn.sh')}" assistant`],
    ['Stop', `bash "${path.join(adapterDir, 'stop.sh')}"`],
  ] as const;

  return expected.every(([event, command]) =>
    (hooks[event] ?? []).some((group) => (group.hooks ?? []).some((hook) => hook.command === command)),
  );
}

function upsertCodexHook(
  hooks: CodexHookGroups,
  event: string,
  group: { matcher?: string; hooks: CodexHookCommand[] },
): void {
  const existingGroups = hooks[event] ?? [];
  const targetGroup = existingGroups.find((item) => item.matcher === group.matcher)
    ?? existingGroups[0]
    ?? { matcher: group.matcher, hooks: [] };
  const existingHooks = targetGroup.hooks ?? [];

  for (const hook of group.hooks) {
    if (!existingHooks.some((item) => item.command === hook.command)) {
      existingHooks.push(hook);
    }
  }

  targetGroup.matcher = group.matcher;
  targetGroup.hooks = existingHooks;

  if (!existingGroups.includes(targetGroup)) {
    existingGroups.unshift(targetGroup);
  }

  hooks[event] = existingGroups;
}

async function removeCodexHooksConfig(hooksPath: string, adapterDir: string): Promise<void> {
  const settings = await readCodexHooksSettings(hooksPath);
  if (!settings.hooks) {
    return;
  }

  const commands = [
    ['SessionStart', `bash "${path.join(adapterDir, 'session-init.sh')}"`],
    ['UserPromptSubmit', `bash "${path.join(adapterDir, 'ingest-turn.sh')}" user`],
    ['UserPromptSubmit', `bash "${path.join(adapterDir, 'user-prompt-submit.sh')}"`],
    ['Stop', `bash "${path.join(adapterDir, 'ingest-turn.sh')}" assistant`],
    ['Stop', `bash "${path.join(adapterDir, 'stop.sh')}"`],
  ] as const;

  for (const [event, command] of commands) {
    removeCodexHook(settings.hooks, event, command);
  }

  await fs.writeFile(hooksPath, JSON.stringify(settings, null, 2), 'utf8');
}

function removeCodexHook(hooks: CodexHookGroups, event: string, command: string): void {
  const groups = hooks[event];
  if (!groups) {
    return;
  }

  hooks[event] = groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((hook) => hook.command !== command),
    }))
    .filter((group) => (group.hooks?.length ?? 0) > 0);
}

async function writeNotifyBackup(backupPath: string, command: string[]): Promise<void> {
  await fs.writeFile(backupPath, JSON.stringify(command), 'utf8');
}

async function readNotifyBackup(backupPath: string): Promise<string[] | null> {
  const content = await readFileIfExists(backupPath);
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function removeCodexRuleBlock(filePath: string): Promise<void> {
  const content = await readFileIfExists(filePath);

  if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
    return;
  }

  const regex = new RegExp(`\\n?${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}\\n?`, 'g');
  const updated = content.replace(regex, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  await fs.writeFile(filePath, updated, 'utf8');
}

function extractNotifyCommand(content: string): string[] | null {
  const match = content.match(/notify\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) {
    return null;
  }

  const values = Array.from(match[1].matchAll(/"((?:\\"|[^"])*)"/g)).map((item) =>
    item[1].replace(/\\"/g, '"'),
  );

  return values.length > 0 ? values : null;
}

function shouldWrapNotify(command: string[] | null, dispatchPath: string): command is string[] {
  return Boolean(command && command.length > 0 && !command.includes(dispatchPath));
}

function upsertNotifyCommand(content: string, command: string[]): string {
  const notifyLine = `notify = [ ${command.map((value) => `"${value}"`).join(', ')} ]`;

  if (!content.trim()) {
    return `${notifyLine}\n`;
  }

  if (/notify\s*=\s*\[[\s\S]*?\]/m.test(content)) {
    return content.replace(/notify\s*=\s*\[[\s\S]*?\]/m, notifyLine);
  }

  return content.endsWith('\n') ? `${content}${notifyLine}\n` : `${content}\n${notifyLine}\n`;
}

function removeNotifyCommand(content: string): string {
  if (!/notify\s*=\s*\[[\s\S]*?\]/m.test(content)) {
    return content;
  }

  const updated = content.replace(/notify\s*=\s*\[[\s\S]*?\]\s*\n?/m, '');
  return `${updated.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

async function removeCodexNotifyConfig(
  configPath: string,
  dispatchPath: string,
  notifyBackupPath: string,
): Promise<void> {
  const content = await readFileIfExists(configPath);
  if (!content) {
    return;
  }

  const notify = extractNotifyCommand(content);
  if (!notify || !notify.includes(dispatchPath)) {
    return;
  }

  const backupNotify = await readNotifyBackup(notifyBackupPath);
  const updatedConfig = backupNotify ? upsertNotifyCommand(content, backupNotify) : removeNotifyCommand(content);
  await fs.writeFile(configPath, updatedConfig, 'utf8');
  await fs.rm(notifyBackupPath, { force: true });
}

async function removeCodexWritableRoot(configPath: string, rootPath: string): Promise<void> {
  const content = await readFileIfExists(configPath);
  if (!content) {
    return;
  }

  const updated = removeSandboxWritableRoot(content, rootPath);
  await fs.writeFile(configPath, updated, 'utf8');
}

function upsertSandboxWritableRoot(content: string, rootPath: string): string {
  const line = `writable_roots = [ "${rootPath}" ]`;
  const normalizedContent = stripWritableRoots(content).replace(/\n{3,}/g, '\n\n');
  const sectionRegex = /\[sandbox_workspace_write\]([\s\S]*?)(?=\n\[|$)/;
  const sectionMatch = normalizedContent.match(sectionRegex);

  if (!sectionMatch) {
    const block = `[sandbox_workspace_write]\n${line}\n`;
    return normalizedContent.endsWith('\n') ? `${normalizedContent}${block}` : `${normalizedContent}\n${block}`;
  }

  const section = sectionMatch[0];
  const rootsMatch = section.match(/writable_roots\s*=\s*\[([\s\S]*?)\]/m);

  if (!rootsMatch) {
    const updatedSection = `${section.trimEnd()}\n${line}\n`;
    return normalizedContent.replace(sectionRegex, updatedSection);
  }

  const roots = Array.from(rootsMatch[1].matchAll(/"((?:\\"|[^"])*)"/g)).map((item) =>
    item[1].replace(/\\"/g, '"'),
  );

  if (!roots.includes(rootPath)) {
    roots.push(rootPath);
  }

  const updatedRootsLine = `writable_roots = [ ${roots.map((value) => `"${value}"`).join(', ')} ]`;
  const bodyLines = section
    .split('\n')
    .slice(1)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('writable_roots'));
  const updatedSection = ['[sandbox_workspace_write]', updatedRootsLine, ...bodyLines].join('\n') + '\n';
  return dedupeWritableRootLines(normalizedContent.replace(sectionRegex, updatedSection));
}

function stripWritableRoots(content: string): string {
  const kept: string[] = [];
  let skipping = false;

  for (const line of content.split('\n')) {
    if (!skipping && /^\s*writable_roots\s*=/.test(line)) {
      skipping = !line.includes(']');
      continue;
    }

    if (skipping) {
      if (line.includes(']')) {
        skipping = false;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n');
}

function dedupeWritableRootLines(content: string): string {
  let seen = false;

  return content
    .split('\n')
    .filter((line) => {
      if (!/^\s*writable_roots\s*=/.test(line)) {
        return true;
      }

      if (seen) {
        return false;
      }

      seen = true;
      return true;
    })
    .join('\n');
}

function removeSandboxWritableRoot(content: string, rootPath: string): string {
  const sectionRegex = /\[sandbox_workspace_write\]([\s\S]*?)(?=\n\[|$)/;
  const sectionMatch = content.match(sectionRegex);
  if (!sectionMatch) {
    return content;
  }

  const section = sectionMatch[0];
  const rootsMatch = section.match(/writable_roots\s*=\s*\[([\s\S]*?)\]/m);
  if (!rootsMatch) {
    return content;
  }

  const roots = Array.from(rootsMatch[1].matchAll(/"((?:\\"|[^"])*)"/g))
    .map((item) => item[1].replace(/\\"/g, '"'))
    .filter((item) => item !== rootPath);

  const bodyLines = section
    .split('\n')
    .slice(1)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('writable_roots'));

  const updatedSectionLines = ['[sandbox_workspace_write]'];
  if (roots.length > 0) {
    updatedSectionLines.push(`writable_roots = [ ${roots.map((value) => `"${value}"`).join(', ')} ]`);
  }
  updatedSectionLines.push(...bodyLines);

  const replacement = updatedSectionLines.length > 1 ? `${updatedSectionLines.join('\n')}\n` : '';
  const updatedContent = content.replace(sectionRegex, replacement).replace(/\n{3,}/g, '\n\n');
  return updatedContent.trimEnd() ? `${updatedContent.trimEnd()}\n` : '';
}

function hasSandboxWritableRoot(content: string, rootPath: string): boolean {
  const sectionRegex = /\[sandbox_workspace_write\]([\s\S]*?)(?=\n\[|$)/;
  const sectionMatch = content.match(sectionRegex);
  if (!sectionMatch) {
    return false;
  }

  const rootsMatch = sectionMatch[0].match(/writable_roots\s*=\s*\[([\s\S]*?)\]/m);
  if (!rootsMatch) {
    return false;
  }

  const roots = Array.from(rootsMatch[1].matchAll(/"((?:\\"|[^"])*)"/g)).map((item) =>
    item[1].replace(/\\"/g, '"'),
  );
  return roots.includes(rootPath);
}

function buildDispatchScript(existingNotify: string[] | null): string {
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'INPUT=""',
    'if [ ! -t 0 ]; then',
    '  INPUT="$(cat)"',
    'fi',
  ];

  if (existingNotify && existingNotify.length > 0) {
    const quoted = existingNotify.map((value) => shellQuote(value)).join(' ');
    lines.push(
      `printf '%s' "$INPUT" | ${quoted} || true`,
    );
  }

  lines.push(
    'if [ -x "$HOME/.codex/corivo/notify-review.sh" ]; then',
    '  printf \'%s\' "$INPUT" | bash "$HOME/.codex/corivo/notify-review.sh" || true',
    'fi',
    '',
  );

  return lines.join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
