/**
 * Claude Code configuration extractor.
 * Extracts Claude Code global rules, settings, and MCP configuration.
 */

import { readFileSafe, expandHome, findFilesInHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Extracts content from a CLAUDE.md file.
 */
async function extractClaudeMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // Extract headings and main paragraphs — exclude conversation history and other sensitive content
  const lines = content.split('\n');
  const mainSections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    // Skip lines that may contain secrets
    if (
      line.includes('API_KEY') ||
      line.includes('SECRET') ||
      line.includes('PASSWORD') ||
      line.includes('TOKEN')
    ) {
      continue;
    }

    // Collect heading-delimited sections
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

  // Save concise rule sections (long blocks are too noisy to be useful)
  for (const section of mainSections) {
    if (section.length < 500) {
      // Only persist short rule fragments
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

  // If the file is too long and no sections were saved, record a summary block instead
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
 * Extracts relevant fields from settings.json.
 */
async function extractSettings(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const settings = JSON.parse(content);

    // Extract allowedTools — reflects the user's tool permission preferences
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

    // Extract model preference
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

    // Extract temperature setting
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
    // Parsing failed
  }

  return blocks;
}

/**
 * Extracts MCP server configuration.
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
    // Parsing failed
  }

  return blocks;
}

/**
 * Extracts custom slash commands from the commands directory.
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
    // Directory does not exist
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'claude-code',
  path: async () => {
    const results: string[] = [];

    // Check for global CLAUDE.md
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

    // Check for .claude.json (MCP configuration)
    try {
      await fs.access(path.join(os.homedir(), '.claude.json'));
      results.push(path.join(os.homedir(), '.claude.json'));
    } catch {
      // ignore
    }

    // Check for custom commands directory
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
