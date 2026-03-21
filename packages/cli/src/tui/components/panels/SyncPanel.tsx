import React from 'react';
import { Box, Text } from 'ink';
import type { SolverConfig } from '../../../config.js';
import { KeyValue } from '../KeyValue.js';

interface SyncPanelProps {
  solver: SolverConfig | null;
}

export function SyncPanel({ solver }: SyncPanelProps) {
  if (!solver) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Text color="gray">● Sync not configured</Text>
        <Text color="gray">  Run: corivo sync register</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Connection</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Server" value={solver.server_url} valueColor="green" />
        <KeyValue label="Status" value="● configured" valueColor="green" />
        <KeyValue label="Site ID" value={solver.site_id} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Sync Progress</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="Pushed" value={`${solver.last_push_version} changesets`} />
        <KeyValue label="Pulled" value={`${solver.last_pull_version} changesets`} />
      </Box>
    </Box>
  );
}
