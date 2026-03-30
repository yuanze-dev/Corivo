import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TEMPLATE_PATH = new URL('../../../plugins/cursor/templates/corivo.mdc', import.meta.url);
const TEMPLATE_TEXT = await fs.readFile(TEMPLATE_PATH, 'utf8');

export async function injectGlobalCursorRules(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const rulesDir = path.join(home, '.cursor', 'rules');
  const filePath = path.join(rulesDir, 'corivo.mdc');

  try {
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(filePath, TEMPLATE_TEXT, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const CURSOR_RULE_TEMPLATE = TEMPLATE_TEXT;
