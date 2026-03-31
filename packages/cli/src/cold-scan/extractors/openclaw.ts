/**
 * OpenClaw configuration extractor
 * Extract OpenClaw AI assistant configuration, model preferences, channels, skills and other information
 */

import { readFileSafe, expandHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * OpenClaw configuration structure (part)
 */
interface OpenClawConfig {
  models?: {
    providers?: Record<string, unknown>;
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
    list?: Array<{
      id: string;
      name?: string;
      model?: string;
    }>;
  };
  channels?: {
    feishu?: { enabled?: boolean };
    discord?: { enabled?: boolean };
    telegram?: { enabled?: boolean };
    [key: string]: { enabled?: boolean } | undefined;
  };
  plugins?: {
    entries?: Record<string, { enabled?: boolean } | undefined>;
    installs?: Record<string, { version?: string } | undefined>;
  };
}

/**
 * Extract the main configuration file
 */
async function extractConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const config = JSON.parse(content) as OpenClawConfig;

    // Extract model preferences
    const primaryModel = config.agents?.defaults?.model?.primary;
    if (primaryModel) {
      blocks.push(
        createBlock({
          content: `OpenClaw 默认模型: ${primaryModel}`,
          annotation: '偏好 · AI · 模型',
          source: 'openclaw',
          filePath,
          metadata: { model: primaryModel },
        })
      );
    }

    // Extract available agents
    const agents = config.agents?.list || [];
    if (agents.length > 0) {
      const agentNames = agents.map(a => a.name || a.id).join(', ');
      blocks.push(
        createBlock({
          content: `OpenClaw Agents: ${agentNames}`,
          annotation: '知识 · 工具 · OpenClaw',
          source: 'openclaw',
          filePath,
          metadata: { agents: agents.map(a => ({ id: a.id, name: a.name })) },
        })
      );
    }

    // Extract enabled channels
    const enabledChannels: string[] = [];
    for (const [channel, channelConfig] of Object.entries(config.channels || {})) {
      if (channelConfig && typeof channelConfig === 'object' && 'enabled' in channelConfig && channelConfig.enabled) {
        enabledChannels.push(channel);
      }
    }
    if (enabledChannels.length > 0) {
      blocks.push(
        createBlock({
          content: `OpenClaw 启用的通道: ${enabledChannels.join(', ')}`,
          annotation: '知识 · 工作流 · OpenClaw',
          source: 'openclaw',
          filePath,
          metadata: { channels: enabledChannels },
        })
      );
    }

    // Extract enabled plugins
    const enabledPlugins: string[] = [];
    const pluginVersions: Record<string, string> = {};
    for (const [plugin, pluginConfig] of Object.entries(config.plugins?.entries || {})) {
      if (pluginConfig && typeof pluginConfig === 'object' && 'enabled' in pluginConfig && pluginConfig.enabled) {
        enabledPlugins.push(plugin);
      }
    }
    for (const [plugin, info] of Object.entries(config.plugins?.installs || {})) {
      if (info && typeof info === 'object' && 'version' in info) {
        pluginVersions[plugin] = info.version as string;
      }
    }
    if (enabledPlugins.length > 0) {
      blocks.push(
        createBlock({
          content: `OpenClaw 启用的插件: ${enabledPlugins.join(', ')}`,
          annotation: '知识 · 工具链 · OpenClaw',
          source: 'openclaw',
          filePath,
          metadata: { plugins: enabledPlugins, versions: pluginVersions },
        })
      );
    }
  } catch {
    // Parsing failed
  }

  return blocks;
}

/**
 * Extract AGENTS.md (behavior rules)
 */
async function extractAgentsMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // Extract key rule paragraphs
  const lines = content.split('\n');
  const rules: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    // Collect main paragraphs
    if (line.match(/^#{2,4}\s/)) {
      if (currentSection.length > 0) {
        const section = currentSection.join('\n').trim();
        if (section.length > 50 && section.length < 500) {
          rules.push(section);
        }
        currentSection = [];
      }
      currentSection.push(line);
    } else if (currentSection.length > 0) {
      currentSection.push(line);
    }
  }

  if (currentSection.length > 0) {
    const section = currentSection.join('\n').trim();
    if (section.length > 50 && section.length < 500) {
      rules.push(section);
    }
  }

  // Save important rules
  for (const rule of rules.slice(0, 5)) {
    blocks.push(
      createBlock({
        content: `[OpenClaw 规则] ${rule.substring(0, 200)}${rule.length > 200 ? '...' : ''}`,
        annotation: '偏好 · AI · OpenClaw 规则',
        source: 'openclaw',
        filePath,
      })
    );
  }

  // If there is too much content, only record the summary
  if (content.length > 1000 && blocks.length === 0) {
    blocks.push(
      createBlock({
        content: 'OpenClaw 已配置 AGENTS.md 行为规则',
        annotation: '知识 · 工具 · OpenClaw',
        source: 'openclaw',
        filePath,
      })
    );
  }

  return blocks;
}

/**
 * Extract SOUL.md (AI personality)
 */
async function extractSoulMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  blocks.push(
    createBlock({
      content: `OpenClaw AI 个性: ${content.substring(0, 300)}${content.length > 300 ? '...' : ''}`,
      annotation: '知识 · AI · OpenClaw',
      source: 'openclaw',
      filePath,
    })
  );

  return blocks;
}

/**
 * Extract USER.md (user information)
 */
async function extractUserMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  blocks.push(
    createBlock({
      content: `OpenClaw 用户配置: ${content.substring(0, 300)}${content.length > 300 ? '...' : ''}`,
      annotation: '事实 · self · OpenClaw',
      source: 'openclaw',
      filePath,
    })
  );

  return blocks;
}

/**
 * Extract skill list
 */
async function extractSkills(skillsDir: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skillNames = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => !name.startsWith('.'));

    if (skillNames.length > 0) {
      blocks.push(
        createBlock({
          content: `OpenClaw 安装的技能: ${skillNames.join(', ')}`,
          annotation: '知识 · 工具链 · OpenClaw Skills',
          source: 'openclaw',
          filePath: skillsDir,
          metadata: { skills: skillNames },
        })
      );
    }
  } catch {
    // Directory does not exist or cannot be read
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'openclaw',
  path: async () => {
    const results: string[] = [];
    const configDir = path.join(os.homedir(), '.openclaw');
    const workspaceDir = path.join(configDir, 'workspace');

    // main configuration file
    results.push(path.join(configDir, 'openclaw.json'));

    // workspace file
    results.push(path.join(workspaceDir, 'AGENTS.md'));
    results.push(path.join(workspaceDir, 'SOUL.md'));
    results.push(path.join(workspaceDir, 'USER.md'));
    results.push(path.join(workspaceDir, 'MEMORY.md'));

    // Skills Catalog
    results.push(path.join(workspaceDir, 'skills'));

    return results.filter(p => p);
  },
  priority: 85,
  timeout: 1000,
  extractor: async (content: string, filePath: string) => {
    const blocks = [];

    if (filePath.endsWith('openclaw.json')) {
      blocks.push(...(await extractConfig(content, filePath)));
    } else if (filePath.endsWith('AGENTS.md')) {
      blocks.push(...(await extractAgentsMd(content, filePath)));
    } else if (filePath.endsWith('SOUL.md')) {
      blocks.push(...(await extractSoulMd(content, filePath)));
    } else if (filePath.endsWith('USER.md')) {
      blocks.push(...(await extractUserMd(content, filePath)));
    } else if (filePath.endsWith('MEMORY.md')) {
      blocks.push(
        createBlock({
          content: `OpenClaw 长期记忆 (${(content.length / 1000).toFixed(1)}KB)`,
          annotation: '知识 · AI · OpenClaw',
          source: 'openclaw',
          filePath,
        })
      );
    } else if (filePath.endsWith('skills')) {
      blocks.push(...(await extractSkills(filePath)));
    }

    return blocks;
  },
};

export default { source, extractConfig, extractAgentsMd, extractSoulMd };
