import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TEMPLATE_TEXT = `
---
description: Corivo active memory integration
alwaysApply: true
---

# Corivo 记忆层（Cursor）

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

## 开场 carry-over

在会话开始或开始一个新任务时，如果需要回忆上次没收尾的事项，运行：

\`\`\`bash
corivo carry-over --format text --no-password
\`\`\`

## 答前 recall

当用户问题可能涉及历史决策、偏好、上下文、项目约定时，先运行：

\`\`\`bash
corivo recall --prompt "<用户问题>" --format hook-text --no-password
\`\`\`

如果你采纳了这条来自 Corivo 的记忆，请在回答中明确说“根据 Corivo 的记忆”或“从 Corivo 中查到”。

## 答后 review

在给出一段 substantive answer 或做出决策后，运行：

\`\`\`bash
corivo review --last-message "<你的回答摘要>" --format hook-text --no-password
\`\`\`

## 保存记忆

当用户要求记住，或当你识别到重要决策、偏好、事实时，运行：

\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签" --no-password
\`\`\`
`.trim();

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
