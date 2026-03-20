import { getDb } from '../db/server-db.js';
import { changesets, devices } from '../db/schema.js';
import { and, eq, gt, ne, asc, max, count } from 'drizzle-orm';

export interface ChangesetRow {
  table_name: string;
  pk: string;           // base64 encoded blob
  col_name: string | null;
  col_version: number;
  db_version: number;
  value: string | null; // base64 encoded blob or null
  site_id: string;
}

export interface PushPayload {
  site_id: string;
  db_version: number;
  changesets: ChangesetRow[];
}

export interface PullPayload {
  site_id: string;
  since_version: number;
}

export function pushChangesets(identityId: string, payload: PushPayload): { stored: number } {
  const db = getDb();
  const now = Date.now();

  const stored = db.transaction((tx) => {
    let insertCount = 0;
    for (const cs of payload.changesets) {
      tx.insert(changesets).values({
        identityId,
        siteId: cs.site_id || payload.site_id,
        tableName: cs.table_name,
        pk: cs.pk,
        colName: cs.col_name ?? null,
        colVersion: cs.col_version,
        dbVersion: cs.db_version,
        value: cs.value ?? null,
        createdAt: now,
      }).onConflictDoNothing().run();
      insertCount++;
    }
    return insertCount;
  });

  return { stored };
}

export function pullChangesets(
  identityId: string,
  payload: PullPayload
): { changesets: ChangesetRow[]; current_version: number } {
  const db = getDb();

  const rows = db.select({
    tableName: changesets.tableName,
    pk: changesets.pk,
    colName: changesets.colName,
    colVersion: changesets.colVersion,
    dbVersion: changesets.dbVersion,
    value: changesets.value,
    siteId: changesets.siteId,
  })
    .from(changesets)
    .where(and(
      eq(changesets.identityId, identityId),
      gt(changesets.dbVersion, payload.since_version),
      ne(changesets.siteId, payload.site_id),
    ))
    .orderBy(asc(changesets.dbVersion))
    .limit(1000)
    .all();

  const result: ChangesetRow[] = rows.map(row => ({
    table_name: row.tableName,
    pk: row.pk,
    col_name: row.colName,
    col_version: row.colVersion,
    db_version: row.dbVersion,
    value: row.value,
    site_id: row.siteId,
  }));

  // Fix 1: current_version = last row's db_version (not global max),
  // so clients paginate correctly when LIMIT truncates the result.
  // Only fall back to global max when there are no rows (i.e. fully caught up).
  let currentVersion: number;
  if (result.length > 0) {
    currentVersion = result[result.length - 1].db_version;
  } else {
    const versionRow = db.select({ maxVersion: max(changesets.dbVersion) })
      .from(changesets)
      .where(eq(changesets.identityId, identityId))
      .get();
    currentVersion = versionRow?.maxVersion ?? 0;
  }

  // Fix 2: update devices.last_sync_version so the server tracks progress.
  if (result.length > 0) {
    db.update(devices)
      .set({ lastSyncVersion: currentVersion, lastSeenAt: Date.now() })
      .where(and(
        eq(devices.identityId, identityId),
        eq(devices.siteId, payload.site_id),
      ))
      .run();
  }

  return {
    changesets: result,
    current_version: currentVersion,
  };
}

export function getSyncStatus(identityId: string, deviceId: string): {
  identity_id: string;
  device_id: string;
  last_sync_version: number;
  total_changesets: number;
} {
  const db = getDb();

  const device = db.select({ deviceId: devices.deviceId, lastSyncVersion: devices.lastSyncVersion })
    .from(devices)
    .where(and(
      eq(devices.identityId, identityId),
      eq(devices.deviceId, deviceId),
    ))
    .get();

  const countResult = db.select({ total: count() })
    .from(changesets)
    .where(eq(changesets.identityId, identityId))
    .get();

  return {
    identity_id: identityId,
    device_id: deviceId,
    last_sync_version: device?.lastSyncVersion ?? 0,
    total_changesets: countResult?.total ?? 0,
  };
}
