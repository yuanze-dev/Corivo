import { createRequire } from 'node:module';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { config } from '../config.js';

let db: SQLiteDatabase;
let exitHooksRegistered = false;

export function getServerDb(): SQLiteDatabase {
  if (!db) {
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
}
