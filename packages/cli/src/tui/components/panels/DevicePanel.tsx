import React from 'react';
import { Box, Text } from 'ink';
import Table from 'ink-table';
import type { DeviceInfo } from '../../hooks/useDevice.js';
import { KeyValue } from '../KeyValue.js';

interface DevicePanelProps {
  device: DeviceInfo;
}

export function DevicePanel({ device }: DevicePanelProps) {
  const { identity } = device;
  const deviceRows = identity
    ? Object.values(identity.devices).map(d => ({
        ID: d.id,
        Name: d.name,
        Platform: d.platform,
        'Last Seen': new Date(d.last_seen).toLocaleDateString(),
      }))
    : [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Identity</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Identity ID" value={identity?.identity_id ?? '—'} valueColor="cyan" labelWidth={16} />
        <KeyValue label="Display Name" value={identity?.display_name ?? '(not set)'} labelWidth={16} />
        <KeyValue label="Created" value={identity ? new Date(identity.created_at).toLocaleDateString() : '—'} labelWidth={16} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">This Device</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Hostname" value={device.hostname} labelWidth={16} />
        <KeyValue label="Platform" value={`${device.platform} (${device.arch})`} labelWidth={16} />
        <KeyValue label="Node" value={device.nodeVersion} labelWidth={16} />
      </Box>

      {deviceRows.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold color="cyan">All Devices</Text>
          </Box>
          <Box paddingX={1} marginBottom={2}>
            <Table data={deviceRows} />
          </Box>
        </>
      )}

      <Box marginBottom={1}>
        <Text bold color="cyan">Storage</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="DB" value={device.dbPath} labelWidth={16} />
        <KeyValue label="Config" value={device.configPath} labelWidth={16} />
        <KeyValue label="Identity" value={device.identityPath} labelWidth={16} />
        <KeyValue label="Log" value={device.logPath} labelWidth={16} />
      </Box>
    </Box>
  );
}
