/**
 * Auto-sync engine
 *
 * Push/pull is automatically executed in the background in the heartbeat daemon without the need for manual triggering by the user.
 * Prerequisite: The user has completed registration through `corivo sync --register`.
 */

import type { CliContext } from '../cli/context/types.js';
import { applyPulledChangesets, authenticate, post, type PulledChangeset } from '../runtime/sync-client.js';
import type { CorivoDatabase } from '../storage/database.js';

const TOKEN_TTL = 4 * 60 * 1000; // 4 minutes (server TTL 5 minutes)

export class AutoSync {
  private token: string | null = null;
  private tokenObtainedAt = 0;

  constructor(
    private db: CorivoDatabase,
    private readonly context: Pick<CliContext, 'logger' | 'config' | 'clock'>
  ) {}

  /**
   * Perform a synchronization (push + pull)
   * @returns synchronization result count, if not configured or an error occurs, null is returned
   */
  async run(): Promise<{ pushed: number; pulled: number } | null> {
    try {
      const config = await this.context.config.load();
      if (!config) return null;
      const logger = this.context.logger;

      const solverConfig = await this.context.config.loadSolver();
      if (!solverConfig) return null;

      const { server_url, shared_secret, site_id } = solverConfig;
      logger.debug(
        `[sync:auto] 开始同步 server=${server_url} site=${site_id} lastPull=${solverConfig.last_pull_version} lastPush=${solverConfig.last_push_version}`
      );

      // Make sure the token is valid (cache reuse, retrieval after expiration)
      const token = await this.ensureToken(server_url, config.identity_id, shared_secret, logger);

      // Push: full blocks (simplified version, consistent with CLI sync)
      let pushed = 0;
      const blocks = this.db.queryBlocks({ limit: 10000 });
      logger.debug(`[sync:auto] 准备 push blocks=${blocks.length}`);
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

        const pushResult = (await post(
          `${server_url}/sync/push`,
          { site_id, db_version: changesets.length, changesets },
          logger,
          token,
          'push'
        )) as { stored: number };
        pushed = pushResult.stored;
        logger.debug(`[sync:auto] push 完成 stored=${pushed} changesets=${changesets.length}`);

        solverConfig.last_push_version = blocks.length;
        await this.context.config.saveSolver(solverConfig);
        logger.debug(`[sync:auto] 已更新 last_push_version=${solverConfig.last_push_version}`);
      }

      // Pull: Pull server changes
      let pulled = 0;
      const pullResult = (await post(
        `${server_url}/sync/pull`,
        { site_id, since_version: solverConfig.last_pull_version },
        logger,
        token,
        'pull'
      )) as {
        changesets: PulledChangeset[];
        current_version: number;
      };
      logger.debug(
        `[sync:auto] pull 完成 changesets=${pullResult.changesets.length} currentVersion=${pullResult.current_version} sinceVersion=${solverConfig.last_pull_version}`
      );

      pulled = applyPulledChangesets(this.db, pullResult.changesets, logger);
      logger.debug(`[sync:auto] pull 已写库 applied=${pulled}`);

      if (pullResult.current_version > solverConfig.last_pull_version) {
        solverConfig.last_pull_version = pullResult.current_version;
        await this.context.config.saveSolver(solverConfig);
        logger.debug(`[sync:auto] 已更新 last_pull_version=${solverConfig.last_pull_version}`);
      }

      logger.debug(`[sync:auto] 同步结束 push=${pushed} pull=${pulled}`);
      return { pushed, pulled };
    } catch (error) {
      this.context.logger.error('[sync:auto] 同步失败:', error instanceof Error ? error.message : error);
      // 401 Authentication failed: clear the cache token and obtain it again next time
      if (error instanceof Error && error.message.includes('401')) {
        this.token = null;
        this.tokenObtainedAt = 0;
      }
      return null;
    }
  }

  private async ensureToken(
    serverUrl: string,
    identityId: string,
    sharedSecret: string,
    logger = this.context.logger
  ): Promise<string> {
    if (this.token && this.isTokenValid()) {
      logger.debug('[sync:auto] 复用缓存 token');
      return this.token;
    }
    logger.debug('[sync:auto] 重新获取 token');
    this.token = await authenticate(serverUrl, identityId, sharedSecret, logger);
    this.tokenObtainedAt = this.context.clock.now();
    return this.token;
  }

  private isTokenValid(): boolean {
    return this.context.clock.now() - this.tokenObtainedAt < TOKEN_TTL;
  }
}
