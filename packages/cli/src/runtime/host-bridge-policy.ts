import type {
  HostAdapterCapability,
  HostAdapterLifecyclePayload,
  HostLifecycleEvent,
} from './types.js';
import type { HostBridgeCommand, HostBridgeEvent, HostId } from '../hosts/types.js';

const HOST_RUNTIME_COMMAND_BY_EVENT: Record<HostLifecycleEvent, HostAdapterLifecyclePayload['runtimeCommand']> = {
  'session-start': 'carry-over',
  'prompt-submit': 'recall',
  'response-done': 'review',
};

const HOST_BRIDGE_COMMAND_BY_EVENT: Record<HostBridgeEvent, HostBridgeCommand['command']> = {
  ...HOST_RUNTIME_COMMAND_BY_EVENT,
  'realtime-ingest': 'ingest-message',
};

const HOST_BRIDGE_FORMAT_BY_HOST_EVENT: Record<HostId, Record<HostBridgeEvent, HostBridgeCommand['format']>> = {
  codex: {
    'session-start': 'hook-text',
    'prompt-submit': 'hook-text',
    'response-done': 'hook-text',
    'realtime-ingest': 'json',
  },
  'claude-code': {
    'session-start': 'hook-text',
    'prompt-submit': 'hook-text',
    'response-done': 'hook-text',
    'realtime-ingest': 'json',
  },
  cursor: {
    'session-start': 'hook-text',
    'prompt-submit': 'hook-text',
    'response-done': 'hook-text',
    'realtime-ingest': 'json',
  },
  opencode: {
    'session-start': 'hook-text',
    'prompt-submit': 'hook-text',
    'response-done': 'hook-text',
    'realtime-ingest': 'json',
  },
};

export function resolveHostBridgeRuntimeCommand(
  event: HostLifecycleEvent,
): HostAdapterLifecyclePayload['runtimeCommand'] {
  return HOST_RUNTIME_COMMAND_BY_EVENT[event];
}

export function resolveHostBridgeOutputFormat(
  capability: HostAdapterCapability,
): HostAdapterLifecyclePayload['outputFormat'] {
  return capability === 'instruction-driven' ? 'text' : 'hook-text';
}

export function resolveHostBridgeCommand(host: HostId, event: HostBridgeEvent): HostBridgeCommand {
  const format = HOST_BRIDGE_FORMAT_BY_HOST_EVENT[host][event];

  return {
    host,
    event,
    command: HOST_BRIDGE_COMMAND_BY_EVENT[event],
    format,
  };
}
