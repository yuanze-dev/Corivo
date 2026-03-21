import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  daemonRunning: boolean;
  syncConfigured: boolean;
  dbHealthy: boolean;
  pid?: number | null;
  savedFlash?: boolean;
}

export function StatusBar({ daemonRunning, syncConfigured, dbHealthy, pid, savedFlash }: StatusBarProps) {
  return (
    <Box paddingX={1} marginTop={1}>
      <Box flexGrow={1}>
        <Text color={daemonRunning ? 'green' : 'red'}>● </Text>
        <Text color="gray">daemon  </Text>
        <Text color={syncConfigured ? 'green' : 'gray'}>● </Text>
        <Text color="gray">sync  </Text>
        <Text color={dbHealthy ? 'green' : 'red'}>● </Text>
        <Text color="gray">db:WAL</Text>
        {savedFlash && <Text color="green">  ✓ saved</Text>}
      </Box>
      <Box>
        <Text color="gray">
          {pid ? `pid ${pid}  ` : ''}Tab/←→ navigate · j/k scroll · q quit
        </Text>
      </Box>
    </Box>
  );
}
