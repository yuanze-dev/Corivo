import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const TMP_DIR = `/tmp/corivo-solver-tests-${Date.now()}`;
const DB_PATH = path.join(TMP_DIR, 'solver.db');

process.env.SOLVER_DB_PATH = DB_PATH;

const [{ getDb, getServerDb }, { accounts, devices, changesets }, { createSyncRepository }] = await Promise.all([
  import('../src/db/server-db.js'),
  import('../src/db/schema.js'),
  import('../src/sync/sync-handler.js'),
]);

const syncRepository = createSyncRepository({ db: getDb() });

describe('sync-handler', () => {
  beforeEach(() => {
    const db = getDb();
    db.delete(changesets).run();
    db.delete(devices).run();
    db.delete(accounts).run();

    const now = Date.now();
    db.insert(accounts).values({
      identityId: 'identity-1',
      fingerprints: '[]',
      sharedSecret: 'secret',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(devices).values([
      {
        deviceId: 'device-a',
        identityId: 'identity-1',
        deviceName: 'Device A',
        platform: 'darwin',
        arch: 'arm64',
        siteId: 'site-a',
        createdAt: now,
        lastSeenAt: now,
      },
      {
        deviceId: 'device-b',
        identityId: 'identity-1',
        deviceName: 'Device B',
        platform: 'linux',
        arch: 'x64',
        siteId: 'site-b',
        createdAt: now,
        lastSeenAt: now,
      },
    ]).run();
  });

  afterAll(async () => {
    getServerDb().close();
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('does not lose later changes from another site when their local db_version restarts at 1', () => {
    syncRepository.pushChangesets('identity-1', {
      site_id: 'site-a',
      db_version: 3,
      changesets: [
        {
          table_name: 'blocks',
          pk: 'blk-a-1',
          col_name: 'content',
          col_version: 1,
          db_version: 1,
          value: 'from site a 1',
          site_id: 'site-a',
        },
        {
          table_name: 'blocks',
          pk: 'blk-a-2',
          col_name: 'content',
          col_version: 1,
          db_version: 2,
          value: 'from site a 2',
          site_id: 'site-a',
        },
        {
          table_name: 'blocks',
          pk: 'blk-a-3',
          col_name: 'content',
          col_version: 1,
          db_version: 3,
          value: 'from site a 3',
          site_id: 'site-a',
        },
      ],
    });

    const initialPullForB = syncRepository.pullChangesets('identity-1', {
      site_id: 'site-b',
      since_version: 0,
    });

    expect(initialPullForB.changesets).toHaveLength(3);
    expect(initialPullForB.current_version).toBe(3);

    syncRepository.pushChangesets('identity-1', {
      site_id: 'site-b',
      db_version: 1,
      changesets: [
        {
          table_name: 'blocks',
          pk: 'blk-b-1',
          col_name: 'content',
          col_version: 1,
          db_version: 1,
          value: 'from site b 1',
          site_id: 'site-b',
        },
      ],
    });

    const followupPullForA = syncRepository.pullChangesets('identity-1', {
      site_id: 'site-a',
      since_version: initialPullForB.current_version,
    });

    expect(followupPullForA.changesets).toHaveLength(1);
    expect(followupPullForA.changesets[0]).toMatchObject({
      pk: 'blk-b-1',
      value: 'from site b 1',
      site_id: 'site-b',
    });
    expect(followupPullForA.current_version).toBeGreaterThan(initialPullForB.current_version);
  });
});
