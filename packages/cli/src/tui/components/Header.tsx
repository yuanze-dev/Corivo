import React from 'react';
import { Box, Text } from 'ink';

const VERSION = '0.12.0';

export function Header() {
  return (
    <Box paddingX={1}>
      <Text>
        <Text bold color="cyan">◆ CORIVO</Text>
        {'  '}
        <Text color="gray">v{VERSION}</Text>
        {'  '}
        <Text color="gray" dimColor>your silicon colleague — it only lives for you</Text>
      </Text>
    </Box>
  );
}
