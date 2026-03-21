import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../storage/database.js';
import { getDatabaseKey, loadConfig } from '../config.js';
import { App } from './App.js';

export async function renderTui(): Promise<void> {
  const configDir = getConfigDir();
  const dbPath = getDefaultDatabasePath();
  const configPath = path.join(configDir, 'config.json');

  // Read raw config JSON to access all fields (including optional encrypted_db_key)
  let rawConfig: Record<string, unknown>;
  try {
    const content = await import('node:fs/promises').then(fs => fs.readFile(configPath, 'utf-8'));
    rawConfig = JSON.parse(content);
  } catch {
    console.error('Corivo not initialized. Run: corivo init');
    process.exit(1);
  }

  // Load typed config for validation
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

  const enableEncryption = rawConfig!['encrypted_db_key'] !== undefined;

  const db = CorivoDatabase.getInstance({
    path: dbPath,
    key: dbKey,
    enableEncryption,
  });

  const { waitUntilExit } = render(
    <App db={db} configDir={configDir} dbPath={dbPath} />
  );

  await waitUntilExit();
}
