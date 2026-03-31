# Corivo Service Contract Architecture Design

**日期**: 2026-04-01
**状态**: 提议中
**范围**: `packages/cli` 为主，影响 `packages/plugins/*` 的边界定义

---

## 目标

把 Corivo 从“按目录分实现”的代码组织，收敛成“按能力 contract + 编排边界”组织的架构。

这轮不追求一次性重写，而是先建立稳定的 service contract、host registry 和 capability dispatch，让 CLI、daemon、runtime、宿主适配层都依赖接口，而不是直接依赖具体文件路径和硬编码分支。

## 要解决的问题

当前代码已经有能力雏形，但边界还不稳定：

- `engine/` 已经承担 heartbeat、association、consolidation、sync 等后台能力，但 job 注册是写死在 [`packages/cli/src/engine/heartbeat.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/engine/heartbeat.ts) 里的。
- `push/` 已经有推送生成能力，但 [`packages/cli/src/cli/commands/push.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/cli/commands/push.ts) 仍然自己读 config、自己拿 DB、自己决定输出。
- `runtime/` 已经定义了一层 host capability 雏形，但它只覆盖运行时 recall/review，没有覆盖 install/inject/doctor/distribute 这些宿主能力。
- `inject/` 里已经有 Codex、Cursor、OpenCode、Claude Code 的实现，但 [`packages/cli/src/cli/commands/inject.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/cli/commands/inject.ts) 仍然按宿主名 `if/else` 分发。
- `service/` 目录现在表达的是 service manager，不是 service contract，命名上容易和“业务服务层”混淆。
- `ingestors/`、`cold-scan/`、`identity/`、`engine/auto-sync.ts` 各自持有一部分业务能力，但没有统一的 service taxonomy。

结果是：

- 新增宿主接入时，主流程会被不断改写。
- CLI 命令难以复用给 daemon、plugin runtime 或后续 API 面。
- 能力发现依赖目录知识，而不是依赖显式 contract。
- “包结构”和“运行时结构”混在一起，后续拆分会越来越贵。

## 设计原则

1. 统一接口，不统一实现。
2. 先抽编排边界，再考虑目录重排。
3. 新能力通过注册注入，不通过修改主流程扇出。
4. 宿主差异优先建模为 capability，不优先建模为宿主名分支。
5. 第一阶段不大动数据库 schema，不重写 heartbeat 主循环。
6. 保持现有 CLI 行为兼容，先把内部依赖改成新 contract。

## 目标能力分类

Corivo 的核心能力收敛成 6 类 service：

### 1. MemoryService

负责 block 的存取和记忆模型相关能力：

- block CRUD
- annotation
- association read/write
- query history
- pattern / reminder / review queue 相关存取

第一阶段不要求把所有 storage method 都迁到新目录，但要求先定义 contract，后续实现可以先包住现有 [`packages/cli/src/storage/database.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/storage/database.ts)。

### 2. HeartbeatService

负责后台周期任务编排：

- pending block processing
- vitality decay
- consolidation
- association analysis
- weekly summary
- follow-up
- trigger decision
- auto sync

第一阶段先保留 [`packages/cli/src/engine/heartbeat.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/engine/heartbeat.ts) 主循环，但把“任务定义”和“任务调度”分开。

### 3. PushService

负责推送内容的生成与分发前处理：

- preview
- dispatch preparation
- dedup
- throttle
- host target selection

这里要把“生成什么推”和“推给哪个宿主”分开。

### 4. HostService

负责宿主生态交互：

- install
- uninstall
- doctor
- capability discovery
- push delivery
- rules / hooks / plugin / notify 等宿主行为执行

它是 registry + adapter 的组合，不是一个上帝对象。

### 5. SyncService

负责 solver 同步能力：

- identity
- auth challenge / verify
- changeset creation
- push / pull orchestration
- sync cursor tracking

第一阶段只定义 contract，不重构现有 `sync` 命令和 `engine/auto-sync.ts` 的内部实现。

### 6. DiscoveryService

负责离线和近实时发现：

- cold scan
- project/profile/source extractors
- realtime ingestors
- host-specific source extraction

目标是把 `cold-scan/` 和 `ingestors/` 都收敛到 discovery 范畴下，而不是继续作为平行但无契约的目录。

## 核心架构提案

### 1. 先引入 service contracts

在 `packages/cli/src/contracts/` 下定义稳定接口，建议最小集合如下：

```ts
export interface MemoryService {
  createBlock(input: CreateBlockInput): Promise<Block>;
  updateAnnotation(input: UpdateAnnotationInput): Promise<Block>;
  queryBlocks(input: QueryBlocksInput): Promise<Block[]>;
  createAssociation(input: CreateAssociationInput): Promise<Association>;
  recordQuery(input: RecordQueryInput): Promise<void>;
}

export interface PushService {
  preview(input: PushRequest): Promise<PushPreview>;
  dispatch(input: PushDispatchRequest): Promise<PushResult>;
}

export interface HostService {
  listHosts(): HostDescriptor[];
  getHost(id: HostId): HostAdapter | null;
  install(input: HostInstallRequest): Promise<HostInstallResult>;
  doctor(input: HostDoctorRequest): Promise<HostDoctorResult>;
  dispatch(input: HostDispatchRequest): Promise<HostDispatchResult>;
}

export interface SyncService {
  push(input: SyncPushRequest): Promise<SyncPushResult>;
  pull(input: SyncPullRequest): Promise<SyncPullResult>;
}

export interface DiscoveryService {
  coldScan(input: ColdScanRequest): Promise<ColdScanResult>;
  ingest(input: IngestRequest): Promise<IngestResult>;
}

export interface HeartbeatService {
  runCycle(input?: HeartbeatCycleRequest): Promise<HeartbeatCycleResult>;
}
```

要求：

- contract 只描述能力，不暴露底层文件路径、SQLite、宿主配置文件细节。
- 命令层、daemon、plugin runtime 只能 import contract 和 use case，不能直接 import 某个宿主实现。
- contract 优先返回结构化结果，不直接 `console.log()`。

### 2. 引入 HostAdapter contract 和 HostRegistry

HostAdapter 是第一阶段收益最大的抽象，因为它能直接收敛当前 `inject` 和宿主安装逻辑。

建议 contract：

```ts
export type HostCapability =
  | 'rules-injection'
  | 'hook-installation'
  | 'session-push'
  | 'command-template'
  | 'idle-trigger'
  | 'notification'
  | 'doctor'
  | 'uninstall';

export interface HostAdapter {
  id: HostId;
  displayName: string;
  capabilities(): HostCapability[];
  install(input: InstallRequest): Promise<InstallResult>;
  uninstall(input: UninstallRequest): Promise<UninstallResult>;
  doctor(input: DoctorRequest): Promise<DoctorResult>;
  push?(input: HostPushRequest): Promise<HostPushResult>;
}
```

建议 registry：

```ts
export interface HostRegistry {
  register(adapter: HostAdapter): void;
  get(id: HostId): HostAdapter | null;
  list(): HostAdapter[];
  listByCapability(capability: HostCapability): HostAdapter[];
}
```

落地约束：

- 先新增 `hosts/`，不要求立刻删除 `inject/`。
- `inject/` 里的现有实现先退化为 helper 或 installer primitive。
- [`packages/cli/src/runtime/types.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/runtime/types.ts) 已有的 `full-hook | plugin-transform | instruction-driven` 可以保留为“runtime interaction capability”；新的 host capability 要覆盖安装和分发层。
- 后续可以把 runtime capability 和 install capability 拆成两个枚举，避免一个枚举承担两层语义。

### 3. 引入能力注册表，而不是 import fan-out

除了 HostRegistry，这轮还要为后续留下统一注册模式：

- `HostAdapter[]`
- `ServiceProvider[]`
- `JobHandler[]`
- `Ingestor[]`

建议形态：

```ts
registerHostAdapter(codexAdapter);
registerIngestor(claudeCodeIngestor);
registerJobHandler('consolidation', consolidationJob);
registerServiceProvider(memoryProvider);
```

价值：

- 新增能力时只增加注册，不修改主入口扇出。
- daemon、CLI、inject、runtime 可共享同一份注册表。
- 内置能力和插件扩展能力的接入方式一致。

### 4. 把编排从命令和实现中拔出来

新增 `application/usecases/`，由 use case 负责流程编排。

建议拆法：

```text
packages/cli/src/
  application/
    usecases/
      host-install.ts
      host-doctor.ts
      push-preview.ts
      push-dispatch.ts
      heartbeat-run-cycle.ts
```

职责划分：

- command handler: 参数解析、exit code、stdout/stderr 渲染
- use case: 业务流程编排、能力组合、错误归一
- service: 单一能力实现
- adapter: 宿主或基础设施侧实现细节

例如把当前 [`packages/cli/src/cli/commands/push.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/cli/commands/push.ts) 拆成：

- `cli/commands/push.ts`
- `application/usecases/push-preview.ts`
- `services/push/push-service.ts`
- `hosts/<host>/adapter.ts`

这样 `push preview` 就可以同时被 CLI、宿主 runtime 和后台 job 复用。

### 5. 用 capability dispatch 代替宿主名 if/else

当前的风险是：

- Codex 要 inject rules
- Cursor 要写 hooks + rules
- OpenCode 要装 plugin
- Claude Code 要配 host hooks

如果继续按宿主名分支，主流程会越来越长。应该改为 capability-based orchestration。

例如：

```ts
for (const adapter of hostRegistry.listByCapability('rules-injection')) {
  await adapter.installRules(input);
}
```

或由统一接口包装：

```ts
await hostService.install({
  host: 'codex',
  requestedCapabilities: ['rules-injection', 'notification'],
});
```

这样编排层依赖“宿主支持什么能力”，而不是“这个宿主叫 codex 所以走哪条分支”。

### 6. 区分包结构和运行时结构

当前 `packages/plugins/codex` 本质上是内容包，不是运行时 adapter 包。

建议长期目标：

```text
packages/hosts/codex
  src/
    adapter.ts
    installer.ts
    doctor.ts
    capabilities/

packages/plugins/codex
  .codex-plugin/
  skills/
  commands/
  hooks/
  assets/
```

语义边界：

- `packages/hosts/*`: Corivo 内部运行时依赖的宿主 adapter 实现
- `packages/plugins/*`: 面向宿主安装面的静态内容包

第一阶段不强制移动目录，但 spec 要先把这个边界定清楚，避免继续把更多运行时代码塞进 `packages/plugins/*`。

## 代码组织建议

第一阶段建议的新目录骨架：

```text
packages/cli/src/
  application/
    usecases/
  contracts/
  hosts/
    registry.ts
    types.ts
    adapters/
  jobs/
  services/
    memory/
    push/
    sync/
    discovery/
    heartbeat/
  inject/
    ...existing helpers
  runtime/
    ...existing recall/review runtime
```

说明：

- 现有 `service/` 已用于 service manager，不建议直接复用为业务 service 根目录。
- 为避免命名冲突，业务服务层建议用新的 `services/` 目录。
- `runtime/` 保持现有 recall/review 相关职责，不把所有宿主安装逻辑塞进去。

## 对现有模块的影响

### `inject/`

影响最大，但也是第一阶段最该收敛的部分。

- [`packages/cli/src/cli/commands/inject.ts`](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/cli/commands/inject.ts) 不再直接 import 每个宿主实现。
- `inject/*.ts` 从“命令专用实现”转成“可复用 installer/check helper”。
- `inject --codex --cursor --opencode --claude-code` 保持兼容，但内部改为调用 HostRegistry。

### `push/`

- `push-manager.ts` 继续负责内容生成。
- 新增 `PushService` contract 后，CLI 的 `push`、runtime recall/review、后续 host dispatch 都从 use case 层进入。
- 去重、节流、目标宿主选择不应该继续散在命令层。

### `runtime/`

- 现有 runtime capability 保留，但名称上要从“宿主全部能力”降级为“runtime interaction capability”。
- 未来 `runtime/host-adapter.ts` 应只负责 lifecycle payload 组装，不再承担 install/doctor 语义。

### `engine/heartbeat.ts`

- 第一阶段不重写主循环。
- 先把 built-in 任务整理成 `JobHandler` contract，再逐步改成 registry 驱动。
- `RuleEngine` 内建规则注册也可沿用同样思路，但不作为第一阶段前置条件。

### `ingestors/` 和 `cold-scan/`

- 暂时目录不动。
- 先定义 `DiscoveryService` 和 `Ingestor` contract，后面再逐步把这些实现挂到 registry。

### `service/`

- 保持现有 service manager 职责。
- 文档和命名上明确它是 `ServiceManager` 层，不代表业务 service contract。

## 兼容性与迁移策略

这轮必须保持向后兼容：

- 现有 `corivo inject` 用法不变。
- 现有宿主安装产物路径不变。
- 现有 `runtime` 命令不改名。
- 现有 plugin 包结构暂不强制变更。

迁移方法：

1. 先加 contract 和 registry。
2. 再让旧命令转发到新编排层。
3. 等转发稳定后，再考虑清理旧 helper 命名和目录。

## 风险与代价

### 1. 目录短期会变多

引入 `contracts/`、`application/`、`hosts/`、`services/` 之后，目录层级会变深，短期阅读成本会增加。

这是可接受的，因为当前问题不是“目录太多”，而是“边界不清导致改一个地方要理解全局”。

### 2. 两套 host capability 语义可能混淆

目前 `runtime/types.ts` 已有 capability 枚举。如果直接复用，会把“运行时触发方式”和“安装分发能力”混在一起。

解决方案：

- 第一阶段明确拆成 `RuntimeInteractionCapability` 与 `HostCapability` 两组类型。
- 命名上避免都叫 `HostAdapterCapability`。

### 3. 旧代码和新编排会并存一段时间

这是刻意接受的过渡状态。

如果试图一次性重构：

- 风险高
- 回归面大
- 很难验证行为一致

所以要接受“新 contract 包旧实现”一段时间。

### 4. 宿主包拆分不是第一阶段能完全做完的

`packages/plugins/*` 和未来 `packages/hosts/*` 的拆分需要配合发布、安装脚本和文档调整，不能在同一轮和 contract 收敛耦合在一起。

## 非目标

这轮明确不做：

- 重写 `CorivoDatabase`
- 大改 heartbeat 调度算法
- 统一所有 engine 规则实现
- 重新设计 solver 协议
- 立刻拆分所有 `packages/plugins/*`
- 建立跨 package 的 DI 容器

## 分阶段计划

### Phase 1: HostAdapter contract + HostRegistry

目标：

- 引入 `HostAdapter`
- 引入 `HostRegistry`
- 给 Codex / Cursor / OpenCode / Claude Code / project Claude 提供 adapter

产出：

- CLI、inject、installer 可以通过 registry 查宿主
- 新宿主接入不再修改 `inject` 主分支

这是第一优先级，因为收益最大、风险最小。

### Phase 2: inject 改走 registry

目标：

- 把 `inject` 命令从宿主硬编码改成 registry 转发
- 把每个 `inject/*.ts` 改成 helper primitive

产出：

- 安装、卸载、doctor 行为统一
- CLI 层只做输入输出

### Phase 3: push 分发改走 capability

目标：

- `PushService.preview()` 和 `PushService.dispatch()` contract 稳定下来
- 目标宿主分发不再靠宿主名分支

产出：

- push 内容生成与宿主投递解耦
- 后续接入 notification / idle-trigger / session-push 更顺

### Phase 4: 抽 `application/usecases/*`

目标：

- 把 `push`、`host install`、`host doctor`、`host uninstall` 等流程搬到 use case 层

产出：

- CLI、daemon、runtime 的复用面建立起来
- 测试从“测命令输出”转成“测编排结果”

### Phase 5: engine jobs registry 化

目标：

- 给 heartbeat jobs 建立 `JobHandler` contract
- built-in jobs 改从 registry 装载

产出：

- 后台任务新增能力不再改 `heartbeat.ts` 主循环
- 未来 discovery / sync / reminder jobs 都能增量接入

## 实施顺序建议

如果只做一轮中等规模重构，建议严格按下面顺序推进：

1. 先引入 `HostAdapter` 接口和 `HostRegistry`
2. 把 `inject` 相关逻辑改成走 registry
3. 把 push 对宿主的分发改成走 capability
4. 再抽 `application/usecases/*`
5. 最后再考虑把 engine job 做成 registry

原因：

- 先做 host contract，能最快消掉最明显的宿主扇出问题。
- `inject` 是最清晰的切入点，验证 contract 是否成立最直接。
- push 分发依赖 host capability，必须排在 registry 之后。
- use case 层应建立在 contract 稳定之后，否则只是把旧耦合搬到新目录。
- engine job registry 的收益高，但不是当前主阻塞。

## 测试策略

### 合同测试

为每个 contract 增加最小契约测试：

- HostRegistry 返回稳定 ID
- HostAdapter 的 `install/doctor/uninstall` 返回统一结构
- PushService 的 `preview/dispatch` 对同输入稳定

### 编排测试

对 use case 做无副作用测试：

- host install 选择了正确 adapter
- push dispatch 只调用具备对应 capability 的 adapter
- inject alias 正确转发到新层

### 回归测试

保留现有 CLI 行为回归：

- `corivo inject --global --codex`
- `corivo inject --global --cursor`
- `corivo inject --global --opencode`
- `corivo inject --global --claude-code`
- `corivo inject --eject`

必要时补充 snapshot 或 fixture，但重点是行为兼容，不是输出格式逐字符一致。

## 决策总结

这不是一次“重命名目录”的重构，而是一次“建立 service contract 和编排边界”的重构。

最关键的判断有三个：

1. 先统一接口，不统一实现。
2. 先解决 host/install/push 的扇出问题，不先动数据库和 heartbeat 核心。
3. 先把包结构和运行时结构的边界写清楚，再决定什么时候物理拆包。

如果这份 spec 被采纳，下一份实现计划应该直接围绕 Phase 1 和 Phase 2 展开，而不是试图一次性覆盖全部 6 类 service。
