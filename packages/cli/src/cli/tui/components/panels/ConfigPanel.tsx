import React from 'react';
import { Box, Text } from 'ink';
import type { UseConfigResult } from '../../hooks/useConfig.js';
import type { CorivoFeatures } from '@/config.js';

export interface FeatureItem {
  key: keyof CorivoFeatures;
  label: string;
  group: string;
}

export const FEATURE_ITEMS: FeatureItem[] = [
  // sync
  { key: 'sync',              label: 'Multi-device sync',       group: 'Sync' },
  { key: 'autoPushOnSave',    label: 'Auto-push on save',       group: 'Sync' },
  { key: 'syncOnWake',        label: 'Sync on wake',            group: 'Sync' },
  // daemon
  { key: 'heartbeatEngine',   label: 'Heartbeat engine',        group: 'Daemon' },
  { key: 'autoStartOnLogin',  label: 'Auto-start on login',     group: 'Daemon' },
  // memory engine
  { key: 'passiveListening',      label: 'Passive listening',       group: 'Memory Engine' },
  { key: 'associationDiscovery',  label: 'Association discovery',   group: 'Memory Engine' },
  { key: 'consolidation',         label: 'Consolidation',           group: 'Memory Engine' },
  { key: 'cjkFtsFallback',        label: 'CJK FTS fallback',        group: 'Memory Engine' },
  // Integrate
  { key: 'claudeCode',  label: 'Claude Code',   group: 'Integrations' },
  { key: 'cursor',      label: 'Cursor',         group: 'Integrations' },
  { key: 'feishu',      label: 'Feishu',         group: 'Integrations' },
  // safe
  { key: 'dbEncryption', label: 'Database encryption', group: 'Security' },
  { key: 'telemetry',    label: 'Telemetry',            group: 'Security' },
];

// ─── Sync interval presets ────────────────────────────────────────

const SYNC_PRESETS = [300, 900, 1800] as const; // 5m, 15m, 30m

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function nextSyncPreset(current: number): number {
  const idx = SYNC_PRESETS.indexOf(current as typeof SYNC_PRESETS[number]);
  if (idx === -1) {
    const next = SYNC_PRESETS.find(p => p > current);
    return next ?? SYNC_PRESETS[0];
  }
  return SYNC_PRESETS[(idx + 1) % SYNC_PRESETS.length];
}

export function prevSyncPreset(current: number): number {
  const idx = SYNC_PRESETS.indexOf(current as typeof SYNC_PRESETS[number]);
  if (idx === -1) {
    const prev = [...SYNC_PRESETS].reverse().find(p => p < current);
    return prev ?? SYNC_PRESETS[SYNC_PRESETS.length - 1];
  }
  return SYNC_PRESETS[(idx - 1 + SYNC_PRESETS.length) % SYNC_PRESETS.length];
}

export const CONFIG_ITEM_COUNT = FEATURE_ITEMS.length + 1; // +1 for sync interval row
export const SYNC_INTERVAL_INDEX = FEATURE_ITEMS.length;   // index of sync interval row

interface ConfigPanelProps {
  configState: UseConfigResult;
  focusIndex: number;
  panelHeight: number;
}

// ─── Flat row type (for virtual scrolling) ─────────────────────────────────

type FlatRow =
  | { kind: 'group'; label: string }
  | { kind: 'item'; item: FeatureItem; globalIndex: number }
  | { kind: 'syncInterval' };

/** Expand FEATURE_ITEMS into a flat list of rows, with group header as delimited row */
function buildFlatRows(): FlatRow[] {
  const rows: FlatRow[] = [];
  let lastGroup = '';
  let gi = 0;
  for (const item of FEATURE_ITEMS) {
    if (item.group !== lastGroup) {
      rows.push({ kind: 'group', label: item.group });
      lastGroup = item.group;
    }
    rows.push({ kind: 'item', item, globalIndex: gi++ });
    // insert sync interval row after last Sync group item
    if (item.group === 'Sync') {
      const nextItem = FEATURE_ITEMS[gi];
      if (!nextItem || nextItem.group !== 'Sync') {
        rows.push({ kind: 'syncInterval' });
      }
    }
  }
  return rows;
}

const FLAT_ROWS = buildFlatRows();

/** Calculate the flat row index corresponding to focusIndex */
function focusRowIndex(focusIndex: number): number {
  if (focusIndex === SYNC_INTERVAL_INDEX) {
    return FLAT_ROWS.findIndex(r => r.kind === 'syncInterval');
  }
  return FLAT_ROWS.findIndex(r => r.kind === 'item' && r.globalIndex === focusIndex);
}

// ─── Section title consistent with OverviewPanel ───────────────────────

function SectionTitle({ label }: { label: string }) {
  return (
    <Box marginBottom={0}>
      <Text color="gray" dimColor>{label}</Text>
    </Box>
  );
}

// ─── Synchronized spaced row rendering ───────────────────────────────────────────

function SyncIntervalRow({
  seconds,
  focused,
}: {
  seconds: number;
  focused: boolean;
}) {
  const label = formatSeconds(seconds);
  if (focused) {
    return (
      <Box>
        <Text color="white">{'> '}</Text>
        <Text color="gray">{'Sync interval  '}</Text>
        <Text color="cyan">{label}</Text>
        <Text color="gray" dimColor>{'  - / + cycle'}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="gray">{'  Sync interval  '}</Text>
      <Text color="white">{label}</Text>
    </Box>
  );
}

// ─── Single item row rendering ─────────────────────────────────────────

function ItemRow({
  item,
  enabled,
  focused,
}: {
  item: FeatureItem;
  enabled: boolean;
  focused: boolean;
}) {
  if (focused) {
    return (
      <Box>
        <Text color="white">{'> '}</Text>
        <Text color={enabled ? 'green' : 'gray'}>{enabled ? '[x]' : '[ ]'}</Text>
        <Text color="white">{' ' + item.label}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="gray">{'  '}</Text>
      <Text color={enabled ? 'green' : 'gray'} dimColor={!enabled}>{enabled ? '[x]' : '[ ]'}</Text>
      <Text color="gray">{' ' + item.label}</Text>
    </Box>
  );
}

// ───Group bordered style (when the height is sufficient) ────────────────────────────

function GroupedView({
  config,
  focusIndex,
}: {
  config: NonNullable<UseConfigResult['config']>;
  focusIndex: number;
}) {
  const groups: Array<{ group: string; items: Array<{ item: FeatureItem; gi: number }> }> = [];
  let gi = 0;
  for (const item of FEATURE_ITEMS) {
    let g = groups.find(g => g.group === item.group);
    if (!g) { g = { group: item.group, items: [] }; groups.push(g); }
    g.items.push({ item, gi: gi++ });
  }

  const syncSeconds = config.settings?.syncIntervalSeconds ?? 300;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {focusIndex === SYNC_INTERVAL_INDEX
            ? '↑/↓ navigate · - / + cycle · restart daemon to apply'
            : '↑/↓ navigate · Enter/Space toggle'}
        </Text>
      </Box>
      {groups.map(({ group, items }) => (
        <Box
          key={group}
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
          marginBottom={1}
        >
          <SectionTitle label={group} />
          {items.map(({ item, gi }) => (
            <ItemRow
              key={item.key}
              item={item}
              enabled={config.features?.[item.key] !== false}
              focused={gi === focusIndex}
            />
          ))}
          {group === 'Sync' && (
            <SyncIntervalRow
              seconds={syncSeconds}
              focused={focusIndex === SYNC_INTERVAL_INDEX}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Virtual scrolling style (when the height is insufficient) ─────────────────────────────────

function ScrollView({
  config,
  focusIndex,
  availableRows,
}: {
  config: NonNullable<UseConfigResult['config']>;
  focusIndex: number;
  availableRows: number;
}) {
  const totalRows = FLAT_ROWS.length;
  const innerH = Math.max(3, availableRows - 4);

  const focusRow = focusRowIndex(focusIndex);
  const rawTop = focusRow - Math.floor(innerH / 2);
  const scrollTop = Math.max(0, Math.min(rawTop, totalRows - innerH));
  const scrollEnd = scrollTop + innerH;

  const visibleRows = FLAT_ROWS.slice(scrollTop, scrollEnd);
  const hasMore  = scrollEnd < totalRows;
  const hasAbove = scrollTop > 0;

  const syncSeconds = config.settings?.syncIntervalSeconds ?? 300;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {focusIndex === SYNC_INTERVAL_INDEX
            ? '- / + cycle · restart daemon to apply'
            : '↑/↓ navigate · Enter/Space toggle'}
        </Text>
        {hasAbove && <Text color="gray" dimColor>{'  ↑ ' + scrollTop + ' more'}</Text>}
        {hasMore  && <Text color="gray" dimColor>{'  ↓ ' + (totalRows - scrollEnd) + ' more'}</Text>}
      </Box>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <SectionTitle label="Features" />
        {visibleRows.map((row, i) => {
          if (row.kind === 'group') {
            return (
              <Box key={`g-${row.label}-${i}`}>
                <Text color="gray" dimColor>─ {row.label}</Text>
              </Box>
            );
          }
          if (row.kind === 'syncInterval') {
            return (
              <SyncIntervalRow
                key="sync-interval"
                seconds={syncSeconds}
                focused={focusIndex === SYNC_INTERVAL_INDEX}
              />
            );
          }
          return (
            <ItemRow
              key={row.item.key}
              item={row.item}
              enabled={config.features?.[row.item.key] !== false}
              focused={row.globalIndex === focusIndex}
            />
          );
        })}
      </Box>
    </Box>
  );
}

// ─── The static height of each group (border×2 + title + items + marginBottom) ──

function groupedContentRows(): number {
  const groups = new Map<string, number>();
  for (const item of FEATURE_ITEMS) {
    groups.set(item.group, (groups.get(item.group) ?? 0) + 1);
  }
  let total = 1; // hint line
  for (const [group, count] of groups.entries()) {
    const extraRows = group === 'Sync' ? 1 : 0; // SyncIntervalRow
    total += 2 + 1 + count + extraRows + 1; // border×2 + title + items + extra + marginBottom
  }
  return total;
}

const GROUPED_ROWS_NEEDED = groupedContentRows();

// ─── Main component ────────────────────────────────────────────────────

export const ConfigPanel = React.memo(function ConfigPanel({ configState, focusIndex, panelHeight }: ConfigPanelProps) {
  const { config, loading } = configState;
  const scrollModeRef = React.useRef<boolean | null>(null);

  if (loading) return <Box paddingX={2}><Text color="gray">Loading config...</Text></Box>;
  if (!config)  return <Box paddingX={2}><Text color="red">Config unavailable</Text></Box>;

  const availableRows = Math.max(5, panelHeight);

  // hysteresis: ±2 line buffering to prevent critical jitter
  if (scrollModeRef.current === null) {
    scrollModeRef.current = availableRows < GROUPED_ROWS_NEEDED;
  } else if (scrollModeRef.current && availableRows >= GROUPED_ROWS_NEEDED + 2) {
    scrollModeRef.current = false;
  } else if (!scrollModeRef.current && availableRows < GROUPED_ROWS_NEEDED - 2) {
    scrollModeRef.current = true;
  }

  if (!scrollModeRef.current) {
    // Sufficient height: use grouped bordered style
    return <GroupedView config={config} focusIndex={focusIndex} />;
  }

  // Not enough height: virtual scrolling
  return <ScrollView config={config} focusIndex={focusIndex} availableRows={availableRows} />;
});
