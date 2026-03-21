import React, { useState, useCallback } from 'react';
import { Box, useInput, useApp, useStdout } from 'ink';
import type { CorivoDatabase } from '../storage/database.js';

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

// 固定开销行数：header(3) + tabbar(4) + statusbar(2)
const PANEL_OVERHEAD = 9;

export function App({ db, configDir, dbPath }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // panel 区域固定高度 = 终端总行数 - 固定开销，确保切换时旧内容被清除
  const panelHeight = Math.max(3, (stdout?.rows ?? 24) - PANEL_OVERHEAD);

  // 各 panel 的滚动偏移，切换 tab 时重置
  const [panelScroll, setPanelScroll] = useState(0);
  const [configFocus, setConfigFocus] = useState(0);
  const [logScroll, setLogScroll] = useState(0);

  // 数据 hooks
  const { stats, loading: dbLoading } = useDatabase(db);
  const daemon = useDaemon(configDir);
  const { solver } = useSync(configDir);
  const device = useDevice(configDir, dbPath);
  const configState = useConfig(configDir);
  // logs 只在 logs tab 时启用文件监听，非活跃时不触发渲染
  const { lines: logLines, error: logError } = useLogs(configDir, activeTab === 'logs');

  const tabIds = TABS.map(t => t.id);

  const navigate = useCallback((dir: 1 | -1) => {
    setPanelScroll(0); // 切 tab 时重置面板滚动
    setActiveTab(prev => {
      const i = tabIds.indexOf(prev);
      return tabIds[(i + dir + tabIds.length) % tabIds.length] as TabId;
    });
  }, [tabIds]);

  useInput((input, key) => {
    // 退出
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // Tab 导航
    if (key.tab && !key.shift) { navigate(1); return; }
    if (key.tab && key.shift)  { navigate(-1); return; }
    if (key.rightArrow)        { navigate(1); return; }
    if (key.leftArrow)         { navigate(-1); return; }

    // 数字键跳转（1-6）
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= 6) {
      setPanelScroll(0);
      setActiveTab(tabIds[n - 1] as TabId);
      return;
    }

    // Config panel 导航（j/k 移动焦点）
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

    // Logs panel 滚动
    if (activeTab === 'logs') {
      if (input === 'j' || key.downArrow)  { setLogScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'k' || key.upArrow)    { setLogScroll(s => s + 1); return; }
    }

    // 其他 panel 滚动（overview / sync / daemon / device）
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
