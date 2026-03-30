import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CODEX_RULES,
  injectCodexRules,
  injectGlobalCodexRules,
} from '../../src/inject/codex-rules.js';

describe('Codex Corivo integration', () => {
  let tempDir: string;
  let agentsPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-inject-'));
    agentsPath = path.join(tempDir, 'AGENTS.md');
    await fs.writeFile(agentsPath, '# Codex Rules\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('includes carry-over, recall, review, and explicit Corivo attribution guidance', () => {
    expect(CODEX_RULES).toContain('corivo carry-over');
    expect(CODEX_RULES).toContain('corivo recall');
    expect(CODEX_RULES).toContain('corivo review');
    expect(CODEX_RULES).toContain('根据 Corivo 的记忆');
    expect(CODEX_RULES).toContain('--format text');
    expect(CODEX_RULES).not.toContain('--format hook-text');
  });

  it('injects Codex rules into AGENTS.md', async () => {
    const result = await injectCodexRules(agentsPath);
    const content = await fs.readFile(agentsPath, 'utf8');

    expect(result.success).toBe(true);
    expect(content).toContain('## Corivo 记忆层（Codex）');
    expect(content).toContain('corivo recall');
  });

  it('installs global Codex adapters and rewires notify through a dispatch script', async () => {
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

      const result = await injectGlobalCodexRules();
      const updatedConfig = await fs.readFile(configPath, 'utf8');
      const dispatchPath = path.join(tempHome, '.codex', 'corivo', 'notify-dispatch.sh');
      const reviewPath = path.join(tempHome, '.codex', 'corivo', 'notify-review.sh');
      const dispatchContent = await fs.readFile(dispatchPath, 'utf8');
      const reviewContent = await fs.readFile(reviewPath, 'utf8');
      const globalAgentsPath = path.join(tempHome, '.codex', 'AGENTS.md');
      const globalAgents = await fs.readFile(globalAgentsPath, 'utf8');

      expect(result.success).toBe(true);
      expect(result.path).toBe(globalAgentsPath);
      expect(updatedConfig).toContain(dispatchPath);
      expect(updatedConfig).toContain('[sandbox_workspace_write]');
      expect(updatedConfig).toContain(path.join(tempHome, '.corivo'));
      expect(dispatchContent).toContain('/tmp/existing-notify.sh');
      expect(reviewContent).toContain('corivo review');
      expect(reviewContent).not.toContain('session-start');
      expect(globalAgents).toContain('## Corivo 记忆层（Codex）');
    } finally {
      process.env.HOME = previousHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});
