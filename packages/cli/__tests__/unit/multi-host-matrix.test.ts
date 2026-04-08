import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createHostAdapterPayload,
  getHostAdapterOutputFormat,
} from '../../src/runtime/host-adapter.js';
import type { HostAdapterCapability } from '../../src/runtime/types.js';
import { getHostAdapter } from '../../src/infrastructure/hosts/registry.js';
import { resolveHostBridgeCommand } from '../../src/runtime/host-bridge-policy.js';
import { createBridgeHostEventUseCase } from '../../src/application/hosts/bridge-host-event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('multi-host adapter matrix', () => {
  it('maps Cursor to full-hook behavior', () => {
    const capability: HostAdapterCapability = 'full-hook';

    expect(getHostAdapterOutputFormat(capability)).toBe('hook-text');
    expect(createHostAdapterPayload(capability, 'prompt-submit').runtimeCommand).toBe('recall');
  });

  it('maps OpenCode to plugin-transform behavior', () => {
    const capability: HostAdapterCapability = 'plugin-transform';

    expect(getHostAdapterOutputFormat(capability)).toBe('hook-text');
    expect(createHostAdapterPayload(capability, 'response-done').runtimeCommand).toBe('review');
  });

  it('maps Codex to instruction-driven behavior', () => {
    const capability: HostAdapterCapability = 'instruction-driven';

    expect(getHostAdapterOutputFormat(capability)).toBe('text');
    expect(createHostAdapterPayload(capability, 'session-start').runtimeCommand).toBe('carry-over');
  });

  it('keeps CLI bridge commands stable across hosts and only varies output surface by host capability', () => {
    const expected = {
      'session-start': 'carry-over',
      'prompt-submit': 'recall',
      'response-done': 'review',
    } as const;
    const hostIds = ['codex', 'claude-code', 'cursor', 'opencode'] as const;

    for (const hostId of hostIds) {
      const adapter = getHostAdapter(hostId);
      expect(adapter).not.toBeNull();

      for (const [event, command] of Object.entries(expected)) {
        const bridge = resolveHostBridgeCommand(hostId, event as keyof typeof expected);
        expect(bridge.command).toBe(command);
      }
    }
  });

  it('builds exact CLI command/flags for bridge events', () => {
    const runBridge = createBridgeHostEventUseCase();

    expect(runBridge({
      host: 'codex',
      event: 'session-start',
    })).toEqual({
      command: 'carry-over',
      args: ['--format', 'hook-text'],
    });

    expect(runBridge({
      host: 'cursor',
      event: 'prompt-submit',
      payload: { prompt: 'Need prior decision context' },
    })).toEqual({
      command: 'recall',
      args: ['--prompt', 'Need prior decision context', '--format', 'hook-text'],
    });

    expect(runBridge({
      host: 'claude-code',
      event: 'response-done',
      payload: { lastMessage: 'I will update the migration plan.' },
    })).toEqual({
      command: 'review',
      args: ['--last-message', 'I will update the migration plan.', '--format', 'hook-text'],
    });
  });

  it('keeps hook scripts thin and free of host-side business rules', () => {
    const codexSessionInit = readRepoFile('packages/plugins/codex/hooks/scripts/session-init.sh');
    const codexPromptSubmit = readRepoFile('packages/plugins/codex/hooks/scripts/user-prompt-submit.sh');
    const codexStop = readRepoFile('packages/plugins/codex/hooks/scripts/stop.sh');
    const claudeSessionInit = readRepoFile('packages/plugins/claude-code/hooks/scripts/session-init.sh');
    const claudePromptRecall = readRepoFile('packages/plugins/claude-code/hooks/scripts/prompt-recall.sh');
    const claudeIngestTurn = readRepoFile('packages/plugins/claude-code/hooks/scripts/ingest-turn.sh');
    const cursorPromptRecall = readRepoFile('packages/plugins/cursor/hooks/scripts/prompt-recall.sh');

    expect(codexSessionInit).toContain('corivo carry-over --format hook-text');
    expect(codexSessionInit).not.toContain('corivo status');
    expect(codexSessionInit).not.toContain('blocks available');

    expect(codexPromptSubmit).toContain('corivo recall --prompt "$PROMPT" --format hook-text');
    expect(codexPromptSubmit).not.toContain('corivo status');
    expect(codexPromptSubmit).not.toContain('未初始化');

    expect(codexStop).toContain('corivo review');
    expect(codexStop).not.toContain('"decision":"block"');
    expect(codexStop).not.toContain('I(\'| wi)ll remember');

    expect(claudeSessionInit).toContain('corivo carry-over --format hook-text');
    expect(claudeSessionInit).not.toContain('corivo status');
    expect(claudeSessionInit).not.toContain('blocks |');
    expect(claudePromptRecall).toContain('corivo recall --prompt "$PROMPT" --format hook-text');

    expect(claudeIngestTurn).toContain('corivo ingest-message');
    expect(claudeIngestTurn).not.toContain('Content too short or empty, skipping');

    expect(cursorPromptRecall).toContain('corivo recall --prompt "$PROMPT" --format hook-text');
    expect(cursorPromptRecall).not.toContain('corivo review');
  });
});
