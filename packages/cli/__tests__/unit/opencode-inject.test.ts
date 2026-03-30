import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OPENCODE_PLUGIN_TEMPLATE,
  injectGlobalOpencodePlugin,
} from '../../src/inject/opencode-plugin.js';

describe('OpenCode Corivo integration', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-inject-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('includes carry-over, recall, review, and explicit Corivo attribution guidance', () => {
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('carry-over');
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('recall');
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('review');
    expect(OPENCODE_PLUGIN_TEMPLATE).toContain('hook-text');
  });

  it('writes a global OpenCode plugin file', async () => {
    const result = await injectGlobalOpencodePlugin();
    const pluginPath = path.join(tempHome, '.config', 'opencode', 'plugins', 'corivo.ts');
    const content = await fs.readFile(pluginPath, 'utf8');

    expect(result.success).toBe(true);
    expect(result.path).toBe(pluginPath);
    expect(content).toContain('experimental.chat.system.transform');
    expect(content).toContain("runCorivo('recall'");
  });
});
