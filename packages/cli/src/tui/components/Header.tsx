import React from 'react';
import { Box, Text } from 'ink';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// After tsup is packaged, __dirname points to dist/cli/, and ../../package.json is used to read the version number.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, '../../package.json');
let VERSION = '0.11.0';
try {
  VERSION = JSON.parse(readFileSync(packagePath, 'utf-8')).version;
} catch {
  // The default version number is used when the packaging environment path is different.
}

// Purely static components, use React.memo to avoid invalid re-rendering when rendering parent components
export const Header = React.memo(function Header() {
  return (
    <Box borderStyle="single" borderColor="gray" marginBottom={0}>
      <Text>
        <Text bold color="#f59e0b">◆ CORIVO</Text>
        <Text color="white">v{VERSION}</Text>
        <Text color="gray">your silicon colleague — it only lives for you</Text>
      </Text>
    </Box>
  );
});
