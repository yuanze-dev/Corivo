# domain

## 负责什么

- Corivo 核心业务模型与稳定契约
- memory / identity / host 的纯逻辑规则
- 不依赖 terminal、db、fs、network 也成立的业务服务

## 不负责什么

- Commander、stdout/stderr、chalk
- SQLite repository、文件系统、平台服务
- daemon lifecycle、scheduler、service manager
- provider SDK 和具体宿主安装实现

## 当前例子

- `memory/models/block.ts`
- `memory/models/association.ts`
- `memory/services/query-history.ts`
- `host/contracts/types.ts`

## 常见误放

- 在 `domain/` 里直接读取数据库或配置文件
- 在 `domain/` 中依赖 `runtime/` 的策略工具而不抽出稳定契约
- 把宿主安装细节、provider SDK 类型直接放进领域层
