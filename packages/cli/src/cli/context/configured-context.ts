import type { CorivoConfig } from '../../config.js';
import type { CreateCliContextOptions, CliContext } from './types.js';
import { createCliContext } from './create-context.js';

export function createConfiguredCliContext(
  config: CorivoConfig | null | undefined,
  options: CreateCliContextOptions = {},
): CliContext {
  return createCliContext({
    ...options,
    logLevel: config?.settings?.logLevel ?? options.logLevel,
  });
}
