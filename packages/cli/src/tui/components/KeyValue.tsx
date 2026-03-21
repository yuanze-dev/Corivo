import React from 'react';
import { Box, Text } from 'ink';

interface KeyValueProps {
  label: string;
  value: string;
  labelWidth?: number;
  valueColor?: string;
}

export function KeyValue({ label, value, labelWidth = 14, valueColor = 'white' }: KeyValueProps) {
  const paddedLabel = label.padEnd(labelWidth);
  return (
    <Box>
      <Text color="gray">{paddedLabel}</Text>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}
