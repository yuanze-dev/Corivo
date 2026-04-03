import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const tmpDir = path.join('/tmp', `corivo-solver-sync-regression-${Date.now()}`);
const dbPath = path.join(tmpDir, 'solver.db');
process.env.SOLVER_DB_PATH = dbPath;

const [{ getDb, getServerDb }, { accounts, changesets, devices }, { createSyncRepository }] = await Promise.all([
  import('../src/db/server-db.js'),
  import('../src/db/schema.js'),
  import('../src/sync/sync-handler.js'),
]);

const syncRepository = createSyncRepository({ db: getDb() });

function resetFixtureData() {
  const db = getDb();
  db.delete(changesets).run();
  db.delete(devices).run();
  db.delete(accounts).run();

  const now = Date.now();
  db
    .insert(accounts)
    .values({
      identityId: 'identity-1',
      fingerprints: '[]',
      sharedSecret: 'secret',
      createdAt: now,
      lastSeenAt: now,
    })
    .run();

  db
    .insert(devices)
    .values([
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
    ])
    .run();
}

test('sync pull cursor uses server-global sequence so cross-site updates are not skipped', () => {
  resetFixtureData();

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

  assert.equal(initialPullForB.changesets.length, 3);
  assert.equal(initialPullForB.current_version, 3);

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

  assert.equal(followupPullForA.changesets.length, 1);
  assert.equal(followupPullForA.changesets[0]?.pk, 'blk-b-1');
  assert.equal(followupPullForA.changesets[0]?.value, 'from site b 1');
  assert.equal(followupPullForA.changesets[0]?.site_id, 'site-b');
  assert.ok(followupPullForA.current_version > initialPullForB.current_version);
});

after(async () => {
  getServerDb().close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
