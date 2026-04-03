# Corivo Module Boundaries Baseline (2026-04)

## Rules

1. `packages/cli/src/cli/commands/*` 的目标依赖面是：
- `packages/cli/src/application/*`
- `packages/cli/src/runtime/*`
- `packages/cli/src/utils/*`
当前 Task 1 的已落地强校验为：`cli/commands/*` 不允许依赖 `engine/*`（见下方测试范围）。

2. `packages/cli/src/engine/*` 不能依赖 `packages/cli/src/cli/commands/*`。

3. `packages/cli/src/application/*` 不能依赖 `packages/cli/src/cli/context/*`。
唯一例外：CLI 组合根 `packages/cli/src/application/bootstrap/create-cli-app.ts`，用于装配命令运行时能力。

4. `packages/cli/src/memory-pipeline/*` 不依赖任何 `packages/cli/src/cli/*` 模块。

5. `packages/plugins/*/hooks/scripts/*.sh` 只能调用 CLI 命令（`corivo ...`），不能在脚本内编码业务规则。

## Task 1 Test Enforcement Scope

Task 1 的单测当前直接强校验以下禁止模式：

- `packages/cli/src/cli/commands/* -> engine/*` 禁止（全目录扫描）
- `packages/cli/src/engine/* -> cli/commands/*` 禁止（全目录扫描）
- `application/* -> cli/context/*` 禁止（`application/bootstrap/create-cli-app.ts` 组合根例外）
- `memory-pipeline/* -> cli/*` 禁止
- `packages/plugins/*/hooks/scripts/*.sh` 通过脚本扫描校验：
  - 必须调用 `corivo` CLI
  - 不允许直接执行内部源码/构建入口（如 `node ... src/`、`node ... dist/`）
  - 不允许直接编码 SQL/存储语句
