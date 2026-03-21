import React from 'react';
import { Box, Text } from 'ink';
import type { UseConfigResult } from '../../hooks/useConfig.js';
import type { CorivoFeatures } from '../../../config.js';

export interface FeatureItem {
  key: keyof CorivoFeatures;
  label: string;
  group: string;
}

export const FEATURE_ITEMS: FeatureItem[] = [
  // Sync
  { key: 'sync',              label: 'Multi-device sync',       group: 'Sync' },
  { key: 'autoPushOnSave',    label: 'Auto-push on save',       group: 'Sync' },
  { key: 'syncOnWake',        label: 'Sync on wake',            group: 'Sync' },
  // Daemon
  { key: 'heartbeatEngine',   label: 'Heartbeat engine',        group: 'Daemon' },
  { key: 'autoStartOnLogin',  label: 'Auto-start on login',     group: 'Daemon' },
  // Memory Engine
  { key: 'passiveListening',      label: 'Passive listening',       group: 'Memory Engine' },
  { key: 'associationDiscovery',  label: 'Association discovery',   group: 'Memory Engine' },
  { key: 'consolidation',         label: 'Consolidation',           group: 'Memory Engine' },
  { key: 'cjkFtsFallback',        label: 'CJK FTS fallback',        group: 'Memory Engine' },
  // Integrations
  { key: 'claudeCode',  label: 'Claude Code',   group: 'Integrations' },
  { key: 'cursor',      label: 'Cursor',         group: 'Integrations' },
  { key: 'feishu',      label: 'Feishu',         group: 'Integrations' },
  // Security
  { key: 'dbEncryption', label: 'Database encryption', group: 'Security' },
  { key: 'telemetry',    label: 'Telemetry',            group: 'Security' },
];

export const CONFIG_ITEM_COUNT = FEATURE_ITEMS.length;

interface ConfigPanelProps {
  configState: UseConfigResult;
  focusIndex: number;
}

export function ConfigPanel({ configState, focusIndex }: ConfigPanelProps) {
  const { config, loading } = configState;
  if (loading) return <Box paddingX={2}><Text color="gray">Loading config...</Text></Box>;
  if (!config) return <Box paddingX={2}><Text color="red">Config unavailable</Text></Box>;

  let currentGroup = '';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>↑/↓ navigate · Enter/Space toggle</Text>
      </Box>
      {FEATURE_ITEMS.map((item, myIndex) => {
        const isFocused = myIndex === focusIndex;
        // opt-out: missing key = true (enabled)
        const enabled = config.features?.[item.key] !== false;

        const showGroup = item.group !== currentGroup;
        if (showGroup) currentGroup = item.group;

        return (
          <React.Fragment key={item.key}>
            {showGroup && (
              <Box marginTop={1}>
                <Text bold color="cyan">{item.group}</Text>
              </Box>
            )}
            <Box paddingX={1}>
              {isFocused ? (
                <Text color="white">{'> '}{enabled ? '[x]' : '[ ]'} {item.label}</Text>
              ) : (
                <Text color="gray">{'  '}{enabled ? '[x]' : '[ ]'} {item.label}</Text>
              )}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
