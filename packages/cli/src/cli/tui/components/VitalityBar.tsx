import React from 'react';
import { Box, Text } from 'ink';

interface VitalityBarProps {
  value: number;   // 0–100
  width?: number;  // default 20
  showValue?: boolean;
}

export function VitalityBar({ value, width = 20, showValue = true }: VitalityBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  const color = clamped >= 70 ? 'green' : clamped >= 40 ? 'yellow' : clamped >= 10 ? 'blue' : 'gray';

  return (
    <Box>
      <Text color={color}>{bar}</Text>
      {showValue && <Text color="gray"> {clamped}</Text>}
    </Box>
  );
}
