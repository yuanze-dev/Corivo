# Plugin Layout Restructure Design

Date: 2026-04-02
Status: Proposed

## Goal

把 `packages/plugins` 从按职责横切分组：

- `packages/plugins/hosts/*`
- `packages/plugins/runtime/*`

重组为按插件名分组：

- `packages/plugins/codex`
- `packages/plugins/claude-code`
- `packages/plugins/cursor`
- `packages/plugins/opencode`
- `packages/plugins/openclaw`

让维护入口与团队心智模型一致。开发者应该先按插件找目录，而不是先判断该改动属于 host 资产还是 runtime 代码。

## Problem

当前结构把“实现边界”暴露成了“顶层导航”：

- 使用者和维护者通常先想到插件名，而不是先想到 `hosts` / `runtime`
- `opencode` 这类同时包含宿主安装资产与运行时代码的插件，被拆散到两个不同位置
- 文档、测试、installer 和 README 需要反复解释目录例外与映射关系
- 目录结构本身增加了认知负担，但并没有减少多少实现复杂度

当前拆分曾用于澄清职责边界，但这层边界更适合作为插件内约定，而不是顶层目录结构。

## Non-Goals

- 不改变 `corivo host install <host>` 作为唯一安装入口
- 不改变各插件当前能力边界或事件语义
- 不在本次重组中引入新的插件包
- 不重写 CLI host adapter 模型

## Proposed Structure

目标结构：

```text
packages/plugins/
  codex/
    .codex-plugin/
    adapters/
    assets/
    commands/
    hooks/
    skills/
    templates/
    AGENTS.md
    README.md
    package.json
  claude-code/
    .claude-plugin/
    commands/
    hooks/
    skills/
    CLAUDE.md
    EXAMPLES.md
    README.md
    package.json
  cursor/
    hooks/
    templates/
    README.md
    package.json
  opencode/
    assets/
    src/
    scripts/
    README.md
    package.json
    tsconfig.json
  openclaw/
    src/
    README.md
    package.json
    tsconfig.json
```

关键点：

- 顶层只按插件名分组
- 不再保留 `hosts/` / `runtime/` 物理目录
- `opencode` 目录下同时放 host-facing 资产与 runtime 代码
- 插件内部通过文件名、README、测试和 installer 约定表达职责边界，而不是再加一层目录

## Boundary Rules After Migration

虽然去掉顶层 `hosts` / `runtime` 目录，但以下概念边界保留：

1. Host-facing 安装资产仍由 CLI installer 读取。
2. 可执行 runtime 代码仍通过 `src/`、构建脚本和产物边界管理。
3. `opencode` 是单目录双职责插件：
   - `assets/` 提供安装到宿主环境中的插件文件
   - `src/` / `scripts/` / `tsconfig.json` 提供可构建的 runtime 源码
4. `openclaw` 当前仍是 runtime-only 插件，但目录位于插件名顶层，而不是 `runtime/openclaw`
5. `codex`、`cursor`、`claude-code` 当前仍是 host-asset-oriented 插件，但目录位于插件名顶层，而不是 `hosts/*`

## Path Mapping

| Old Path | New Path |
| --- | --- |
| `packages/plugins/hosts/codex` | `packages/plugins/codex` |
| `packages/plugins/hosts/claude-code` | `packages/plugins/claude-code` |
| `packages/plugins/hosts/cursor` | `packages/plugins/cursor` |
| `packages/plugins/hosts/opencode` | absorbed into `packages/plugins/opencode/README.md` and plugin-level docs |
| `packages/plugins/runtime/opencode` | `packages/plugins/opencode` |
| `packages/plugins/runtime/openclaw` | `packages/plugins/openclaw` |
| `packages/plugins/hosts/README.md` | replaced by plugin-level docs plus top-level `packages/plugins/README.md` |
| `packages/plugins/runtime/README.md` | replaced by plugin-level docs plus top-level `packages/plugins/README.md` |

`hosts/opencode` 作为保留目录的概念将消失。OpenCode 的“宿主安装入口”和“运行时代码”改为在同一个插件目录下表达。

## Required Code and Docs Changes

### 1. Asset Resolution

CLI 中所有基于 `packages/plugins/hosts/<host>` 的解析逻辑，需要改成基于新的 `packages/plugins/<host>`。

特别是：

- host asset loader
- 安装路径选择逻辑
- 测试中的 fixtures 和断言文案

`opencode` 仍然需要维持“支持 host install，但当前不提供 CLI-managed host assets”的行为约定，除非实现层一起简化。

### 2. Docs

以下文档必须同步更新：

- 根目录 `README.md`
- 根目录 `AGENTS.md`
- `docs/rfc/host-integration-asset-boundaries.md`
- `packages/plugins/*/README.md`
- 新增 `packages/plugins/README.md`

文档语义要改为：

- 顶层按插件名组织
- host-facing assets 与 runtime code 是插件内部职责，不再是顶层目录模型

### 3. Tests

现有测试中显式绑定旧目录模型的，需要全部更新：

- `packages/cli/__tests__/unit/plugin-layout.test.ts`
- `packages/cli/__tests__/unit/host-boundary-docs.test.ts`
- `packages/cli/__tests__/unit/host-assets.test.ts`
- 所有包含 `packages/plugins/hosts/*` 或 `packages/plugins/runtime/*` 字面量路径的测试

测试目标也要重写：

- 断言插件目录位于 `packages/plugins/<plugin>`
- 断言顶层不再存在 `hosts` / `runtime` 目录依赖
- 断言文档与 installer 路径对新结构保持一致

### 4. Workspace and Package References

需要检查并更新：

- `pnpm-lock.yaml` importer 路径
- workspace 包发现逻辑
- 根 `tsconfig.json` project references
- 任何脚本中的硬编码路径

## Migration Strategy

采用一次性切换，而不是并存双路径：

1. 先建立新目录目标结构
2. 移动插件目录内容
3. 修正 CLI 路径解析与测试
4. 修正文档
5. 运行针对性测试，确认 installer、asset loader、layout docs 一致
6. 删除对 `hosts` / `runtime` 旧目录结构的剩余引用

不推荐双写兼容层，原因：

- 兼容层会把“目录重组”变成长期维护负担
- 旧测试与旧文档会拖长迁移尾巴
- 这是仓库内部结构问题，适合一次性收敛

## Risks

### 1. OpenCode 双职责目录变复杂

`opencode` 是这次迁移的最高风险点，因为它当前既代表 host install 入口，又承载 runtime 插件实现。

控制方式：

- 在 `packages/plugins/opencode/README.md` 明确目录职责
- 增加针对 `opencode` 安装路径的测试
- 保持 `assets/corivo.ts` 的产物路径语义不变，避免安装器行为漂移

### 2. Docs/Test wording regressions

现有文档与测试大量依赖 `hosts` / `runtime` 术语。若只改路径，不改文本，会留下大量错误指引。

控制方式：

- 一并更新路径和 wording
- 用文档一致性测试覆盖新的说法

### 3. Hidden hard-coded paths

installer、脚本、README 示例、锁文件和 package importers 里可能存在未显式覆盖的旧路径。

控制方式：

- 全仓 `rg` 搜索旧路径
- 在计划中加入“路径扫尾”任务

## Success Criteria

迁移完成后，应满足：

1. `packages/plugins` 顶层直接展示所有插件目录。
2. 不再依赖 `packages/plugins/hosts` 或 `packages/plugins/runtime` 作为主结构。
3. CLI installer 和 asset loader 在新路径下工作正常。
4. `opencode` 在单目录下仍可清晰区分安装资产与 runtime 代码。
5. 所有引用旧目录模型的测试、README、RFC 都被替换。

## Recommendation

执行这次重组，但要把“去掉顶层分类”与“保留插件内部职责边界”同时落实。

这次调整的核心不是把边界删掉，而是把边界从“顶层导航”降级为“插件内部约定”。这样目录结构更符合人找东西的方式，同时不会让 `opencode` 之类的复杂插件失去结构。
