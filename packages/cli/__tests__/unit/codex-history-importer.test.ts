import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codexHostAdapter } from '../../src/infrastructure/hosts/adapters/codex.js';
import { importCodexHistory } from '../../src/infrastructure/hosts/importers/codex-history.js';

describe('Codex history importer', () => {
  it('imports only user event messages and assistant final answers', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-filtered-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const sessionPath = path.join(sessionsDir, 'rollout-2026-04-02.jsonl');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-02T17:32:30.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-filtered',
            timestamp: '2026-04-02T17:32:30.000Z',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T17:32:32.337Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: '你好你好你好你好 是 我',
            images: [],
            local_images: [],
            text_elements: [],
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T17:32:35.334Z',
          type: 'event_msg',
          payload: {
            type: 'agent_message',
            message: '你好，我在。你想让我帮你做什么？',
            phase: 'final_answer',
            memory_citation: null,
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-02T17:32:35.334Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '你好，我在。你想让我帮你做什么？',
              },
            ],
            phase: 'final_answer',
          },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const result = await importCodexHistory({ all: true, target: sessionsDir });

      expect(result).toMatchObject({
        success: true,
        importedSessionCount: 1,
        importedMessageCount: 2,
      });
      expect(result.sessions[0]?.messages).toEqual([
        {
          role: 'user',
          content: '你好你好你好你好 是 我',
          createdAt: Date.parse('2026-04-02T17:32:32.337Z'),
        },
        {
          role: 'assistant',
          content: '你好，我在。你想让我帮你做什么？',
          createdAt: Date.parse('2026-04-02T17:32:35.334Z'),
        },
      ]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('ignores non-final assistant responses and event agent duplicates', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-codex-history-non-final-'));
    const sessionsDir = path.join(tempDir, 'sessions');
    const sessionPath = path.join(sessionsDir, 'rollout-2026-04-03.jsonl');
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-03T09:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-non-final',
            timestamp: '2026-04-03T09:00:00.000Z',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-03T09:00:02.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: '给我一句最终答复',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-03T09:00:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'analysis',
            content: [
              {
                type: 'output_text',
                text: '这是中间分析，不该被导入。',
              },
            ],
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-03T09:00:04.000Z',
          type: 'event_msg',
          payload: {
            type: 'agent_message',
            phase: 'final_answer',
            message: '这是重复包装，不该被导入。',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-03T09:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [
              {
                type: 'output_text',
                text: '这是最终答复。',
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
        importedSessionCount: 1,
        importedMessageCount: 2,
      });
      expect(result.sessions[0]?.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }))).toEqual([
        {
          role: 'user',
          content: '给我一句最终答复',
        },
        {
          role: 'assistant',
          content: '这是最终答复。',
        },
      ]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

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
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Summarize the rollout notes.',
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
            phase: 'final_answer',
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
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Only import host history',
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
            phase: 'final_answer',
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
