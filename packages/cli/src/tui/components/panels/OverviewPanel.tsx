import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DbStats } from '../../hooks/useDatabase.js';

interface OverviewPanelProps {
  stats: DbStats | null;
  loading: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString('en-US');
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function relTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Type colors ───────────────────────────────────────────────────────────────

const NATURE_COLOR: Record<string, string> = {
  decision:   'green',
  fact:       '#60a5fa',
  knowledge:  '#f59e0b',
  preference: '#a78bfa',
  other:      'gray',
};

const NATURE_ORDER = ['decision', 'fact', 'knowledge', 'preference', 'other'];

function toNature(annotation: string): string {
  if (annotation.startsWith('决策')) return 'decision';
  if (annotation.startsWith('事实')) return 'fact';
  if (annotation.startsWith('知识')) return 'knowledge';
  if (annotation.startsWith('指令')) return 'preference';
  return 'other';
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return (
    <Box marginBottom={0}>
      <Text color="gray" dimColor>{label}</Text>
    </Box>
  );
}

function HBar({ value, max, width, color }: { value: number; max: number; width: number; color: string }) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return (
    <>
      <Text color={color as any}>{'█'.repeat(filled)}</Text>
      <Text color="gray" dimColor>{'░'.repeat(width - filled)}</Text>
    </>
  );
}

function CompositeBar({
  segments,
  width,
}: {
  segments: Array<{ count: number; color: string }>;
  width: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0) || 1;
  let used = 0;
  return (
    <>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const w = isLast ? width - used : Math.round((seg.count / total) * width);
        const clamped = Math.max(0, w);
        used += clamped;
        return <Text key={i} color={seg.color as any}>{'█'.repeat(clamped)}</Text>;
      })}
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OverviewPanel({ stats, loading }: OverviewPanelProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const sectionW = cols - 4;
  const barW = Math.max(20, sectionW - 28);

  if (loading) {
    return <Box paddingX={2}><Text color="gray">  Loading...</Text></Box>;
  }
  if (!stats) {
    return <Box paddingX={2}><Text color="red">  Database unavailable</Text></Box>;
  }

  const { byStatus } = stats;
  const vCounts = [
    { label: 'active',   count: byStatus['active']   ?? 0, color: 'green' },
    { label: 'cooling',  count: byStatus['cooling']  ?? 0, color: 'yellow' },
    { label: 'cold',     count: byStatus['cold']     ?? 0, color: '#60a5fa' },
    { label: 'archived', count: byStatus['archived'] ?? 0, color: 'red' },
  ];
  const vTotal = vCounts.reduce((s, v) => s + v.count, 0) || 1;
  const lifecycleBarW = Math.max(20, sectionW - 4);

  // Compute segment widths for pct brackets
  let usedW = 0;
  const vSegWidths = vCounts.map((v, i) => {
    const isLast = i === vCounts.length - 1;
    const w = isLast ? lifecycleBarW - usedW : Math.round((v.count / vTotal) * lifecycleBarW);
    const clamped = Math.max(0, w);
    usedW += clamped;
    return clamped;
  });

  const maxNature = Math.max(...NATURE_ORDER.map(n => stats.byNature[n] || 0), 1);

  return (
    <Box flexDirection="column" paddingX={1}>

      {/* ── Memory overview ── */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <SectionTitle label="Memory overview" />
        <Box marginTop={0}>
          <Text>Total blocks  </Text>
          <Text bold color="green">{fmtNum(stats.total)}</Text>
          <Text color="gray">  (+{stats.weeklyNew} this week)</Text>
        </Box>
        <Box>
          <Text>Associations  </Text>
          <Text color="cyan">{fmtNum(stats.associationCount)}</Text>
          <Text color="gray">  │  Query hits  </Text>
          <Text color="cyan">{fmtNum(stats.queryHits)}</Text>
        </Box>
        <Box>
          <Text>DB size  </Text>
          <Text color="white">{fmtSize(stats.sizeBytes)}</Text>
          <Text color="gray">  │  DB  </Text>
          <Text color={stats.healthy ? 'green' : 'red'}>{stats.healthy ? '● ok' : '● error'}</Text>
        </Box>
      </Box>

      {/* ── By type ── */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <SectionTitle label="By type" />
        {NATURE_ORDER.map(nature => {
          const count = stats.byNature[nature] || 0;
          if (count === 0) return null;
          const color = NATURE_COLOR[nature] ?? 'gray';
          return (
            <Box key={nature}>
              <Text color={color as any}>{nature.padEnd(12)}</Text>
              <Text>  </Text>
              <HBar value={count} max={maxNature} width={barW} color={color} />
              <Text>  </Text>
              <Text color="white">{fmtNum(count)}</Text>
            </Box>
          );
        })}
        {NATURE_ORDER.every(n => !stats.byNature[n]) && (
          <Text color="gray" dimColor>  no blocks yet</Text>
        )}
      </Box>

      {/* ── Vitality lifecycle ── */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <SectionTitle label="Vitality lifecycle" />

        {/* Dots row */}
        <Box marginBottom={0}>
          {vCounts.map((v, i) => (
            <Box key={v.label} marginRight={3}>
              <Text color={v.color as any}>● {v.label} </Text>
              <Text bold color={v.color as any}>{fmtNum(v.count)}</Text>
            </Box>
          ))}
        </Box>

        {/* Composite bar */}
        <Box>
          <CompositeBar segments={vCounts} width={lifecycleBarW} />
        </Box>

        {/* Pct brackets */}
        <Box>
          {vCounts.map((v, i) => {
            const pct = ((v.count / vTotal) * 100).toFixed(1) + '%';
            const w = vSegWidths[i];
            if (w <= 0) return null;
            const dashes = Math.max(0, w - pct.length - 4);
            return (
              <Text key={v.label} color={v.color as any}>
                {`└ ${pct} ${'─'.repeat(dashes)}┘`}
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* ── Recent ── */}
      {stats.recentBlocks.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <SectionTitle label="Recent" />
          {stats.recentBlocks.map((block: any) => {
            const nature = toNature(block.annotation);
            const color  = NATURE_COLOR[nature] ?? 'gray';
            const maxCont = Math.max(20, cols - 52);
            const snippet = block.content.length > maxCont
              ? block.content.slice(0, maxCont - 1) + '…'
              : block.content;
            return (
              <Box key={block.id}>
                <Text color="gray">{relTime(block.created_at).padEnd(8)}  </Text>
                <Text color={color as any}>[{nature.padEnd(10)}]  </Text>
                <Text color="white">{snippet}</Text>
                <Text color="gray">  ▐{block.vitality}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
