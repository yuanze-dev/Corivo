import { createLogger, type Logger } from '@/utils/logging';

export function createMemoryPipelineLogger(): Logger {
  return createLogger();
}
