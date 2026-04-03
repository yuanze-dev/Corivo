# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 包概述

`@corivo/cli` — Corivo 的核心包。提供 CLI 工具、本地数据库、心跳引擎和所有智能处理逻辑。

- 纯 ESM TypeScript，编译目标 ES2022，Node ≥ 18
- `better-sqlite3`（CJS）通过 `createRequire(import.meta.url)` 加载
- 测试使用 Vitest

---

## 构建与测试

```bash
# 构建
npm run build          # tsdown → dist/

# 开发（监听模式）
npm run dev            # tsdown --watch

# 打包独立二进制（macOS arm64/x64 + Linux x64）
npm run package

# 测试
npm run test
npm run test -- __tests__/unit/database.test.ts
npm run test -- __tests__/integration/heartbeat.test.ts
npm run test -- __tests__/integration/claude-code-ingestor.test.ts
npm run test -- __tests__/e2e/cli-flow.test.ts
```

测试文件分三层：`unit/` → `integration/` → `e2e/`

---

## 目录结构与职责

```
src/
  cli/
    commands/     每个 CLI 子命令一个文件（init / save / query / status / start / stop …）
    utils/        CLI 工具函数
  cold-scan/
    extractors/   一次性扫描提取器（claude-code, cursor, git-config, package-json …）
    index.ts      聚合所有提取器，写入 DB
  engine/
    heartbeat.ts      后台主循环（每 5 秒）
    rules/index.ts    规则引擎（注册 Rule 实现）
    rules/tech-choice.ts  第一条规则：技术选型识别
    associations.ts   Block 关联发现（基于规则）
    consolidation.ts  去重 + 摘要 + 补链
    weekly-summary.ts 周总结生成
    follow-up.ts      进展提醒
  ingestors/
    claude-code.ts    实时摄取 Claude Code 对话日志
  identity/
    fingerprint.ts    平台指纹采集（claude_code / feishu / device）
    identity.ts       身份创建与识别
    auth.ts           身份鉴权
  crypto/
    keys.ts           密钥生成、派生、内容加解密（AES-256-GCM）
  storage/
    database.ts       CorivoDatabase 单例封装（所有 DB 操作）
  models/
    block.ts          Block 接口 + BlockStatus + vitalityToStatus()
    association.ts    Association 接口 + AssociationType 枚举
    pattern.ts        Pattern 接口（决策模式）
  push/
    context.ts        上下文推送逻辑
  hosts/installers/
    claude-rules.ts   注入 CLAUDE.md 规则
  daemon/
    index.ts          守护进程入口
    macos.ts          macOS launchd 集成
  errors/index.ts     自定义错误类型
```

---

## 核心概念

### Block — 最小记忆单元

```typescript
interface Block {
  id: string;           // "blk_<hex>"
  content: string;      // 自然语言正文
  annotation: string;   // "性质 · 领域 · 标签"，例如 "决策 · project · typescript"
  refs: string[];       // 引用的其他 block ID
  source: string;       // 采集来源标识
  vitality: number;     // 0–100，驱动状态流转
  status: BlockStatus;  // active → cooling → cold → archived
  access_count: number;
  last_accessed: number | null;
  pattern?: Pattern;    // 仅决策类 block 有
  created_at: number;   // Unix 秒
  updated_at: number;
}
```

`vitality` 衰减规则（由心跳引擎执行）：
- 24 小时内不衰减
- 每日衰减量：决策 0.3 / 事实 0.5 / 知识 2 / 其他 1

`vitalityToStatus(v)` 映射：≥70 → active，≥40 → cooling，≥10 → cold，<10 → archived

### Annotation 格式

三段式，中间用 ` · ` 分隔：

```
性质 · 领域 · 标签
```

性质：`事实` / `知识` / `决策` / `指令`
领域：`self` / `people` / `project` / `asset` / `knowledge`

### 心跳引擎调度

```
每 5s:   processPendingBlocks()   → 用 RuleEngine 标注 pending block
每 5s:   processVitalityDecay()   → 批量衰减
每 30s:  processAssociations()    → 发现 block 间关联
每 1min: processConsolidation()   → 去重 + 摘要 + 补链
每 1h:   checkFollowUps()         → 进展提醒
每 7d:   sendWeeklySummary()      → 周总结
```

### 数据库

- 位置：`~/.corivo/corivo.db`（通过 `getDefaultDatabasePath()` 获取）
- `CorivoDatabase.getInstance(config)` — 单例，同一路径只创建一次
- WAL 模式，FTS5 全文搜索（中文无结果时自动降级为 LIKE）
- FTS5 通过 SQLite 触发器（INSERT / UPDATE / DELETE）自动同步
- 可选 SQLCipher 加密；未安装时降级为应用层 AES-256-GCM（`KeyManager`）
- 密钥 base64 明文存储于 `~/.corivo/config.json`，依赖文件系统权限保护

---

## 添加新功能时的注意事项

**新增 CLI 命令**：在 `src/cli/commands/` 新建文件，在主入口注册到 `commander`。

**新增规则**：实现 `Rule` 接口，在 `src/engine/rules/index.ts` 调用 `ruleEngine.register()` 注册。规则需实现 `matches(content): boolean` 和 `extract(content): Pattern | null`。

**新增提取器**：在 `src/cold-scan/extractors/` 实现 `Extractor` 接口，在 `src/cold-scan/index.ts` 中引入。

**守护进程传参**：仅通过环境变量 `CORIVO_DB_PATH` 注入心跳子进程，不走命令行参数，也不再传递 `db_key`。

**ESM 注意**：所有内部导入必须带 `.js` 扩展名（TypeScript 编译后的 ESM 要求）。
