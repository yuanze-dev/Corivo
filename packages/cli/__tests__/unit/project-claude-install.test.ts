import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectClaudeHost } from '../../src/inject/claude-rules.js';

describe('project-claude install helper', () => {
  let tempHome: string;
  let tempProject: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-project-claude-home-'));
    tempProject = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-project-claude-project-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempProject, { recursive: true, force: true });
  });

  it('replaces existing CLAUDE.md Corivo section when force=true', async () => {
    const claudePath = path.join(tempProject, 'CLAUDE.md');
    const initial = await installProjectClaudeHost(tempProject);
    expect(initial.success).toBe(true);

    const seeded = await fs.readFile(claudePath, 'utf8');
    await fs.writeFile(
      claudePath,
      seeded.replace('## Corivo 记忆层', '## Corivo 记忆层\nFORCE_REPLACE_MARKER'),
      'utf8',
    );

    await installProjectClaudeHost(tempProject, { force: false });
    const afterNoForce = await fs.readFile(claudePath, 'utf8');
    expect(afterNoForce).toContain('FORCE_REPLACE_MARKER');

    await installProjectClaudeHost(tempProject, { force: true });
    const afterForce = await fs.readFile(claudePath, 'utf8');
    expect(afterForce).not.toContain('FORCE_REPLACE_MARKER');
  });

  it('falls back from ~/.claude/CLAUDE.md to ~/.config/claude/CLAUDE.md for global install', async () => {
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
    await fs.writeFile(path.join(tempHome, '.claude'), 'blocked', 'utf8');

    const result = await installProjectClaudeHost(undefined, { global: true });
    const fallbackPath = path.join(tempHome, '.config', 'claude', 'CLAUDE.md');

    expect(result.success).toBe(true);
    expect(result.path).toBe(fallbackPath);
    await expect(fs.readFile(fallbackPath, 'utf8')).resolves.toContain('## Corivo 记忆层');
    homedirSpy.mockRestore();
  });
});
