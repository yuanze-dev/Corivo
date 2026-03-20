/**
 * Claude Code 配置提取器
 * 提取 Claude Code 的全局规则、设置、MCP 配置等
 */

import { readFileSafe, expandHome, findFilesInHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * 提取 CLAUDE.md 内容
 */
async function extractClaudeMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // 提取标题和主要段落（不包含对话历史等敏感内容）
  const lines = content.split('\n');
  const mainSections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    // 跳过可能的敏感内容
    if (
      line.includes('API_KEY') ||
      line.includes('SECRET') ||
      line.includes('PASSWORD') ||
      line.includes('TOKEN')
    ) {
      continue;
    }

    // 收集主要标题段落
    if (line.match(/^#{1,3}\s/)) {
      if (currentSection.length > 0) {
        mainSections.push(currentSection.join('\n'));
        currentSection = [];
      }
      currentSection.push(line);
    } else if (currentSection.length > 0) {
      currentSection.push(line);
    }
  }

  if (currentSection.length > 0) {
    mainSections.push(currentSection.join('\n'));
  }

  // 提取关键规则片段
  for (const section of mainSections) {
    if (section.length < 500) {
      // 只保存较短的规则
      blocks.push(
        createBlock({
          content: section.trim(),
          annotation: '偏好 · AI · Claude Code 规则',
          source: 'claude-code',
          filePath,
          metadata: { ruleType: 'claude_md' },
        })
      );
    }
  }

  // 如果内容过长，只记录摘要
  if (content.length > 1000 && blocks.length === 0) {
    blocks.push(
      createBlock({
        content: '已配置 Claude Code 全局规则',
        annotation: '知识 · 工具 · Claude Code',
        source: 'claude-code',
        filePath,
        metadata: { hasRules: true },
      })
    );
  }

  return blocks;
}

/**
 * 提取 settings.json
 */
async function extractSettings(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const settings = JSON.parse(content);

    // 提取 allowedTools（反映权限偏好）
    if (settings.allowedTools && Array.isArray(settings.allowedTools)) {
      blocks.push(
        createBlock({
          content: `允许的工具: ${settings.allowedTools.join(', ')}`,
          annotation: '偏好 · AI · 工具权限',
          source: 'claude-code',
          filePath,
          metadata: { allowedTools: settings.allowedTools },
        })
      );
    }

    // 提取模型偏好
    if (settings.apiSettings?.model) {
      blocks.push(
        createBlock({
          content: `默认模型: ${settings.apiSettings.model}`,
          annotation: '偏好 · AI · Claude 模型',
          source: 'claude-code',
          filePath,
          metadata: { model: settings.apiSettings.model },
        })
      );
    }

    // 提取 temperature
    if (settings.apiSettings?.temperature !== undefined) {
      blocks.push(
        createBlock({
          content: `温度设置: ${settings.apiSettings.temperature}`,
          annotation: '偏好 · AI · 温度',
          source: 'claude-code',
          filePath,
          metadata: { temperature: settings.apiSettings.temperature },
        })
      );
    }
  } catch {
    // 解析失败
  }

  return blocks;
}

/**
 * 提取 MCP 配置
 */
async function extractMcpConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const settings = JSON.parse(content);
    const mcpServers = settings.mcpServers || settings.mcp_servers || {};

    const serverNames = Object.keys(mcpServers);

    if (serverNames.length > 0) {
      blocks.push(
        createBlock({
          content: `MCP 服务器: ${serverNames.join(', ')}`,
          annotation: '知识 · 工具链 · MCP',
          source: 'claude-code',
          filePath,
          metadata: { mcpServers: serverNames },
        })
      );
    }
  } catch {
    // 解析失败
  }

  return blocks;
}

/**
 * 提取自定义命令
 */
async function extractCommands(commandsDir: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  try {
    const files = await fs.readdir(commandsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length > 0) {
      const commandNames = mdFiles.map(f => f.replace('.md', '').replace(/^/, '/'));
      blocks.push(
        createBlock({
          content: `自定义命令: ${commandNames.join(', ')}`,
          annotation: '知识 · 工作流 · Claude 命令',
          source: 'claude-code',
          filePath: commandsDir,
          metadata: { commands: commandNames },
        })
      );
    }
  } catch {
    // 目录不存在
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'claude-code',
  path: async () => {
    const results: string[] = [];

    // 检查全局 CLAUDE.md
    const claudeDirs = [
      path.join(os.homedir(), '.claude'),
      path.join(os.homedir(), '.config', 'claude'),
    ];

    for (const dir of claudeDirs) {
      try {
        await fs.access(dir);
        results.push(path.join(dir, 'CLAUDE.md'));
        results.push(path.join(dir, 'settings.json'));
        results.push(path.join(dir, 'settings.local.json'));
      } catch {
        continue;
      }
    }

    // 检查 .claude.json (MCP 配置)
    try {
      await fs.access(path.join(os.homedir(), '.claude.json'));
      results.push(path.join(os.homedir(), '.claude.json'));
    } catch {
      // ignore
    }

    // 检查自定义命令目录
    for (const dir of claudeDirs) {
      const commandsDir = path.join(dir, 'commands');
      try {
        await fs.access(commandsDir);
        results.push(commandsDir);
      } catch {
        continue;
      }
    }

    return results.filter(p => p);
  },
  priority: 90,
  timeout: 1000,
  extractor: async (content: string, filePath: string) => {
    const blocks = [];

    if (filePath.endsWith('CLAUDE.md')) {
      blocks.push(...(await extractClaudeMd(content, filePath)));
    } else if (filePath.includes('settings')) {
      blocks.push(...(await extractSettings(content, filePath)));
      blocks.push(...(await extractMcpConfig(content, filePath)));
    } else if (filePath.includes('commands')) {
      blocks.push(...(await extractCommands(filePath)));
    } else if (filePath.endsWith('.claude.json')) {
      blocks.push(...(await extractMcpConfig(content, filePath)));
    }

    return blocks;
  },
};

export default { source, extractClaudeMd, extractSettings, extractMcpConfig };
