import React from 'react';
import { Box, Text } from 'ink';

interface TableProps {
  data: Record<string, unknown>[];
}

export default function Table({ data }: TableProps) {
  if (data.length === 0) return null;

  const headers = Object.keys(data[0]);
  const widths = headers.map(h =>
    Math.max(h.length, ...data.map(row => String(row[h] ?? '').length))
  );

  const topBorder    = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const midBorder    = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const bottomBorder = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  const renderRow = (row: Record<string, unknown>, key: string | number) => (
    <Box key={key}>
      <Text>{'│'}</Text>
      {headers.map((h, i) => (
        <Text key={h}>{' ' + String(row[h] ?? '').padEnd(widths[i]) + ' │'}</Text>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column">
      <Text>{topBorder}</Text>
      <Box>
        <Text>{'│'}</Text>
        {headers.map((h, i) => (
          <Text key={h} bold>{' ' + h.padEnd(widths[i]) + ' │'}</Text>
        ))}
      </Box>
      <Text>{midBorder}</Text>
      {data.map((row, i) => renderRow(row, i))}
      <Text>{bottomBorder}</Text>
    </Box>
  );
}
