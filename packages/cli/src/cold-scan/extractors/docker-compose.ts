/**
 * docker-compose 提取器
 * 提取基础设施偏好
 */

import { readFileSafe, getRecentGitProjects, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function extractDockerCompose(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    // YAML 解析简化版（不引入 yaml 依赖）
    const services: string[] = [];
    const images: string[] = [];

    // 提取 services
    const servicesMatch = content.match(/^services:\s*$/m);
    if (servicesMatch) {
      // 提取服务名
      const serviceMatches = content.match(/^\s{2}([a-z0-9_-]+):\s*$/gim);
      if (serviceMatches) {
        for (const match of serviceMatches) {
          const serviceName = match.trim().replace(':', '');
          services.push(serviceName);
        }
      }

      // 提取镜像名
      const imageMatches = content.match(/^\s{4}image:\s*(.+)$/gim);
      if (imageMatches) {
        for (const match of imageMatches) {
          const imageName = match.replace(/^\s{4}image:\s*/, '').trim();
          images.push(imageName);
        }
      }
    }

    // 分析基础设施偏好
    const infra: string[] = [];

    if (images.some(i => /postgres|mysql|mariadb|mongodb|redis|memcached/i.test(i))) {
      const databases = images.filter(i =>
        /postgres|mysql|mariadb|mongodb/i.test(i)
      );
      if (databases.length > 0) {
        infra.push(...databases);
      }
    }

    if (images.some(i => /redis/i.test(i))) {
      infra.push('Redis');
    }

    if (images.some(i => /nginx|apache|caddy/i.test(i))) {
      infra.push('Web 服务器');
    }

    if (images.some(i => /rabbitmq|kafka|nats/i.test(i))) {
      infra.push('消息队列');
    }

    if (images.some(i => /elasticsearch|opensearch/i.test(i))) {
      infra.push('Elasticsearch');
    }

    if (services.length > 0) {
      blocks.push(
        createBlock({
          content: `使用 Docker 服务: ${services.slice(0, 10).join(', ')}`,
          annotation: '知识 · 技术栈 · Docker',
          source: 'docker-compose',
          filePath,
          metadata: { services },
        })
      );
    }

    if (infra.length > 0) {
      blocks.push(
        createBlock({
          content: `基础设施: ${infra.join(' + ')}`,
          annotation: '知识 · 技术栈 · 基础设施',
          source: 'docker-compose',
          filePath,
          metadata: { infrastructure: infra },
        })
      );
    }
  } catch {
    // 解析失败，跳过
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'docker-compose',
  path: async () => {
    // 查找最近的 Git 项目中的 docker-compose.yml
    const projects = await getRecentGitProjects(5);
    const results: string[] = [];

    for (const projectDir of projects) {
      const possiblePaths = [
        path.join(projectDir, 'docker-compose.yml'),
        path.join(projectDir, 'docker-compose.yaml'),
        path.join(projectDir, 'compose.yml'),
        path.join(projectDir, 'compose.yaml'),
      ];

      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          results.push(p);
          break; // 找到一个就停止
        } catch {
          continue;
        }
      }

      if (results.length >= 3) break; // 最多扫描 3 个
    }

    return results;
  },
  priority: 80,
  timeout: 1000,
  extractor: async (content: string, filePath: string) => {
    if (!content) {
      content = (await readFileSafe(filePath)) || '';
    }
    return extractDockerCompose(content, filePath);
  },
};

export default { source, extractDockerCompose };
