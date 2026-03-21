import React from 'react';
import { Box, Text } from 'ink';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, '../../../package.json');
const VERSION = JSON.parse(readFileSync(packagePath, 'utf-8')).version;

export function Header() {
  return (
    <Box borderStyle="single" borderColor="gray" marginBottom={0}>
      <Text>
        <Text bold color="#f59e0b">◆ CORIVO</Text>
        {'  '}
        <Text color="white">v{VERSION}</Text>
        {'  '}
        <Text color="gray">your silicon colleague — it only lives for you</Text>
      </Text>
    </Box>
  );
}
