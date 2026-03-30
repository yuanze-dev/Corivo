import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectGlobalClaudeCodeHost } from '../../src/inject/claude-host.js';

describe('Claude Code host installer', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-host-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    await fs.mkdir(path.join(tempHome, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('installs Claude Code hooks, skills, and settings wiring', async () => {
    const result = await injectGlobalClaudeCodeHost();
    expect(result.success).toBe(true);
    const settingsPath = result.path!;
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const hooksDir = path.join(tempHome, '.corivo', 'hooks');
    const skillsDir = path.join(path.dirname(settingsPath), 'skills');

    expect(result.path).toBe(settingsPath);
    expect(settings.hooks.SessionStart?.[0]?.hooks?.length).toBeGreaterThan(0);
    expect(settings.hooks.UserPromptSubmit?.[0]?.hooks?.length).toBeGreaterThan(0);
    expect(settings.hooks.Stop?.[0]?.hooks?.length).toBeGreaterThan(0);
    await expect(fs.readFile(path.join(hooksDir, 'session-init.sh'), 'utf8')).resolves.toContain('corivo status');
    await expect(fs.readFile(path.join(skillsDir, 'corivo-save', 'SKILL.md'), 'utf8')).resolves.toContain('Corivo 保存记忆');
    await expect(fs.readFile(path.join(skillsDir, 'corivo-query', 'SKILL.md'), 'utf8')).resolves.toContain('Corivo 查询记忆');
  });
});
