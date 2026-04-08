# runtime

## 负责什么

- daemon lifecycle
- scheduler / heartbeat / auto-sync 这类持续运行控制
- runtime policy glue 与进程级协调
- 连接 application/domain/infrastructure 的后台执行入口

## 不负责什么

- CLI 参数解析和输出
- 纯领域模型与规则定义
- SQLite 或 host adapter 的具体实现
- 面向用户的单次动作编排长期停留在这里

## 当前例子

- `daemon/`
- `scheduling/`
- `process-state.ts`
- `host-bridge-policy.ts`

## 常见误放

- 把 query / review / carry-over 这类单次动作继续堆进 `runtime/`
- 把可下沉到 `domain/` 的纯规则放进 runtime helper
- 用 `runtime/` 作为从旧结构迁来的临时垃圾桶
