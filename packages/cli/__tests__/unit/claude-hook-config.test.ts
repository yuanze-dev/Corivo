import { describe, expect, it } from 'vitest';
import hooksConfig from '../../../plugins/hosts/claude-code/hooks/hooks.json';

describe('Claude Code hook wiring', () => {
  it('wires SessionStart to init and carry-over hooks', () => {
    const hooks = hooksConfig.hooks.SessionStart?.[0]?.hooks ?? [];
    const commands = hooks.map((hook) => hook.command);

    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session-init.sh');
    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session-carry-over.sh');
  });

  it('wires UserPromptSubmit to ingestion and query hooks', () => {
    const hooks = hooksConfig.hooks.UserPromptSubmit?.[0]?.hooks ?? [];
    const commands = hooks.map((hook) => hook.command);

    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ingest-turn.sh user');
    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/prompt-recall.sh');
  });

  it('wires Stop to ingestion and review hooks', () => {
    const hooks = hooksConfig.hooks.Stop?.[0]?.hooks ?? [];
    const commands = hooks.map((hook) => hook.command);

    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ingest-turn.sh assistant');
    expect(commands).toContain('bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop-review.sh');
  });
});
