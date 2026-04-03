import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CODEX_TEMPLATE_PATH = path.resolve('../plugins/codex/templates/AGENTS.codex.md');
const CODEX_REVIEW_ADAPTER_PATH = path.resolve('../plugins/codex/adapters/notify-review.sh');
const CODEX_RULES_MODULE_PATH = '../../src/hosts/installers/codex-rules.js';

describe('Codex Corivo integration', () => {
  let tempDir: string;
  let agentsPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-inject-'));
    agentsPath = path.join(tempDir, 'AGENTS.md');
    await fs.writeFile(agentsPath, '# Codex Rules\n', 'utf8');
  });

  afterEach(async () => {
    vi.resetModules();
    delete process.env.CORIVO_HOST_ASSETS_ROOT;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads Codex rules lazily with carry-over, query, review, and explicit Corivo attribution guidance', async () => {
    const { getCodexRules } = await import(CODEX_RULES_MODULE_PATH);
    const rules = await getCodexRules();

    expect(rules).toContain('corivo carry-over');
    expect(rules).toContain('corivo query --prompt');
    expect(rules).toContain('corivo review');
    expect(rules).toContain('根据 Corivo 的记忆');
    expect(rules).toContain('--format text');
    expect(rules).not.toContain('--format hook-text');
  });

  it('injects Codex rules into AGENTS.md', async () => {
    const { injectCodexRules } = await import(CODEX_RULES_MODULE_PATH);
    const result = await injectCodexRules(agentsPath);
    const content = await fs.readFile(agentsPath, 'utf8');

    expect(result.success).toBe(true);
    expect(content).toContain('## Corivo 记忆层（Codex）');
    expect(content).toContain('corivo query --prompt');
  });

  it('builds injected rules from the packaged Codex template asset', async () => {
    const { getCodexRules } = await import(CODEX_RULES_MODULE_PATH);
    const template = await fs.readFile(CODEX_TEMPLATE_PATH, 'utf8');
    const rules = await getCodexRules();

    expect(rules).toContain(template.trim());
  });

  it('does not crash on import when the preferred Codex asset root is missing, but fails on use without repo fallback', async () => {
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-missing-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = missingRoot;
    vi.resetModules();

    try {
      const mod = await import(CODEX_RULES_MODULE_PATH);
      await expect(mod.getCodexRules()).rejects.toThrowError(
        `Missing host asset "templates/AGENTS.codex.md" for host "codex". Checked paths: ${path.join(
          missingRoot,
          'codex',
          'templates',
          'AGENTS.codex.md',
        )}.`,
      );
      await expect(mod.injectCodexRules(agentsPath)).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining(path.join(missingRoot, 'codex', 'templates', 'AGENTS.codex.md')),
      });
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(missingRoot, { recursive: true, force: true });
    }
  });

  it('installs global Codex adapters and rewires notify through a dispatch script', async () => {
    const { injectGlobalCodexRules } = await import(CODEX_RULES_MODULE_PATH);
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-home-'));
    const previousHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const configPath = path.join(tempHome, '.codex', 'config.toml');
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        'notify = [\n  "bash",\n  "/tmp/existing-notify.sh"\n]\n',
        'utf8'
      );

      await injectGlobalCodexRules();
      const result = await injectGlobalCodexRules();
      const updatedConfig = await fs.readFile(configPath, 'utf8');
      const dispatchPath = path.join(tempHome, '.codex', 'corivo', 'notify-dispatch.sh');
      const reviewPath = path.join(tempHome, '.codex', 'corivo', 'notify-review.sh');
      const sessionInitPath = path.join(tempHome, '.codex', 'corivo', 'session-init.sh');
      const ingestTurnPath = path.join(tempHome, '.codex', 'corivo', 'ingest-turn.sh');
      const userPromptSubmitPath = path.join(tempHome, '.codex', 'corivo', 'user-prompt-submit.sh');
      const stopPath = path.join(tempHome, '.codex', 'corivo', 'stop.sh');
      const hooksConfigPath = path.join(tempHome, '.codex', 'hooks.json');
      const dispatchContent = await fs.readFile(dispatchPath, 'utf8');
      const reviewContent = await fs.readFile(reviewPath, 'utf8');
      const sessionInitContent = await fs.readFile(sessionInitPath, 'utf8');
      const ingestTurnContent = await fs.readFile(ingestTurnPath, 'utf8');
      const userPromptSubmitContent = await fs.readFile(userPromptSubmitPath, 'utf8');
      const stopContent = await fs.readFile(stopPath, 'utf8');
      const hooksConfig = await fs.readFile(hooksConfigPath, 'utf8');
      const globalAgentsPath = path.join(tempHome, '.codex', 'AGENTS.md');
      const globalAgents = await fs.readFile(globalAgentsPath, 'utf8');
      const packagedTemplate = await fs.readFile(CODEX_TEMPLATE_PATH, 'utf8');
      const packagedReviewAdapter = await fs.readFile(CODEX_REVIEW_ADAPTER_PATH, 'utf8');

      expect(result.success).toBe(true);
      expect(result.path).toBe(globalAgentsPath);
      expect(updatedConfig).toContain(dispatchPath);
      expect(updatedConfig).toContain('[sandbox_workspace_write]');
      expect(updatedConfig).toContain(path.join(tempHome, '.corivo'));
      expect(updatedConfig.match(/writable_roots/g)).toHaveLength(1);
      expect(dispatchContent).toContain('/tmp/existing-notify.sh');
      expect(reviewContent).toBe(packagedReviewAdapter);
      expect(sessionInitContent).toContain('hookEventName:"SessionStart"');
      expect(ingestTurnContent).toContain('corivo ingest-message');
      expect(userPromptSubmitContent).toContain('hookEventName:"UserPromptSubmit"');
      expect(userPromptSubmitContent).toContain('corivo recall --prompt "$PROMPT" --format hook-text');
      expect(userPromptSubmitContent).not.toContain('corivo list --annotation');
      expect(stopContent).toContain('hookEventName:"Stop"');
      expect(stopContent).toContain('corivo review --last-message "$MESSAGE" --format hook-text');
      expect(hooksConfig).toContain(sessionInitPath);
      expect(hooksConfig).toContain(ingestTurnPath);
      expect(hooksConfig).toContain(userPromptSubmitPath);
      expect(hooksConfig).toContain(stopPath);
      expect(globalAgents).toContain(packagedTemplate.trim());
      expect(globalAgents).toContain('优先使用 Corivo 返回的 Markdown memory / recall 结果');
    } finally {
      process.env.HOME = previousHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});
