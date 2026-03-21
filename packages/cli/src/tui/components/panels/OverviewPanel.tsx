import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DbStats } from '../../hooks/useDatabase.js';

interface OverviewPanelProps {
  stats: DbStats | null;
  loading: boolean;
  scrollOffset: number;
  panelHeight: number;
}

// ─── 格式化工具 ────────────────────────────────────────────────────

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

// ─── 颜色映射 ────────────────────────────────────────────────────

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

// ─── 进度条 ───────────────────────────────────────────────────────

function HBar({ value, max, width, color }: { value: number; max: number; width: number; color: string }) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return (
    <>
      <Text color={color as any}>{'█'.repeat(filled)}</Text>
      <Text color="gray" dimColor>{'░'.repeat(width - filled)}</Text>
    </>
  );
}

function CompositeBar({ segments, width }: { segments: Array<{ count: number; color: string }>; width: number }) {
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

// ─── 估算分组模式所需行数 ────────────────────────────────────────

function estimateGroupedRows(stats: DbStats): number {
  const activeTypes = NATURE_ORDER.filter(n => (stats.byNature[n] || 0) > 0).length;
  const recentCount = stats.recentBlocks.length;
  // 每个 section: 2(边框) + 1(标题) + N(内容) + 1(间距，最后一个无)
  const memSection    = 2 + 1 + 3;               // Total / Associations / DB
  const typeSection   = 2 + 1 + activeTypes + 1;  // 每种类型一行
  const cycleSection  = 2 + 1 + 3 + 1;            // dots + bar + pct
  const recentSection = recentCount > 0 ? 2 + 1 + recentCount : 0;
  return memSection + typeSection + cycleSection + recentSection;
}

// ─── 平铺行（虚拟滚动用） ────────────────────────────────────────

type FlatRow = { key: string; node: React.ReactNode };

function buildRows(stats: DbStats, barW: number): FlatRow[] {
  const rows: FlatRow[] = [];

  const { byStatus } = stats;
  const vCounts = [
    { label: 'active',   count: byStatus['active']   ?? 0, color: 'green' },
    { label: 'cooling',  count: byStatus['cooling']  ?? 0, color: 'yellow' },
    { label: 'cold',     count: byStatus['cold']     ?? 0, color: '#60a5fa' },
    { label: 'archived', count: byStatus['archived'] ?? 0, color: 'red' },
  ];
  const vTotal = vCounts.reduce((s, v) => s + v.count, 0) || 1;

  // 计算 pct 括号宽度
  let usedW = 0;
  const vSegWidths = vCounts.map((v, i) => {
    const isLast = i === vCounts.length - 1;
    const w = isLast ? barW - usedW : Math.round((v.count / vTotal) * barW);
    const clamped = Math.max(0, w);
    usedW += clamped;
    return clamped;
  });

  const maxNature = Math.max(...NATURE_ORDER.map(n => stats.byNature[n] || 0), 1);

  // ── Memory overview ──
  rows.push({ key: 'sep-mem', node: <Text color="gray" dimColor>─ Memory overview</Text> });
  rows.push({
    key: 'total',
    node: (
      <Box>
        <Text>{'Total blocks  '}</Text>
        <Text bold color="green">{fmtNum(stats.total)}</Text>
        <Text color="gray">{'  (+' + stats.weeklyNew + ' this week)'}</Text>
      </Box>
    ),
  });
  rows.push({
    key: 'assoc',
    node: (
      <Box>
        <Text>{'Associations  '}</Text>
        <Text color="cyan">{fmtNum(stats.associationCount)}</Text>
        <Text color="gray">{'  │  Query hits  '}</Text>
        <Text color="cyan">{fmtNum(stats.queryHits)}</Text>
      </Box>
    ),
  });
  rows.push({
    key: 'db',
    node: (
      <Box>
        <Text>{'DB size  '}</Text>
        <Text color="white">{fmtSize(stats.sizeBytes)}</Text>
        <Text color="gray">{'  │  DB  '}</Text>
        <Text color={stats.healthy ? 'green' : 'red'}>{stats.healthy ? '● ok' : '● error'}</Text>
      </Box>
    ),
  });

  // ── By type ──
  rows.push({ key: 'sep-type', node: <Text color="gray" dimColor>─ By type</Text> });
  for (const nature of NATURE_ORDER) {
    const count = stats.byNature[nature] || 0;
    if (count === 0) continue;
    const color = NATURE_COLOR[nature] ?? 'gray';
    rows.push({
      key: `type-${nature}`,
      node: (
        <Box>
          <Text color={color as any}>{nature.padEnd(12)}</Text>
          <Text>{'  '}</Text>
          <HBar value={count} max={maxNature} width={barW} color={color} />
          <Text>{'  '}</Text>
          <Text color="white">{fmtNum(count)}</Text>
        </Box>
      ),
    });
  }

  // ── Vitality lifecycle ──
  rows.push({ key: 'sep-vitality', node: <Text color="gray" dimColor>─ Vitality lifecycle</Text> });
  rows.push({
    key: 'vitality-dots',
    node: (
      <Box>
        {vCounts.map(v => (
          <Box key={v.label} marginRight={3}>
            <Text color={v.color as any}>{'● ' + v.label + ' '}</Text>
            <Text bold color={v.color as any}>{fmtNum(v.count)}</Text>
          </Box>
        ))}
      </Box>
    ),
  });
  rows.push({
    key: 'vitality-bar',
    node: <Box><CompositeBar segments={vCounts} width={barW} /></Box>,
  });
  rows.push({
    key: 'vitality-pct',
    node: (
      <Box>
        {vCounts.map((v, i) => {
          const pct = ((v.count / vTotal) * 100).toFixed(1) + '%';
          const w = vSegWidths[i];
          if (w <= 0) return null;
          const dashes = Math.max(0, w - pct.length - 4);
          return (
            <Text key={v.label} color={v.color as any}>
              {'└ ' + pct + ' ' + '─'.repeat(dashes) + '┘'}
            </Text>
          );
        })}
      </Box>
    ),
  });

  // ── Recent ──
  if (stats.recentBlocks.length > 0) {
    rows.push({ key: 'sep-recent', node: <Text color="gray" dimColor>─ Recent</Text> });
    for (const block of stats.recentBlocks) {
      const nature = toNature(block.annotation);
      const color  = NATURE_COLOR[nature] ?? 'gray';
      const maxCont = Math.max(20, barW - 20);
      const snippet = block.content.length > maxCont
        ? block.content.slice(0, maxCont - 1) + '…'
        : block.content;
      rows.push({
        key: `recent-${block.id}`,
        node: (
          <Box>
            <Text color="gray">{relTime(block.created_at).padEnd(8) + '  '}</Text>
            <Text color={color as any}>{'[' + nature.padEnd(10) + ']  '}</Text>
            <Text color="white">{snippet}</Text>
            <Text color="gray">{'  ▐' + block.vitality}</Text>
          </Box>
        ),
      });
    }
  }

  return rows;
}

// ─── 分组 bordered 样式（高度充足时） ────────────────────────────

function FullView({ stats, sectionW, barW }: { stats: DbStats; sectionW: number; barW: number }) {
  const { byStatus } = stats;
  const vCounts = [
    { label: 'active',   count: byStatus['active']   ?? 0, color: 'green' },
    { label: 'cooling',  count: byStatus['cooling']  ?? 0, color: 'yellow' },
    { label: 'cold',     count: byStatus['cold']     ?? 0, color: '#60a5fa' },
    { label: 'archived', count: byStatus['archived'] ?? 0, color: 'red' },
  ];
  const vTotal = vCounts.reduce((s, v) => s + v.count, 0) || 1;
  const lifecycleBarW = Math.max(20, sectionW - 4);
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

      {/* Memory overview */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Memory overview</Text>
        <Box>
          <Text>{'Total blocks  '}</Text>
          <Text bold color="green">{fmtNum(stats.total)}</Text>
          <Text color="gray">{'  (+' + stats.weeklyNew + ' this week)'}</Text>
        </Box>
        <Box>
          <Text>{'Associations  '}</Text>
          <Text color="cyan">{fmtNum(stats.associationCount)}</Text>
          <Text color="gray">{'  │  Query hits  '}</Text>
          <Text color="cyan">{fmtNum(stats.queryHits)}</Text>
        </Box>
        <Box>
          <Text>{'DB size  '}</Text>
          <Text color="white">{fmtSize(stats.sizeBytes)}</Text>
          <Text color="gray">{'  │  DB  '}</Text>
          <Text color={stats.healthy ? 'green' : 'red'}>{stats.healthy ? '● ok' : '● error'}</Text>
        </Box>
      </Box>

      {/* By type */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>By type</Text>
        {NATURE_ORDER.map(nature => {
          const count = stats.byNature[nature] || 0;
          if (count === 0) return null;
          const color = NATURE_COLOR[nature] ?? 'gray';
          return (
            <Box key={nature}>
              <Text color={color as any}>{nature.padEnd(12)}</Text>
              <Text>{'  '}</Text>
              <HBar value={count} max={maxNature} width={barW} color={color} />
              <Text>{'  '}</Text>
              <Text color="white">{fmtNum(count)}</Text>
            </Box>
          );
        })}
        {NATURE_ORDER.every(n => !stats.byNature[n]) && (
          <Text color="gray" dimColor>  no blocks yet</Text>
        )}
      </Box>

      {/* Vitality lifecycle */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>Vitality lifecycle</Text>
        <Box marginBottom={0}>
          {vCounts.map(v => (
            <Box key={v.label} marginRight={3}>
              <Text color={v.color as any}>{'● ' + v.label + ' '}</Text>
              <Text bold color={v.color as any}>{fmtNum(v.count)}</Text>
            </Box>
          ))}
        </Box>
        <Box><CompositeBar segments={vCounts} width={lifecycleBarW} /></Box>
        <Box>
          {vCounts.map((v, i) => {
            const pct = ((v.count / vTotal) * 100).toFixed(1) + '%';
            const w = vSegWidths[i];
            if (w <= 0) return null;
            const dashes = Math.max(0, w - pct.length - 4);
            return (
              <Text key={v.label} color={v.color as any}>
                {'└ ' + pct + ' ' + '─'.repeat(dashes) + '┘'}
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* Recent */}
      {stats.recentBlocks.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="gray" dimColor>Recent</Text>
          {stats.recentBlocks.map((block: any) => {
            const nature = toNature(block.annotation);
            const color  = NATURE_COLOR[nature] ?? 'gray';
            const maxCont = Math.max(20, sectionW - 36);
            const snippet = block.content.length > maxCont
              ? block.content.slice(0, maxCont - 1) + '…'
              : block.content;
            return (
              <Box key={block.id}>
                <Text color="gray">{relTime(block.created_at).padEnd(8) + '  '}</Text>
                <Text color={color as any}>{'[' + nature.padEnd(10) + ']  '}</Text>
                <Text color="white">{snippet}</Text>
                <Text color="gray">{'  ▐' + block.vitality}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────

export const OverviewPanel = React.memo(function OverviewPanel({ stats, loading, scrollOffset, panelHeight }: OverviewPanelProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const availableRows = Math.max(5, panelHeight);
  const sectionW = cols - 4;
  const barW = Math.max(20, sectionW - 28);

  // 模式滞后 ref：±2 行缓冲，防止数据刷新时在临界点反复切换
  const scrollModeRef = React.useRef<boolean | null>(null);

  if (loading) {
    return <Box paddingX={2}><Text color="gray">  Loading...</Text></Box>;
  }
  if (!stats) {
    return <Box paddingX={2}><Text color="red">  Database unavailable</Text></Box>;
  }

  // 估算分组模式所需行数，应用 hysteresis 决定是否进入滚动模式
  const neededRows = estimateGroupedRows(stats);
  if (scrollModeRef.current === null) {
    scrollModeRef.current = availableRows < neededRows;
  } else if (scrollModeRef.current && availableRows >= neededRows + 2) {
    scrollModeRef.current = false;
  } else if (!scrollModeRef.current && availableRows < neededRows - 2) {
    scrollModeRef.current = true;
  }

  if (!scrollModeRef.current) {
    return <FullView stats={stats} sectionW={sectionW} barW={barW} />;
  }

  // 高度不足：虚拟滚动
  const rows = buildRows(stats, barW);
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
          <Text color="gray" dimColor>Overview</Text>
          {hasAbove && <Text color="gray" dimColor>  ↑ {offset} more</Text>}
          {hasBelow && <Text color="gray" dimColor>  ↓ {rows.length - offset - innerH} more</Text>}
        </Box>
        {visible.map(row => <React.Fragment key={row.key}>{row.node}</React.Fragment>)}
      </Box>
    </Box>
  );
});
