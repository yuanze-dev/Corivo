import React, { useState, useCallback } from 'react';
import { Box, useInput, useApp, useStdout } from 'ink';
import type { CorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';

import { Header } from './components/Header.js';
import { TabBar, TABS, type TabId } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { OverviewPanel } from './components/panels/OverviewPanel.js';
import { SyncPanel } from './components/panels/SyncPanel.js';
import { DaemonPanel } from './components/panels/DaemonPanel.js';
import { DevicePanel } from './components/panels/DevicePanel.js';
import {
  ConfigPanel,
  CONFIG_ITEM_COUNT,
  FEATURE_ITEMS,
  SYNC_INTERVAL_INDEX,
  nextSyncPreset,
  prevSyncPreset,
} from './components/panels/ConfigPanel.js';
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

// Fixed number of overhead lines: header(3) + tabbar(4) + statusbar(2)
const PANEL_OVERHEAD = 9;

export function App({ db, configDir, dbPath }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Fixed height of panel area = total number of rows in the terminal - fixed overhead to ensure that old content is cleared when switching
  const panelHeight = Math.max(3, (stdout?.rows ?? 24) - PANEL_OVERHEAD);

  // The scroll offset of each panel is reset when switching tabs.
  const [panelScroll, setPanelScroll] = useState(0);
  const [configFocus, setConfigFocus] = useState(0);
  const [logScroll, setLogScroll] = useState(0);

  // Data hooks
  const { stats, loading: dbLoading } = useDatabase(db);
  const daemon = useDaemon(configDir);
  const { solver } = useSync(configDir);
  const device = useDevice(configDir, dbPath);
  const configState = useConfig(configDir);
  // logs only enables file monitoring when the logs tab is active, and does not trigger rendering when it is inactive.
  const { lines: logLines, error: logError } = useLogs(configDir, activeTab === 'logs');

  const tabIds = TABS.map(t => t.id);

  const navigate = useCallback((dir: 1 | -1) => {
    setPanelScroll(0); // Reset panel scrolling when switching tabs
    setActiveTab(prev => {
      const i = tabIds.indexOf(prev);
      return tabIds[(i + dir + tabIds.length) % tabIds.length] as TabId;
    });
  }, [tabIds]);

  useInput((input, key) => {
    // Exit
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // Tab navigation
    if (key.tab && !key.shift) { navigate(1); return; }
    if (key.tab && key.shift)  { navigate(-1); return; }
    if (key.rightArrow)        { navigate(1); return; }
    if (key.leftArrow)         { navigate(-1); return; }

    // Number key jump (1-6)
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= 6) {
      setPanelScroll(0);
      setActiveTab(tabIds[n - 1] as TabId);
      return;
    }

    // Config panel navigation (j/k moving focus)
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
        if (configFocus < FEATURE_ITEMS.length) {
          const item = FEATURE_ITEMS[configFocus];
          if (item) configState.toggleFeature(item.key);
        }
        return;
      }
      if (input === '+' || input === '=') {
        if (configFocus === SYNC_INTERVAL_INDEX) {
          const current = configState.config?.settings?.syncIntervalSeconds ?? 300;
          configState.updateSetting('syncIntervalSeconds', nextSyncPreset(current));
        }
        return;
      }
      if (input === '-') {
        if (configFocus === SYNC_INTERVAL_INDEX) {
          const current = configState.config?.settings?.syncIntervalSeconds ?? 300;
          configState.updateSetting('syncIntervalSeconds', prevSyncPreset(current));
        }
        return;
      }
    }

    // Logs panel scroll
    if (activeTab === 'logs') {
      if (input === 'j' || key.downArrow)  { setLogScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'k' || key.upArrow)    { setLogScroll(s => s + 1); return; }
    }

    // Other panel scrolling (overview/sync/daemon/device)
    if (activeTab !== 'config' && activeTab !== 'logs') {
      if (input === 'j' || key.downArrow)  { setPanelScroll(s => s + 1); return; }
      if (input === 'k' || key.upArrow)    { setPanelScroll(s => Math.max(0, s - 1)); return; }
    }
  });

  const renderPanel = () => {
    switch (activeTab) {
      case 'overview': return <OverviewPanel stats={stats} loading={dbLoading} scrollOffset={panelScroll} panelHeight={panelHeight} />;
      case 'sync':     return <SyncPanel solver={solver} scrollOffset={panelScroll} panelHeight={panelHeight} />;
      case 'daemon':   return <DaemonPanel daemon={daemon} scrollOffset={panelScroll} panelHeight={panelHeight} />;
      case 'device':   return <DevicePanel device={device} scrollOffset={panelScroll} panelHeight={panelHeight} />;
      case 'config':   return <ConfigPanel configState={configState} focusIndex={configFocus} panelHeight={panelHeight} />;
      case 'logs':     return <LogsPanel lines={logLines} error={logError} scrollOffset={logScroll} panelHeight={panelHeight} />;
    }
  };

  return (
    <Box flexDirection="column">
      <Header />
      <TabBar active={activeTab} />
      {/* 固定高度确保切 tab 时 Ink 始终清除整个 panel 区域 */}
      <Box height={panelHeight} flexDirection="column" overflow="hidden">
        {renderPanel()}
      </Box>
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
