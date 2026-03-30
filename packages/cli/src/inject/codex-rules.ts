import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const START_MARKER = '<!-- CORIVO CODEX START -->';
const END_MARKER = '<!-- CORIVO CODEX END -->';
const TEMPLATE_PATH = new URL('../../../plugins/codex/templates/AGENTS.codex.md', import.meta.url);
const TEMPLATE_TEXT = await fs.readFile(TEMPLATE_PATH, 'utf8');

export const CODEX_RULES = `
${START_MARKER}
${TEMPLATE_TEXT}
${END_MARKER}
`.trim();

export async function injectCodexRules(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      // ignore
    }

    if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
      const regex = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*${escapeRegExp(END_MARKER)}`, 'g');
      content = content.replace(regex, CODEX_RULES);
    } else {
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += `\n${CODEX_RULES}\n`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function injectGlobalCodexRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const filePath = path.join(os.homedir(), '.codex', 'AGENTS.md');
  const result = await injectCodexRules(filePath);

  return {
    success: result.success,
    path: filePath,
    error: result.error,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
