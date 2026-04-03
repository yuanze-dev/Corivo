import { changesets, devices } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, gt, ne, asc, max, count } from 'drizzle-orm';
import type * as schema from '../db/schema.js';
import type { ChangesetRow, PullPayload, SyncRepository } from '../application/sync/sync-ports.js';
import type { PushPayload } from '../application/sync/sync-ports.js';

interface CreateSyncRepositoryDeps {
  db: BetterSQLite3Database<typeof schema>;
  now?: () => number;
}

export function createSyncRepository(deps: CreateSyncRepositoryDeps): SyncRepository {
  const now = deps.now ?? Date.now;

  return {
    pushChangesets(identityId, payload) {
      const stored = deps.db.transaction((tx) => {
        let insertCount = 0;
        for (const cs of payload.changesets) {
          const result = tx
            .insert(changesets)
            .values({
              identityId,
              siteId: cs.site_id || payload.site_id,
              tableName: cs.table_name,
              pk: cs.pk,
              colName: cs.col_name ?? null,
              colVersion: cs.col_version,
              dbVersion: cs.db_version,
              value: cs.value ?? null,
              createdAt: now(),
            })
            .onConflictDoNothing()
            .run();
          insertCount += result.changes;
        }
        return insertCount;
      });

      return { stored };
    },
    pullChangesets(identityId, payload) {
      const rows = deps.db
        .select({
          cursor: changesets.id,
          tableName: changesets.tableName,
          pk: changesets.pk,
          colName: changesets.colName,
          colVersion: changesets.colVersion,
          dbVersion: changesets.dbVersion,
          value: changesets.value,
          siteId: changesets.siteId,
        })
        .from(changesets)
        .where(
          and(
            eq(changesets.identityId, identityId),
            gt(changesets.id, payload.since_version),
            ne(changesets.siteId, payload.site_id),
          ),
        )
        .orderBy(asc(changesets.id))
        .limit(1000)
        .all();

      const result: ChangesetRow[] = rows.map((row) => ({
        table_name: row.tableName,
        pk: row.pk,
        col_name: row.colName,
        col_version: row.colVersion,
        db_version: row.dbVersion,
        value: row.value,
        site_id: row.siteId,
      }));

      let currentVersion: number;
      if (result.length > 0) {
        currentVersion = rows[rows.length - 1].cursor;
      } else {
        const versionRow = deps.db
          .select({ maxVersion: max(changesets.id) })
          .from(changesets)
          .where(eq(changesets.identityId, identityId))
          .get();
        currentVersion = versionRow?.maxVersion ?? 0;
      }

      if (result.length > 0) {
        deps.db
          .update(devices)
          .set({ lastSyncVersion: currentVersion, lastSeenAt: now() })
          .where(and(eq(devices.identityId, identityId), eq(devices.siteId, payload.site_id)))
          .run();
      }

      return {
        changesets: result,
        current_version: currentVersion,
      };
    },
    getSyncStatus(identityId, deviceId) {
      const device = deps.db
        .select({ deviceId: devices.deviceId, lastSyncVersion: devices.lastSyncVersion })
        .from(devices)
        .where(and(eq(devices.identityId, identityId), eq(devices.deviceId, deviceId)))
        .get();

      const countResult = deps.db
        .select({ total: count() })
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
  };
}
