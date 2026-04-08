import React from 'react';
import { Box, Text } from 'ink';
import type { SolverConfig } from '@/config.js';

interface SyncPanelProps {
  solver: SolverConfig | null;
  scrollOffset: number;
  panelHeight: number;
}

// ───Tile row type (for virtual scrolling) ────────────────────────────────────

type FlatRow = { key: string; node: React.ReactNode };

function sepRow(label: string): FlatRow {
  return { key: `sep-${label}`, node: <Text color="gray" dimColor>─ {label}</Text> };
}
function kvRow(k: string, labelStr: string, value: React.ReactNode): FlatRow {
  return {
    key: k,
    node: (
      <Box>
        <Text color="gray">{labelStr}</Text>
        {value}
      </Box>
    ),
  };
}

// ─── Constructing a tiled row list ─────────────────────────────────────────────

function buildRows(solver: SolverConfig | null): FlatRow[] {
  const rows: FlatRow[] = [];
  rows.push(sepRow('Connection'));

  if (!solver) {
    rows.push({ key: 'not-cfg', node: <Text color="gray">● not configured</Text> });
    rows.push({
      key: 'hint', node: (
        <Box>
          <Text color="gray" dimColor>Run: </Text>
          <Text color="white">corivo sync register</Text>
        </Box>
      ),
    });
    return rows;
  }

  rows.push(kvRow('server', 'Server      ', <Text color="green">{solver.server_url}</Text>));
  rows.push(kvRow('status', 'Status      ', <Text color="green">● configured</Text>));
  rows.push(kvRow('site',   'Site ID     ', <Text color="white">{solver.site_id}</Text>));

  rows.push(sepRow('Sync progress'));
  rows.push(kvRow('pushed', 'Pushed      ', <><Text color="cyan">{solver.last_push_version}</Text><Text color="gray"> changesets</Text></>));
  rows.push(kvRow('pulled', 'Pulled      ', <><Text color="cyan">{solver.last_pull_version}</Text><Text color="gray"> changesets</Text></>));

  return rows;
}

// ─── Grouped bordered style (when the height is sufficient) ─────────────────────────────

function FullView({ solver }: { solver: SolverConfig | null }) {
  if (!solver) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="gray" dimColor>Connection</Text>
          <Box><Text color="gray">● not configured</Text></Box>
          <Box>
            <Text color="gray" dimColor>Run: </Text>
            <Text color="white">corivo sync register</Text>
          </Box>
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Connection</Text>
        <Box><Text color="gray">{'Server      '}</Text><Text color="green">{solver.server_url}</Text></Box>
        <Box><Text color="gray">{'Status      '}</Text><Text color="green">● configured</Text></Box>
        <Box><Text color="gray">{'Site ID     '}</Text><Text color="white">{solver.site_id}</Text></Box>
      </Box>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text color="gray" dimColor>Sync progress</Text>
        <Box>
          <Text color="gray">{'Pushed      '}</Text>
          <Text color="cyan">{solver.last_push_version}</Text>
          <Text color="gray"> changesets</Text>
        </Box>
        <Box>
          <Text color="gray">{'Pulled      '}</Text>
          <Text color="cyan">{solver.last_pull_version}</Text>
          <Text color="gray"> changesets</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export const SyncPanel = React.memo(function SyncPanel({ solver, scrollOffset, panelHeight }: SyncPanelProps) {
  const availableRows = Math.max(5, panelHeight);
  const rows = buildRows(solver);
  const scrollModeRef = React.useRef<boolean | null>(null);
  const threshold = rows.length + 2;

  // hysteresis: ±2 line buffering to prevent critical jitter
  if (scrollModeRef.current === null) {
    scrollModeRef.current = availableRows < threshold;
  } else if (scrollModeRef.current && availableRows >= threshold + 2) {
    scrollModeRef.current = false;
  } else if (!scrollModeRef.current && availableRows < threshold - 2) {
    scrollModeRef.current = true;
  }

  if (!scrollModeRef.current) {
    return <FullView solver={solver} />;
  }

  // Insufficient height: virtual scrolling (single bordered container)
  const innerH = Math.max(2, availableRows - 3); // 3 = top and bottom borders + title row
  const maxScroll = Math.max(0, rows.length - innerH);
  const offset = Math.min(scrollOffset, maxScroll);
  const visible = rows.slice(offset, offset + innerH);
  const hasAbove = offset > 0;
  const hasBelow = offset + innerH < rows.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Box>
          <Text color="gray" dimColor>Sync</Text>
          {hasAbove && <Text color="gray" dimColor>  ↑ {offset} more</Text>}
          {hasBelow && <Text color="gray" dimColor>  ↓ {rows.length - offset - innerH} more</Text>}
        </Box>
        {visible.map(row => <React.Fragment key={row.key}>{row.node}</React.Fragment>)}
      </Box>
    </Box>
  );
});
