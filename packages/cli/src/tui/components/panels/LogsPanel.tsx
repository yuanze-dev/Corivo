import React from 'react';
import { Box, Text } from 'ink';
import type { LogLine } from '../../hooks/useLogs.js';

interface LogsPanelProps {
  lines: LogLine[];
  error: string | null;
  scrollOffset: number;  // 距底部行数（0 = 最新，正数 = 向上滚动）
  panelHeight: number;
}

// 根据日志内容返回对应颜色
function colorize(text: string): string {
  if (/\[ERR\]|\[错误\]|error:/i.test(text))            return 'red';
  if (/\[BEAT\]|\[心跳\]/.test(text))                   return 'green';
  if (/\[DECAY\]|\[衰减\]/.test(text))                  return 'yellow';
  if (/\[SYNC\]|\[同步\]|\[PUSH\]|\[PULL\]/.test(text)) return 'magenta';
  if (/\[ASSOC\]|\[关联\]/.test(text))                  return 'blue';
  if (/\[AUTH\]|\[INIT\]/.test(text))                   return 'cyan';
  return 'gray';
}

// 与 OverviewPanel 保持一致的 section 标题样式
function SectionTitle({ label }: { label: string }) {
  return (
    <Box marginBottom={0}>
      <Text color="gray" dimColor>{label}</Text>
    </Box>
  );
}

export const LogsPanel = React.memo(function LogsPanel({ lines, error, scrollOffset, panelHeight }: LogsPanelProps) {
  // 减去 bordered box 的开销（上下边框 + 标题行）
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

  // 计算可见区域：scrollOffset=0 时显示最新行
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
            // 使用稳定的 id（全局递增），避免 slice 后 index 变化导致节点重建
            <Text key={line.id} color={colorize(line.text)}>{line.text}</Text>
          ))
        }
      </Box>
    </Box>
  );
});
