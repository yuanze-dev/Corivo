import React from 'react';
import { Box, Text } from 'ink';
import Table from '../Table.js';
import type { DaemonStatus } from '../../hooks/useDaemon.js';
import { KeyValue } from '../KeyValue.js';

interface DaemonPanelProps {
  daemon: DaemonStatus;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DaemonPanel({ daemon }: DaemonPanelProps) {
  const engineCycles = [
    { Task: 'processPendingBlocks', Interval: '5s',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processVitalityDecay', Interval: '5s',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processAssociations',  Interval: '30s', Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processConsolidation', Interval: '60s', Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'checkFollowUps',       Interval: '1h',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'autoSync',             Interval: '5m',  Status: daemon.running ? 'active' : 'stopped' },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Heartbeat Engine</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue
          label="Status"
          value={daemon.running ? '● running' : '○ stopped'}
          valueColor={daemon.running ? 'green' : 'gray'}
        />
        <KeyValue label="PID" value={daemon.pid ? String(daemon.pid) : '—'} />
        <KeyValue label="Uptime" value={formatUptime(daemon.uptime)} />
        <KeyValue label="Cycles" value={daemon.cycleCount ? String(daemon.cycleCount) : '—'} />
        {daemon.lastCheckAge !== null && (
          <KeyValue
            label="Health check"
            value={`${Math.round(daemon.lastCheckAge / 1000)}s ago`}
            valueColor={daemon.lastCheckAge < 60000 ? 'green' : 'yellow'}
          />
        )}
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Engine Cycles</Text>
      </Box>
      <Box paddingX={1} marginBottom={2}>
        <Table data={engineCycles} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Log Files</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="stdout" value={daemon.logPath} />
        <KeyValue label="stderr" value={daemon.errPath} />
      </Box>
    </Box>
  );
}
