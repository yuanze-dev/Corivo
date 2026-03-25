import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../../..');
const SOLVER_DIST = path.join(ROOT, 'packages/solver/dist/index.js');
const TEST_PORT = 13142;
const SOLVER_URL = `http://127.0.0.1:${TEST_PORT}`;

const TMP = `/tmp/corivo-solver-db-dir-${Date.now()}`;
const SOLVER_DB_PATH = path.join(TMP, 'nested', 'missing', 'solver.db');

let solverProcess: ReturnType<typeof spawn> | null = null;

async function waitForSolver(maxMs = 15_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SOLVER_URL}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Solver 未在 ${maxMs}ms 内就绪`);
}

describe('E2E: Solver 自动创建数据库目录', () => {
  beforeAll(async () => {
    await fs.mkdir(TMP, { recursive: true });

    execSync('npm run build', {
      cwd: path.join(ROOT, 'packages/solver'),
      stdio: 'pipe',
    });

    solverProcess = spawn('node', [SOLVER_DIST], {
      stdio: 'pipe',
      env: {
        ...process.env,
        SOLVER_PORT: String(TEST_PORT),
        SOLVER_HOST: '127.0.0.1',
        SOLVER_DB_PATH,
        NODE_ENV: 'test',
      },
    });
  }, 90_000);

  afterAll(async () => {
    solverProcess?.kill('SIGTERM');
    await fs.rm(TMP, { recursive: true, force: true }).catch(() => {});
  });

  it('当父目录不存在时仍能启动并创建数据库文件', async () => {
    await waitForSolver();

    const res = await fetch(`${SOLVER_URL}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_id: 'probe' }),
    });
    expect(res.status).toBe(404);

    const stat = await fs.stat(SOLVER_DB_PATH);
    expect(stat.isFile()).toBe(true);
  }, 20_000);
});
