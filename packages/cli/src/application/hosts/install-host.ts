import { createHostImportUseCase, type HostImportRequest } from './import-host.js';
import { getHostAdapter } from '@/infrastructure/hosts/registry.js';
import type { HostAdapter, HostId, HostInstallOptions, HostInstallResult } from '@/domain/host/contracts/types.js';
import type { Logger } from '@/infrastructure/logging.js';

export type HostInstallRequest = HostInstallOptions & { host: HostId };
type HostInstallLogger = Pick<Logger, 'debug'>;

export interface HostInstallUseCaseDependencies {
  logger?: HostInstallLogger;
  getAdapter?: (host: HostId) => HostAdapter | null;
  installHost?: (input: HostInstallRequest) => Promise<HostInstallResult>;
  importHistory?: (input: HostImportRequest) => Promise<{
    success: boolean;
    summary: string;
    error?: string;
  }>;
  isInteractive?: () => boolean;
  confirmImport?: (prompt: string) => Promise<boolean>;
}

export function createHostInstallUseCase(deps?: HostInstallUseCaseDependencies) {
  return async (input: HostInstallRequest): Promise<HostInstallResult> => {
    const logger = deps?.logger;
    logger?.debug(
      `[host:install] start host=${input.host} target=${input.target ?? '<default>'}`
    );

    const getAdapter = deps?.getAdapter ?? ((host: HostId) => getHostAdapter(host));
    const installHost =
      deps?.installHost
      ?? (async (request: HostInstallRequest) => {
      const adapter = getAdapter(request.host);
      if (!adapter) {
        return {
          success: false,
          host: request.host,
          summary: `Unknown host: ${request.host}`,
          error: `Unknown host: ${request.host}`,
        };
      }

      return adapter.install(request);
    });

    const result = await installHost(input);
    const adapter = getAdapter(input.host);
    const canImportHistory = Boolean(adapter?.capabilities.includes('history-import'));
    logger?.debug(
      `[host:install] install result host=${input.host} success=${result.success} canImportHistory=${canImportHistory}`
    );

    if (!result.success || !canImportHistory) {
      return result;
    }

    const isInteractive = deps?.isInteractive ?? (() => false);
    if (!isInteractive()) {
      logger?.debug(`[host:install] auto-import skipped host=${input.host} reason=non-interactive`);
      return result;
    }

    const confirmImport = deps?.confirmImport ?? (async () => false);
    const confirmed = await confirmImport('Import existing conversation history now?');
    if (!confirmed) {
      logger?.debug(`[host:install] auto-import declined host=${input.host}`);
      return result;
    }
    logger?.debug(`[host:install] import confirmed host=${input.host} mode=full`);

    const importHistory = deps?.importHistory ?? createHostImportUseCase({ logger });

    try {
      const importResult = await importHistory({
        host: input.host,
        all: true,
        target: input.target,
      });
      logger?.debug(
        `[host:install] import completed host=${input.host} success=${importResult.success}`
      );

      return mergeImportFeedback(result, importResult.summary, importResult.success ? undefined : importResult.error);
    } catch (error) {
      logger?.debug(
        `[host:install] import threw host=${input.host} error=${error instanceof Error ? error.message : String(error)}`
      );
      return mergeImportFeedback(
        result,
        'History import failed.',
        error instanceof Error ? error.message : String(error),
      );
    }
  };
}

function mergeImportFeedback(
  result: HostInstallResult,
  importSummary?: string,
  importError?: string,
): HostInstallResult {
  const summary = [result.summary, importSummary].filter(Boolean).join('\n');
  const error = [result.error, importError].filter(Boolean).join('\n') || undefined;

  return {
    ...result,
    success: true,
    summary,
    error,
  };
}
