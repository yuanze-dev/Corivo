import React from 'react';
import { Box, Text } from 'ink';
import type { LogLine } from '../../hooks/useLogs.js';

interface LogsPanelProps {
  lines: LogLine[];
  error: string | null;
  scrollOffset: number;  // Number of lines from bottom (0 = latest, positive = scroll up)
  panelHeight: number;
}

// Return the corresponding color based on the log content
function colorize(text: string): string {
  if (/\[ERR\]|\[错误\]|error:/i.test(text))            return 'red';
  if (/\[BEAT\]|\[心跳\]/.test(text))                   return 'green';
  if (/\[DECAY\]|\[衰减\]/.test(text))                  return 'yellow';
  if (/\[SYNC\]|\[同步\]|\[PUSH\]|\[PULL\]/.test(text)) return 'magenta';
  if (/\[ASSOC\]|\[关联\]/.test(text))                  return 'blue';
  if (/\[AUTH\]|\[INIT\]/.test(text))                   return 'cyan';
  return 'gray';
}

// Section title style consistent with OverviewPanel
function SectionTitle({ label }: { label: string }) {
  return (
    <Box marginBottom={0}>
      <Text color="gray" dimColor>{label}</Text>
    </Box>
  );
}

export const LogsPanel = React.memo(function LogsPanel({ lines, error, scrollOffset, panelHeight }: LogsPanelProps) {
  // Subtract the overhead of bordered box (top and bottom borders + title row)
  const maxVisible = Math.max(5, panelHeight - 4);

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <SectionTitle label="Daemon logs" />
          <Box>
            <Text color="gray">{error}</Text>
          </Box>
          <Box>
            <Text color="gray" dimColor>Start daemon first: </Text>
            <Text color="white">corivo start</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Calculate the visible area: display the latest row when scrollOffset=0
  const start = Math.max(0, lines.length - maxVisible - scrollOffset);
  const end = Math.max(0, lines.length - scrollOffset);
  const visible = lines.slice(start, end);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Box>
          <Text color="gray" dimColor>Daemon logs</Text>
          {scrollOffset > 0 && (
            <>
              <Text color="gray" dimColor>{'  '}</Text>
              <Text color="yellow">(paused -{scrollOffset})</Text>
            </>
          )}
          <Text color="gray" dimColor>{'  j/k scroll'}</Text>
        </Box>

        {visible.length === 0
          ? <Text color="gray" dimColor>  No logs yet</Text>
          : visible.map(line => (
            // Use stable id (global increment) to avoid node reconstruction caused by index changes after slice
            <Text key={line.id} color={colorize(line.text)}>{line.text}</Text>
          ))
        }
      </Box>
    </Box>
  );
});
