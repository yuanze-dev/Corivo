# Memory Pipeline Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/cli` 中落地一套可扩展的 memory pipeline framework，支持初始化/手动触发的全量多层加工，以及定时触发的增量加工，并为后续 Claude-specific stages 留出稳定接入口。

**Architecture:** 该实现以 `memory-pipeline/` 目录为中心，新增 `pipeline -> stage -> artifact` 三层结构，统一由 runner 执行并将结果落入 `~/.corivo/memory/`。`heartbeat` 与 CLI 只负责触发，`extraction/` 继续只负责单次 provider 调用，不承担流程编排。首版优先交付 skeleton、状态管理、artifact store、空壳 stage 与触发入口，不强行完成 Claude session 扫描、prompt 策略或 index 算法。

**Tech Stack:** TypeScript ESM, Node.js fs/path APIs, existing CLI command architecture, existing heartbeat engine, Vitest

**Spec:** [2026-04-01-memory-pipeline-framework-design.md](/Users/airbo/Developer/corivo/Corivo/docs/superpowers/specs/2026-04-01-memory-pipeline-framework-design.md)

---

## 文件变更地图

**新建：**
- `packages/cli/src/memory-pipeline/types.ts` — pipeline/stage/artifact/run 状态的核心类型
- `packages/cli/src/memory-pipeline/index.ts` — framework 导出入口
- `packages/cli/src/memory-pipeline/runner.ts` — pipeline runner，负责顺序执行、manifest 持久化、错误汇总
- `packages/cli/src/memory-pipeline/registry.ts` — pipeline 注册与查找
- `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts` — artifact 目录管理、descriptor 持久化
- `packages/cli/src/memory-pipeline/state/run-lock.ts` — 运行锁
- `packages/cli/src/memory-pipeline/state/run-manifest.ts` — run manifest 读写
- `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts` — init/manual pipeline definition
- `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts` — scheduled pipeline definition
- `packages/cli/src/memory-pipeline/stages/collect-claude-sessions.ts` — 空壳 stage，先产出 work item artifact
- `packages/cli/src/memory-pipeline/stages/summarize-session-batch.ts` — 空壳 stage
- `packages/cli/src/memory-pipeline/stages/consolidate-session-summaries.ts` — 空壳 stage
- `packages/cli/src/memory-pipeline/stages/collect-stale-blocks.ts` — 首版 block selector
- `packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts` — 空壳 stage
- `packages/cli/src/memory-pipeline/stages/append-detail-records.ts` — detail artifact writer
- `packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts` — init 侧 index stage
- `packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts` — scheduled 侧 index stage
- `packages/cli/src/memory-pipeline/processors/model-processor.ts` — 模型处理接口与默认 no-op 实现
- `packages/cli/src/memory-pipeline/sources/claude-session-source.ts` — session source 接口与默认 stub
- `packages/cli/src/memory-pipeline/sources/stale-block-source.ts` — 基于 DB 的 stale block source
- `packages/cli/src/cli/commands/memory.ts` — 手动触发 pipeline 的命令入口
- `packages/cli/__tests__/unit/memory-pipeline-types.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-registry.test.ts`
- `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- `packages/cli/__tests__/integration/memory-command.test.ts`
- `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`

**修改：**
- `packages/cli/src/index.ts` — 导出 memory pipeline 公共接口
- `packages/cli/src/cli/index.ts` — 注册 `memory` 命令
- `packages/cli/src/engine/heartbeat.ts` — 接入 scheduled pipeline trigger
- `packages/cli/src/cli/context/types.ts` — 如 runner 需要，补充路径能力或写文件能力
- `packages/cli/src/cli/context/create-context.ts` — 为 runner/command 提供所需 fs 能力

**暂不纳入本计划：**
- Claude session 的真实扫描实现
- Claude prompt 与 chunk/merge 策略
- 真实的 memory index 算法
- DB schema 迁移来保存 pipeline 状态
- 多 pipeline 并发执行

---

### Task 1: 定义 memory pipeline 核心类型

**Files:**
- Create: `packages/cli/src/memory-pipeline/types.ts`
- Create: `packages/cli/__tests__/unit/memory-pipeline-types.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: 写 failing test，锁定 framework 最小 contract**

在 `packages/cli/__tests__/unit/memory-pipeline-types.test.ts` 中定义并验证：

```ts
import { describe, expect, it } from 'vitest';
import type {
  PipelineTrigger,
  WorkItem,
  ArtifactDescriptor,
  PipelineStageResult,
  MemoryPipelineDefinition,
} from '../../src/memory-pipeline/types.js';

describe('memory pipeline types', () => {
  it('defines supported trigger types', () => {
    const trigger: PipelineTrigger = { type: 'manual', runAt: Date.now() };
    expect(trigger.type).toBe('manual');
  });

  it('supports session and block work items', () => {
    const session: WorkItem = { id: 's1', kind: 'session', sourceRef: 'src' };
    const block: WorkItem = { id: 'b1', kind: 'block', sourceRef: 'db' };
    expect(session.kind).toBe('session');
    expect(block.kind).toBe('block');
  });

  it('models stage output with artifact ids', () => {
    const result: PipelineStageResult = {
      stageId: 'collect',
      status: 'success',
      inputCount: 0,
      outputCount: 1,
      artifactIds: ['art1'],
    };
    expect(result.artifactIds).toEqual(['art1']);
  });

  it('supports named pipeline definitions', () => {
    const pipeline: MemoryPipelineDefinition = { id: 'init-memory-pipeline', stages: [] };
    expect(pipeline.id).toBe('init-memory-pipeline');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-types.test.ts`

Expected: FAIL，提示 `src/memory-pipeline/types.ts` 不存在。

- [ ] **Step 3: 写最小类型实现**

在 `packages/cli/src/memory-pipeline/types.ts` 中定义：

```ts
export interface PipelineTrigger {
  type: 'init' | 'manual' | 'scheduled';
  requestedBy?: string;
  runAt: number;
  scope?: Record<string, unknown>;
}

export interface WorkItem {
  id: string;
  kind: 'session' | 'block' | 'summary' | 'index-fragment';
  sourceRef: string;
  freshnessToken?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactDescriptor {
  id: string;
  kind: string;
  version: number;
  path: string;
  source: string;
  createdAt: number;
  upstreamIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface PipelineStageResult {
  stageId: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  inputCount: number;
  outputCount: number;
  artifactIds: string[];
  cursor?: string;
  error?: string;
}

export interface MemoryPipelineContext {
  runId: string;
  trigger: PipelineTrigger;
  artifactStore: unknown;
  logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export interface MemoryPipelineStage {
  id: string;
  run(context: MemoryPipelineContext): Promise<PipelineStageResult>;
}

export interface MemoryPipelineDefinition {
  id: 'init-memory-pipeline' | 'scheduled-memory-pipeline';
  stages: MemoryPipelineStage[];
}
```

在 `packages/cli/src/index.ts` 增加：

```ts
export * from './memory-pipeline/index.js';
```

- [ ] **Step 4: 新建 `packages/cli/src/memory-pipeline/index.ts` 并导出 types**

```ts
export * from './types.js';
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-types.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/memory-pipeline/types.ts packages/cli/src/memory-pipeline/index.ts packages/cli/src/index.ts packages/cli/__tests__/unit/memory-pipeline-types.test.ts
git commit -m "feat: define memory pipeline core contracts"
```

---

### Task 2: 实现 artifact store 与 run manifest

**Files:**
- Create: `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`
- Create: `packages/cli/src/memory-pipeline/state/run-manifest.ts`
- Create: `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`

- [ ] **Step 1: 写 failing test，锁定 artifact 目录结构与 descriptor 落盘**

在 `packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts` 中使用临时目录验证：

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../../src/memory-pipeline/artifacts/artifact-store.js';

describe('ArtifactStore', () => {
  it('creates detail and index artifact directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const store = new ArtifactStore(root);
    const descriptor = await store.writeArtifact({
      kind: 'detail-record',
      source: 'test',
      body: 'hello',
    });

    expect(descriptor.path).toContain(path.join('artifacts', 'detail'));
  });

  it('persists a run manifest file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const manifestPath = path.join(root, 'runs', 'run_1', 'manifest.json');
    await writeRunManifest(manifestPath, {
      runId: 'run_1',
      pipelineId: 'init-memory-pipeline',
      trigger: 'manual',
      status: 'running',
      stages: [],
    });
    const content = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(content.runId).toBe('run_1');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-artifact-store.test.ts`

Expected: FAIL，提示模块缺失。

- [ ] **Step 3: 写最小 `ArtifactStore`**

在 `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts` 实现：

- 构造参数为 root path
- `writeArtifact()` 至少支持：
  - `detail-record` 写入 `artifacts/detail/`
  - `memory-index` 写入 `artifacts/index/`
  - 其它 kind 默认写入 `runs/<run-id>/stages/`
- 返回 `ArtifactDescriptor`

建议接口：

```ts
export class ArtifactStore {
  constructor(private readonly rootDir: string) {}

  async writeArtifact(input: {
    runId?: string;
    kind: string;
    source: string;
    body: string;
    upstreamIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactDescriptor> { /* ... */ }
}
```

- [ ] **Step 4: 写最小 `run-manifest.ts`**

实现：

```ts
export async function writeRunManifest(filePath: string, manifest: {
  runId: string;
  pipelineId: string;
  trigger: string;
  status: string;
  stages: unknown[];
}): Promise<void>;
```

同时补一个 `readRunManifest()` 供后续 runner 测试使用。

- [ ] **Step 5: 更新导出**

在 `packages/cli/src/memory-pipeline/index.ts` 增加：

```ts
export * from './artifacts/artifact-store.js';
export * from './state/run-manifest.js';
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-artifact-store.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/memory-pipeline/artifacts/artifact-store.ts packages/cli/src/memory-pipeline/state/run-manifest.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-artifact-store.test.ts
git commit -m "feat: add memory pipeline artifact store"
```

---

### Task 3: 实现 runner、registry 与 run lock

**Files:**
- Create: `packages/cli/src/memory-pipeline/runner.ts`
- Create: `packages/cli/src/memory-pipeline/registry.ts`
- Create: `packages/cli/src/memory-pipeline/state/run-lock.ts`
- Create: `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`
- Create: `packages/cli/__tests__/unit/memory-pipeline-registry.test.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`

- [ ] **Step 1: 写 failing test，锁定顺序执行与 manifest 更新**

在 `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts` 中定义：

```ts
import { describe, expect, it, vi } from 'vitest';
import { MemoryPipelineRunner } from '../../src/memory-pipeline/runner.js';

describe('MemoryPipelineRunner', () => {
  it('runs stages in order and records their results', async () => {
    const calls: string[] = [];
    const runner = new MemoryPipelineRunner(/* temp store + no-op logger */);

    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        { id: 'a', run: async () => { calls.push('a'); return { stageId: 'a', status: 'success', inputCount: 0, outputCount: 1, artifactIds: [] }; } },
        { id: 'b', run: async () => { calls.push('b'); return { stageId: 'b', status: 'success', inputCount: 1, outputCount: 1, artifactIds: [] }; } },
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(calls).toEqual(['a', 'b']);
    expect(result.status).toBe('success');
    expect(result.stages).toHaveLength(2);
  });

  it('stops on a failed stage', async () => {
    // first success, second failed, third never runs
  });
});
```

在 `packages/cli/__tests__/unit/memory-pipeline-registry.test.ts` 中验证：

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryPipelineRegistry } from '../../src/memory-pipeline/registry.js';

describe('memory pipeline registry', () => {
  it('returns init and scheduled pipeline definitions by id', () => {
    const registry = createMemoryPipelineRegistry([]);
    expect(typeof registry.get).toBe('function');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-runner.test.ts __tests__/unit/memory-pipeline-registry.test.ts`

Expected: FAIL，提示 runner/registry 缺失。

- [ ] **Step 3: 实现 `run-lock.ts`**

首版用文件锁即可，要求：

- lock 文件路径可配置
- `acquire()` 已加锁时抛出可读错误
- `release()` 幂等

建议接口：

```ts
export class FileRunLock {
  constructor(private readonly lockPath: string) {}
  async acquire(runId: string): Promise<void> {}
  async release(): Promise<void> {}
}
```

- [ ] **Step 4: 实现 `runner.ts`**

要求：

- 自动生成 `runId`
- 创建初始 manifest
- 顺序执行 pipeline stages
- 每个 stage 完成后更新 manifest
- 遇到 `failed` 立即停止并写最终状态
- 确保释放 run lock

建议返回值：

```ts
{
  runId: string;
  pipelineId: string;
  status: 'success' | 'failed';
  stages: PipelineStageResult[];
}
```

- [ ] **Step 5: 实现 `registry.ts`**

要求：

- 提供 `register()` 与 `get()`
- 支持按 `init-memory-pipeline` / `scheduled-memory-pipeline` 查找

- [ ] **Step 6: 更新导出**

在 `packages/cli/src/memory-pipeline/index.ts` 中增加：

```ts
export * from './runner.js';
export * from './registry.js';
export * from './state/run-lock.js';
```

- [ ] **Step 7: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-runner.test.ts __tests__/unit/memory-pipeline-registry.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/memory-pipeline/runner.ts packages/cli/src/memory-pipeline/registry.ts packages/cli/src/memory-pipeline/state/run-lock.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-runner.test.ts packages/cli/__tests__/unit/memory-pipeline-registry.test.ts
git commit -m "feat: add memory pipeline runner and registry"
```

---

### Task 4: 定义 source 与 processor 扩展口

**Files:**
- Create: `packages/cli/src/memory-pipeline/processors/model-processor.ts`
- Create: `packages/cli/src/memory-pipeline/sources/claude-session-source.ts`
- Create: `packages/cli/src/memory-pipeline/sources/stale-block-source.ts`
- Create: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`

- [ ] **Step 1: 写 failing test，锁定 source/processor 最小行为**

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 中定义：

```ts
import { describe, expect, it } from 'vitest';
import { NoopModelProcessor } from '../../src/memory-pipeline/processors/model-processor.js';
import { DatabaseStaleBlockSource } from '../../src/memory-pipeline/sources/stale-block-source.js';

describe('memory pipeline extension points', () => {
  it('provides a no-op model processor for skeleton stages', async () => {
    const processor = new NoopModelProcessor();
    const result = await processor.process(['hello']);
    expect(result.outputs).toEqual(['hello']);
  });

  it('supports collecting stale blocks from db-backed source', async () => {
    const source = new DatabaseStaleBlockSource({
      queryBlocks: () => [{ id: 'b1', content: 'x', source: 'test' }],
    } as any);
    const items = await source.collect();
    expect(items[0]?.kind).toBe('block');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现 `model-processor.ts`**

定义接口：

```ts
export interface ModelProcessor {
  process(inputs: string[]): Promise<{ outputs: string[]; metadata?: Record<string, unknown> }>;
}
```

实现默认空壳：

```ts
export class NoopModelProcessor implements ModelProcessor {
  async process(inputs: string[]) {
    return { outputs: inputs };
  }
}
```

- [ ] **Step 4: 实现 `claude-session-source.ts` 与 `stale-block-source.ts`**

要求：

- `claude-session-source.ts` 先只导出接口和默认 stub，返回空数组
- `stale-block-source.ts` 使用现有 DB `queryBlocks()` 构造 `WorkItem[]`

建议接口：

```ts
export interface ClaudeSessionSource {
  collect(): Promise<WorkItem[]>;
}

export class StubClaudeSessionSource implements ClaudeSessionSource {
  async collect(): Promise<WorkItem[]> {
    return [];
  }
}

export class DatabaseStaleBlockSource {
  constructor(private readonly db: { queryBlocks: (filter?: Record<string, unknown>) => Array<{ id: string; source: string }> }) {}
  async collect(): Promise<WorkItem[]> { /* map to kind:block */ }
}
```

- [ ] **Step 5: 更新导出**

在 `packages/cli/src/memory-pipeline/index.ts` 中增加 exports。

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/memory-pipeline/processors/model-processor.ts packages/cli/src/memory-pipeline/sources/claude-session-source.ts packages/cli/src/memory-pipeline/sources/stale-block-source.ts packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts
git commit -m "feat: add memory pipeline source and processor contracts"
```

---

### Task 5: 落地 init 与 scheduled pipeline definitions

**Files:**
- Create: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Create: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Create: `packages/cli/src/memory-pipeline/stages/collect-claude-sessions.ts`
- Create: `packages/cli/src/memory-pipeline/stages/summarize-session-batch.ts`
- Create: `packages/cli/src/memory-pipeline/stages/consolidate-session-summaries.ts`
- Create: `packages/cli/src/memory-pipeline/stages/collect-stale-blocks.ts`
- Create: `packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts`
- Create: `packages/cli/src/memory-pipeline/stages/append-detail-records.ts`
- Create: `packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts`
- Create: `packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`

- [ ] **Step 1: 写 failing test，锁定两条 pipeline 的 stage 顺序**

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 中新增：

```ts
import { createInitMemoryPipeline } from '../../src/memory-pipeline/pipelines/init-pipeline.js';
import { createScheduledMemoryPipeline } from '../../src/memory-pipeline/pipelines/scheduled-pipeline.js';

it('builds init pipeline with the expected stages', () => {
  const pipeline = createInitMemoryPipeline(/* deps */);
  expect(pipeline.stages.map((stage) => stage.id)).toEqual([
    'collect-claude-sessions',
    'summarize-session-batch',
    'consolidate-session-summaries',
    'append-detail-records',
    'rebuild-memory-index',
  ]);
});

it('builds scheduled pipeline with the expected stages', () => {
  const pipeline = createScheduledMemoryPipeline(/* deps */);
  expect(pipeline.stages.map((stage) => stage.id)).toEqual([
    'collect-stale-blocks',
    'summarize-block-batch',
    'append-detail-records',
    'refresh-memory-index',
  ]);
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现所有 stage 的最小空壳**

要求：

- 每个 stage 都返回合法的 `PipelineStageResult`
- 不要在首版把真实 Claude 调用写进 stage
- `collect-*` stages 先产出 work-item artifact
- `append-detail-records` 先把输入摘要转成 detail artifact 文本
- `rebuild-memory-index` / `refresh-memory-index` 先写最小 JSON 占位索引

例如：

```ts
export class AppendDetailRecordsStage implements MemoryPipelineStage {
  id = 'append-detail-records';

  constructor(private readonly store: ArtifactStore) {}

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifact = await this.store.writeArtifact({
      runId: context.runId,
      kind: 'detail-record',
      source: this.id,
      body: JSON.stringify({ runId: context.runId }),
    });

    return {
      stageId: this.id,
      status: 'success',
      inputCount: 1,
      outputCount: 1,
      artifactIds: [artifact.id],
    };
  }
}
```

- [ ] **Step 4: 实现 pipeline factory**

要求：

- `createInitMemoryPipeline()` 返回固定顺序 stages
- `createScheduledMemoryPipeline()` 返回固定顺序 stages

- [ ] **Step 5: 更新导出**

在 `packages/cli/src/memory-pipeline/index.ts` 中导出 pipelines 与 stages。

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/memory-pipeline/pipelines packages/cli/src/memory-pipeline/stages packages/cli/src/memory-pipeline/index.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts
git commit -m "feat: scaffold memory pipeline stages"
```

---

### Task 6: 加入 CLI 手动触发入口

**Files:**
- Create: `packages/cli/src/cli/commands/memory.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Create: `packages/cli/__tests__/integration/memory-command.test.ts`

- [ ] **Step 1: 写 failing integration test，锁定命令面**

在 `packages/cli/__tests__/integration/memory-command.test.ts` 中定义：

```ts
import { describe, expect, it, vi } from 'vitest';

describe('memory command', () => {
  it('runs init pipeline for --full', async () => {
    // mock runner, invoke command action, assert pipeline id
  });

  it('runs scheduled pipeline for --incremental', async () => {
    // mock runner, invoke command action, assert pipeline id
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现命令**

在 `packages/cli/src/cli/commands/memory.ts` 中定义命令：

```ts
memory run --full
memory run --incremental
```

要求：

- `--full` 触发 `init-memory-pipeline`
- `--incremental` 触发 `scheduled-memory-pipeline`
- 未指定时默认 `--incremental`
- 命令内部只做参数解析、runner 调用和结果打印

- [ ] **Step 4: 在 `packages/cli/src/cli/index.ts` 注册命令**

参考已有 `addCommand(...)` 模式接入。

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli/commands/memory.ts packages/cli/src/cli/index.ts packages/cli/__tests__/integration/memory-command.test.ts
git commit -m "feat: add manual memory pipeline command"
```

---

### Task 7: 在 heartbeat 中接入 scheduled trigger

**Files:**
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Create: `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`

- [ ] **Step 1: 写 failing integration test，锁定 heartbeat 只触发不编排**

在 `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts` 中定义：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Heartbeat } from '../../src/engine/heartbeat.js';

describe('Heartbeat memory pipeline trigger', () => {
  it('triggers the scheduled memory pipeline on cadence', async () => {
    // inject fake runner / callback, advance cycle, assert one trigger
  });
});
```

测试目标：

- heartbeat 只触发 scheduled pipeline
- 不在 heartbeat 里直接实现 summarize / artifact 逻辑

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: FAIL

- [ ] **Step 3: 最小改造 `heartbeat.ts`**

要求：

- 新增一个独立方法，例如：

```ts
private async triggerScheduledMemoryPipeline(): Promise<void>
```

- 将该方法挂在比 5 秒更长的周期上，避免每轮 heartbeat 都触发
- 首版可以使用 no-op runner 或 feature-gated runner
- 失败仅记录日志，不影响原有 block heartbeat 主流程

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: PASS

- [ ] **Step 5: 跑回归测试**

Run: `cd packages/cli && npm run test -- __tests__/integration/heartbeat.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts`

Expected: PASS，原有 heartbeat 行为不回归。

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/engine/heartbeat.ts packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts
git commit -m "feat: trigger memory pipeline from heartbeat"
```

---

### Task 8: 接入 `extractWithProvider()` 的 processor 适配层

**Files:**
- Modify: `packages/cli/src/memory-pipeline/processors/model-processor.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/summarize-session-batch.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`

- [ ] **Step 1: 写 failing test，锁定 processor 对 extraction 的依赖边界**

在 `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts` 中新增：

```ts
import { describe, expect, it, vi } from 'vitest';
import { ExtractionBackedModelProcessor } from '../../src/memory-pipeline/processors/model-processor.js';

it('maps extraction success into processor outputs', async () => {
  const processor = new ExtractionBackedModelProcessor({
    provider: 'claude',
    extract: vi.fn().mockResolvedValue({
      provider: 'claude',
      status: 'success',
      result: 'summary',
    }),
  });

  const result = await processor.process(['hello']);
  expect(result.outputs).toEqual(['summary']);
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: FAIL

- [ ] **Step 3: 在 `model-processor.ts` 增加 extraction-backed 实现**

要求：

- 使用现有 `extractWithProvider()`
- provider 通过构造参数注入
- 处理 `success` / `error` / `timeout`
- 失败时返回可读错误，避免把 provider 细节扩散进 stage

- [ ] **Step 4: 最小接入两个 summarize stages**

要求：

- `summarize-session-batch` 调用 processor 对 session 文本批次做处理
- `summarize-block-batch` 调用 processor 对 block 文本批次做处理
- 结果先写成 summary artifacts，不在本任务里实现复杂 merge 策略

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/memory-pipeline/processors/model-processor.ts packages/cli/src/memory-pipeline/stages/summarize-session-batch.ts packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts packages/cli/__tests__/unit/memory-pipeline-stages.test.ts
git commit -m "feat: connect memory pipeline summarize stages to extraction providers"
```

---

### Task 9: 回归测试与文档收尾

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `docs/superpowers/specs/2026-04-01-memory-pipeline-framework-design.md`（如实现偏离需同步）

- [ ] **Step 1: 运行 unit test 套件**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-types.test.ts __tests__/unit/memory-pipeline-artifact-store.test.ts __tests__/unit/memory-pipeline-runner.test.ts __tests__/unit/memory-pipeline-registry.test.ts __tests__/unit/memory-pipeline-stages.test.ts`

Expected: PASS

- [ ] **Step 2: 运行 integration test 套件**

Run: `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts __tests__/integration/heartbeat-memory-pipeline.test.ts __tests__/integration/heartbeat.test.ts`

Expected: PASS

- [ ] **Step 3: 运行 package build**

Run: `cd packages/cli && npm run build`

Expected: PASS，生成最新 `dist/`

- [ ] **Step 4: 更新 `packages/cli/README.md`**

补充：

- `memory` 命令入口
- memory pipeline framework 的职责
- `~/.corivo/memory/` 目录说明

- [ ] **Step 5: 视实现结果同步 spec**

若实现中对阶段命名、目录结构、命令面有必要偏移，更新 spec 保持一致。

- [ ] **Step 6: Commit**

```bash
git add packages/cli/README.md docs/superpowers/specs/2026-04-01-memory-pipeline-framework-design.md
git commit -m "docs: document memory pipeline framework"
```

---

## 交付顺序建议

建议严格按以下依赖顺序执行：

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9

原因：

- 没有 types/store/runner，后续 stages 没有稳定依赖
- 没有 CLI/heartbeat trigger，framework 无法被真实流程使用
- `extractWithProvider()` 适配层放在后面，避免过早把 provider 细节绑死

## 明确不做的事

以下内容即使开发时很诱人，也不要顺手塞进本计划：

- 新增 DB 表保存 pipeline 状态
- 一次性做完真实 Claude session 扫描
- 提前设计复杂 index schema
- 在 heartbeat 中嵌入总结实现细节
- 在 command 中硬编码阶段执行逻辑

## 完成标准

完成本计划后，应满足：

- 仓库内存在可运行的 memory pipeline skeleton
- init/manual 与 scheduled 两条 pipeline 都可被触发
- detail/index/run artifacts 有统一落盘位置
- pipeline 有 manifest 与 run lock
- summarize stages 可以通过统一 processor 接入 `extractWithProvider()`
- heartbeat 与 CLI 只承担 trigger 角色，没有吞掉框架边界
