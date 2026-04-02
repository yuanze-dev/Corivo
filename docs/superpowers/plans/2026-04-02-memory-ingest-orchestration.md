# Memory Ingest Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/cli` 与对应 host bundles 中落地 memory ingest orchestration spec，让历史导入、实时 hooks、raw transcript 持久化、DB-backed queue、memory pipeline runner 和 install 自动导入串成一条可恢复、可重试、可增量的主链路。

**Architecture:** 现有代码已经有 `corivo host` 命令面、HostAdapter registry、SQLite storage、heartbeat 触发的 memory pipeline runner，以及 `claude-code`/`codex` host 资产包。本计划在不打破这些边界的前提下新增一层 raw ingest 子系统：`host import` 负责把宿主历史转成统一 raw records，实时 hooks 只做快速入库与 enqueue，runner 从 job queue claim `session_key` 后调用既有 memory pipeline/extraction 能力完成异步处理。

**Tech Stack:** TypeScript ESM, Commander, better-sqlite3, existing host adapter registry, existing memory-pipeline runner, shell hook scripts, Vitest

**Spec:** [2026-04-02-memory-ingest-orchestration-design.md](/Users/airbo/Developer/corivo/Corivo/docs/superpowers/specs/2026-04-02-memory-ingest-orchestration-design.md)

---

## Scope Check

这份 spec 虽然覆盖 `host import`、raw storage、queue、runner、hooks、install flow，但都属于同一条 memory ingest 主链路，保持为一份 implementation plan 是合理的，不需要拆成多个独立项目计划。

执行时要坚持 3 个边界：

- hooks 只做轻量 DB 写入与 enqueue，不能把 extraction / merge 塞回 shell 脚本。
- raw layer、memory layer、block layer 分离，不能把 session transcript 混进现有 `blocks` 表。
- `claude-code` 与 `codex` 共享 contract，但不强求第一版能力对称；`codex` 历史导入允许 unavailable。

## 文件变更地图

**新增：**
- `packages/cli/src/application/hosts/import-host.ts` - `corivo host import <host>` use case 编排
- `packages/cli/src/application/memory-ingest/ingest-realtime-message.ts` - 实时 hook 入库 use case
- `packages/cli/src/application/memory-ingest/enqueue-session-extraction.ts` - `extract-session` job ensure / refresh
- `packages/cli/src/raw-memory/types.ts` - raw session / raw message / job / import cursor contracts
- `packages/cli/src/raw-memory/repository.ts` - raw session 与 raw message upsert/query repository
- `packages/cli/src/raw-memory/job-queue.ts` - DB-backed queue claim / retry / complete / fail
- `packages/cli/src/raw-memory/import-cursors.ts` - per-host `last_import_cursor` read/write
- `packages/cli/src/cli/commands/host-import.ts` - `host import` 子命令定义
- `packages/cli/src/memory-pipeline/sources/raw-session-job-source.ts` - 从 job queue 读取 session work items
- `packages/cli/__tests__/unit/raw-memory-repository.test.ts`
- `packages/cli/__tests__/unit/raw-memory-job-queue.test.ts`
- `packages/cli/__tests__/unit/host-import-use-case.test.ts`
- `packages/cli/__tests__/integration/host-import-command.test.ts`
- `packages/cli/__tests__/integration/realtime-memory-ingest.test.ts`

**修改：**
- `packages/cli/src/hosts/types.ts` - 扩展 import contract、capability、result 类型
- `packages/cli/src/hosts/registry.ts` - registry 继续注册支持 import 的 adapter
- `packages/cli/src/hosts/adapters/claude-code.ts` - 接入 Claude history import adapter
- `packages/cli/src/hosts/adapters/codex.ts` - 接入 Codex history import adapter / unavailable result
- `packages/cli/src/cli/commands/host.ts` - 注册 `import` 子命令
- `packages/cli/src/cli/index.ts` - 若帮助文案需要，更新总命令说明
- `packages/cli/src/storage/database.ts` - 新增 raw tables、索引、upsert/query helpers 或 repository 所需低层接口
- `packages/cli/src/application/hosts/install-host.ts` - install 后的可选自动历史导入
- `packages/cli/src/engine/heartbeat.ts` - 让 scheduled runner 消费 raw session jobs，而不是只看 stale blocks
- `packages/cli/src/cli/commands/memory.ts` - 组装 raw-session job source
- `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts` - 改为 session-job 驱动
- `packages/cli/src/memory-pipeline/index.ts` - 导出新 source / contracts
- `packages/plugins/hosts/claude-code/hooks/scripts/ingest-turn.sh` - 调整为快速入库 + enqueue
- `packages/plugins/hosts/codex/hooks/scripts/ingest-turn.sh` - 调整为快速入库 + enqueue
- `packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh` - 只写 user message 并 ensure job
- `packages/plugins/hosts/codex/hooks/scripts/stop.sh` - 写 assistant message 并 refresh job
- `packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh` - 若当前脚本承担入库职责，则剥离为 recall only
- `packages/plugins/hosts/claude-code/hooks/scripts/stop-review.sh` - 若当前 stop 路径接入 ingest，则改成异步 enqueue 语义
- `packages/plugins/hosts/claude-code/README.md`
- `packages/plugins/hosts/codex/README.md`
- `packages/cli/README.md`

**可能新增但需先确认目录格式：**
- `packages/cli/src/hosts/importers/claude-history.ts` - Claude session probe + parser
- `packages/cli/src/hosts/importers/codex-history.ts` - Codex session probe + parser / unavailable fallback

如果现有 `hosts/adapters/*` 已经足够承载 parser，也可以不新增 `hosts/importers/` 目录，但不要把 parser 逻辑直接塞进 `cli/commands/host.ts`。

**明确不纳入本计划：**
- Phase 1 / Phase 2 prompt 内容改动
- final Markdown merge 语义重写
- recall 排序算法
- Cursor / OpenCode / Project Claude 接入
- 外部消息队列或 worker service

---

### Task 1: 扩展 host import contract 与 CLI 命令面

**Files:**
- Create: `packages/cli/src/application/hosts/import-host.ts`
- Create: `packages/cli/src/cli/commands/host-import.ts`
- Modify: `packages/cli/src/hosts/types.ts`
- Modify: `packages/cli/src/cli/commands/host.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Test: `packages/cli/__tests__/unit/host-import-use-case.test.ts`
- Test: `packages/cli/__tests__/integration/host-import-command.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 `host import` command 与 use case 行为**

在 `packages/cli/__tests__/unit/host-import-use-case.test.ts` 增加：

```ts
it('fails without --all or stored cursor on first import', async () => {
  const run = createHostImportUseCase({
    getAdapter: () => ({ id: 'claude-code', importHistory: vi.fn() } as any),
    getLastCursor: async () => undefined,
  });

  await expect(run({ host: 'claude-code' })).resolves.toMatchObject({
    success: false,
    error: expect.stringContaining('No previous import cursor found'),
  });
});

it('uses stored cursor when no explicit mode is provided', async () => {
  const importHistory = vi.fn(async () => ({
    host: 'claude-code',
    mode: 'incremental',
    importedSessionCount: 2,
    importedMessageCount: 6,
    nextCursor: 'cursor-2',
    summary: 'imported 2 sessions',
  }));

  const run = createHostImportUseCase({
    getAdapter: () => ({ id: 'claude-code', importHistory } as any),
    getLastCursor: async () => 'cursor-1',
    saveLastCursor: async () => {},
  });

  await run({ host: 'claude-code' });
  expect(importHistory).toHaveBeenCalledWith(expect.objectContaining({ since: 'cursor-1' }));
});
```

在 `packages/cli/__tests__/integration/host-import-command.test.ts` 增加：

```ts
it('registers host import with --all, --since, --limit and --dry-run options', async () => {
  const command = hostCommand.commands.find((item) => item.name() === 'import');
  expect(command).toBeDefined();
  expect(command?.options.map((item) => item.long)).toEqual(
    expect.arrayContaining(['--all', '--since', '--limit', '--dry-run', '--target']),
  );
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-import-use-case.test.ts __tests__/integration/host-import-command.test.ts`

Expected: FAIL，提示缺少 `createHostImportUseCase`、`host import` 子命令或 import types。

- [ ] **Step 3: 实现最小 contract 与命令入口**

在 `packages/cli/src/hosts/types.ts` 增加：

```ts
export type HostCapability = /* existing */ | 'history-import';

export interface HostImportOptions {
  all?: boolean;
  since?: string;
  limit?: number;
  dryRun?: boolean;
  target?: string;
}

export interface HostImportResult {
  host: HostId;
  mode: 'full' | 'incremental';
  importedSessionCount: number;
  importedMessageCount: number;
  nextCursor?: string;
  summary: string;
  unavailableReason?: string;
}
```

在 `packages/cli/src/application/hosts/import-host.ts` 实现：

```ts
export type HostImportRequest = HostImportOptions & { host: HostId };

// 逻辑顺序：
// 1. resolve adapter
// 2. resolve default mode from cursor
// 3. call adapter.importHistory()
// 4. persist nextCursor if returned
// 5. return structured result
```

在 `packages/cli/src/cli/commands/host-import.ts` 定义 `import` 子命令，再由 `host.ts` 挂载。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-import-use-case.test.ts __tests__/integration/host-import-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/application/hosts/import-host.ts packages/cli/src/cli/commands/host-import.ts packages/cli/src/hosts/types.ts packages/cli/src/cli/commands/host.ts packages/cli/src/hosts/registry.ts packages/cli/__tests__/unit/host-import-use-case.test.ts packages/cli/__tests__/integration/host-import-command.test.ts
git commit -m "feat: add host import command surface"
```

---

### Task 2: 建立 raw session、raw message、job queue 与 cursor 持久化层

**Files:**
- Create: `packages/cli/src/raw-memory/types.ts`
- Create: `packages/cli/src/raw-memory/repository.ts`
- Create: `packages/cli/src/raw-memory/job-queue.ts`
- Create: `packages/cli/src/raw-memory/import-cursors.ts`
- Modify: `packages/cli/src/storage/database.ts`
- Test: `packages/cli/__tests__/unit/raw-memory-repository.test.ts`
- Test: `packages/cli/__tests__/unit/raw-memory-job-queue.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 schema 语义与幂等行为**

在 `packages/cli/__tests__/unit/raw-memory-repository.test.ts` 增加：

```ts
it('upserts a raw session and message idempotently', () => {
  repository.upsertSession({
    host: 'claude-code',
    externalSessionId: 'sess-1',
    sessionKey: 'claude-code:sess-1',
    sourceType: 'history-import',
  });
  repository.upsertSession({
    host: 'claude-code',
    externalSessionId: 'sess-1',
    sessionKey: 'claude-code:sess-1',
    sourceType: 'history-import',
  });

  repository.upsertMessage({
    sessionKey: 'claude-code:sess-1',
    externalMessageId: 'msg-1',
    role: 'user',
    content: 'remember this',
    ordinal: 1,
    ingestedFrom: 'host-import',
  });
  repository.upsertMessage({
    sessionKey: 'claude-code:sess-1',
    externalMessageId: 'msg-1',
    role: 'user',
    content: 'remember this',
    ordinal: 1,
    ingestedFrom: 'host-import',
  });

  expect(repository.listMessages('claude-code:sess-1')).toHaveLength(1);
});
```

在 `packages/cli/__tests__/unit/raw-memory-job-queue.test.ts` 增加：

```ts
it('keeps only one pending extract job per session key', () => {
  queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-1' });
  queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-1' });
  expect(queue.listPending()).toHaveLength(1);
});

it('claims one pending job atomically and marks it running', () => {
  const claimed = queue.claimNext();
  expect(claimed?.status).toBe('running');
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/raw-memory-repository.test.ts __tests__/unit/raw-memory-job-queue.test.ts`

Expected: FAIL，提示 repository / queue / schema helpers 不存在。

- [ ] **Step 3: 实现最小 raw-memory 子系统**

在 `packages/cli/src/storage/database.ts` 新增表与索引：

```sql
CREATE TABLE raw_sessions (..., UNIQUE(host, external_session_id), UNIQUE(session_key));
CREATE TABLE raw_messages (...);
CREATE TABLE memory_processing_jobs (..., UNIQUE(dedupe_key));
CREATE TABLE host_import_cursors (host TEXT PRIMARY KEY, last_import_cursor TEXT, updated_at INTEGER NOT NULL);
```

在 `packages/cli/src/raw-memory/repository.ts` 实现：

```ts
upsertSession(input: RawSessionInput): void
upsertMessage(input: RawMessageInput): void
listMessages(sessionKey: string): RawMessageRecord[]
getTranscript(sessionKey: string): RawTranscript
```

在 `packages/cli/src/raw-memory/job-queue.ts` 实现：

```ts
ensureExtractSessionJob(input: { host: HostId; sessionKey: string; availableAt?: number }): JobRecord
claimNext(now = Date.now()): JobRecord | null
markSucceeded(id: string): void
markFailed(id: string, error: string, nextAvailableAt?: number): void
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/raw-memory-repository.test.ts __tests__/unit/raw-memory-job-queue.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/raw-memory/types.ts packages/cli/src/raw-memory/repository.ts packages/cli/src/raw-memory/job-queue.ts packages/cli/src/raw-memory/import-cursors.ts packages/cli/src/storage/database.ts packages/cli/__tests__/unit/raw-memory-repository.test.ts packages/cli/__tests__/unit/raw-memory-job-queue.test.ts
git commit -m "feat: add raw memory storage and job queue"
```

---

### Task 3: 让 Claude Code 与 Codex adapters 支持历史导入 contract

**Files:**
- Modify: `packages/cli/src/hosts/adapters/claude-code.ts`
- Modify: `packages/cli/src/hosts/adapters/codex.ts`
- Create: `packages/cli/src/hosts/importers/claude-history.ts`
- Create: `packages/cli/src/hosts/importers/codex-history.ts`
- Test: `packages/cli/__tests__/unit/claude-history-importer.test.ts`
- Test: `packages/cli/__tests__/unit/codex-history-importer.test.ts`

- [ ] **Step 1: 写 failing tests，锁定两类宿主的差异化行为**

在 `packages/cli/__tests__/unit/claude-history-importer.test.ts` 增加：

```ts
it('parses Claude session files into ImportedSessionRecord values', async () => {
  const sessions = await importer.importHistory({ all: true, limit: 1 });
  expect(sessions.summary).toContain('imported');
  expect(sessions.importedSessionCount).toBe(1);
  expect(sessions.nextCursor).toBeDefined();
});
```

在 `packages/cli/__tests__/unit/codex-history-importer.test.ts` 增加：

```ts
it('returns unavailable when no stable Codex history source is detected', async () => {
  await expect(importer.importHistory({ all: true })).resolves.toMatchObject({
    host: 'codex',
    importedSessionCount: 0,
    unavailableReason: expect.stringContaining('not available'),
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-history-importer.test.ts __tests__/unit/codex-history-importer.test.ts`

Expected: FAIL，提示 importer 不存在或 adapter 未暴露 `importHistory`。

- [ ] **Step 3: 实现最小 importer 与 adapter 集成**

在 `packages/cli/src/hosts/importers/claude-history.ts` 实现：

```ts
// 1. probe ~/.claude/sessions then ~/.config/claude/sessions
// 2. enumerate files
// 3. parse stable session id / message sequence
// 4. build ImportedSessionRecord[]
// 5. derive nextCursor from last modified time or host-specific metadata
```

在 `packages/cli/src/hosts/importers/codex-history.ts` 实现：

```ts
// 1. probe ~/.codex/sessions
// 2. if unavailable or unrecognized, return HostImportResult with unavailableReason
// 3. if recognizable, normalize into ImportedSessionRecord[]
```

在 `packages/cli/src/hosts/adapters/*.ts` 中增加 `history-import` capability 和 `importHistory`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-history-importer.test.ts __tests__/unit/codex-history-importer.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hosts/adapters/claude-code.ts packages/cli/src/hosts/adapters/codex.ts packages/cli/src/hosts/importers/claude-history.ts packages/cli/src/hosts/importers/codex-history.ts packages/cli/__tests__/unit/claude-history-importer.test.ts packages/cli/__tests__/unit/codex-history-importer.test.ts
git commit -m "feat: add host history import adapters"
```

---

### Task 4: 把历史导入与实时 hooks 统一写入 raw layer 并 enqueue session jobs

**Files:**
- Create: `packages/cli/src/application/memory-ingest/ingest-realtime-message.ts`
- Create: `packages/cli/src/application/memory-ingest/enqueue-session-extraction.ts`
- Modify: `packages/cli/src/application/hosts/import-host.ts`
- Modify: `packages/plugins/hosts/claude-code/hooks/scripts/ingest-turn.sh`
- Modify: `packages/plugins/hosts/codex/hooks/scripts/ingest-turn.sh`
- Modify: `packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh`
- Modify: `packages/plugins/hosts/codex/hooks/scripts/stop.sh`
- Modify: `packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh`
- Modify: `packages/plugins/hosts/claude-code/hooks/scripts/stop-review.sh`
- Test: `packages/cli/__tests__/integration/realtime-memory-ingest.test.ts`

- [ ] **Step 1: 写 failing tests，锁定历史导入与 hook 幂等行为**

在 `packages/cli/__tests__/integration/realtime-memory-ingest.test.ts` 增加：

```ts
it('stores user prompt on submit and ensures one extract-session job', async () => {
  await ingestRealtimeMessage({
    host: 'codex',
    externalSessionId: 'sess-1',
    role: 'user',
    content: 'remember: prefer thin adapters',
    eventType: 'user-prompt-submit',
  });

  expect(repository.listMessages('codex:sess-1')).toEqual([
    expect.objectContaining({ role: 'user', content: 'remember: prefer thin adapters' }),
  ]);
  expect(queue.listPending()).toHaveLength(1);
});

it('adds assistant message on stop without creating duplicate pending jobs', async () => {
  await ingestRealtimeMessage({
    host: 'codex',
    externalSessionId: 'sess-1',
    role: 'assistant',
    content: 'noted',
    eventType: 'assistant-stop',
  });

  expect(repository.listMessages('codex:sess-1')).toHaveLength(2);
  expect(queue.listPending()).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/integration/realtime-memory-ingest.test.ts`

Expected: FAIL，提示缺少 ingest use case 或 queue refresh 行为。

- [ ] **Step 3: 实现历史导入写库与 hook 快路径**

在 `packages/cli/src/application/hosts/import-host.ts` 中，把 adapter 返回的 `ImportedSessionRecord[]` 逐条写入 raw repository，并为每个 `session_key` 调用 `ensureExtractSessionJob(...)`。

在 `packages/cli/src/application/memory-ingest/ingest-realtime-message.ts` 中实现：

```ts
// 1. build sessionKey = `${host}:${externalSessionId}`
// 2. upsert raw session
// 3. upsert raw message
// 4. update last_message_at when assistant message arrives
// 5. ensure or refresh extract-session job
```

在 hook shell 脚本里统一改为调用轻量 CLI 子命令或 JS entrypoint，不直接执行模型或 Markdown 写入。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/integration/realtime-memory-ingest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/application/memory-ingest/ingest-realtime-message.ts packages/cli/src/application/memory-ingest/enqueue-session-extraction.ts packages/cli/src/application/hosts/import-host.ts packages/plugins/hosts/claude-code/hooks/scripts/ingest-turn.sh packages/plugins/hosts/codex/hooks/scripts/ingest-turn.sh packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh packages/plugins/hosts/codex/hooks/scripts/stop.sh packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh packages/plugins/hosts/claude-code/hooks/scripts/stop-review.sh packages/cli/__tests__/integration/realtime-memory-ingest.test.ts
git commit -m "feat: ingest realtime messages into raw memory queue"
```

---

### Task 5: 让 memory pipeline runner 从 raw session jobs 消费 transcript

**Files:**
- Create: `packages/cli/src/memory-pipeline/sources/raw-session-job-source.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/src/cli/commands/memory.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Test: `packages/cli/__tests__/unit/raw-session-job-source.test.ts`
- Test: `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`
- Test: `packages/cli/__tests__/integration/memory-command.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 job-driven runner 输入**

在 `packages/cli/__tests__/unit/raw-session-job-source.test.ts` 增加：

```ts
it('claims pending extract-session jobs and loads full transcripts', async () => {
  const items = await source.collect();
  expect(items).toEqual([
    expect.objectContaining({
      sessionKey: 'claude-code:sess-1',
      transcript: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
    }),
  ]);
});
```

在 `packages/cli/__tests__/integration/memory-command.test.ts` 增加：

```ts
it('builds the incremental pipeline from raw-session job source', async () => {
  await runMemoryPipeline('incremental', overrides);
  expect(overrides.createScheduledPipeline).toHaveBeenCalledWith(
    expect.objectContaining({ rawSessionJobSource: expect.anything() }),
  );
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/raw-session-job-source.test.ts __tests__/integration/memory-command.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: FAIL，提示缺少 raw-session job source 或 scheduled pipeline 仍依赖 stale blocks。

- [ ] **Step 3: 实现 job source 与 runner 接线**

在 `packages/cli/src/memory-pipeline/sources/raw-session-job-source.ts` 实现：

```ts
collect(limit = 20): Promise<SessionJobWorkItem[]>
markSucceeded(jobId: string): Promise<void>
markFailed(jobId: string, error: string): Promise<void>
```

在 `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts` 把输入从 `staleBlockSource` 改成 `rawSessionJobSource`，让阶段语义变成：

```text
claim session jobs
-> load raw session transcripts
-> phase 1 / phase 2 stages
-> mark jobs succeeded
```

在 `packages/cli/src/engine/heartbeat.ts` 继续只负责触发，不直接承担 job 处理逻辑。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/raw-session-job-source.test.ts __tests__/integration/memory-command.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/sources/raw-session-job-source.ts packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts packages/cli/src/cli/commands/memory.ts packages/cli/src/memory-pipeline/index.ts packages/cli/src/engine/heartbeat.ts packages/cli/__tests__/unit/raw-session-job-source.test.ts packages/cli/__tests__/integration/memory-command.test.ts packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts
git commit -m "refactor: drive scheduled memory pipeline from raw session jobs"
```

---

### Task 6: 在 install flow 中加入显式的自动历史导入入口

**Files:**
- Modify: `packages/cli/src/application/hosts/install-host.ts`
- Modify: `packages/cli/src/cli/utils/password.ts`
- Test: `packages/cli/__tests__/unit/install-host-use-case.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 install 后确认导入行为**

在 `packages/cli/__tests__/unit/install-host-use-case.test.ts` 增加：

```ts
it('offers optional history import after successful install', async () => {
  const importHost = vi.fn(async () => ({
    host: 'claude-code',
    mode: 'full',
    importedSessionCount: 3,
    importedMessageCount: 9,
    summary: 'imported 3 sessions',
  }));

  const run = createHostInstallUseCase({
    runInstall: async () => ({ success: true, host: 'claude-code', summary: 'installed' }),
    readConfirm: async () => true,
    importHost,
  });

  await run({ host: 'claude-code' });
  expect(importHost).toHaveBeenCalledWith(expect.objectContaining({ host: 'claude-code', all: true }));
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-host-use-case.test.ts`

Expected: FAIL，提示 install use case 没有导入确认与 `importHost` 注入点。

- [ ] **Step 3: 实现最小 install 自动导入分支**

在 `packages/cli/src/application/hosts/install-host.ts` 注入：

```ts
readConfirm?: (prompt: string, defaultNo?: boolean) => Promise<boolean>;
importHost?: (input: HostImportRequest) => Promise<HostImportExecutionResult>;
```

逻辑：

- 仅对 `claude-code` / `codex` 且 install 成功时询问。
- 用户确认后调用 `importHost({ host, all: true, target })`。
- 即使导入失败，也不把 install 结果改写为失败；仅把导入摘要附加到 summary。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-host-use-case.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/application/hosts/install-host.ts packages/cli/src/cli/utils/password.ts packages/cli/__tests__/unit/install-host-use-case.test.ts
git commit -m "feat: offer history import after host install"
```

---

### Task 7: 文档、验收与回归测试收口

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `packages/plugins/hosts/claude-code/README.md`
- Modify: `packages/plugins/hosts/codex/README.md`
- Modify: `docs/superpowers/specs/2026-04-02-memory-ingest-orchestration-design.md` (only if implementation materially diverges)

- [ ] **Step 1: 补文档，写清命令面、默认行为与降级语义**

更新文档至少覆盖：

- `corivo host import <host>` 的 `--all` / `--since` / 默认行为
- `codex` history import unavailable 时的 CLI 输出
- hooks 只做快速入库 + enqueue
- install 自动导入是显式确认，不是隐式默认

- [ ] **Step 2: 跑完整相关测试集**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-import-use-case.test.ts __tests__/integration/host-import-command.test.ts __tests__/unit/raw-memory-repository.test.ts __tests__/unit/raw-memory-job-queue.test.ts __tests__/unit/claude-history-importer.test.ts __tests__/unit/codex-history-importer.test.ts __tests__/integration/realtime-memory-ingest.test.ts __tests__/unit/raw-session-job-source.test.ts __tests__/integration/memory-command.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts __tests__/unit/install-host-use-case.test.ts`

Expected: PASS

- [ ] **Step 3: 跑类型检查与 package build**

Run: `cd packages/cli && npm run typecheck`
Expected: PASS

Run: `cd packages/cli && npm run build`
Expected: PASS

- [ ] **Step 4: 做一次手工 smoke test**

Run:

```bash
cd packages/cli
node dist/cli/index.js host import claude-code --dry-run
node dist/cli/index.js host import codex --all
node dist/cli/index.js memory run --incremental
```

Expected:

- `claude-code --dry-run` 输出将导入的 session 数量，不写 DB
- `codex --all` 在无可解析历史源时输出 unavailable summary，而不是抛异常
- `memory run --incremental` 正常触发 job-driven pipeline

- [ ] **Step 5: Commit**

```bash
git add packages/cli/README.md packages/plugins/hosts/claude-code/README.md packages/plugins/hosts/codex/README.md docs/superpowers/specs/2026-04-02-memory-ingest-orchestration-design.md
git commit -m "docs: document memory ingest orchestration flow"
```

---

## Open Questions To Resolve During Implementation

- Claude session 文件 schema 需要先在真实本机数据上 probe；不要在 parser 落地前假设固定 JSON 结构。
- `codex` hook payload 是否稳定包含 `external_message_id`；若没有，需在 use case 中定义 fallback dedupe 规则。
- scheduled pipeline 是否直接复用 04-02 extraction/merge stages，还是先新增一个更薄的 transcript-loading stage 再调用现有阶段；优先复用，不重复造 runner。
- 若 install flow 在非 TTY 环境运行，自动导入提示应默认跳过，避免卡死 CI 或脚本。

## Verification Notes

- 每个任务都先写失败测试，再补最小实现，再跑通过测试。
- 不要在同一个 commit 里混入 schema、runner、hook、docs 四类无关改动。
- 如果 raw schema 迁移导致现有 `CorivoDatabase` 初始化变慢，要在对应 test 中补回归断言。

## Review Status

已完成作者自查，重点确认了 plan 与现有代码边界一致：

- 命令面挂在既有 `corivo host` 下，而不是新增平行顶级命令。
- runner 继续由 `memory.ts` 与 `heartbeat.ts` 触发，不把长流程塞回 hooks。
- plugin 包里的真实 hook 脚本路径已纳入计划，而不是只改 `packages/cli/src/inject/*`。

按 `writing-plans` skill 原流程，下一步应派发 plan-document-reviewer subagent 做独立审阅；当前会话没有用户明确授权使用 sub-agent，因此这里先停止在自查版本，由执行者在开工前补一次人工或后续授权的 agent review。
