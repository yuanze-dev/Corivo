import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURSOR_RULE_TEMPLATE, injectGlobalCursorRules } from '../../src/inject/cursor-rules.js';

describe('Cursor Corivo integration', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-cursor-inject-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('includes carry-over, recall, review, and explicit Corivo attribution guidance', () => {
    expect(CURSOR_RULE_TEMPLATE).toContain('corivo carry-over');
    expect(CURSOR_RULE_TEMPLATE).toContain('corivo recall');
    expect(CURSOR_RULE_TEMPLATE).toContain('corivo review');
    expect(CURSOR_RULE_TEMPLATE).toContain('根据 Corivo 的记忆');
  });

  it('writes a global Cursor rule file', async () => {
    const result = await injectGlobalCursorRules();
    const rulePath = path.join(tempHome, '.cursor', 'rules', 'corivo.mdc');
    const content = await fs.readFile(rulePath, 'utf8');

    expect(result.success).toBe(true);
    expect(result.path).toBe(rulePath);
    expect(content).toContain('# Corivo 记忆层（Cursor）');
  });
});
