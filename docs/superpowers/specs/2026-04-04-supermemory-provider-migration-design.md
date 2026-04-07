# Supermemory Provider Migration Design

Date: 2026-04-04
Status: Proposed

## Goal

在不改变 Corivo 现有命令面和主要用法的前提下，引入可切换的记忆引擎抽象，让 `supermemory` 成为新的记忆写入与召回主路径，同时保留本地实现作为 fallback 和迁移校验通道。

用户目标是：

- 继续使用原有 `corivo save`、`corivo query`、`corivo query --prompt` 和既有 ingest 流程
- 通过配置切换记忆/搜索后端，而不是改命令
- 使用用户自己的 supermemory API key 作为用户级隔离边界
- 在用户自己的 supermemory 空间内，再按项目维度做隔离

## Problem

当前 Corivo 的主路径由本地 SQLite、markdown memory index、raw transcript fallback 和 legacy block recall 组成：

- prompt-time recall 走 `memory index -> raw transcript -> block recall`
- 显式搜索走本地 `searchBlocks`
- `save` 与 memory pipeline 产物都沉淀到本地存储模型

这带来两个问题：

1. 记忆引擎和 CLI 命令面耦合较深，难以替换底层实现
2. 现有本地存储/召回链路过重，不利于切换到托管记忆服务

## Non-Goals

- 不在本次迁移中删除本地 SQLite、markdown memory index、raw transcript 或 block model
- 不重写 heartbeat、vitality、association 规则
- 不改变用户侧命令名和主要参数
- 不在本次实现中引入系统 keychain；API key 先存放在 Corivo 本地配置中
- 不承诺本次直接迁走所有仅依赖本地 block 语义的周边功能

## Chosen Approach

采用“中等重构”方案：

- 在应用层下方引入统一的记忆 provider 接口
- 先提供两个实现：
  - `local`
  - `supermemory`
- 通过配置切换 provider
- 上层命令和 use-case 尽量不感知底层 provider 类型
- 当 provider 为 `supermemory` 时：
  - 写入主路径走 supermemory
  - prompt recall 主路径走 supermemory
  - 搜索主路径走 supermemory
  - 本地链路只用于 fallback 和迁移期校验

不采用“薄适配”，因为那会把 provider 逻辑散落到多个命令和 use-case 中；也不采用“深重构”，因为那会把本次平滑迁移扩大成全栈重写。

## User-Facing Behavior

迁移完成后，以下命令的外部用法保持不变：

- `corivo save`
- `corivo query <keyword>`
- `corivo query --prompt "<text>"`
- 现有的 realtime ingest / history import / memory pipeline 触发方式

新增的是配置能力，而不是命令面破坏性变化。

## Configuration Model

新增统一的引擎配置，示意如下：

```json
{
  "memoryEngine": {
    "provider": "supermemory",
    "supermemory": {
      "apiKey": "sm_...",
      "containerTag": "project:<stable-project-id>"
    }
  }
}
```

约定：

- `memoryEngine.provider`
  - `local`
  - `supermemory`
- `memoryEngine.supermemory.apiKey`
  - 用户自行申请并配置
  - 先存本地配置
- `memoryEngine.supermemory.containerTag`
  - 当前项目的固定隔离 tag
  - 所有写入和查询都必须携带

建议新增 CLI 子命令：

- `corivo supermemory set-key`
- `corivo supermemory status`

这两个命令只负责配置和诊断，不改变业务命令。

## Isolation Model

隔离分两层：

1. 用户级隔离
   - 由“每个用户独立的 supermemory API key”提供
   - 不同用户不共享同一套 supermemory 凭证
2. 项目级隔离
   - 在该用户的 supermemory 空间内，所有记忆写入和查询都强制使用同一个 `containerTag`
   - `containerTag` 推荐形如 `project:<stable-project-id>`

辅助 metadata：

- `cwd`
- `host`
- `sessionId`
- `annotation`
- `source`
- `memoryType`

这些 metadata 用于过滤、调试和观察，不作为主隔离边界。

## Provider Interface

需要在应用层/运行时之间建立稳定接口，避免命令直接依赖 supermemory SDK。

建议最小接口：

```ts
interface MemoryProvider {
  save(input: SaveMemoryInput): Promise<SaveMemoryResult>;
  search(input: SearchMemoryInput): Promise<SearchMemoryResult>;
  recall(input: RecallMemoryInput): Promise<CorivoSurfaceItem | null>;
  healthcheck(): Promise<MemoryProviderHealth>;
}
```

其中：

- `save` 对应 `corivo save` 和 pipeline 产出的记忆写入
- `search` 对应 `corivo query <keyword>`
- `recall` 对应 `corivo query --prompt`
- `healthcheck` 用于 `status`/诊断命令

第一阶段可以让 `search` 和 `recall` 在 supermemory provider 内共享底层 search 逻辑，但上层语义仍保持分离。

## Data Mapping

第一阶段不强行把本地 block 模型完整映射到 supermemory，只迁主路径必需字段。

写入到 supermemory 的主数据：

- 主文本：Corivo 最终沉淀的记忆正文
- `containerTag`：项目隔离键
- metadata：
  - `annotation`
  - `source`
  - `host`
  - `cwd`
  - `sessionId`
  - `memoryType`
  - `createdAt`

本地保留但不作为 supermemory 主模型强制映射的字段：

- `vitality`
- `status`
- `association`
- 各类依赖本地 block graph 的衍生关系

这些字段继续留在本地兼容层，直到后续决定是否完全移除。

## Cutover Plan

### 1. Prompt Recall

当前：

- `memory index`
- `raw transcript recall`
- `legacy block recall`

调整为：

- `supermemory provider recall`
- 若失败或未命中，则 fallback 到旧链路

该入口是第一优先级，因为它直接影响答前 recall 体验。

### 2. Explicit Search

`corivo query <keyword>` 改为：

- 首选 `supermemory provider search`
- 失败时 fallback 到本地 `searchBlocks`

### 3. Save

`corivo save` 改为：

- 首选写入 `supermemory provider`
- 同时可选保留一份本地兼容记录，供旧功能使用

是否做兼容写本地，应受配置控制，默认建议开启迁移兼容模式。

### 4. Memory Pipeline Outputs

realtime ingest / history import / memory pipeline 本轮不删除，但其“最终记忆沉淀”要改为优先写入 provider。

即：

- pipeline 继续负责提取和归纳
- 最终记忆写入目标改为 provider
- 本地产物保留作兼容/回退/调试

## Fallback Strategy

当 `provider=supermemory` 时，以下情况触发 fallback：

- supermemory 配置缺失
- API key 无效
- SDK/network 调用失败
- search/recall 返回空且调用方允许回退

fallback 目标：

- prompt recall：旧 `memory index -> raw transcript -> block recall`
- explicit search：本地 `searchBlocks`
- save：可以选择失败即报错，或者写本地兼容存储并标记远端未同步

第一阶段建议：

- `query` 和 `query --prompt` 允许 fallback
- `save` 默认报错更清晰；若需要更平滑，可加兼容开关

## Migration Validation

迁移期需要保留校验能力，而不是只做静默替换。

建议在 provider=supermemory 时增加可选对比模式：

- 新主路径先产出 supermemory 结果
- 后台或 debug 模式下再运行旧链路
- 记录两者是否都命中、命中内容是否明显偏离

目的：

- 观察召回质量回归
- 找出哪些 query 仍依赖旧 block graph / markdown index
- 为后续清理旧逻辑提供依据

该能力不要求一开始就暴露给所有用户，可以先作为 debug/logger 输出。

## Implementation Areas

预期主要改动区域：

- 配置模型与读写逻辑
- `src/application/bootstrap/query-execution.ts`
- `src/application/query/*`
- `src/cli/commands/save.ts`
- memory ingest / pipeline 的最终写入编排
- 新增 provider 目录，例如：
  - `src/domain/memory/providers/`
  - 或 `src/application/memory/providers/`
  - 具体以现有目录边界为准，但应避免把 supermemory SDK 直接散落到 CLI 命令层

## Risks

### 1. Provider Interface Leaks Old Model

如果 provider 接口直接暴露 block-specific 字段，会导致 `supermemory` 实现被迫模拟过多本地语义，迁移收益下降。

控制方式：

- provider 接口只暴露上层真正需要的最小能力
- block graph 相关语义继续留在 local provider 内部

### 2. Fallback Masks Real Failures

如果任何 supermemory 失败都被静默 fallback，用户会误以为新链路已经稳定。

控制方式：

- fallback 时写入明确日志
- `status` 命令应能看出当前是否在 fallback
- debug 模式输出 provider 命中来源

### 3. Save/Search Semantics Drift

supermemory 检索结果和本地 block search 的排序、粒度、返回文本不一定一致。

控制方式：

- 在迁移期做结果对比记录
- presenter 层尽量统一输出形态
- 优先保证 recall 和 search 的可用性，而不是逐字等价

### 4. Config UX Is Incomplete

若只有底层配置字段，没有易用命令，用户接入成本会偏高。

控制方式：

- 在首轮实现里补齐 `set-key` / `status`
- 报错信息明确指出缺少的配置项

## Success Criteria

- 用户无需改变既有主命令用法
- 通过配置即可在 `local` 和 `supermemory` 间切换
- `provider=supermemory` 时：
  - `corivo query --prompt` 主路径走 supermemory
  - `corivo query <keyword>` 主路径走 supermemory
  - `corivo save` 主路径走 supermemory
- 旧链路仍可作为 fallback 使用
- 配置缺失或远端故障时，错误和来源可被清楚诊断

## Open Questions

- `save` 在 supermemory 不可用时，默认是否要写入本地兼容层
- `containerTag` 的稳定生成策略是否完全基于 project path，还是由初始化时持久化生成
- memory pipeline 的“最终记忆单元”是否需要在写入 provider 前进一步统一格式

这些问题不阻塞第一阶段实现，但需要在 implementation plan 中明确默认策略。
