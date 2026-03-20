import { getServerDb } from '../db/server-db.js';

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
  const db = getServerDb();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO changesets (identity_id, site_id, table_name, pk, col_name, col_version, db_version, value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction((changesets: ChangesetRow[]) => {
    let count = 0;
    for (const cs of changesets) {
      stmt.run(
        identityId,
        cs.site_id || payload.site_id,
        cs.table_name,
        cs.pk,
        cs.col_name ?? null,
        cs.col_version,
        cs.db_version,
        cs.value ?? null,
        now
      );
      count++;
    }
    return count;
  });

  const stored = insert(payload.changesets);
  return { stored };
}

export function pullChangesets(
  identityId: string,
  payload: PullPayload
): { changesets: ChangesetRow[]; current_version: number } {
  const db = getServerDb();

  const rows = db.prepare(`
    SELECT table_name, pk, col_name, col_version, db_version, value, site_id
    FROM changesets
    WHERE identity_id = ? AND db_version > ? AND site_id != ?
    ORDER BY db_version ASC
    LIMIT 1000
  `).all(identityId, payload.since_version, payload.site_id) as any[];

  const changesets: ChangesetRow[] = rows.map(row => ({
    table_name: row.table_name,
    pk: row.pk,
    col_name: row.col_name,
    col_version: row.col_version,
    db_version: row.db_version,
    value: row.value,
    site_id: row.site_id,
  }));

  // Fix 1: current_version = last row's db_version (not global max),
  // so clients paginate correctly when LIMIT truncates the result.
  // Only fall back to global max when there are no rows (i.e. fully caught up).
  let currentVersion: number;
  if (changesets.length > 0) {
    currentVersion = changesets[changesets.length - 1].db_version;
  } else {
    const versionRow = db.prepare(`
      SELECT MAX(db_version) as max_version FROM changesets WHERE identity_id = ?
    `).get(identityId) as { max_version: number | null };
    currentVersion = versionRow.max_version ?? 0;
  }

  // Fix 2: update devices.last_sync_version so the server tracks progress.
  if (changesets.length > 0) {
    db.prepare(`
      UPDATE devices SET last_sync_version = ?, last_seen_at = ?
      WHERE identity_id = ? AND site_id = ?
    `).run(currentVersion, Date.now(), identityId, payload.site_id);
  }

  return {
    changesets,
    current_version: currentVersion,
  };
}

export function getSyncStatus(identityId: string, deviceId: string): {
  identity_id: string;
  device_id: string;
  last_sync_version: number;
  total_changesets: number;
} {
  const db = getServerDb();

  const device = db.prepare(`
    SELECT device_id, last_sync_version FROM devices
    WHERE identity_id = ? AND device_id = ?
  `).get(identityId, deviceId) as { device_id: string; last_sync_version: number } | undefined;

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM changesets WHERE identity_id = ?
  `).get(identityId) as { count: number };

  return {
    identity_id: identityId,
    device_id: deviceId,
    last_sync_version: device?.last_sync_version ?? 0,
    total_changesets: countRow.count,
  };
}
