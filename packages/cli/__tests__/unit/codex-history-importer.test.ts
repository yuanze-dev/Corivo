import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codexHostAdapter } from '../../src/hosts/adapters/codex.js';
import { importCodexHistory } from '../../src/hosts/importers/codex-history.js';

describe('Codex history importer', () => {
  it('parses Codex JSONL history into imported sessions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const sessionPath = path.join(sessionsDir, 'rollout-2026-04-02.jsonl');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-02T01:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-1',
            timestamp: '2026-04-02T01:00:00.000Z',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T01:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Summarize the rollout notes.',
              },
            ],
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T01:00:10.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Here is the rollout summary.',
              },
            ],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const result = await importCodexHistory({ all: true, target: sessionsDir });

      expect(result).toMatchObject({
        success: true,
        host: 'codex',
        mode: 'full',
        importedSessionCount: 1,
        importedMessageCount: 2,
      });
      expect(result.sessions).toMatchObject([
        {
          host: 'codex',
          externalSessionId: 'codex-session-1',
          startedAt: Date.parse('2026-04-02T01:00:00.000Z'),
          messages: [
            {
              role: 'user',
              content: 'Summarize the rollout notes.',
            },
            {
              role: 'assistant',
              content: 'Here is the rollout summary.',
            },
          ],
        },
      ]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns unavailable when no stable Codex history source is detected', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-empty-'));

    try {
      const result = await importCodexHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: false,
        host: 'codex',
        mode: 'full',
        importedSessionCount: 0,
        importedMessageCount: 0,
        unavailableReason: expect.stringContaining('No stable Codex history source detected'),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves a project-root target to Codex session roots only and avoids duplicate imports', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-project-root-'));
    const sessionsDir = path.join(tempDir, '.codex', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      path.join(sessionsDir, 'history-session.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-04-02T02:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'codex-history-only', timestamp: '2026-04-02T02:00:00.000Z' },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T02:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Only import host history' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(tempDir, 'not-history.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-04-02T03:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'project-root-noise', timestamp: '2026-04-02T03:00:00.000Z' },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T03:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Do not scan me' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const result = await importCodexHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: true,
        importedSessionCount: 1,
        importedMessageCount: 1,
      });
      expect(result.sessions.map((session) => session.externalSessionId)).toEqual(['codex-history-only']);
      expect(result.sessions[0]?.sourcePath).toContain(path.join('.codex', 'sessions'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('reports parse failure when Codex history files exist but no sessions are parseable', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-malformed-'));
    const sessionsDir = path.join(tempDir, '.codex', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(path.join(sessionsDir, 'broken.jsonl'), '{not-json', 'utf8');

    try {
      const result = await importCodexHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: false,
        host: 'codex',
        importedSessionCount: 0,
        importedMessageCount: 0,
        summary: expect.stringContaining('No parseable Codex sessions found'),
        error: expect.stringContaining('No parseable Codex sessions found'),
      });
      expect(result.unavailableReason).toBeUndefined();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('applies limit after parsing valid Codex sessions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-limit-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const invalidPath = path.join(sessionsDir, 'invalid-session.jsonl');
    const validPath = path.join(sessionsDir, 'valid-session.jsonl');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(invalidPath, '{not-json', 'utf8');
    await fs.writeFile(
      validPath,
      [
        JSON.stringify({
          timestamp: '2026-04-02T04:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'codex-valid-late', timestamp: '2026-04-02T04:00:00.000Z' },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T04:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Valid later session' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const older = new Date('2026-04-02T00:00:00.000Z');
    const newer = new Date('2026-04-02T00:10:00.000Z');
    await fs.utimes(invalidPath, older, older);
    await fs.utimes(validPath, newer, newer);

    try {
      const result = await importCodexHistory({ all: true, target: sessionsDir, limit: 1 });

      expect(result).toMatchObject({
        success: true,
        importedSessionCount: 1,
        importedMessageCount: 1,
      });
      expect(result.sessions.map((session) => session.externalSessionId)).toEqual(['codex-valid-late']);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('delegates Codex adapter history import to the importer', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-empty-'));

    try {
      expect(codexHostAdapter.capabilities).toContain('history-import');

      const result = await codexHostAdapter.importHistory!({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: false,
        host: 'codex',
        unavailableReason: expect.stringContaining('No stable Codex history source detected'),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
  it('returns no source when directory target lacks Codex history roots', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-no-source-'));

    await fs.writeFile(
      path.join(tempDir, 'unrelated.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-04-02T05:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'not-codex-history', timestamp: '2026-04-02T05:00:00.000Z' },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T05:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'ignore me' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const result = await importCodexHistory({ all: true, target: tempDir });

      expect(result).toMatchObject({
        success: false,
        host: 'codex',
        importedSessionCount: 0,
        importedMessageCount: 0,
        summary: expect.stringContaining('No stable Codex history source detected'),
        unavailableReason: expect.stringContaining('No stable Codex history source detected'),
      });
      expect(result.sessions).toEqual([]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
