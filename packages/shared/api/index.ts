/**
 * Corivo Shared API
 * Cross-platform encapsulation of Corivo core functions
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

export interface CorivoConfig {
  dataDir: string;
  dbPath: string;
  configPath: string;
}

export interface SaveOptions {
  annotation?: string;
  refs?: string[];
}

export interface QueryOptions {
  limit?: number;
  annotation?: string;
}

export interface QueryResult {
  id: string;
  content: string;
  annotation: string;
  vitality: number;
  created_at: number;
}

export interface StatsResult {
  total: number;
  active: number;
  cooling: number;
  cold: number;
}

/**
 * Corivo core API classes
 */
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
   * Check if Corivo CLI is installed
   */
  isInstalled(): boolean {
    try {
      execSync('command -v corivo', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the database has been initialized
   */
  isInitialized(): boolean {
    return existsSync(this.config.dbPath);
  }

  /**
   * save memory
   */
  save(content: string, options: SaveOptions = {}): { success: boolean; id?: string; error?: string } {
    try {
      if (!this.isInstalled()) {
        return { success: false, error: 'Corivo CLI 未安装，请运行: npm install -g corivo' };
      }

      if (!this.isInitialized()) {
        return { success: false, error: '数据库未初始化，请运行: corivo init' };
      }

      const args = ['save', '--content', content];
      if (options.annotation) {
        args.push('--annotation', options.annotation);
      }
      args.push('--no-password');

      const output = execSync(`corivo ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Parse the output to get the block ID
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
   * query memory
   */
  query(query: string, options: QueryOptions = {}): QueryResult[] {
    try {
      if (!this.isInstalled() || !this.isInitialized()) {
        return [];
      }

      const args = ['query', query];
      if (options.limit) {
        args.push('--limit', String(options.limit));
      }
      if (options.annotation) {
        args.push('--annotation', options.annotation);
      }
      args.push('--no-password');

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
   * Get statistics
   */
  getStats(): StatsResult | null {
    try {
      if (!this.isInstalled() || !this.isInitialized()) {
        return null;
      }

      const output = execSync('corivo status --no-password', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      return this.parseStatsOutput(output);
    } catch {
      return null;
    }
  }

  /**
   * Get status summary (for hooks)
   */
  getStatusSummary(): string {
    if (!this.isInstalled()) {
      return '[corivo] CLI not found. Run: npm install -g corivo && corivo init';
    }

    if (!this.isInitialized()) {
      return '[corivo] Database not initialized. Run: corivo init';
    }

    const stats = this.getStats();
    if (!stats || stats.total === 0) {
      return '[corivo] ready';
    }

    const health = Math.round((stats.active / stats.total) * 100);
    return `[corivo] ${stats.total} blocks | ${health}% active`;
  }

  /**
   * Parse query output
   */
  private parseQueryOutput(output: string): QueryResult[] {
    const results: QueryResult[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match: [ID] [annotation] content
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
   * Parse statistical output
   */
  private parseStatsOutput(output: string): StatsResult {
    let total = 0;
    let active = 0;
    let cooling = 0;
    let cold = 0;

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('总计:') || line.includes('总数:')) {
        const match = line.match(/(?:总计|总数):\s*(\d+)/);
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
      if (line.includes('冷冻:') || line.includes('冷区:')) {
        const match = line.match(/(?:冷冻|冷区):\s*(\d+)/);
        if (match) cold = parseInt(match[1], 10);
      }
    }

    return { total, active, cooling, cold };
  }
}

// Export singleton
export const corivo = new CorivoAPI();
