import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

import { config } from '../config.js';

let db: SQLiteDatabase;
let drizzleDb: BetterSQLite3Database<typeof schema>;
let exitHooksRegistered = false;

export function getServerDb(): SQLiteDatabase {
  if (!db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createSchema(db);

    if (!exitHooksRegistered) {
      exitHooksRegistered = true;
      process.on('exit', () => { try { db.close(); } catch {} });
      process.on('SIGTERM', () => { try { db.close(); } catch {} process.exit(0); });
      process.on('SIGINT', () => { try { db.close(); } catch {} process.exit(0); });
    }
  }
  return db;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!drizzleDb) {
    drizzleDb = drizzle(getServerDb(), { schema });
  }
  return drizzleDb;
}

function createSchema(db: SQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      identity_id TEXT PRIMARY KEY,
      fingerprints TEXT NOT NULL,
      shared_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL REFERENCES accounts(identity_id),
      device_name TEXT,
      platform TEXT,
      arch TEXT,
      site_id TEXT NOT NULL,
      last_sync_version INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS changesets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL REFERENCES accounts(identity_id),
      site_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      pk BLOB NOT NULL,
      col_name TEXT,
      col_version INTEGER NOT NULL,
      db_version INTEGER NOT NULL,
      value BLOB,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_changesets_lookup
      ON changesets(identity_id, db_version);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_changesets_unique
      ON changesets(identity_id, site_id, table_name, pk, col_version);
  `);

  // 迁移：为已有 devices 表添加 platform 和 arch 列
  const cols = db.pragma('table_info(devices)') as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('platform')) {
    db.exec('ALTER TABLE devices ADD COLUMN platform TEXT');
  }
  if (!colNames.includes('arch')) {
    db.exec('ALTER TABLE devices ADD COLUMN arch TEXT');
  }
}
