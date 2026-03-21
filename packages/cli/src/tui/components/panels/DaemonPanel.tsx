import React from 'react';
import { Box, Text } from 'ink';
import type { DaemonStatus } from '../../hooks/useDaemon.js';

interface DaemonPanelProps {
  daemon: DaemonStatus;
  scrollOffset: number;
  panelHeight: number;
}

// 引擎循环任务列表
const ENGINE_CYCLES = [
  { task: 'processPendingBlocks', interval: '5s' },
  { task: 'processVitalityDecay', interval: '5s' },
  { task: 'processAssociations',  interval: '30s' },
  { task: 'processConsolidation', interval: '60s' },
  { task: 'checkFollowUps',       interval: '1h' },
  { task: 'autoSync',             interval: '5m' },
];

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── 平铺行类型（虚拟滚动用） ─────────────────────────────────────

type FlatRow = { key: string; node: React.ReactNode };

function sepRow(label: string): FlatRow {
  return { key: `sep-${label}`, node: <Text color="gray" dimColor>─ {label}</Text> };
}

function buildRows(daemon: DaemonStatus): FlatRow[] {
  const statusColor = daemon.running ? 'green' : 'gray';
  const statusText  = daemon.running ? '● running' : '○ stopped';
  const cycleStatus = daemon.running ? '● active' : '○ stopped';
  const cycleColor  = daemon.running ? 'green' : 'gray';

  const rows: FlatRow[] = [];

  // ── Heartbeat engine ──
  rows.push(sepRow('Heartbeat engine'));
  rows.push({ key: 'status', node: <Box><Text color="gray">{'Status      '}</Text><Text color={statusColor}>{statusText}</Text></Box> });
  rows.push({ key: 'pid',    node: <Box><Text color="gray">{'PID         '}</Text><Text color="white">{daemon.pid ? String(daemon.pid) : '—'}</Text></Box> });
  rows.push({ key: 'uptime', node: <Box><Text color="gray">{'Uptime      '}</Text><Text color="white">{formatUptime(daemon.uptime)}</Text></Box> });
  rows.push({ key: 'cycles', node: <Box><Text color="gray">{'Cycles      '}</Text><Text color="cyan">{daemon.cycleCount ? String(daemon.cycleCount) : '—'}</Text></Box> });
  if (daemon.lastCheckAge !== null) {
    rows.push({
      key: 'health',
      node: (
        <Box>
          <Text color="gray">{'Health      '}</Text>
          <Text color={daemon.lastCheckAge < 60000 ? 'green' : 'yellow'}>
            {`${Math.round(daemon.lastCheckAge / 1000)}s ago`}
          </Text>
        </Box>
      ),
    });
  }

  // ── Engine cycles ──
  rows.push(sepRow('Engine cycles'));
  for (const { task, interval } of ENGINE_CYCLES) {
    rows.push({
      key: `cycle-${task}`,
      node: (
        <Box>
          <Text color="white">{task.padEnd(26)}</Text>
          <Text color="gray">{'every '}</Text>
          <Text color="cyan">{interval.padEnd(4)}</Text>
          <Text color="gray">{'  '}</Text>
          <Text color={cycleColor}>{cycleStatus}</Text>
        </Box>
      ),
    });
  }

  // ── Log files ──
  rows.push(sepRow('Log files'));
  rows.push({ key: 'stdout', node: <Box><Text color="gray">{'stdout      '}</Text><Text color="white">{daemon.logPath}</Text></Box> });
  rows.push({ key: 'stderr', node: <Box><Text color="gray">{'stderr      '}</Text><Text color="white">{daemon.errPath}</Text></Box> });

  return rows;
}

// ─── 分组 bordered 样式（高度充足时） ────────────────────────────

function FullView({ daemon }: { daemon: DaemonStatus }) {
  const statusColor = daemon.running ? 'green' : 'gray';
  const cycleColor  = daemon.running ? 'green' : 'gray';

  return (
    <Box flexDirection="column" paddingX={1}>

      {/* Heartbeat engine */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Heartbeat engine</Text>
        <Box><Text color="gray">{'Status      '}</Text><Text color={statusColor}>{daemon.running ? '● running' : '○ stopped'}</Text></Box>
        <Box><Text color="gray">{'PID         '}</Text><Text color="white">{daemon.pid ? String(daemon.pid) : '—'}</Text></Box>
        <Box><Text color="gray">{'Uptime      '}</Text><Text color="white">{formatUptime(daemon.uptime)}</Text></Box>
        <Box><Text color="gray">{'Cycles      '}</Text><Text color="cyan">{daemon.cycleCount ? String(daemon.cycleCount) : '—'}</Text></Box>
        {daemon.lastCheckAge !== null && (
          <Box>
            <Text color="gray">{'Health      '}</Text>
            <Text color={daemon.lastCheckAge < 60000 ? 'green' : 'yellow'}>
              {`${Math.round(daemon.lastCheckAge / 1000)}s ago`}
            </Text>
          </Box>
        )}
      </Box>

      {/* Engine cycles */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Engine cycles</Text>
        {ENGINE_CYCLES.map(({ task, interval }) => (
          <Box key={task}>
            <Text color="white">{task.padEnd(26)}</Text>
            <Text color="gray">{'every '}</Text>
            <Text color="cyan">{interval.padEnd(4)}</Text>
            <Text color="gray">{'  '}</Text>
            <Text color={cycleColor}>{daemon.running ? '● active' : '○ stopped'}</Text>
          </Box>
        ))}
      </Box>

      {/* Log files */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text color="gray" dimColor>Log files</Text>
        <Box><Text color="gray">{'stdout      '}</Text><Text color="white">{daemon.logPath}</Text></Box>
        <Box><Text color="gray">{'stderr      '}</Text><Text color="white">{daemon.errPath}</Text></Box>
      </Box>

    </Box>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────

export const DaemonPanel = React.memo(function DaemonPanel({ daemon, scrollOffset, panelHeight }: DaemonPanelProps) {
  const availableRows = Math.max(5, panelHeight);
  const rows = buildRows(daemon);
  const scrollModeRef = React.useRef<boolean | null>(null);
  // 分组模式额外开销：3个section × (边框+标题+间距) ≈ +9 行
  const threshold = rows.length + 9;

  if (scrollModeRef.current === null) {
    scrollModeRef.current = availableRows < threshold;
  } else if (scrollModeRef.current && availableRows >= threshold + 2) {
    scrollModeRef.current = false;
  } else if (!scrollModeRef.current && availableRows < threshold - 2) {
    scrollModeRef.current = true;
  }

  if (!scrollModeRef.current) {
    return <FullView daemon={daemon} />;
  }

  // 高度不足：虚拟滚动
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
          <Text color="gray" dimColor>Daemon</Text>
          {hasAbove && <Text color="gray" dimColor>  ↑ {offset} more</Text>}
          {hasBelow && <Text color="gray" dimColor>  ↓ {rows.length - offset - innerH} more</Text>}
        </Box>
        {visible.map(row => <React.Fragment key={row.key}>{row.node}</React.Fragment>)}
      </Box>
    </Box>
  );
});
