import type { HostBridgeEvent, HostId } from '../../hosts/types.js';
import { resolveHostBridgeCommand } from '../../runtime/host-bridge-policy.js';

interface HostBridgePayload {
  prompt?: string;
  lastMessage?: string;
}

export interface BridgeHostEventRequest {
  host: HostId;
  event: HostBridgeEvent;
  payload?: HostBridgePayload;
}

export interface BridgeHostEventResult {
  command: string;
  args: string[];
}

export function createBridgeHostEventUseCase() {
  return (input: BridgeHostEventRequest): BridgeHostEventResult => {
    const bridge = resolveHostBridgeCommand(input.host, input.event);

    if (bridge.command === 'recall') {
      const prompt = input.payload?.prompt?.trim();
      if (!prompt) {
        throw new Error('Host bridge recall requires payload.prompt');
      }

      return {
        command: bridge.command,
        args: ['--prompt', prompt, '--format', bridge.format],
      };
    }

    if (bridge.command === 'review') {
      const lastMessage = input.payload?.lastMessage?.trim();
      if (!lastMessage) {
        throw new Error('Host bridge review requires payload.lastMessage');
      }

      return {
        command: bridge.command,
        args: ['--last-message', lastMessage, '--format', bridge.format],
      };
    }

    if (bridge.command === 'carry-over') {
      return {
        command: bridge.command,
        args: ['--format', bridge.format],
      };
    }

    return {
      command: bridge.command,
      args: [],
    };
  };
}
