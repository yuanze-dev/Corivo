import React from 'react';
import { Text } from 'ink';

interface BadgeProps {
  label: string;
  color?: string;
}

export function Badge({ label, color = 'white' }: BadgeProps) {
  return <Text color={color}>[{label}]</Text>;
}
