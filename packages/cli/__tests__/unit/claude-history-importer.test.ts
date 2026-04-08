import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importClaudeHistory,
  parseClaudeSessionFile,
} from '../../src/infrastructure/hosts/importers/claude-history.js';
import { claudeCodeHostAdapter } from '../../src/infrastructure/hosts/adapters/claude-code.js';

describe('Claude history importer', () => {
  it('parses a Claude session file into an imported session record', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-history-'));
    const sessionPath = path.join(tempDir, 'session-1.json');

    await fs.writeFile(
      sessionPath,
      JSON.stringify({
        sessionId: 'claude-session-1',
        startedAt: '2026-04-01T10:00:00.000Z',
        endedAt: '2026-04-01T10:05:00.000Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: [{ type: 'text', text: 'Remember the release checklist.' }],
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'I will remember it.',
          },
          {
            id: 'msg-3',
            role: 'assistant',
            content: { text: 'Second response' },
          },
        ],
      }),
      'utf8',
    );

    try {
      const session = await parseClaudeSessionFile(sessionPath);

      expect(session).toMatchObject({
        host: 'claude-code',
        externalSessionId: 'claude-session-1',
        startedAt: Date.parse('2026-04-01T10:00:00.000Z'),
        endedAt: Date.parse('2026-04-01T10:05:00.000Z'),
        messages: [
          {
            externalMessageId: 'msg-1',
            role: 'user',
            content: 'Remember the release checklist.',
          },
          {
            externalMessageId: 'msg-2',
            role: 'assistant',
            content: 'I will remember it.',
          },
          {
            externalMessageId: 'msg-3',
            role: 'assistant',
            content: 'Second response',
          },
        ],
      });
      expect(session?.cursor.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('imports Claude sessions and skips malformed files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-history-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const validPath = path.join(sessionsDir, 'valid-session.json');
    const invalidPath = path.join(sessionsDir, 'broken-session.json');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      validPath,
      JSON.stringify({
        sessionId: 'claude-session-2',
        startedAt: '2026-04-01T11:00:00.000Z',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Track this decision.' },
          { id: 'msg-2', role: 'assistant', content: 'Tracked.' },
        ],
      }),
      'utf8',
    );
    await fs.writeFile(invalidPath, '{not-json', 'utf8');

    try {
      const result = await importClaudeHistory({ all: true, target: sessionsDir });

      expect(result).toMatchObject({
        success: true,
        host: 'claude-code',
        mode: 'full',
        importedSessionCount: 1,
        importedMessageCount: 2,
        summary: expect.stringContaining('1 session'),
      });
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        externalSessionId: 'claude-session-2',
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves a project-root target to Claude session roots only and avoids duplicate imports', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-project-root-'));
    const sessionsDir = path.join(tempDir, '.claude', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      path.join(sessionsDir, 'history-session.json'),
      JSON.stringify({
        sessionId: 'claude-history-only',
        messages: [{ id: 'msg-1', role: 'user', content: 'History only' }],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(tempDir, 'not-history.json'),
      JSON.stringify({
        sessionId: 'project-root-noise',
        messages: [{ id: 'msg-1', role: 'user', content: 'Do not scan me' }],
      }),
      'utf8',
    );

    try {
      const result = await importClaudeHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: true,
        importedSessionCount: 1,
        importedMessageCount: 1,
      });
      expect(result.sessions.map((session) => session.externalSessionId)).toEqual(['claude-history-only']);
      expect(result.sessions[0]?.sourcePath).toContain(path.join('.claude', 'sessions'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('applies limit after parsing valid Claude sessions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-limit-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const invalidPath = path.join(sessionsDir, 'invalid-session.json');
    const validPath = path.join(sessionsDir, 'valid-session.json');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(invalidPath, '{not-json', 'utf8');
    await fs.writeFile(
      validPath,
      JSON.stringify({
        sessionId: 'claude-valid-late',
        messages: [{ id: 'msg-1', role: 'assistant', content: 'Valid later session' }],
      }),
      'utf8',
    );

    const older = new Date('2026-04-01T00:00:00.000Z');
    const newer = new Date('2026-04-01T00:10:00.000Z');
    await fs.utimes(invalidPath, older, older);
    await fs.utimes(validPath, newer, newer);

    try {
      const result = await importClaudeHistory({ all: true, target: sessionsDir, limit: 1 });

      expect(result).toMatchObject({
        success: true,
        importedSessionCount: 1,
        importedMessageCount: 1,
      });
      expect(result.sessions.map((session) => session.externalSessionId)).toEqual(['claude-valid-late']);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns no source when directory target lacks Claude history roots', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-no-source-'));

    await fs.writeFile(
      path.join(tempDir, 'unrelated.json'),
      JSON.stringify({
        sessionId: 'not-claude-history',
        messages: [{ id: 'msg-1', role: 'user', content: 'ignore me' }],
      }),
      'utf8',
    );

    try {
      const result = await importClaudeHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: false,
        host: 'claude-code',
        importedSessionCount: 0,
        importedMessageCount: 0,
        summary: expect.stringContaining('No Claude session history source detected'),
        error: expect.stringContaining('No Claude session history source detected'),
      });
      expect(result.sessions).toEqual([]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('delegates Claude adapter history import to the importer', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-claude-history-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      path.join(sessionsDir, 'adapter-session.json'),
      JSON.stringify({
        sessionId: 'claude-session-adapter',
        messages: [{ id: 'msg-1', role: 'user', content: 'Adapter import test' }],
      }),
      'utf8',
    );

    try {
      expect(claudeCodeHostAdapter.capabilities).toContain('history-import');

      const result = await claudeCodeHostAdapter.importHistory!({ all: true, target: sessionsDir });

      expect(result).toMatchObject({
        success: true,
        host: 'claude-code',
        importedSessionCount: 1,
        importedMessageCount: 1,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
