# Corivo CLI 去巨石化与分层收敛方案

## 状态

Draft

## 执行基线

这份文档当前作为 `packages/cli` 分层治理的 governing spec 使用。

首个可落地里程碑是 **Phase 1：建立唯一有效的层语义**。

在 Phase 1 中，`packages/cli/src` 只保留：

- `cli/`
- `application/`
- `domain/`
- `infrastructure/`
- `runtime/`
- `memory-pipeline/`

其它历史一级目录都不再保留在顶层；已经迁移完并删除的包括：

- `service/`
- `hosts/`
- `first-push/`
- `update/`
- `models/`
- `type/`
- `push/`
- `raw-memory/`
- `errors/`
- `crypto/`
- `utils/`
- `cold-scan/`
- `engine/`
- `identity/`
- `ingestors/`
- `storage/`
- `tui/`

换句话说，`packages/cli/src` **只保留** 这 6 个一级目录。

## Final Top Level Layout

```text
src/
  cli/
  application/
  domain/
  infrastructure/
  runtime/
  memory-pipeline/
```

## Layer Ownership Snapshot

- `cli/`: 命令定义、参数解析、presenter、exit code 映射
- `application/`: 单次动作的编排、输入输出 DTO、调用顺序控制
- `domain/`: 核心业务模型、规则、纯逻辑服务、稳定契约
- `infrastructure/`: SQLite、filesystem、platform、host adapter、provider adapter
- `runtime/`: daemon lifecycle、scheduler、heartbeat orchestration、runtime policy glue
- `memory-pipeline/`: 暂时保留的一级子系统，但不能成为新的兜底目录
