/**
 * Corivo API Wrapper
 * 为 Claude Code 提供简单的记忆存储 API
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface CorivoConfig {
  dataDir: string;
  dbPath: string;
  configPath: string;
}

export interface SaveOptions {
  annotation?: string;
  refs?: string[];
}

export interface QueryResult {
  id: string;
  content: string;
  annotation: string;
  vitality: number;
  created_at: number;
}

export class CorivoAPI {
  private config: CorivoConfig;

  constructor() {
    this.config = this.getConfig();
  }

  private getConfig(): CorivoConfig {
    const dataDir = join(homedir(), '.corivo');
    return {
      dataDir,
      dbPath: join(dataDir, 'corivo.db'),
      configPath: join(dataDir, 'config.json'),
    };
  }

  /**
   * 检查 Corivo 是否已初始化
   */
  isInitialized(): boolean {
    return existsSync(this.config.dbPath);
  }

  /**
   * 保存记忆
   */
  save(content: string, options: SaveOptions = {}): { success: boolean; id?: string; error?: string } {
    try {
      if (!this.isInitialized()) {
        return { success: false, error: 'Corivo 未初始化，请先运行 corivo init' };
      }

      const args = ['save', content];
      if (options.annotation) {
        args.push('--annotation', options.annotation);
      }

      const output = execSync(`corivo ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // 解析输出获取 block ID
      const match = output.match(/ID:\s*(\w+)/);
      const id = match ? match[1] : undefined;

      return { success: true, id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 查询记忆
   */
  query(query: string, options: { limit?: number; annotation?: string } = {}): QueryResult[] {
    try {
      if (!this.isInitialized()) {
        return [];
      }

      const args = ['query', query];
      if (options.limit) {
        args.push('--limit', String(options.limit));
      }
      if (options.annotation) {
        args.push('--annotation', options.annotation);
      }

      const output = execSync(`corivo ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      return this.parseQueryOutput(output);
    } catch {
      return [];
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; active: number; cooling: number; cold: number } | null {
    try {
      if (!this.isInitialized()) {
        return null;
      }

      const output = execSync('corivo status', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      return this.parseStatsOutput(output);
    } catch {
      return null;
    }
  }

  /**
   * 解析查询输出
   */
  private parseQueryOutput(output: string): QueryResult[] {
    const results: QueryResult[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // 匹配: [ID] [annotation] content
      const match = line.match(/\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/);
      if (match) {
        results.push({
          id: match[1],
          annotation: match[2],
          content: match[3],
          vitality: 100,
          created_at: Date.now()
        });
      }
    }

    return results;
  }

  /**
   * 解析统计输出
   */
  private parseStatsOutput(output: string): { total: number; active: number; cooling: number; cold: number } {
    let total = 0;
    let active = 0;
    let cooling = 0;
    let cold = 0;

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('总计:')) {
        const match = line.match(/总计:\s*(\d+)/);
        if (match) total = parseInt(match[1], 10);
      }
      if (line.includes('活跃:')) {
        const match = line.match(/活跃:\s*(\d+)/);
        if (match) active = parseInt(match[1], 10);
      }
      if (line.includes('冷却:')) {
        const match = line.match(/冷却:\s*(\d+)/);
        if (match) cooling = parseInt(match[1], 10);
      }
      if (line.includes('冷冻:')) {
        const match = line.match(/冷冻:\s*(\d+)/);
        if (match) cold = parseInt(match[1], 10);
      }
    }

    return { total, active, cooling, cold };
  }
}

// 导出单例
export const corivo = new CorivoAPI();
