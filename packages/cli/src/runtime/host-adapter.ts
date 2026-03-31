import type {
  HostAdapterCapability,
  HostAdapterLifecyclePayload,
  HostLifecycleEvent,
} from './types.js';
import type { RuntimeOutputFormat } from './render.js';

const EVENT_TO_COMMAND: Record<HostLifecycleEvent, HostAdapterLifecyclePayload['runtimeCommand']> = {
  'session-start': 'carry-over',
  'prompt-submit': 'query',
  'response-done': 'review',
};

export function getHostAdapterOutputFormat(
  capability: HostAdapterCapability,
): RuntimeOutputFormat {
  return capability === 'instruction-driven' ? 'text' : 'hook-text';
}

export function createHostAdapterPayload(
  capability: HostAdapterCapability,
  event: HostLifecycleEvent,
): HostAdapterLifecyclePayload {
  return {
    capability,
    event,
    runtimeCommand: EVENT_TO_COMMAND[event],
    outputFormat: getHostAdapterOutputFormat(capability),
  };
}
