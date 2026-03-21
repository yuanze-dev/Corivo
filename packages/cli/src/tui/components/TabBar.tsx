import React from 'react';
import { Box, Text } from 'ink';

export const TABS = [
  { id: 'overview', label: '1:Overview' },
  { id: 'sync',     label: '2:Sync' },
  { id: 'daemon',   label: '3:Daemon' },
  { id: 'device',   label: '4:Device' },
  { id: 'config',   label: '5:Config' },
  { id: 'logs',     label: '6:Logs' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

interface TabBarProps {
  active: TabId;
}

export function TabBar({ active }: TabBarProps) {
  return (
    <Box paddingX={1} marginBottom={1}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Box key={tab.id} marginRight={2}>
            <Text
              color={isActive ? 'green' : 'gray'}
              bold={isActive}
              underline={isActive}
            >
              {tab.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
