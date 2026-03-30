import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CODEX_RULES,
  injectCodexRules,
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
  });

  it('injects Codex rules into AGENTS.md', async () => {
    const result = await injectCodexRules(agentsPath);
    const content = await fs.readFile(agentsPath, 'utf8');

    expect(result.success).toBe(true);
    expect(content).toContain('## Corivo 记忆层（Codex）');
    expect(content).toContain('corivo recall');
  });
});
