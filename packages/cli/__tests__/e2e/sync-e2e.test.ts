/**
 * E2E 测试 — Corivo 同步链路
 *
 * 完整验证：solver 启动 → 注册 → save → push → 配对 → join → pull
 *
 * 注意：
 * - Pull 当前不写入本地 DB（只记录条数），测试只验证 pull count > 0
 * - init 会尝试启动 launchd 心跳，测试环境会失败，但 init 会优雅跳过
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../../..'); // monorepo root
const CLI = path.join(ROOT, 'packages/cli/dist/cli/index.js');
const SOLVER_DIST = path.join(ROOT, 'packages/solver/dist/index.js');
const TEST_PORT = 13141;
const SOLVER_URL = `http://localhost:${TEST_PORT}`;

const TMP = `/tmp/corivo-sync-e2e-${Date.now()}`;
const DEVICE_A = path.join(TMP, 'device-a');
const DEVICE_B = path.join(TMP, 'device-b');
const SOLVER_DATA = path.join(TMP, 'solver-data');

let solverProcess: ReturnType<typeof spawn> | null = null;

/** 调用 CLI，隔离 HOME 目录 */
function cli(args: string, homeDir: string): string {
  return execSync(`node ${CLI} ${args}`, {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: homeDir,
      CORIVO_SOLVER_URL: SOLVER_URL,
    },
  });
}

/** 轮询 /health，等待 solver 就绪 */
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

const state = { pairingCode: '' };

describe('E2E: Solver 同步链路', () => {
  beforeAll(async () => {
    await Promise.all([
      fs.mkdir(DEVICE_A, { recursive: true }),
      fs.mkdir(DEVICE_B, { recursive: true }),
      fs.mkdir(SOLVER_DATA, { recursive: true }),
    ]);

    // 构建 solver
    execSync('npm run build', {
      cwd: path.join(ROOT, 'packages/solver'),
      stdio: 'pipe',
    });

    // 启动 solver 子进程
    solverProcess = spawn('node', [SOLVER_DIST], {
      stdio: 'pipe',
      env: {
        ...process.env,
        SOLVER_PORT: String(TEST_PORT),
        SOLVER_HOST: '127.0.0.1',
        SOLVER_DB_PATH: path.join(SOLVER_DATA, 'solver.db'),
        NODE_ENV: 'test',
      },
    });

    solverProcess.on('error', (err) => {
      console.error('[solver]', err.message);
    });

    await waitForSolver();
  }, 90_000); // solver build 可能较慢

  afterAll(async () => {
    solverProcess?.kill('SIGTERM');
    await fs.rm(TMP, { recursive: true, force: true }).catch(() => {});
  });

  it('设备 A: 初始化 + 自动注册到 solver', () => {
    const out = cli('init', DEVICE_A);
    expect(out).toContain('初始化完成');
    expect(fsSync.existsSync(path.join(DEVICE_A, '.corivo', 'config.json'))).toBe(true);
    // init 结束时会自动尝试注册 solver（CORIVO_SOLVER_URL 指向测试服务器）
    expect(fsSync.existsSync(path.join(DEVICE_A, '.corivo', 'solver.json'))).toBe(true);
  }, 30_000);

  it('设备 A: 保存测试记忆', () => {
    const out = cli(
      'save --content "e2e测试：验证同步链路" --annotation "事实 · project · e2e"',
      DEVICE_A,
    );
    // save 成功时输出包含 block ID 或保存确认
    expect(out).toMatch(/blk_|已保存|保存成功/i);
  }, 15_000);

  it('设备 A: push 数据到 solver', () => {
    const out = cli(`sync --server ${SOLVER_URL}`, DEVICE_A);
    expect(out).toContain('同步完成');
    const match = out.match(/Push:\s*(\d+)/);
    expect(match, '输出中应包含 "Push: N"').not.toBeNull();
    expect(parseInt(match![1])).toBeGreaterThan(0);
  }, 15_000);

  it('solver 数据库已落盘 changeset', () => {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = require('better-sqlite3') as any;
    const db = new Database(path.join(SOLVER_DATA, 'solver.db'), { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as cnt FROM changesets').get() as { cnt: number };
    db.close();
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('设备 A: 生成配对码', () => {
    const out = cli('sync --pair', DEVICE_A);
    const match = out.match(/配对码:\s*([A-Z2-9]{6})/);
    expect(match, '输出中应包含 "配对码: XXXXXX"').not.toBeNull();
    state.pairingCode = match![1];
  }, 15_000);

  it('设备 B: 通过配对码加入同一 identity', () => {
    expect(state.pairingCode, '需要先获取配对码').toHaveLength(6);
    const out = cli(`init --join ${state.pairingCode} --server ${SOLVER_URL}`, DEVICE_B);
    expect(out).toContain('加入成功');

    const configA = JSON.parse(
      fsSync.readFileSync(path.join(DEVICE_A, '.corivo', 'config.json'), 'utf-8'),
    );
    const configB = JSON.parse(
      fsSync.readFileSync(path.join(DEVICE_B, '.corivo', 'config.json'), 'utf-8'),
    );
    expect(configB.identity_id).toBe(configA.identity_id);
  }, 30_000);

  it('设备 B: pull 拉取到设备 A 的数据', () => {
    const out = cli(`sync --server ${SOLVER_URL}`, DEVICE_B);
    expect(out).toContain('同步完成');
    const match = out.match(/Pull:\s*(\d+)/);
    expect(match, '输出中应包含 "Pull: N"').not.toBeNull();
    expect(parseInt(match![1])).toBeGreaterThan(0);
  }, 15_000);
});
