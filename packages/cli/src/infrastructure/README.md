# infrastructure

## 负责什么

- SQLite、schema、migration、repository、search
- filesystem、config、platform/service manager
- host installer / importer / adapter
- provider / LLM / output-side persistence 等具体技术实现

## 不负责什么

- 业务规则定义
- CLI 参数解析或 presenter
- daemon 循环、scheduler 决策

## 当前例子

- `storage/repositories/raw-memory-repository.ts`
- `storage/schema/database-schema.ts`
- `hosts/installers/host-assets.ts`
- `platform/macos.ts`

## 常见误放

- 把 “下一步该做什么” 的流程编排写在 repository 或 adapter 里
- 在基础设施模块里渲染终端输出
- 用 `infrastructure/` 充当任何还没想清楚归属的杂项桶
