import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const solverSrcDir = path.resolve(__dirname, '../src');

async function readRouteFile(name: string): Promise<string> {
  const filePath = path.join(solverSrcDir, 'routes', name);
  return fs.readFile(filePath, 'utf8');
}

test('auth routes only depend on HTTP adapter dependencies and application layer', async () => {
  const source = await readRouteFile('auth.routes.ts');

  assert.equal(source.includes('../db/server-db.js'), false, 'route should not import database module directly');
  assert.equal(source.includes('../db/schema.js'), false, 'route should not import schema directly');
  assert.equal(source.includes("from 'drizzle-orm'"), false, 'route should not use direct SQL helpers');
  assert.equal(source.includes('../auth/challenge.js'), false, 'route should not run auth business logic directly');
  assert.equal(source.includes('../auth/pairing.js'), false, 'route should not run pairing business logic directly');
  assert.equal(source.includes('../application/auth/'), true, 'route should delegate to auth application layer');
});

test('sync routes only depend on HTTP adapter dependencies and application layer', async () => {
  const source = await readRouteFile('sync.routes.ts');

  assert.equal(source.includes('../sync/sync-handler.js'), false, 'route should not import sync business logic from sync-handler directly');
  assert.equal(source.includes('../db/'), false, 'route should not import database modules');
  assert.equal(source.includes('../application/sync/'), true, 'route should delegate to sync application layer');
});
