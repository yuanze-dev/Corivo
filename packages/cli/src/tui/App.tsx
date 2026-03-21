import React, { useState, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { CorivoDatabase } from '../storage/database.js';

import { Header } from './components/Header.js';
import { TabBar, TABS, type TabId } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { OverviewPanel } from './components/panels/OverviewPanel.js';
import { SyncPanel } from './components/panels/SyncPanel.js';
import { DaemonPanel } from './components/panels/DaemonPanel.js';
import { DevicePanel } from './components/panels/DevicePanel.js';
import { ConfigPanel, CONFIG_ITEM_COUNT, FEATURE_ITEMS } from './components/panels/ConfigPanel.js';
import { LogsPanel } from './components/panels/LogsPanel.js';

import { useDatabase } from './hooks/useDatabase.js';
import { useDaemon } from './hooks/useDaemon.js';
import { useSync } from './hooks/useSync.js';
import { useDevice } from './hooks/useDevice.js';
import { useConfig } from './hooks/useConfig.js';
import { useLogs } from './hooks/useLogs.js';

interface AppProps {
  db: CorivoDatabase | null;
  configDir: string;
  dbPath: string;
}

export function App({ db, configDir, dbPath }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [configFocus, setConfigFocus] = useState(0);
  const [logScroll, setLogScroll] = useState(0);

  // Data hooks
  const { stats, loading: dbLoading } = useDatabase(db);
  const daemon = useDaemon(configDir);
  const { solver } = useSync(configDir);
  const device = useDevice(configDir, dbPath);
  const configState = useConfig(configDir);
  const { lines: logLines, error: logError } = useLogs(configDir);

  const tabIds = TABS.map(t => t.id);

  const navigate = useCallback((dir: 1 | -1) => {
    setActiveTab(prev => {
      const i = tabIds.indexOf(prev);
      return tabIds[(i + dir + tabIds.length) % tabIds.length] as TabId;
    });
  }, [tabIds]);

  useInput((input, key) => {
    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // Tab navigation
    if (key.tab && !key.shift) { navigate(1); return; }
    if (key.tab && key.shift)  { navigate(-1); return; }
    if (key.rightArrow)        { navigate(1); return; }
    if (key.leftArrow)         { navigate(-1); return; }

    // Number jump (1-6)
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= 6) {
      setActiveTab(tabIds[n - 1] as TabId);
      return;
    }

    // Config panel navigation
    if (activeTab === 'config') {
      if (input === 'j' || key.downArrow)  {
        setConfigFocus(f => Math.min(f + 1, CONFIG_ITEM_COUNT - 1));
        return;
      }
      if (input === 'k' || key.upArrow)    {
        setConfigFocus(f => Math.max(f - 1, 0));
        return;
      }
      if (input === ' ' || key.return) {
        const item = FEATURE_ITEMS[configFocus];
        if (item) configState.toggleFeature(item.key);
        return;
      }
    }

    // Logs panel scrolling
    if (activeTab === 'logs') {
      if (input === 'j' || key.downArrow)  { setLogScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'k' || key.upArrow)    { setLogScroll(s => s + 1); return; }
    }
  });

  const renderPanel = () => {
    switch (activeTab) {
      case 'overview': return <OverviewPanel stats={stats} loading={dbLoading} />;
      case 'sync':     return <SyncPanel solver={solver} />;
      case 'daemon':   return <DaemonPanel daemon={daemon} />;
      case 'device':   return <DevicePanel device={device} />;
      case 'config':   return <ConfigPanel configState={configState} focusIndex={configFocus} />;
      case 'logs':     return <LogsPanel lines={logLines} error={logError} scrollOffset={logScroll} />;
    }
  };

  return (
    <Box flexDirection="column">
      <Header />
      <TabBar active={activeTab} />
      <Box flexGrow={1}>{renderPanel()}</Box>
      <StatusBar
        daemonRunning={daemon.running}
        syncConfigured={solver !== null}
        dbHealthy={stats?.healthy ?? false}
        pid={daemon.pid}
        savedFlash={configState.savedFlash}
      />
    </Box>
  );
}
