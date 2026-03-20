import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  identityId: text('identity_id').primaryKey(),
  fingerprints: text('fingerprints').notNull(),
  sharedSecret: text('shared_secret').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const devices = sqliteTable('devices', {
  deviceId: text('device_id').primaryKey(),
  identityId: text('identity_id').notNull().references(() => accounts.identityId),
  deviceName: text('device_name'),
  siteId: text('site_id').notNull(),
  lastSyncVersion: integer('last_sync_version').default(0),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

// pk and value are stored as base64-encoded strings in the BLOB columns
export const changesets = sqliteTable('changesets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identityId: text('identity_id').notNull().references(() => accounts.identityId),
  siteId: text('site_id').notNull(),
  tableName: text('table_name').notNull(),
  pk: text('pk').notNull(),
  colName: text('col_name'),
  colVersion: integer('col_version').notNull(),
  dbVersion: integer('db_version').notNull(),
  value: text('value'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_changesets_lookup').on(table.identityId, table.dbVersion),
  uniqueIndex('idx_changesets_unique').on(table.identityId, table.siteId, table.tableName, table.pk, table.colVersion),
]);
