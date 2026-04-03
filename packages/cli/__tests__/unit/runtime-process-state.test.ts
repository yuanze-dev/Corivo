import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getProcessRuntimeState,
  resetProcessRuntimeState,
  updateProcessRuntimeState,
} from '../../src/runtime/process-state.js';

describe('process runtime state', () => {
  beforeEach(() => {
    resetProcessRuntimeState();
  });

  it('stores process-scoped metadata in a singleton registry', () => {
    updateProcessRuntimeState({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });

    expect(getProcessRuntimeState()).toEqual({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });
  });

  it('merges updates instead of replacing the entire runtime state', () => {
    updateProcessRuntimeState({
      runId: 'run-123',
      startedAt: 1000,
    });

    updateProcessRuntimeState({
      sessionId: 'session-456',
    });

    expect(getProcessRuntimeState()).toEqual({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });
  });

  it('keeps runtime modules free from commander option parsing and CLI printing', () => {
    const runtimeFiles = [
      'src/runtime/carry-over.ts',
      'src/runtime/follow-up-render.ts',
      'src/runtime/follow-up-retrieval.ts',
      'src/runtime/query-pack.ts',
      'src/runtime/query-history-policy.ts',
      'src/runtime/query-history-store.ts',
      'src/runtime/raw-recall.ts',
      'src/runtime/recall.ts',
      'src/runtime/review.ts',
      'src/runtime/retrieval.ts',
      'src/runtime/scoring.ts',
      'src/runtime/trigger-decision.ts',
      'src/runtime/trigger-decision-render.ts',
    ];

    for (const relativePath of runtimeFiles) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const content = fs.readFileSync(absolutePath, 'utf8');

      expect(content).not.toMatch(/from ['"]commander['"]/);
      expect(content).not.toMatch(/\bprogram\./);
      expect(content).not.toMatch(/\bconsole\.(log|info|warn|error)\s*\(/);
      expect(content).not.toMatch(/\bprocess\.stdout\b|\bprocess\.stderr\b/);
    }
  });

  it('keeps engine modules orchestration-oriented by delegating SQL and parsing rules to runtime', () => {
    const orchestratorFiles = [
      {
        path: 'src/engine/query-history.ts',
        expectedImport: /from ['"]@\/domain\/memory\/services\//,
      },
      {
        path: 'src/engine/trigger-decision.ts',
        expectedImport: /from ['"]@\/domain\/memory\/services\//,
      },
      {
        path: 'src/engine/follow-up.ts',
        expectedImport: /from ['"]@\/domain\/memory\/services\//,
      },
    ];

    for (const { path: relativePath, expectedImport } of orchestratorFiles) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      expect(content).not.toMatch(/\bquery_logs\b/);
      expect(content).not.toMatch(/\bprepare\s*\(/);
      expect(content).toMatch(expectedImport);
    }
  });

  it('keeps trigger/follow-up/query-history business policy out of engine orchestration', () => {
    const triggerEngineContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/engine/trigger-decision.ts'),
      'utf8',
    );
    const followUpEngineContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/engine/follow-up.ts'),
      'utf8',
    );
    const queryHistoryEngineContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/engine/query-history.ts'),
      'utf8',
    );

    // Trigger engine should orchestrate, not own render payload policy.
    expect(triggerEngineContent).not.toMatch(/title:\s*['"`]/);
    expect(triggerEngineContent).not.toMatch(/message:\s*`/);
    expect(triggerEngineContent).not.toMatch(/expires_at:\s*nowSec\s*\+/);
    expect(triggerEngineContent).not.toMatch(/slice\(0,\s*(50|100)\)/);

    // Follow-up engine should not own output policy/formatting.
    expect(followUpEngineContent).not.toContain('[corivo]');
    expect(followUpEngineContent).not.toMatch(/slice\(0,\s*3\)/);

    // Query-history engine should not hard-code policy windows/limits.
    expect(queryHistoryEngineContent).not.toMatch(/7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(queryHistoryEngineContent).not.toMatch(/30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(queryHistoryEngineContent).not.toMatch(/limit:\s*50/);
    expect(queryHistoryEngineContent).not.toMatch(/slice\(0,\s*3\)/);
  });
});
