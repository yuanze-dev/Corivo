/**
 * 自动同步引擎
 *
 * 在心跳守护进程中后台自动执行 push/pull，无需用户手动触发。
 * 前提：用户已通过 `corivo sync --register` 完成注册。
 */

import { loadConfig, loadSolverConfig, saveSolverConfig } from '../config.js';
import { authenticate, post } from '../cli/commands/sync.js';
import type { CorivoDatabase } from '../storage/database.js';

const TOKEN_TTL = 4 * 60 * 1000; // 4 分钟（服务端 TTL 5 分钟）

export class AutoSync {
  private token: string | null = null;
  private tokenObtainedAt = 0;

  constructor(private db: CorivoDatabase) {}

  /**
   * 执行一次同步（push + pull）
   * @returns 同步结果计数，若未配置或出错则返回 null
   */
  async run(): Promise<{ pushed: number; pulled: number } | null> {
    try {
      const config = await loadConfig();
      if (!config) return null;

      const solverConfig = await loadSolverConfig();
      if (!solverConfig) return null;

      const { server_url, shared_secret, site_id } = solverConfig;

      // 确保 token 有效（缓存复用，过期重新获取）
      const token = await this.ensureToken(server_url, config.identity_id, shared_secret);

      // Push：全量 blocks（简化版，与 CLI sync 一致）
      let pushed = 0;
      const blocks = this.db.queryBlocks({ limit: 10000 });
      if (blocks.length > 0) {
        const changesets = blocks.map((b, i) => ({
          table_name: 'blocks',
          pk: b.id,
          col_name: 'content',
          col_version: 1,
          db_version: i + 1,
          value: b.content,
          site_id,
        }));

        const pushResult = await post(
          `${server_url}/sync/push`,
          { site_id, db_version: changesets.length, changesets },
          token
        ) as { stored: number };
        pushed = pushResult.stored;

        solverConfig.last_push_version = blocks.length;
        await saveSolverConfig(solverConfig);
      }

      // Pull：拉取服务端变更
      let pulled = 0;
      const pullResult = await post(
        `${server_url}/sync/pull`,
        { site_id, since_version: solverConfig.last_pull_version },
        token
      ) as { changesets: unknown[]; current_version: number };

      pulled = pullResult.changesets.length;

      if (pullResult.current_version > solverConfig.last_pull_version) {
        solverConfig.last_pull_version = pullResult.current_version;
        await saveSolverConfig(solverConfig);
      }

      return { pushed, pulled };
    } catch (error) {
      // 401 认证失败：清除缓存 token，下次重新获取
      if (error instanceof Error && error.message.includes('401')) {
        this.token = null;
        this.tokenObtainedAt = 0;
      }
      return null;
    }
  }

  private async ensureToken(serverUrl: string, identityId: string, sharedSecret: string): Promise<string> {
    if (this.token && this.isTokenValid()) {
      return this.token;
    }
    this.token = await authenticate(serverUrl, identityId, sharedSecret);
    this.tokenObtainedAt = Date.now();
    return this.token;
  }

  private isTokenValid(): boolean {
    return Date.now() - this.tokenObtainedAt < TOKEN_TTL;
  }
}
