import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CURSOR_TEMPLATE_PATH = path.resolve('../plugins/cursor/templates/corivo.mdc');
const CURSOR_SESSION_CARRY_OVER_PATH = path.resolve('../plugins/cursor/hooks/scripts/session-carry-over.sh');
const CURSOR_PROMPT_RECALL_PATH = path.resolve('../plugins/cursor/hooks/scripts/prompt-recall.sh');
const CURSOR_STOP_REVIEW_PATH = path.resolve('../plugins/cursor/hooks/scripts/stop-review.sh');
const CURSOR_RULES_MODULE_PATH = '../../src/hosts/installers/cursor-rules.js';

describe('Cursor Corivo integration', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-cursor-inject-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    vi.resetModules();
    process.env.HOME = previousHome;
    delete process.env.CORIVO_HOST_ASSETS_ROOT;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('loads the Cursor rule template lazily', async () => {
    const { getCursorRuleTemplate } = await import(CURSOR_RULES_MODULE_PATH);
    const template = await getCursorRuleTemplate();

    expect(template).toContain('corivo carry-over');
    expect(template).toContain('corivo query --prompt');
    expect(template).toContain('corivo review');
    expect(template).toContain('根据 Corivo 的记忆');
    expect(template).toContain('# Corivo 记忆层（Cursor）');
  });

  it('loads the Cursor rule template from the packaged asset', async () => {
    const { getCursorRuleTemplate } = await import(CURSOR_RULES_MODULE_PATH);
    const packagedTemplate = await fs.readFile(CURSOR_TEMPLATE_PATH, 'utf8');

    await expect(getCursorRuleTemplate()).resolves.toBe(packagedTemplate);
  });

  it('does not crash on import when the preferred Cursor asset root is missing, but fails on use without repo fallback', async () => {
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-cursor-missing-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = missingRoot;
    vi.resetModules();

    try {
      const mod = await import(CURSOR_RULES_MODULE_PATH);
      await expect(mod.getCursorRuleTemplate()).rejects.toThrowError(
        `Missing host asset "templates/corivo.mdc" for host "cursor". Checked paths: ${path.join(
          missingRoot,
          'cursor',
          'templates',
          'corivo.mdc',
        )}.`,
      );
      await expect(mod.injectGlobalCursorRules()).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining(path.join(missingRoot, 'cursor', 'templates', 'corivo.mdc')),
      });
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(missingRoot, { recursive: true, force: true });
    }
  });

  it('writes a global Cursor rule file', async () => {
    const { injectGlobalCursorRules } = await import(CURSOR_RULES_MODULE_PATH);
    const result = await injectGlobalCursorRules();
    const rulePath = path.join(tempHome, '.cursor', 'rules', 'corivo.mdc');
    const content = await fs.readFile(rulePath, 'utf8');
    const cliConfigPath = path.join(tempHome, '.cursor', 'cli-config.json');
    const cliConfig = JSON.parse(await fs.readFile(cliConfigPath, 'utf8'));
    const settingsPath = path.join(tempHome, '.cursor', 'settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const sessionStart = settings.hooks.SessionStart?.[0]?.hooks ?? [];
    const promptSubmit = settings.hooks.UserPromptSubmit?.[0]?.hooks ?? [];
    const stop = settings.hooks.Stop?.[0]?.hooks ?? [];
    const packagedTemplate = await fs.readFile(CURSOR_TEMPLATE_PATH, 'utf8');
    const packagedSessionCarryOver = await fs.readFile(CURSOR_SESSION_CARRY_OVER_PATH, 'utf8');
    const packagedPromptRecall = await fs.readFile(CURSOR_PROMPT_RECALL_PATH, 'utf8');
    const packagedStopReview = await fs.readFile(CURSOR_STOP_REVIEW_PATH, 'utf8');

    expect(result.success).toBe(true);
    expect(result.path).toBe(rulePath);
    expect(content).toBe(packagedTemplate);
    expect(cliConfig.permissions.allow).toContain('Shell(corivo)');
    expect(cliConfig.editor.vimMode).toBe(false);
    expect(sessionStart.map((hook: { command: string }) => hook.command)).toContain(
      `bash ${tempHome}/.cursor/corivo/session-carry-over.sh`
    );
    expect(promptSubmit.map((hook: { command: string }) => hook.command)).toContain(
      `bash ${tempHome}/.cursor/corivo/prompt-recall.sh`
    );
    expect(stop.map((hook: { command: string }) => hook.command)).toContain(
      `bash ${tempHome}/.cursor/corivo/stop-review.sh`
    );
    await expect(fs.readFile(path.join(tempHome, '.cursor', 'corivo', 'session-carry-over.sh'), 'utf8')).resolves.toBe(
      packagedSessionCarryOver
    );
    await expect(fs.readFile(path.join(tempHome, '.cursor', 'corivo', 'prompt-recall.sh'), 'utf8')).resolves.toBe(
      packagedPromptRecall
    );
    await expect(fs.readFile(path.join(tempHome, '.cursor', 'corivo', 'stop-review.sh'), 'utf8')).resolves.toBe(
      packagedStopReview
    );
  });
});
