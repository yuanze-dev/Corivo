# Corivo Module Boundaries Baseline (2026-04)

## Target Layer Direction

`packages/cli/src` 的唯一有效分层方向是：

```text
cli -> application -> domain
application -> infrastructure
runtime -> application / domain / infrastructure
infrastructure -> domain
domain -> no outer-layer dependencies
```

这份文档描述的是当前仓库必须朝向的稳定边界语言，而不是历史目录的客观描述。

## Forbidden Direction Rules

明确禁止以下依赖方向：

- `domain -> infrastructure`
- `domain -> cli`
- `domain -> runtime`
- `application -> cli`
- `application -> runtime`
- `infrastructure -> cli`

当前仓库仍有少量历史例外；这些例外必须出现在测试 allowlist 中，不能继续静默增长。

## Final Top Level Layout

`packages/cli/src` 现在只保留以下一级目录：

- `cli/`
- `application/`
- `domain/`
- `infrastructure/`
- `runtime/`
- `memory-pipeline/`

其余历史一级目录，包括 `engine/`、`storage/`、`hosts/`、`service/`、`identity/`、`ingestors/`、`cold-scan/`、`push/`、`raw-memory/`、`tui/`、`errors/`、`crypto/`、`utils/`、`first-push/`、`update/`、`models/`、`type/`，都不应在顶层重新出现。

## Layer Ownership Snapshot

- `cli/`: 命令定义、参数解析、presenter、exit code 映射
- `application/`: 单次动作的编排、输入输出 DTO、调用顺序控制
- `domain/`: 核心业务模型、规则、纯逻辑服务、稳定契约
- `infrastructure/`: SQLite、filesystem、platform、host adapter、provider adapter
- `runtime/`: daemon lifecycle、scheduler、heartbeat orchestration、runtime policy glue
- `memory-pipeline/`: 暂时保留的一级子系统，但不能成为新的兜底目录

## Baseline Test Enforcement Scope

当前单测与 lint 至少要直接覆盖以下规则：

- 顶层目录只允许 `cli/`、`application/`、`domain/`、`infrastructure/`、`runtime/`、`memory-pipeline/`
- `application/* -> cli/runtime.ts` 禁止，唯一例外：`application/bootstrap/create-cli-app.ts`
- `memory-pipeline/* -> cli/*` 禁止
- `domain/* -> runtime|cli|infrastructure` 新增违规必须被测试拦下
- `application/* -> runtime|cli` 新增违规必须被测试拦下
- `infrastructure/* -> cli` 新增违规必须被测试拦下
- `packages/plugins/*/hooks/scripts/*.sh` 只能通过 `corivo` CLI 触发，不允许直接编码源码入口或 SQL/存储逻辑

## Current Enforcement Strategy

Phase 1 的目标不是一次性清空所有历史耦合，而是先把“新增违规不再发生”变成工程事实：

- 文档定义唯一有效的层语言
- 测试扫描 top-level 目录与依赖方向
- 历史违规必须通过显式 allowlist 暴露
- 新增违规不能自动混进 allowlist
