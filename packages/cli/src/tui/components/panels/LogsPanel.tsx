import React from 'react';
import { Box, Text, useStdout } from 'ink';

interface LogsPanelProps {
  lines: string[];
  error: string | null;
  scrollOffset: number;  // lines from bottom (0 = latest, positive = scroll up)
}

function colorize(line: string): string {
  if (/\[ERR\]|\[错误\]|error:/i.test(line))            return 'red';
  if (/\[BEAT\]|\[心跳\]/.test(line))                   return 'green';
  if (/\[DECAY\]|\[衰减\]/.test(line))                  return 'yellow';
  if (/\[SYNC\]|\[同步\]|\[PUSH\]|\[PULL\]/.test(line)) return 'magenta';
  if (/\[ASSOC\]|\[关联\]/.test(line))                  return 'blue';
  if (/\[AUTH\]|\[INIT\]/.test(line))                   return 'cyan';
  return 'gray';
}

export function LogsPanel({ lines, error, scrollOffset }: LogsPanelProps) {
  const { stdout } = useStdout();
  const maxVisible = Math.max(5, (stdout?.rows ?? 24) - 8);

  if (error) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Text color="gray">{error}</Text>
        <Text color="gray" dimColor>Start daemon first: corivo start</Text>
      </Box>
    );
  }

  // Calculate visible slice: scrollOffset=0 means latest lines at bottom
  const start = Math.max(0, lines.length - maxVisible - scrollOffset);
  const end = Math.max(0, lines.length - scrollOffset);
  const visible = lines.slice(start, end);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>j/k to scroll · auto-follows latest</Text>
        {scrollOffset > 0 && <Text color="yellow">  (paused -{scrollOffset})</Text>}
      </Box>
      {visible.length === 0
        ? <Text color="gray">  No logs yet</Text>
        : visible.map((line, i) => (
          <Text key={`${i}-${line.substring(0, 20)}`} color={colorize(line)}>{line}</Text>
        ))
      }
    </Box>
  );
}
