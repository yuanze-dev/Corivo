import type { HostAdapter, HostId } from './types.js';
import { claudeCodeHostAdapter } from './adapters/claude-code.js';
import { codexHostAdapter } from './adapters/codex.js';
import { cursorHostAdapter } from './adapters/cursor.js';
import { opencodeHostAdapter } from './adapters/opencode.js';
import { projectClaudeHostAdapter } from './adapters/project-claude.js';

const adapters: HostAdapter[] = [];
const adapterById = new Map<HostId, HostAdapter>();

function registerHostAdapter(adapter: HostAdapter): void {
  const existingIndex = adapters.findIndex((item) => item.id === adapter.id);
  if (existingIndex >= 0) {
    adapters.splice(existingIndex, 1);
  }
  adapters.push(adapter);
  adapterById.set(adapter.id, adapter);
}

function getAllHostAdapters(): HostAdapter[] {
  return adapters.slice();
}

function getHostAdapter(id: string): HostAdapter | null {
  return adapterById.get(id as HostId) ?? null;
}

[
  claudeCodeHostAdapter,
  codexHostAdapter,
  cursorHostAdapter,
  opencodeHostAdapter,
  projectClaudeHostAdapter,
].forEach((adapter) => {
  registerHostAdapter(adapter);
});

export {
  getAllHostAdapters,
  getHostAdapter,
  registerHostAdapter,
};
