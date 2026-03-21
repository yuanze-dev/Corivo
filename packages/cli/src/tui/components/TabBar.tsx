import React from 'react';
import { Box, Text } from 'ink';

export const TABS = [
  { id: 'overview', icon: '●', label: 'overview' },
  { id: 'sync',     icon: '⇌', label: 'sync' },
  { id: 'daemon',   icon: '↺', label: 'daemon' },
  { id: 'device',   icon: '□', label: 'device' },
  { id: 'config',   icon: '✦', label: 'config' },
  { id: 'logs',     icon: '▪', label: 'logs' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

const TAB_ICON_COLOR: Record<string, string> = {
  overview: 'green',
  sync:     'cyan',
  daemon:   'yellow',
  device:   '#a78bfa',
  config:   'blue',
  logs:     'gray',
};

interface TabBarProps {
  active: TabId;
}

export function TabBar({ active }: TabBarProps) {
  return (
    <Box marginBottom={1}>
      {TABS.map((tab, i) => {
        const isActive = tab.id === active;
        const iconColor = TAB_ICON_COLOR[tab.id] ?? 'gray';
        if (isActive) {
          return (
            <Box key={tab.id} borderStyle="round" borderColor="green" marginRight={2}>
              <Text color="green" bold>
                {tab.icon} {tab.label}
              </Text>
            </Box>
          );
        }
        return (
          <Box key={tab.id} marginRight={3} alignSelf="center">
            <Text color={iconColor as any}>{tab.icon}</Text>
            <Text color="gray"> {tab.label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
