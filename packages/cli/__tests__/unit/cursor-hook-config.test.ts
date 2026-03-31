import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type HookEntry = {
  command: string;
};

type HookGroup = {
  hooks?: HookEntry[];
};

type CursorHooksConfig = {
  hooks: Record<string, HookGroup[]>;
};

const hooksConfigPath = new URL('../../../plugins/hosts/cursor/hooks/hooks.json', import.meta.url);
const promptRecallScriptPath = new URL(
  '../../../plugins/hosts/cursor/hooks/scripts/prompt-recall.sh',
  import.meta.url
);
const stopReviewScriptPath = new URL(
  '../../../plugins/hosts/cursor/hooks/scripts/stop-review.sh',
  import.meta.url
);

function readHooksConfig(): CursorHooksConfig {
  return JSON.parse(readFileSync(hooksConfigPath, 'utf8')) as CursorHooksConfig;
}

describe('Cursor hook wiring', () => {
  it('includes SessionStart, UserPromptSubmit, and Stop hooks', () => {
    const hooksConfig = readHooksConfig();
    const sessionStart = hooksConfig.hooks.SessionStart?.[0]?.hooks ?? [];
    const userPromptSubmit = hooksConfig.hooks.UserPromptSubmit?.[0]?.hooks ?? [];
    const stop = hooksConfig.hooks.Stop?.[0]?.hooks ?? [];

    expect(sessionStart.length).toBeGreaterThan(0);
    expect(userPromptSubmit.length).toBeGreaterThan(0);
    expect(stop.length).toBeGreaterThan(0);

    expect(sessionStart.map((hook) => hook.command)).toContain(
      'bash ${CURSOR_PLUGIN_ROOT}/hooks/scripts/session-carry-over.sh'
    );
    expect(userPromptSubmit.map((hook) => hook.command)).toContain(
      'bash ${CURSOR_PLUGIN_ROOT}/hooks/scripts/prompt-recall.sh'
    );
    expect(stop.map((hook) => hook.command)).toContain(
      'bash ${CURSOR_PLUGIN_ROOT}/hooks/scripts/stop-review.sh'
    );
  });

  it('uses corivo query --format hook-text in the prompt recall script', () => {
    const script = readFileSync(promptRecallScriptPath, 'utf8');
    expect(script).toContain('corivo query --prompt "$PROMPT" --format hook-text');
  });

  it('uses corivo review --format hook-text in the stop review script', () => {
    const script = readFileSync(stopReviewScriptPath, 'utf8');
    expect(script).toContain(
      'corivo review --last-message "$LAST_MESSAGE" --format hook-text'
    );
  });
});
