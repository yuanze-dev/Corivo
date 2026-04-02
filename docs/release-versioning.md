# 发布与版本管理

## 目标

Corivo 现在采用单版本线管理。根仓库 `@corivo/mono` 是版本真源，所有 workspace package 跟随同一个版本号一起发布，不再各自独立演进。

当前纳入统一版本组的包包括：

- `@corivo/mono`
- `corivo`
- `@corivo/shared`
- `@corivo/solver`
- `@corivo-ai/codex`
- `@corivo-ai/claude-code`
- `@corivo-ai/cursor`
- `@corivo-ai/opencode`
- `@corivo-ai/openclaw`

## 采用的机制

仓库使用 `@changesets/cli` 管理版本和发布节奏，配置位于 [`.changeset/config.json`](/Users/airbo/Developer/corivo/Corivo/.changeset/config.json)。

关键点：

- 使用 `fixed` 分组，把所有 package 绑定到同一条版本线
- repo root 不是 workspace package，因此通过 [`scripts/sync-root-version.mjs`](/Users/airbo/Developer/corivo/Corivo/scripts/sync-root-version.mjs) 把共享版本同步回根 `package.json`
- 内部 workspace 依赖仍可继续使用 `workspace:*`
- 版本 bump 由 Changesets 统一生成，不手工逐个改版本

## 日常开发如何处理版本

日常开发时，不需要每次改代码都手工改 `package.json` 里的版本号。

当一批变更准备进入下一次发布时：

1. 先完成代码改动
2. 运行 `pnpm changeset`
3. 按提示选择 semver 级别并填写本次发布说明
4. 提交生成的 changeset 文件

这一步只是在仓库里记录“下次发布应该怎么涨版本”，还不会立即修改所有包的版本号。

## 正式出版本时怎么做

### 1. 检查待发布状态

```bash
pnpm release:check
```

这个命令会列出当前有哪些未消费的 changesets，以及它们将如何影响版本。

### 2. 生成统一版本

```bash
pnpm release:version
```

这个命令会：

- 读取 `.changeset/*.md`
- 计算下一次共享版本号
- 同步更新所有 workspace package 的 `version`
- 再把共享版本自动回写到根 `package.json`
- 生成或更新 changelog 内容

执行完以后，整个仓库应该仍然只有一个版本号。

### 3. 验证版本是否一致

```bash
pnpm version:assert
```

如果版本一致，会输出类似：

```text
All package versions aligned at 0.12.6
```

如果有人手工改乱了某个包的版本，这个命令会直接失败。

### 4. 提交版本变更

典型提交内容包括：

- `.changeset` 消费后的结果
- 根 `package.json`
- 各 package 的 `package.json`
- 自动生成的 changelog

### 5. 发布包

```bash
pnpm release:publish
```

这个命令通过 Changesets 执行实际发布。发布前应确保：

- 当前分支状态正确
- 构建和测试已经通过
- npm registry 登录状态可用

## 当前约定

### 单版本是硬约束

Corivo 不再维护“CLI 一个版本、solver 一个版本、plugin 一组版本”的模式。现在的约定是：

- 一次发布就是整个 Corivo monorepo 的一次发布
- 内部包成熟度差异不再通过独立版本号表达
- 版本号表达的是产品整体发布节奏

### 根仓库版本是唯一真源

根 `package.json` 中的 `version` 不再只是装饰字段，而是整个 monorepo 对外展示的主版本线。由于 repo root 不属于 workspace，实际同步由 `pnpm version:sync-root` 在 release 流程中自动完成。任何包如果和根版本不一致，都视为错误状态。

### 不建议手工改版本

除了第一次迁移对齐版本外，后续不建议直接手改各个 `package.json` 的 `version`。正常路径应该是：

- 写 changeset
- 跑 `pnpm release:version`
- 跑 `pnpm version:assert`

## 常用命令

```bash
pnpm changeset
pnpm release:check
pnpm release:version
pnpm release:publish
pnpm version:sync-root
pnpm version:assert
```

## 故障排查

### 发现版本不一致

先运行：

```bash
pnpm version:assert
```

如果失败，说明某个 package 的版本被手工改动或某次 version 生成没有完整提交。应先检查所有 workspace `package.json`，不要直接跳过这个错误继续发布。

### 忘了写 changeset

如果已经有代码变更，但 `pnpm release:check` 没有显示待发布内容，通常是因为没有生成 changeset。补跑一次：

```bash
pnpm changeset
```

### 只想发布单个包

当前策略不支持单独发布某一个 workspace 包。只要进入发布流程，整个 fixed group 都会一起进入同一版本。
