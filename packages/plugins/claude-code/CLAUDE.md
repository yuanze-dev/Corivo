# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 包概述

`@corivo/claude-code` — Corivo 的 Claude Code 插件包。让 Claude Code 能读写本地 Corivo 记忆，并在每次会话启动时自动汇报记忆状态。

- ESM TypeScript，Node ≥ 18
- **不直接操作数据库**：通过 `execSync('corivo ...')` 调用本地已安装的 `@corivo/cli`
- 需要用户已全局安装 `corivo` CLI 并执行过 `corivo init`

---

## 构建

```bash
npm run build    # tsc → dist/
npm run dev      # tsc --watch
npm run test     # node --test（当前无测试文件）
```

---

## 目录结构与职责

```
src/
  api.ts          CorivoAPI 类 + corivo 单例（主要接口）
  status.ts       getCorivoStatus()（供 hook 脚本调用）
  index.ts        导出所有公共 API

.claude-plugin/
  plugin.json     插件元数据（名称、版本、描述）
  marketplace.json Claude Code 市场元数据

commands/
  init.md         /corivo:init 命令说明
  info.md         /corivo:info 命令说明

hooks/
  hooks.json      hook 配置（SessionStart / UserPromptSubmit / Stop）
  scripts/
    session-init.sh       会话启动时自动运行，输出记忆状态摘要
    session-carry-over.sh 会话启动时带回未收尾记忆
    prompt-recall.sh      用户提交输入后生成答前 recall
    stop-review.sh        Claude 回复后生成答后 review

skills/
  corivo-save/skill.md   保存记忆的 skill（Claude 读取并执行）
  corivo-query/skill.md  查询记忆的 skill
```

---

## CorivoAPI

`src/api.ts` 中的 `CorivoAPI` 类是插件的核心。所有操作都通过 `execSync` 调用本地 CLI：

```typescript
// 保存记忆
corivo.save('内容', { annotation: '知识 · project · 依赖' })
// → execSync('corivo save "内容" --annotation "知识 · project · 依赖"')

// 查询记忆
corivo.query('React hooks', { limit: 5, annotation: '知识' })
// → execSync('corivo query "React hooks" --limit 5 --annotation "知识"')

// 获取统计
corivo.getStats()
// → execSync('corivo status')，解析输出
```

`isInitialized()` 检查 `~/.corivo/corivo.db` 是否存在，操作前应先调用。

---

## Session Hook

Claude Code 的 hook 生命周期现在分成三条明确的运行时路径：

```
SessionStart
  ├── session-init.sh        → 状态摘要
  └── session-carry-over.sh  → carry-over（带回未收尾记忆）

UserPromptSubmit
  ├── ingest-turn.sh user    → 保存用户输入
  └── prompt-recall.sh       → recall（答前上下文）

Stop
  ├── ingest-turn.sh assistant → 保存 Claude 回复
  └── stop-review.sh           → review（答后补充/纠偏）
```

设计原则：
- shell 脚本只做 JSON 解析和 CLI 调用
- 触发、检索、模式选择都放在 `corivo` CLI/runtime 内
- `UserPromptSubmit` 是主 recall 触发点，`Stop` 只负责 review

---

## Skills

Skills 是 Markdown 文件，Claude Code 在执行相关操作时读取并遵循：

**corivo-save**（`skills/corivo-save/skill.md`）：
- 触发时机：用户说"记住"、"保存这个"、"不要忘了"等
- 执行 `corivo save --content "..." --annotation "性质 · 领域 · 标签" --no-password`
- Annotation 格式：性质（事实/知识/决策/指令）+ 领域（self/people/project/asset/knowledge）+ 标签

**corivo-query**（`skills/corivo-query/skill.md`）：
- 触发时机：用户问"我之前说过..."、"记得吗..."等
- 执行 `corivo query "..." --no-password`

---

## 添加新功能时的注意事项

**新增 CLI 桥接方法**：在 `CorivoAPI` 类中添加新方法，遵循 `execSync` + 输出解析模式。输出解析逻辑需与 CLI 实际输出格式保持同步。

**新增 skill**：在 `skills/` 下新建 `<name>/skill.md`，格式参考现有 skill 文件的 frontmatter（`description`、`allowed-tools`）。

**修改 hook**：`hooks/hooks.json` 格式遵循 Claude Code 插件规范，`timeout` 单位为秒。所有 hook 脚本都应保持幂等且快速，业务逻辑应留在 CLI/runtime 层而不是 shell 层。
