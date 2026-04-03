import { PushQueue } from '@/infrastructure/output/push-queue.js';

export function createRuntimePushQueue(): PushQueue {
  return new PushQueue();
}
