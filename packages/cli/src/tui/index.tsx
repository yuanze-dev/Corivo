import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../storage/database.js';
import { getDatabaseKey, loadConfig } from '../config.js';
import { App } from './App.js';

export async function renderTui(): Promise<void> {
  const configDir = getConfigDir();
  const dbPath = getDefaultDatabasePath();

  // Initialize DB (same sequence as status command)
  const config = await loadConfig(configDir);
  if (!config) {
    console.error('Corivo not initialized. Run: corivo init');
    process.exit(1);
  }

  const dbKey = await getDatabaseKey(configDir);
  if (!dbKey) {
    console.error('Cannot read database key. Run: corivo init');
    process.exit(1);
  }

  const db = CorivoDatabase.getInstance({
    path: dbPath,
    key: dbKey,
    enableEncryption: false,
  });

  const { waitUntilExit } = render(
    <App db={db} configDir={configDir} dbPath={dbPath} />
  );

  await waitUntilExit();
}
