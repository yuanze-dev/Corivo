/**
 * OpenClaw 配置提取器
 * 提取 OpenClaw AI 助手的配置、模型偏好、通道、技能等信息
 */

import { readFileSafe, expandHome, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * OpenClaw 配置结构（部分）
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
 * 提取主配置文件
 */
async function extractConfig(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const config = JSON.parse(content) as OpenClawConfig;

    // 提取模型偏好
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

    // 提取可用的 agents
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

    // 提取启用的通道
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

    // 提取启用的插件
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
    // 解析失败
  }

  return blocks;
}

/**
 * 提取 AGENTS.md（行为规则）
 */
async function extractAgentsMd(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  // 提取关键规则段落
  const lines = content.split('\n');
  const rules: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    // 收集主要段落
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

  // 保存重要规则
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

  // 如果内容过多，只记录摘要
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
 * 提取 SOUL.md（AI 个性）
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
 * 提取 USER.md（用户信息）
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
 * 提取技能列表
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
    // 目录不存在或无法读取
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'openclaw',
  path: async () => {
    const results: string[] = [];
    const configDir = path.join(os.homedir(), '.openclaw');
    const workspaceDir = path.join(configDir, 'workspace');

    // 主配置文件
    results.push(path.join(configDir, 'openclaw.json'));

    // 工作区文件
    results.push(path.join(workspaceDir, 'AGENTS.md'));
    results.push(path.join(workspaceDir, 'SOUL.md'));
    results.push(path.join(workspaceDir, 'USER.md'));
    results.push(path.join(workspaceDir, 'MEMORY.md'));

    // Skills 目录
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
