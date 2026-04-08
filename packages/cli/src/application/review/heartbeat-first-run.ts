import { Heartbeat, type FirstRunConfig } from '@/runtime/daemon/heartbeat.js';

export async function runHeartbeatFirstRun(
  dbPath: string,
  config: FirstRunConfig,
): Promise<{ processedBlocks: number; elapsedTime: number }> {
  const heartbeat = new Heartbeat({ dbPath });
  return heartbeat.runFirstRun(config);
}
