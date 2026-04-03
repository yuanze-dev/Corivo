import type {
  HostAdapterCapability,
  HostAdapterLifecyclePayload,
  HostLifecycleEvent,
} from './types.js';
import type { RuntimeOutputFormat } from './render.js';
import {
  resolveHostBridgeOutputFormat,
  resolveHostBridgeRuntimeCommand,
} from './host-bridge-policy.js';

export function getHostAdapterOutputFormat(
  capability: HostAdapterCapability,
): RuntimeOutputFormat {
  return resolveHostBridgeOutputFormat(capability);
}

export function createHostAdapterPayload(
  capability: HostAdapterCapability,
  event: HostLifecycleEvent,
): HostAdapterLifecyclePayload {
  return {
    capability,
    event,
    runtimeCommand: resolveHostBridgeRuntimeCommand(event),
    outputFormat: getHostAdapterOutputFormat(capability),
  };
}
