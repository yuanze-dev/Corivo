import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectGlobalClaudeCodeHost } from '../../src/hosts/installers/claude-host.js';

const CLAUDE_SESSION_INIT_PATH = path.resolve('../plugins/claude-code/hooks/scripts/session-init.sh');
const CLAUDE_INGEST_TURN_PATH = path.resolve('../plugins/claude-code/hooks/scripts/ingest-turn.sh');
const CLAUDE_QUERY_SKILL_PATH = path.resolve('../plugins/claude-code/skills/corivo-query/skill.md');
const CLAUDE_SAVE_SKILL_PATH = path.resolve('../plugins/claude-code/skills/corivo-save/skill.md');

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
    const packagedSessionInit = await fs.readFile(CLAUDE_SESSION_INIT_PATH, 'utf8');
    const packagedIngestTurn = await fs.readFile(CLAUDE_INGEST_TURN_PATH, 'utf8');
    const packagedQuerySkill = await fs.readFile(CLAUDE_QUERY_SKILL_PATH, 'utf8');
    const packagedSaveSkill = await fs.readFile(CLAUDE_SAVE_SKILL_PATH, 'utf8');

    expect(result.path).toBe(settingsPath);
    expect(settings.hooks.SessionStart?.[0]?.hooks?.length).toBeGreaterThan(0);
    expect(settings.hooks.UserPromptSubmit?.[0]?.hooks?.length).toBeGreaterThan(0);
    expect(settings.hooks.Stop?.[0]?.hooks?.length).toBeGreaterThan(0);
    await expect(fs.readFile(path.join(hooksDir, 'session-init.sh'), 'utf8')).resolves.toBe(packagedSessionInit);
    await expect(fs.readFile(path.join(hooksDir, 'ingest-turn.sh'), 'utf8')).resolves.toBe(packagedIngestTurn);
    await expect(fs.readFile(path.join(skillsDir, 'corivo-save', 'SKILL.md'), 'utf8')).resolves.toBe(packagedSaveSkill);
    await expect(fs.readFile(path.join(skillsDir, 'corivo-query', 'SKILL.md'), 'utf8')).resolves.toBe(packagedQuerySkill);
  });
});
