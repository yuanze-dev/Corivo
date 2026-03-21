import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DbStats } from '../../hooks/useDatabase.js';
import { VitalityBar } from '../VitalityBar.js';
import { Badge } from '../Badge.js';

interface OverviewPanelProps {
  stats: DbStats | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function BarChart({ data, totalWidth }: { data: Record<string, number>; totalWidth: number }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return <Text color="gray">  no data</Text>;
  const barWidth = Math.min(30, Math.floor(totalWidth * 0.3));

  return (
    <Box flexDirection="column">
      {Object.entries(data).map(([label, count]) => {
        const pct = total > 0 ? count / total : 0;
        const filled = Math.round(pct * barWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
        const color = label.startsWith('决策') ? 'green'
          : label.startsWith('事实') ? 'blue'
          : label.startsWith('知识') ? 'yellow'
          : 'magenta';
        return (
          <Box key={label}>
            <Text color="gray">{`  ${label.substring(0, 14).padEnd(14)} `}</Text>
            <Text color={color}>{bar}</Text>
            <Text color="gray"> {count}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function OverviewPanel({ stats, loading }: OverviewPanelProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  if (loading) return <Box paddingX={2}><Text color="gray">Loading...</Text></Box>;
  if (!stats) return <Box paddingX={2}><Text color="red">Database unavailable</Text></Box>;

  const { byStatus } = stats;
  const statusTotal = Object.values(byStatus).reduce((s, v) => s + v, 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Stats row */}
      <Box marginBottom={1}>
        <Box borderStyle="round" paddingX={2} marginRight={2}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{stats.total}</Text>
            <Text color="gray">Blocks</Text>
          </Box>
        </Box>
        <Box borderStyle="round" paddingX={2} marginRight={2}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{stats.associationCount}</Text>
            <Text color="gray">Associations</Text>
          </Box>
        </Box>
        <Box borderStyle="round" paddingX={2}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{formatBytes(stats.sizeBytes)}</Text>
            <Text color="gray">DB Size</Text>
          </Box>
        </Box>
      </Box>

      {/* Annotation distribution */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Type Distribution</Text>
      </Box>
      <BarChart data={stats.byAnnotation} totalWidth={cols} />

      {/* Vitality lifecycle */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">Vitality Lifecycle</Text>
      </Box>
      <Box paddingX={2}>
        {statusTotal > 0 ? (
          <Box flexWrap="wrap">
            {(['active', 'cooling', 'cold', 'archived'] as const).map(s => {
              const count = byStatus[s] ?? 0;
              const pct = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0;
              const color = s === 'active' ? 'green' : s === 'cooling' ? 'yellow' : s === 'cold' ? 'blue' : 'gray';
              return (
                <Box key={s} marginRight={3}>
                  <Text color={color}>{s} </Text>
                  <Text color="white">{count}</Text>
                  <Text color="gray"> ({pct}%)</Text>
                </Box>
              );
            })}
          </Box>
        ) : <Text color="gray">no blocks</Text>}
      </Box>

      {/* Recent blocks */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">Recent Blocks</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {stats.recentBlocks.length === 0
          ? <Text color="gray">  no blocks yet</Text>
          : stats.recentBlocks.map(block => {
            const maxContent = Math.max(20, cols - 52);
            const truncated = block.content.length > maxContent
              ? block.content.substring(0, maxContent) + '…'
              : block.content;
            const nature = block.annotation.split(' · ')[0] ?? '?';
            return (
              <Box key={block.id}>
                <Text color="gray">{new Date(block.updated_at * 1000).toLocaleDateString()} </Text>
                <Badge label={nature} color="cyan" />
                <Text> </Text>
                <Text color="white">{truncated}</Text>
                <Text color="gray"> v{block.vitality}</Text>
              </Box>
            );
          })
        }
      </Box>
    </Box>
  );
}
