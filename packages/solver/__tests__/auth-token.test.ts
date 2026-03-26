import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { buildServer } from '../src/server.js';
import { getTokenForIdentity } from '../src/auth/get-token.js';

const TMP_DIR = `/tmp/corivo-solver-auth-tests-${Date.now()}`;
const DB_PATH = path.join(TMP_DIR, 'solver.db');

process.env.SOLVER_DB_PATH = DB_PATH;

const [{ getDb, getServerDb }, { accounts, devices, changesets }] = await Promise.all([
  import('../src/db/server-db.js'),
  import('../src/db/schema.js'),
]);

describe('getTokenForIdentity', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
  });

  beforeEach(() => {
    const db = getDb();
    db.delete(changesets).where(eq(changesets.identityId, 'identity-under-test')).run();
    db.delete(devices).where(eq(devices.identityId, 'identity-under-test')).run();
    db.delete(accounts).where(eq(accounts.identityId, 'identity-under-test')).run();

    const now = Date.now();
    db.insert(accounts).values({
      identityId: 'identity-under-test',
      fingerprints: '[]',
      sharedSecret: 'shared-secret-for-test',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(devices).values({
      deviceId: 'device-under-test',
      identityId: 'identity-under-test',
      deviceName: 'Device Under Test',
      platform: 'darwin',
      arch: 'arm64',
      siteId: 'site-under-test',
      createdAt: now,
      lastSeenAt: now,
    }).run();
  });

  afterAll(async () => {
    await app.close();
    getServerDb().close();
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('returns a bearer token after completing challenge and verify for the identity', async () => {
    const token = await getTokenForIdentity(app, 'identity-under-test');

    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);
  });
});
