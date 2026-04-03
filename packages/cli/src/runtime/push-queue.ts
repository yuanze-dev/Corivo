import { PushQueue } from '../engine/push-queue.js';

export function createRuntimePushQueue(): PushQueue {
  return new PushQueue();
}
