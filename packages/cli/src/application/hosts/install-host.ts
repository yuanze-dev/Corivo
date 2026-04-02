import { createHostImportUseCase, type HostImportRequest } from './import-host.js';
import { readConfirmIfTTY, isInteractiveTTY } from '../../cli/utils/password.js';
import { getHostAdapter } from '../../hosts/registry.js';
import type { HostAdapter, HostId, HostInstallOptions, HostInstallResult } from '../../hosts/types.js';

export type HostInstallRequest = HostInstallOptions & { host: HostId };

export function createHostInstallUseCase(deps?: {
  run?: (input: HostInstallRequest) => Promise<HostInstallResult>;
  install?: (input: HostInstallRequest) => Promise<HostInstallResult>;
  importHistory?: (input: HostImportRequest) => Promise<{
    success: boolean;
    summary: string;
    error?: string;
  }>;
  confirmImport?: (prompt: string) => Promise<boolean>;
  isInteractive?: () => boolean;
  getAdapter?: (host: HostId) => HostAdapter | null;
}) {
  return async (input: HostInstallRequest): Promise<HostInstallResult> => {
    if (deps?.run) {
      return deps.run(input);
    }

    const getAdapter = deps?.getAdapter ?? ((host: HostId) => getHostAdapter(host));
    const install = deps?.install ?? (async (request: HostInstallRequest) => {
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

    const result = await install(input);
    const adapter = getAdapter(input.host);
    const canImportHistory = Boolean(adapter?.capabilities.includes('history-import'));

    if (!result.success || !canImportHistory) {
      return result;
    }

    const isInteractive = deps?.isInteractive ?? isInteractiveTTY;
    if (!isInteractive()) {
      return result;
    }

    const confirmImport = deps?.confirmImport
      ?? ((prompt: string) => readConfirmIfTTY(prompt, true));
    const confirmed = await confirmImport('Import existing conversation history now?');
    if (!confirmed) {
      return result;
    }

    const importHistory = deps?.importHistory ?? createHostImportUseCase();

    try {
      const importResult = await importHistory({
        host: input.host,
        all: true,
        target: input.target,
      });

      return mergeImportFeedback(result, importResult.summary, importResult.success ? undefined : importResult.error);
    } catch (error) {
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
