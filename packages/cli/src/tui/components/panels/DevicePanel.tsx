import React from 'react';
import { Box, Text } from 'ink';
import type { DeviceInfo } from '../../hooks/useDevice.js';

interface DevicePanelProps {
  device: DeviceInfo;
  scrollOffset: number;
  panelHeight: number;
}

// ───Tile row type (for virtual scrolling) ────────────────────────────────────

type FlatRow = { key: string; node: React.ReactNode };

function sepRow(label: string): FlatRow {
  return { key: `sep-${label}`, node: <Text color="gray" dimColor>─ {label}</Text> };
}

function buildRows(device: DeviceInfo): FlatRow[] {
  const { identity } = device;
  const deviceList = identity ? Object.values(identity.devices) : [];
  const rows: FlatRow[] = [];

  // ── Identity ──
  rows.push(sepRow('Identity'));
  rows.push({ key: 'id',      node: <Box><Text color="gray">{'Identity ID     '}</Text><Text color="cyan">{identity?.identity_id ?? '—'}</Text></Box> });
  rows.push({ key: 'name',    node: <Box><Text color="gray">{'Display name    '}</Text><Text color="white">{identity?.display_name ?? '(not set)'}</Text></Box> });
  rows.push({ key: 'created', node: <Box><Text color="gray">{'Created         '}</Text><Text color="white">{identity ? new Date(identity.created_at).toLocaleDateString() : '—'}</Text></Box> });

  // ── This device ──
  rows.push(sepRow('This device'));
  rows.push({ key: 'hostname', node: <Box><Text color="gray">{'Hostname        '}</Text><Text color="white">{device.hostname}</Text></Box> });
  rows.push({ key: 'platform', node: <Box><Text color="gray">{'Platform        '}</Text><Text color="white">{`${device.platform} (${device.arch})`}</Text></Box> });
  rows.push({ key: 'node',     node: <Box><Text color="gray">{'Node.js         '}</Text><Text color="white">{device.nodeVersion}</Text></Box> });

  // ── All devices ──
  if (deviceList.length > 0) {
    rows.push(sepRow('All devices'));
    for (const d of deviceList) {
      rows.push({
        key: `dev-${d.id}`,
        node: (
          <Box>
            <Text color="cyan">{d.name.padEnd(20)}</Text>
            <Text color="gray">{'  '}</Text>
            <Text color="white">{d.platform.padEnd(10)}</Text>
            <Text color="gray">{'  last '}</Text>
            <Text color="white">{new Date(d.last_seen).toLocaleDateString()}</Text>
          </Box>
        ),
      });
    }
  }

  // ── Storage ──
  rows.push(sepRow('Storage'));
  rows.push({ key: 'db',       node: <Box><Text color="gray">{'DB              '}</Text><Text color="white">{device.dbPath}</Text></Box> });
  rows.push({ key: 'config',   node: <Box><Text color="gray">{'Config          '}</Text><Text color="white">{device.configPath}</Text></Box> });
  rows.push({ key: 'identity', node: <Box><Text color="gray">{'Identity        '}</Text><Text color="white">{device.identityPath}</Text></Box> });
  rows.push({ key: 'log',      node: <Box><Text color="gray">{'Log             '}</Text><Text color="white">{device.logPath}</Text></Box> });

  return rows;
}

// ─── Grouped bordered style (when the height is sufficient) ─────────────────────────────

function FullView({ device }: { device: DeviceInfo }) {
  const { identity } = device;
  const deviceList = identity ? Object.values(identity.devices) : [];

  return (
    <Box flexDirection="column" paddingX={1}>

      {/* Identity */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Identity</Text>
        <Box><Text color="gray">{'Identity ID     '}</Text><Text color="cyan">{identity?.identity_id ?? '—'}</Text></Box>
        <Box><Text color="gray">{'Display name    '}</Text><Text color="white">{identity?.display_name ?? '(not set)'}</Text></Box>
        <Box><Text color="gray">{'Created         '}</Text><Text color="white">{identity ? new Date(identity.created_at).toLocaleDateString() : '—'}</Text></Box>
      </Box>

      {/* This device */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>This device</Text>
        <Box><Text color="gray">{'Hostname        '}</Text><Text color="white">{device.hostname}</Text></Box>
        <Box><Text color="gray">{'Platform        '}</Text><Text color="white">{`${device.platform} (${device.arch})`}</Text></Box>
        <Box><Text color="gray">{'Node.js         '}</Text><Text color="white">{device.nodeVersion}</Text></Box>
      </Box>

      {/* All devices */}
      {deviceList.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
          <Text color="gray" dimColor>All devices</Text>
          {deviceList.map(d => (
            <Box key={d.id}>
              <Text color="cyan">{d.name.padEnd(20)}</Text>
              <Text color="gray">{'  '}</Text>
              <Text color="white">{d.platform.padEnd(10)}</Text>
              <Text color="gray">{'  last '}</Text>
              <Text color="white">{new Date(d.last_seen).toLocaleDateString()}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Storage */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text color="gray" dimColor>Storage</Text>
        <Box><Text color="gray">{'DB              '}</Text><Text color="white">{device.dbPath}</Text></Box>
        <Box><Text color="gray">{'Config          '}</Text><Text color="white">{device.configPath}</Text></Box>
        <Box><Text color="gray">{'Identity        '}</Text><Text color="white">{device.identityPath}</Text></Box>
        <Box><Text color="gray">{'Log             '}</Text><Text color="white">{device.logPath}</Text></Box>
      </Box>

    </Box>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export const DevicePanel = React.memo(function DevicePanel({ device, scrollOffset, panelHeight }: DevicePanelProps) {
  const availableRows = Math.max(5, panelHeight);
  const rows = buildRows(device);
  const scrollModeRef = React.useRef<boolean | null>(null);

  // Estimated number of rows required for grouping mode: sections × (2 borders + 1 title + spacing) + content rows
  const sectionsCount = device.identity && Object.values(device.identity.devices).length > 0 ? 4 : 3;
  const threshold = rows.length + sectionsCount * 3;

  // hysteresis: ±2 line buffering to prevent critical jitter
  if (scrollModeRef.current === null) {
    scrollModeRef.current = availableRows < threshold;
  } else if (scrollModeRef.current && availableRows >= threshold + 2) {
    scrollModeRef.current = false;
  } else if (!scrollModeRef.current && availableRows < threshold - 2) {
    scrollModeRef.current = true;
  }

  if (!scrollModeRef.current) {
    return <FullView device={device} />;
  }

  // Not enough height: virtual scrolling
  const innerH = Math.max(2, availableRows - 3);
  const maxScroll = Math.max(0, rows.length - innerH);
  const offset = Math.min(scrollOffset, maxScroll);
  const visible = rows.slice(offset, offset + innerH);
  const hasAbove = offset > 0;
  const hasBelow = offset + innerH < rows.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Box>
          <Text color="gray" dimColor>Device</Text>
          {hasAbove && <Text color="gray" dimColor>  ↑ {offset} more</Text>}
          {hasBelow && <Text color="gray" dimColor>  ↓ {rows.length - offset - innerH} more</Text>}
        </Box>
        {visible.map(row => <React.Fragment key={row.key}>{row.node}</React.Fragment>)}
      </Box>
    </Box>
  );
});
