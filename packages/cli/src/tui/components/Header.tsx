import React from 'react';
import { Box, Text } from 'ink';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// tsup 打包后 __dirname 指向 dist/cli/，用 ../../package.json 读取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, '../../package.json');
let VERSION = '0.11.0';
try {
  VERSION = JSON.parse(readFileSync(packagePath, 'utf-8')).version;
} catch {
  // 打包环境路径不同时使用默认版本号
}

// 纯静态组件，用 React.memo 避免父组件渲染时的无效重渲染
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
