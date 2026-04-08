# application

## 负责什么

- 单次动作的 use-case 编排
- domain 与 infrastructure 依赖的装配与调用顺序
- 输入输出 DTO、错误映射、流程控制
- 作为 CLI 与后台运行时调用核心动作的统一入口

## 不负责什么

- Commander 参数解析和终端输出
- 纯业务规则本身
- SQLite、filesystem、platform、host adapter 的具体实现
- daemon loop、scheduler、heartbeat 持续运行控制

## 当前例子

- `bootstrap/create-cli-app.ts`
- `hosts/install-host.ts`
- `query/generate-recall.ts`
- `review/run-review.ts`

## 常见误放

- 把 presenter、CLI prompt、TTY 判断放进这里
- 把纯规则计算塞成 “application service”
- 把长期运行逻辑直接放进 `application/` 而不是 `runtime/`
