# Memory Extraction And Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/cli` 中把 2026-04-02 spec 定义的两阶段记忆处理机制落地为可调用实现: 从数据库中的完整 session 原文提取 raw memories，再合并成 canonical final memories 与 `MEMORY.md` 索引。

**Architecture:** 现有 `memory-pipeline/` 已经有 runner、artifact store、CLI 入口和 skeleton stages，但还不具备“阶段间读写 artifact”“消费完整 session 原文”“按 spec 产出 raw/final Markdown”的能力。本计划先补齐 framework 缺口，再新增 prompt assets、Markdown contract、Phase 1 raw extraction、Phase 2 final merge，并把 init/manual 与 scheduled 统一到同一套 session-based processing 语义上。

**Tech Stack:** TypeScript ESM, Node.js fs/path APIs, better-sqlite3, existing extraction providers, existing memory-pipeline runner, Vitest

**Spec:** [2026-04-02-memory-extraction-and-merge-design.md](/Users/airbo/Developer/corivo/Corivo/docs/superpowers/specs/2026-04-02-memory-extraction-and-merge-design.md)

---

## Scope Check

这份 spec 只落在 `packages/cli` 的一个子系统里，可以保持为一份计划，不需要再拆成多个独立项目计划。

当前代码与 spec 的关键落差有 3 个，计划必须先补这 3 个前置条件：

- `memory-pipeline` 的 stage 目前只能“写 artifact”，不能读取上一步结果，不足以实现 `raw -> final`。
- 当前仓库没有可直接消费的“完整 session 原文记录”数据契约，只有 block 级数据和 skeleton `ClaudeSessionSource`。
- 现有 stages 仍然是 `summarize-* / append-detail-records / refresh-index` 命名和语义，和新 spec 的 Phase 1 / Phase 2 contract 不一致。

## 文件变更地图

**新增：**
- `packages/cli/src/memory-pipeline/contracts/session-record.ts` — 完整 session 原文的规范化输入类型
- `packages/cli/src/memory-pipeline/contracts/memory-documents.ts` — raw/final memory frontmatter、scope、deletion marker、index entry 的正式类型
- `packages/cli/src/memory-pipeline/prompts/memory-types.ts` — 四类 memory taxonomy 常量
- `packages/cli/src/memory-pipeline/prompts/what-not-to-save.ts` — exclusion list 常量
- `packages/cli/src/memory-pipeline/prompts/raw-extraction-prompt.ts` — Phase 1 prompt 组装器
- `packages/cli/src/memory-pipeline/prompts/final-merge-prompt.ts` — Phase 2 prompt 组装器
- `packages/cli/src/memory-pipeline/markdown/raw-memory-parser.ts` — 解析 `<!-- FILE: ... -->` raw 输出
- `packages/cli/src/memory-pipeline/markdown/memory-writer.ts` — 渲染 raw/final Markdown 与 `MEMORY.md`
- `packages/cli/src/memory-pipeline/sources/session-record-source.ts` — full/incremental 两类 session source 契约与 DB-backed 实现
- `packages/cli/src/memory-pipeline/stages/extract-raw-memories.ts` — Phase 1 stage
- `packages/cli/src/memory-pipeline/stages/merge-final-memories.ts` — Phase 2 stage
- `packages/cli/__tests__/unit/memory-pipeline-session-source.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-prompts.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-markdown.test.ts`

**修改：**
- `packages/cli/src/storage/database.ts` — 增加 session transcript 持久化与查询接口，或至少增加 pipeline 所需的 session snapshot 读取接口
- `packages/cli/src/memory-pipeline/types.ts` — 为跨 stage artifact 读取、memory run scope、session work item 增强 contract
- `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts` — 增加 artifact 读取、列举、按 stage/run 查询能力
- `packages/cli/src/memory-pipeline/runner.ts` — 注入 richer context，支持 stage 消费上一步 artifact
- `packages/cli/src/memory-pipeline/index.ts` — 导出新 contracts、sources、stages、prompt assets
- `packages/cli/src/memory-pipeline/processors/model-processor.ts` — 支持单输入 prompt 与结构化 metadata 回传
- `packages/cli/src/memory-pipeline/sources/claude-session-source.ts` — 替换为新 session-record source 兼容层，或作为 deprecated adapter 保留
- `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts` — 改为 `collect sessions -> extract raw -> merge final`
- `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts` — 改为与 init 同语义的 session-based 增量流程
- `packages/cli/src/memory-pipeline/stages/collect-claude-sessions.ts` — 改成收集规范化 session record work items，而不是空数组 stub
- `packages/cli/src/cli/commands/memory.ts` — 组装真实 session source 与 memory root，暴露 full/incremental 入口
- `packages/cli/src/cli/index.ts` — 如命令帮助文案需要，更新说明
- `packages/cli/src/index.ts` — 导出新的 memory pipeline contracts
- `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- `packages/cli/__tests__/integration/memory-command.test.ts`
- `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`

**删除或重命名候选：**
- `packages/cli/src/memory-pipeline/stages/consolidate-session-summaries.ts`
- `packages/cli/src/memory-pipeline/stages/summarize-session-batch.ts`
- `packages/cli/src/memory-pipeline/stages/collect-stale-blocks.ts`
- `packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts`
- `packages/cli/src/memory-pipeline/stages/append-detail-records.ts`
- `packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts`
- `packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts`

执行时不要一上来删除旧文件。先完成新测试和新路径，确认迁移后再清理旧 skeleton。

**明确不纳入本计划：**
- recall 注入链路如何消费 `MEMORY.md`
- 新 memory type 扩展
- 调度策略优化
- 单条 memory 的长期稳定 ID
- 人工审阅 `MEMORY.md` 作为正式系统步骤

---

### Task 1: 补齐 framework 缺口，让 stage 能消费前一步 artifact

**Files:**
- Modify: `packages/cli/src/memory-pipeline/types.ts`
- Modify: `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`
- Modify: `packages/cli/src/memory-pipeline/runner.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`

- [ ] **Step 1: 写 failing tests，锁定跨 stage artifact 读取 contract**

在 `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts` 增加：

```ts
it('reads back a written artifact body by descriptor id', async () => {
  const descriptor = await store.writeArtifact({
    runId: 'run-1',
    kind: 'raw-memory-batch',
    source: 'extract-raw-memories',
    body: '{"items":[1]}',
  });

  await expect(store.readArtifact(descriptor.id)).resolves.toBe('{"items":[1]}');
});

it('lists artifacts for a run ordered by creation time', async () => {
  await store.writeArtifact({ runId: 'run-1', kind: 'session-batch', source: 'collect', body: '[]' });
  await store.writeArtifact({ runId: 'run-1', kind: 'raw-memory-batch', source: 'extract', body: '[]' });
  const artifacts = await store.listArtifacts({ runId: 'run-1' });
  expect(artifacts.map((item) => item.kind)).toEqual(['session-batch', 'raw-memory-batch']);
});
```

在 `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts` 增加：

```ts
it('passes artifact reader capabilities to later stages', async () => {
  const pipeline = {
    id: 'init-memory-pipeline',
    stages: [
      createStage('write', async (context) => {
        const artifact = await context.artifactStore.writeArtifact({
          runId: context.runId,
          kind: 'session-batch',
          source: 'write',
          body: '["session-1"]',
        });
        return createResult('write', 'success', { artifactIds: [artifact.id], outputCount: 1 });
      }),
      createStage('read', async (context) => {
        const previous = await context.artifactStore.listArtifacts({ runId: context.runId, source: 'write' });
        const body = await context.artifactStore.readArtifact(previous[0].id);
        expect(body).toBe('["session-1"]');
        return createResult('read', 'success');
      }),
    ],
  };
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-artifact-store.test.ts __tests__/unit/memory-pipeline-runner.test.ts`

Expected: FAIL，提示 `readArtifact` / `listArtifacts` / richer context 不存在。

- [ ] **Step 3: 实现最小框架扩展**

在 `packages/cli/src/memory-pipeline/types.ts` 增加：

```ts
export interface ArtifactQuery {
  runId?: string;
  source?: string;
  kind?: string;
}

export interface MemoryPipelineArtifactStore {
  writeArtifact(input: ArtifactWriteInput): Promise<ArtifactDescriptor>;
  persistDescriptor(descriptor: ArtifactDescriptor): Promise<void>;
  getDescriptor(id: string): Promise<ArtifactDescriptor | undefined>;
  readArtifact(id: string): Promise<string>;
  listArtifacts(query?: ArtifactQuery): Promise<ArtifactDescriptor[]>;
}
```

在 `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`：

```ts
async readArtifact(id: string): Promise<string> {
  const descriptor = await this.getDescriptor(id);
  if (!descriptor) throw new Error(`artifact not found: ${id}`);
  return readFile(path.join(this.rootDir, descriptor.path), 'utf8');
}

async listArtifacts(query: ArtifactQuery = {}): Promise<ArtifactDescriptor[]> {
  // 读取 descriptors 目录，按 query 过滤，再按 createdAt 排序
}
```

在 `packages/cli/src/memory-pipeline/runner.ts` 保持顺序执行，但让 stage 能通过 `artifactStore` 访问前面产物，不再把 artifact store 当纯 write-only sink。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-artifact-store.test.ts __tests__/unit/memory-pipeline-runner.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/types.ts packages/cli/src/memory-pipeline/artifacts/artifact-store.ts packages/cli/src/memory-pipeline/runner.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts packages/cli/__tests__/unit/memory-pipeline-runner.test.ts
git commit -m "refactor: enable artifact reads across memory pipeline stages"
```

---

### Task 2: 定义完整 session 输入契约，并把数据库读取接进 pipeline

**Files:**
- Create: `packages/cli/src/memory-pipeline/contracts/session-record.ts`
- Create: `packages/cli/src/memory-pipeline/sources/session-record-source.ts`
- Modify: `packages/cli/src/storage/database.ts`
- Modify: `packages/cli/src/memory-pipeline/sources/claude-session-source.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/collect-claude-sessions.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-session-source.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 session snapshot contract**

在 `packages/cli/__tests__/unit/memory-pipeline-session-source.test.ts` 新增：

```ts
it('maps database session rows into normalized session records', async () => {
  const source = new DatabaseSessionRecordSource({
    repository: {
      listSessions: async () => [
        {
          sessionId: 'sess-1',
          host: 'claude-code',
          startedAt: 1,
          endedAt: 2,
          messages: [
            { role: 'user', content: 'Remember that I prefer small PRs.' },
            { role: 'assistant', content: 'I will remember that.' },
          ],
        },
      ],
    },
  });

  await expect(source.collect()).resolves.toEqual([
    expect.objectContaining({
      id: 'sess-1',
      kind: 'session',
      sourceRef: 'claude-code:sess-1',
      metadata: expect.objectContaining({ host: 'claude-code' }),
    }),
  ]);
});
```

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 增加：

```ts
it('collects normalized session work items instead of stubbed empty arrays', async () => {
  const source = {
    collect: vi.fn(async () => [
      { id: 'sess-1', kind: 'session', sourceRef: 'claude-code:sess-1', metadata: { host: 'claude-code' } },
    ]),
  };
  const stage = new CollectClaudeSessionsStage(source);
  const result = await stage.run(createContext(store));
  expect(result.outputCount).toBe(1);
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-session-source.test.ts __tests__/unit/memory-pipeline-stages.test.ts`

Expected: FAIL，提示 normalized session source / repository contract 缺失。

- [ ] **Step 3: 实现 session contract 与 DB adapter**

在 `packages/cli/src/memory-pipeline/contracts/session-record.ts` 定义：

```ts
export interface SessionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: number;
}

export interface SessionRecord {
  sessionId: string;
  host: string;
  startedAt: number;
  endedAt?: number;
  messages: SessionMessage[];
}
```

在 `packages/cli/src/memory-pipeline/sources/session-record-source.ts` 定义：

```ts
export interface SessionRecordRepository {
  listSessions(scope: { mode: 'full' | 'incremental' }): Promise<SessionRecord[]>;
}

export class DatabaseSessionRecordSource {
  constructor(private readonly options: { repository: SessionRecordRepository; mode: 'full' | 'incremental' }) {}

  async collect(): Promise<ClaudeSessionWorkItem[]> {
    const sessions = await this.options.repository.listSessions({ mode: this.options.mode });
    return sessions.map((session) => ({
      id: session.sessionId,
      kind: 'session',
      sourceRef: `${session.host}:${session.sessionId}`,
      freshnessToken: String(session.endedAt ?? session.startedAt),
      metadata: session,
    }));
  }
}
```

在 `packages/cli/src/storage/database.ts` 增加最小 repository 接口实现。这里不要把 schema 设计成大而全，第一版只满足 pipeline：

```ts
listSessionRecords(mode: 'full' | 'incremental'): SessionRecord[] {
  // 若已有会话表，直接查询
  // 若当前仅能从已持久化原文表/事件表构建，就在这里做规范化映射
}
```

如果执行时发现当前数据库根本没有 session 原文来源，先在此任务内补一张最小 `session_records` / `session_messages` 表与对应写入路径；不要把“无 session 数据”留到后面再补。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-session-source.test.ts __tests__/unit/memory-pipeline-stages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/contracts/session-record.ts packages/cli/src/memory-pipeline/sources/session-record-source.ts packages/cli/src/memory-pipeline/sources/claude-session-source.ts packages/cli/src/memory-pipeline/stages/collect-claude-sessions.ts packages/cli/src/storage/database.ts packages/cli/__tests__/unit/memory-pipeline-session-source.test.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts
git commit -m "feat: add normalized session record source for memory pipeline"
```

---

### Task 3: 固化 prompt assets 与 Markdown contract

**Files:**
- Create: `packages/cli/src/memory-pipeline/contracts/memory-documents.ts`
- Create: `packages/cli/src/memory-pipeline/prompts/memory-types.ts`
- Create: `packages/cli/src/memory-pipeline/prompts/what-not-to-save.ts`
- Create: `packages/cli/src/memory-pipeline/prompts/raw-extraction-prompt.ts`
- Create: `packages/cli/src/memory-pipeline/prompts/final-merge-prompt.ts`
- Create: `packages/cli/src/memory-pipeline/markdown/raw-memory-parser.ts`
- Create: `packages/cli/src/memory-pipeline/markdown/memory-writer.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-prompts.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-markdown.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 prompt 与 Markdown contract**

在 `packages/cli/__tests__/unit/memory-pipeline-prompts.test.ts` 中验证 prompt 基线片段：

```ts
it('builds raw extraction prompt with required invariant sections', () => {
  const prompt = buildRawExtractionPrompt({ session: fixtureSession });
  expect(prompt).toContain('You are acting as the memory extraction subagent');
  expect(prompt).toContain('## Types of memory');
  expect(prompt).toContain('## What NOT to save in memory');
  expect(prompt).toContain('If a session has NO memories worth extracting, output exactly: <!-- NO_MEMORIES -->');
});

it('builds final merge prompt with required merge rules', () => {
  const prompt = buildFinalMergePrompt({ rawMemories: [], existingFinal: [] });
  expect(prompt).toContain('Dedup by semantics, not filenames');
  expect(prompt).toContain('Resolve conflicts explicitly');
  expect(prompt).toContain('Drop stale project memories');
});
```

在 `packages/cli/__tests__/unit/memory-pipeline-markdown.test.ts` 中验证 parser/writer：

```ts
it('parses raw memory blocks with FILE comments and frontmatter', () => {
  const parsed = parseRawMemoryDocument(`<!-- FILE: private/user_preference_small_prs.md -->\n\`\`\`markdown\n---\nname: Prefers small PRs\ndescription: User prefers small PRs\ntype: feedback\nscope: private\nsource_session: sess-1\n---\n\nUser prefers small PRs.\n\`\`\``);
  expect(parsed.entries[0].targetPath).toBe('private/user_preference_small_prs.md');
});

it('renders MEMORY.md as one-line semantic hooks', () => {
  expect(renderMemoryIndex([{ title: 'Prefers small PRs', href: 'small-prs.md', hook: 'Use narrowly scoped changes.' }]))
    .toBe('- [Prefers small PRs](small-prs.md) — Use narrowly scoped changes.');
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-prompts.test.ts __tests__/unit/memory-pipeline-markdown.test.ts`

Expected: FAIL，提示 prompt builders / parser / writer 缺失。

- [ ] **Step 3: 实现 prompt assets 与 Markdown helpers**

在 `packages/cli/src/memory-pipeline/prompts/memory-types.ts`：

```ts
export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
```

在 `packages/cli/src/memory-pipeline/prompts/raw-extraction-prompt.ts`：

```ts
export function buildRawExtractionPrompt({ session }: { session: SessionRecord }): string {
  return [
    'You are acting as the memory extraction subagent',
    'Do not attempt to investigate or verify that content further',
    '## Types of memory',
    MEMORY_TYPES.map((type) => `- ${type}`).join('\n'),
    '## What NOT to save in memory',
    WHAT_NOT_TO_SAVE,
    '## Output format',
    RAW_OUTPUT_FORMAT_EXAMPLE,
    serializeSession(session),
  ].join('\n\n');
}
```

在 `packages/cli/src/memory-pipeline/markdown/raw-memory-parser.ts` 提供：

```ts
export function parseRawMemoryDocument(markdown: string): ParsedRawMemoryDocument {
  // 识别 <!-- NO_MEMORIES -->
  // 解析 <!-- FILE: ... --> + fenced markdown block
  // 解析 frontmatter 与 body
}
```

在 `packages/cli/src/memory-pipeline/markdown/memory-writer.ts` 提供：

```ts
export function renderFinalMemory(memory: FinalMemoryDocument): string
export function renderRawMemory(memory: RawMemoryDocument): string
export function renderMemoryIndex(entries: MemoryIndexEntry[]): string
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-prompts.test.ts __tests__/unit/memory-pipeline-markdown.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/contracts/memory-documents.ts packages/cli/src/memory-pipeline/prompts/memory-types.ts packages/cli/src/memory-pipeline/prompts/what-not-to-save.ts packages/cli/src/memory-pipeline/prompts/raw-extraction-prompt.ts packages/cli/src/memory-pipeline/prompts/final-merge-prompt.ts packages/cli/src/memory-pipeline/markdown/raw-memory-parser.ts packages/cli/src/memory-pipeline/markdown/memory-writer.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-prompts.test.ts packages/cli/__tests__/unit/memory-pipeline-markdown.test.ts
git commit -m "feat: add memory prompt assets and markdown contracts"
```

---

### Task 4: 落地 Phase 1 raw extraction

**Files:**
- Create: `packages/cli/src/memory-pipeline/stages/extract-raw-memories.ts`
- Modify: `packages/cli/src/memory-pipeline/processors/model-processor.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Modify: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Modify: `packages/cli/__tests__/integration/memory-command.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 raw extraction 行为**

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 新增：

```ts
it('extracts one raw markdown artifact per session', async () => {
  const processor: ModelProcessor = {
    process: vi.fn(async () => ({
      outputs: [
        '<!-- FILE: private/user_preference_small_prs.md -->\n```markdown\n---\nname: Prefers small PRs\ndescription: User prefers small PRs\ntype: feedback\nscope: private\nsource_session: sess-1\n---\n\nUser prefers small PRs.\n```',
      ],
    })),
  };

  const stage = new ExtractRawMemoriesStage({ processor });
  await seedSessionBatchArtifact(store, 'run-test', [fixtureSessionWorkItem]);
  const result = await stage.run(createContext(store));

  expect(result.outputCount).toBe(1);
  const artifact = await store.listArtifacts({ runId: 'run-test', source: 'extract-raw-memories' });
  const body = await store.readArtifact(artifact[0].id);
  expect(body).toContain('source_session: sess-1');
});
```

在 `packages/cli/__tests__/integration/memory-command.test.ts` 增加：

```ts
it('builds full and incremental pipelines from the same raw extraction stage', async () => {
  const result = await runMemoryPipeline('full', overrides);
  expect(result.pipelineId).toBe('init-memory-pipeline');
  expect(result.stages.map((stage) => stage.stageId)).toContain('extract-raw-memories');
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`

Expected: FAIL，提示新 stage / pipeline wiring 缺失。

- [ ] **Step 3: 实现 raw extraction stage**

在 `packages/cli/src/memory-pipeline/stages/extract-raw-memories.ts`：

```ts
export class ExtractRawMemoriesStage implements MemoryPipelineStage {
  readonly id = 'extract-raw-memories';

  constructor(private readonly options: { processor?: ModelProcessor } = {}) {}

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const sessionArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      source: 'collect-claude-sessions',
    });

    let outputCount = 0;
    const artifactIds: string[] = [];

    for (const descriptor of sessionArtifacts) {
      const payload = JSON.parse(await context.artifactStore.readArtifact(descriptor.id)) as SessionRecordWorkItem[];
      for (const workItem of payload) {
        const session = workItem.metadata as SessionRecord;
        const prompt = buildRawExtractionPrompt({ session });
        const result = await this.processor.process([prompt]);
        const markdown = result.outputs[0] ?? '<!-- NO_MEMORIES -->';
        const rawArtifact = await context.artifactStore.writeArtifact({
          runId: context.runId,
          kind: 'raw-memory-batch',
          source: this.id,
          body: JSON.stringify({ sessionId: session.sessionId, markdown }),
          metadata: { sessionId: session.sessionId },
        });
        artifactIds.push(rawArtifact.id);
        outputCount += 1;
      }
    }

    return { stageId: this.id, status: 'success', inputCount: outputCount, outputCount, artifactIds };
  }
}
```

把 `init-pipeline.ts` 与 `scheduled-pipeline.ts` 都改成共享的前三步：

```ts
stages: [
  new CollectClaudeSessionsStage(sessionSource),
  new ExtractRawMemoriesStage({ processor }),
  new MergeFinalMemoriesStage({ processor }),
]
```

第一版不要保留 `summarize-*` 旧 stage 在主路径里混跑。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/stages/extract-raw-memories.ts packages/cli/src/memory-pipeline/processors/model-processor.ts packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts packages/cli/__tests__/integration/memory-command.test.ts
git commit -m "feat: implement phase-1 raw memory extraction stage"
```

---

### Task 5: 落地 Phase 2 final merge，并把 Markdown 文件真正写到 memory root

**Files:**
- Create: `packages/cli/src/memory-pipeline/stages/merge-final-memories.ts`
- Modify: `packages/cli/src/memory-pipeline/contracts/memory-documents.ts`
- Modify: `packages/cli/src/memory-pipeline/markdown/memory-writer.ts`
- Modify: `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Modify: `packages/cli/__tests__/integration/memory-command.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 final merge 与落盘语义**

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 增加：

```ts
it('merges raw memories into final private/team markdown files and indexes', async () => {
  await seedRawMemoryArtifact(store, 'run-test', {
    sessionId: 'sess-1',
    markdown: '<!-- FILE: private/user_preference_small_prs.md -->\n```markdown\n---\nname: Prefers small PRs\ndescription: User prefers small PRs\ntype: feedback\nscope: private\nsource_session: sess-1\n---\n\nUser prefers small PRs.\n```',
  });

  const processor: ModelProcessor = {
    process: vi.fn(async () => ({
      outputs: [
        [
          '<!-- FILE: private/prefers_small_prs.md -->',
          '```markdown',
          '---',
          'name: Prefers small PRs',
          'description: Use narrowly scoped changes.',
          'type: feedback',
          'scope: private',
          'merged_from:',
          '  - sess-1',
          '---',
          '',
          'User prefers small PRs.',
          '```',
          '',
          '<!-- FILE: private/MEMORY.md -->',
          '```markdown',
          '- [Prefers small PRs](prefers_small_prs.md) — Use narrowly scoped changes.',
          '```',
        ].join('\n'),
      ],
    })),
  };

  const stage = new MergeFinalMemoriesStage({ processor, memoryRoot });
  const result = await stage.run(createContext(store));
  expect(result.outputCount).toBeGreaterThan(0);
  await expect(fs.readFile(path.join(memoryRoot, 'final/private/prefers_small_prs.md'), 'utf8')).resolves.toContain('merged_from');
});
```

在 `packages/cli/__tests__/integration/memory-command.test.ts` 增加：

```ts
it('writes raw and final memory files under the configured memory root', async () => {
  const result = await runMemoryPipeline('incremental', overrides);
  expect(result.status).toBe('success');
  await expect(fs.access(path.join(configDir, 'memory', 'final/private/MEMORY.md'))).resolves.toBeUndefined();
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`

Expected: FAIL，提示 `MergeFinalMemoriesStage` / final writer 缺失。

- [ ] **Step 3: 实现 final merge 与写盘**

在 `packages/cli/src/memory-pipeline/stages/merge-final-memories.ts`：

```ts
export class MergeFinalMemoriesStage implements MemoryPipelineStage {
  readonly id = 'merge-final-memories';

  constructor(
    private readonly options: {
      processor?: ModelProcessor;
      memoryRoot: string;
    },
  ) {}

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const rawArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      source: 'extract-raw-memories',
    });

    const rawInputs = await Promise.all(
      rawArtifacts.map(async (descriptor) => JSON.parse(await context.artifactStore.readArtifact(descriptor.id))),
    );
    const existingFinal = await loadExistingFinalMemories(this.options.memoryRoot);
    const prompt = buildFinalMergePrompt({ rawMemories: rawInputs, existingFinal });
    const result = await this.processor.process([prompt]);
    const output = result.outputs[0] ?? '';
    const files = parseRawMemoryDocumentSet(output);
    await writeFinalMemoryOutputs(this.options.memoryRoot, files);

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'final-memory-batch',
      source: this.id,
      body: JSON.stringify(files.map((file) => file.targetPath)),
    });

    return {
      stageId: this.id,
      status: 'success',
      inputCount: rawInputs.length,
      outputCount: files.length,
      artifactIds: [descriptor.id],
    };
  }
}
```

这里必须同时满足 spec：

- raw files 写到 `memory/raw/<session-id>.memories.md`
- final files 写到 `memory/final/private/*.md` 或 `memory/final/team/*.md`
- `MEMORY.md` 一行一条，不承载全文
- 再次执行 exclusion/scope/deletion/stale rules，不把 raw 当无条件可信输入

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/stages/merge-final-memories.ts packages/cli/src/memory-pipeline/contracts/memory-documents.ts packages/cli/src/memory-pipeline/markdown/memory-writer.ts packages/cli/src/memory-pipeline/artifacts/artifact-store.ts packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts packages/cli/__tests__/integration/memory-command.test.ts
git commit -m "feat: implement phase-2 final memory merge and markdown writes"
```

---

### Task 6: 接通命令入口，清理旧 skeleton，并完成回归验证

**Files:**
- Modify: `packages/cli/src/cli/commands/memory.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Modify: `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`
- Modify: `packages/cli/__tests__/integration/memory-command.test.ts`
- Modify: `packages/cli/__tests__/unit/memory-pipeline-types.test.ts`

- [ ] **Step 1: 写 failing tests，锁定对外入口与回归行为**

在 `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts` 增加：

```ts
it('scheduled trigger still invokes the incremental memory pipeline after the session-based rewrite', async () => {
  const runnerSpy = vi.spyOn(memoryCommand, 'runMemoryPipeline').mockResolvedValue({
    runId: 'run-memory-cadence',
    pipelineId: 'scheduled-memory-pipeline',
    status: 'success',
    stages: [
      { stageId: 'collect-claude-sessions', status: 'success', inputCount: 1, outputCount: 1, artifactIds: ['a'] },
      { stageId: 'extract-raw-memories', status: 'success', inputCount: 1, outputCount: 1, artifactIds: ['b'] },
      { stageId: 'merge-final-memories', status: 'success', inputCount: 1, outputCount: 2, artifactIds: ['c'] },
    ],
  });
  // 保持现有 cadence 触发断言
});
```

在 `packages/cli/__tests__/integration/memory-command.test.ts` 增加：

```ts
it('prints a run result containing the new phase stage ids', async () => {
  await runCommand.parseAsync(['memory', 'run', '--incremental'], { from: 'user' });
  expect(printer).toHaveBeenCalledWith(
    expect.objectContaining({
      stages: expect.arrayContaining([
        expect.objectContaining({ stageId: 'extract-raw-memories' }),
        expect.objectContaining({ stageId: 'merge-final-memories' }),
      ]),
    }),
  );
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/integration/heartbeat-memory-pipeline.test.ts __tests__/integration/memory-command.test.ts`

Expected: FAIL，提示命令与 heartbeat 仍依赖旧 stage 语义或旧依赖注入。

- [ ] **Step 3: 完成 wiring 和 skeleton 清理**

在 `packages/cli/src/cli/commands/memory.ts`：

```ts
createSessionSource: (mode, db) =>
  new DatabaseSessionRecordSource({
    repository: {
      listSessions: async ({ mode }) => db.listSessionRecords(mode),
    },
    mode,
  }),
```

并把 `runRoot` 与 `memoryRoot` 区分清楚：

```ts
const runRoot = path.join(configDir, 'memory-pipeline');
const memoryRoot = path.join(configDir, 'memory');
```

随后删除旧 skeleton stage 在 barrel、pipelines、测试里的主路径引用，只保留兼容层或直接移除。不要让 `summarize-session-batch` 和 `extract-raw-memories` 同时作为生产路径存在。

- [ ] **Step 4: 运行完整验证**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-types.test.ts __tests__/unit/memory-pipeline-artifact-store.test.ts __tests__/unit/memory-pipeline-session-source.test.ts __tests__/unit/memory-pipeline-prompts.test.ts __tests__/unit/memory-pipeline-markdown.test.ts __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: PASS

Run: `cd packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/commands/memory.ts packages/cli/src/cli/index.ts packages/cli/src/index.ts packages/cli/src/engine/heartbeat.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts packages/cli/__tests__/integration/memory-command.test.ts packages/cli/__tests__/unit/memory-pipeline-types.test.ts
git commit -m "refactor: wire session-based memory extraction pipeline end-to-end"
```

---

## Verification Checklist

- [ ] `memory run --full` 走 `collect-claude-sessions -> extract-raw-memories -> merge-final-memories`
- [ ] `memory run --incremental` 使用相同处理语义，只缩小 session 输入范围
- [ ] `memory/raw/<session-id>.memories.md` 对每个 session 至少生成一份产物，或写入 `<!-- NO_MEMORIES -->`
- [ ] `memory/final/private/` 与 `memory/final/team/` 生成 canonical memory files
- [ ] `memory/final/private/MEMORY.md` 与 `memory/final/team/MEMORY.md` 符合一行一条 contract
- [ ] deletion marker 会在 Phase 2 生效，而不是在 Phase 1 直接改 final
- [ ] exclusion list 和 scope rules 在 Phase 1、Phase 2 都有覆盖
- [ ] heartbeat 仍只负责触发，不内嵌新的合并逻辑

## Risks To Watch During Execution

- 如果当前数据库没有真正的 session transcript 存储，Task 2 会膨胀，这是本计划的最大风险。不要把它回避成“先用 stub 跑通”。
- Prompt assets 很容易在抽象时漂移。每次改 prompt builder 都要对照 spec 原文，不要为了复用而改语义。
- Final merge output 需要可稳定解析。若直接让模型同时输出多个 final files 与两个 index 文件，parser 必须先写测试再实现。
- 增量更新第一版不要追求复杂的最小 diff 策略，只要保证局部更新后整套 final memory 语义正确。

## Plan Review Note

按 `writing-plans` skill，本应再跑一次独立的计划文档 reviewer。当前会话没有用户授权我启用子代理，所以这里先做本地自审并把风险点显式写出；若你要，我下一步可以单独按 reviewer 流程再审一次这份计划。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-02-memory-extraction-and-merge-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
