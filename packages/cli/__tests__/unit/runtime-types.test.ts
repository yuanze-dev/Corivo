import { describe, expect, it } from 'vitest';
import {
  createQueryPack,
  type QueryPackInput,
} from '../../src/runtime/query-pack.js';
import {
  type CorivoConfidence,
  type CorivoSurfaceItem,
  type CorivoSurfaceMode,
  isCorivoConfidence,
  isCorivoSurfaceMode,
} from '../../src/runtime/types.js';

describe('runtime type guards', () => {
  it('accepts supported surface modes', () => {
    const modes: CorivoSurfaceMode[] = [
      'carry_over',
      'recall',
      'challenge',
      'uncertain',
      'review',
    ];

    for (const mode of modes) {
      expect(isCorivoSurfaceMode(mode)).toBe(true);
    }
  });

  it('rejects unsupported surface modes', () => {
    expect(isCorivoSurfaceMode('suggest')).toBe(false);
    expect(isCorivoSurfaceMode('')).toBe(false);
  });

  it('accepts supported confidence levels', () => {
    const levels: CorivoConfidence[] = ['high', 'medium', 'low'];

    for (const level of levels) {
      expect(isCorivoConfidence(level)).toBe(true);
    }
  });

  it('rejects unsupported confidence levels', () => {
    expect(isCorivoConfidence('certain')).toBe(false);
    expect(isCorivoConfidence('')).toBe(false);
  });
});

describe('createQueryPack', () => {
  it('normalizes whitespace and derives anchors from prompt-oriented input', () => {
    const input: QueryPackInput = {
      prompt: '  Migrate the auth cache to Redis and confirm the team decision  ',
      cwd: '/workspace/project-a',
      sessionId: 'session-123',
      surfacedMemoryIds: ['blk_2', 'blk_1', 'blk_1'],
      recentTurns: ['  We discussed Redis yesterday.  ', ''],
    };

    const queryPack = createQueryPack(input);

    expect(queryPack.anchorText).toBe('Migrate the auth cache to Redis and confirm the team decision');
    expect(queryPack.prompt).toBe('Migrate the auth cache to Redis and confirm the team decision');
    expect(queryPack.assistantMessage).toBe('');
    expect(queryPack.cwd).toBe('/workspace/project-a');
    expect(queryPack.sessionId).toBe('session-123');
    expect(queryPack.recentTurns).toEqual(['We discussed Redis yesterday.']);
    expect(queryPack.surfacedMemoryIds).toEqual(['blk_1', 'blk_2']);
    expect(queryPack.anchorTerms).toEqual([
      'migrate',
      'auth',
      'cache',
      'redis',
      'confirm',
      'team',
      'decision',
    ]);
  });

  it('falls back to assistant text when prompt is absent', () => {
    const queryPack = createQueryPack({
      assistantMessage: 'I updated the PostgreSQL migration plan and kept the old decision in place.',
    });

    expect(queryPack.anchorText).toBe(
      'I updated the PostgreSQL migration plan and kept the old decision in place.',
    );
    expect(queryPack.prompt).toBe('');
    expect(queryPack.assistantMessage).toBe(
      'I updated the PostgreSQL migration plan and kept the old decision in place.',
    );
    expect(queryPack.anchorTerms).toContain('postgresql');
    expect(queryPack.anchorTerms).toContain('migration');
    expect(queryPack.anchorTerms).toContain('decision');
  });

  it('preserves payload evidence arrays for rendering contracts', () => {
    const payload: CorivoSurfaceItem = {
      mode: 'uncertain',
      confidence: 'low',
      whyNow: 'Prompt and memory share a loose database anchor.',
      claim: 'This may relate to your previous database migration discussion.',
      evidence: [],
      memoryIds: [],
    };

    expect(payload.mode).toBe('uncertain');
    expect(payload.confidence).toBe('low');
    expect(payload.evidence).toEqual([]);
    expect(payload.memoryIds).toEqual([]);
  });
});
