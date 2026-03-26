import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { buildServer } from '../src/server.js';
import { fetchToken } from '../src/auth/remote-token.js';

const TMP_DIR = `/tmp/corivo-solver-remote-auth-tests-${Date.now()}`;
const DB_PATH = path.join(TMP_DIR, 'solver.db');

process.env.SOLVER_DB_PATH = DB_PATH;

const [{ getDb, getServerDb }, { accounts, devices, changesets }] = await Promise.all([
  import('../src/db/server-db.js'),
  import('../src/db/schema.js'),
]);

describe('fetchToken', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl = '';

  beforeAll(async () => {
    app = await buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    const db = getDb();
    db.delete(changesets).where(eq(changesets.identityId, 'remote-identity')).run();
    db.delete(devices).where(eq(devices.identityId, 'remote-identity')).run();
    db.delete(accounts).where(eq(accounts.identityId, 'remote-identity')).run();

    const now = Date.now();
    db.insert(accounts).values({
      identityId: 'remote-identity',
      fingerprints: '[]',
      sharedSecret: 'remote-shared-secret',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(devices).values({
      deviceId: 'remote-device',
      identityId: 'remote-identity',
      deviceName: 'Remote Device',
      platform: 'darwin',
      arch: 'arm64',
      siteId: 'remote-site',
      createdAt: now,
      lastSeenAt: now,
    }).run();
  });

  afterAll(async () => {
    await app.close();
    getServerDb().close();
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  });

  it('fetches a bearer token from challenge and verify endpoints', async () => {
    const token = await fetchToken({
      serverUrl: baseUrl,
      identityId: 'remote-identity',
      sharedSecret: 'remote-shared-secret',
    });

    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);
  });
});
