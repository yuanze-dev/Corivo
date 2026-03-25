# Session 索引层设计

**日期**: 2026-03-25
**状态**: 待实现
**范围**: `packages/cli`

---

## 背景与动机

Corivo 当前的记忆单元（Block）没有项目上下文：一个 block 被保存后，无从得知它来自哪个项目。随着用户跨多个项目使用 Corivo，出现了三个需求：

1. **按项目浏览**：用户想看"我在 Corivo 项目里做了哪些决策"
2. **Session 分类**：自动为项目打标签（如 `typescript`、`CLI工具`），方便筛选
3. **跨项目关联发现**：两个项目共享相似技术决策时，自动发现并提示

设计原则：**blocks 表不变**，session 作为上层索引，通过 join 表关联。

---

## 数据模型

新增 3 张表，`blocks` 表不做任何改动。

### `sessions` — 项目工作区

```sql
CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,                          -- ses_<hex>
  name           TEXT NOT NULL,                            -- 项目名（见 session name 生成策略）
  path           TEXT,                                     -- 项目绝对路径（可为 null）
  tags           TEXT NOT NULL DEFAULT '[]',               -- JSON 字符串数组，最多 50 个，每个最长 64 字符
  last_active_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- path 非 null 时唯一，null 允许多条（SQLite NULL != NULL）
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_path ON sessions(path) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at);
```

**session name 生成策略**（优先级从高到低）：
1. `package.json` 中的 `name` 字段
2. git remote `origin` URL 中的仓库名：
   - SSH 格式：`git@github.com:user/repo.git` → `repo`
   - HTTPS 格式：`https://github.com/user/repo.git` → `repo`
   - 正则：`/([^/\\]+?)(?:\.git)?$/` 取最后一段
3. 路径 basename（`path.basename(cwd)`）
4. 兜底：`session-<timestamp>`

### `block_sessions` — blocks 与 sessions 的关联

多对多设计：同一个 block（如通用技术选型决策）可被多个 session 引用。

```sql
CREATE TABLE block_sessions (
  block_id   TEXT NOT NULL,    -- → blocks.id（无 FK，应用层保证）
  session_id TEXT NOT NULL,    -- → sessions.id（无 FK，应用层保证）
  linked_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (block_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_block_sessions_session ON block_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_block_sessions_block ON block_sessions(block_id);
```

`INSERT OR IGNORE` 保证幂等性 — 同一 `(block_id, session_id)` 对重复写入时静默忽略。

**清理策略**：无 CASCADE，由 `session delete <id>` 命令在事务中显式执行：

```sql
BEGIN;
  DELETE FROM block_sessions WHERE session_id = ?;
  DELETE FROM session_links WHERE from_id = ? OR to_id = ?;
  DELETE FROM sessions WHERE id = ?;
COMMIT;
```

### `session_links` — session 间的自动发现关联

对称关系，只存一个方向 `(from_id < to_id)`，避免重复：

```sql
CREATE TABLE session_links (
  from_id    TEXT NOT NULL,    -- → sessions.id（字典序较小的一方）
  to_id      TEXT NOT NULL,    -- → sessions.id（字典序较大的一方）
  confidence REAL NOT NULL,    -- 0-1，Jaccard 相似度
  reason     TEXT,             -- 如 "共享 12 个 block（typescript, ESM）"
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(from_id, to_id),
  CHECK(from_id < to_id)       -- 强制对称存储约束
);
```

查询时用 `WHERE from_id = ? OR to_id = ?` 取双向结果。

---

## TypeScript 接口

**`src/models/session.ts`**（新建文件）：

```typescript
export interface Session {
  id: string;               // 'ses_<hex>'
  name: string;
  path: string | null;
  tags: string[];           // 最多 50 个，每个 ≤ 64 字符
  last_active_at: number;   // Unix 秒
  created_at: number;
  updated_at: number;
}

export interface SessionLink {
  from_id: string;
  to_id: string;
  confidence: number;       // 0-1
  reason: string | null;
  created_at: number;
}

export interface CreateSessionInput {
  name: string;
  path?: string;
  tags?: string[];
}
```

---

## 数据库方法（`database.ts` 新增）

```typescript
// 幂等：相同 path 不重复创建；path 经 path.resolve() 规范化后传入
getOrCreateSession(cwd: string): Session

// 单条关联，INSERT OR IGNORE（重复时静默忽略）
linkBlockToSession(blockId: string, sessionId: string): void

// 批量关联，单事务；blockIds 中不存在的 block 静默跳过（INSERT OR IGNORE）
// 返回实际成功关联的数量
linkBlocksToSession(blockIds: string[], sessionId: string): number

// 按 session 查询 blocks（分页；limit 默认 50，最大 1000；offset 默认 0）
getBlocksBySession(sessionId: string, limit?: number, offset?: number): Block[]

// 查询最近活跃的 sessions（activeSince 为 Unix 秒时间戳）
getRecentSessions(options: { activeSince: number }): Session[]

// 查询 session 的所有关联（双向：WHERE from_id = ? OR to_id = ?）
getSessionLinks(sessionId: string): SessionLink[]

// 删除 session 及关联数据（单事务：block_sessions + session_links + sessions）
deleteSession(sessionId: string): void
```

---

## 数据库迁移

在 `createSchema()` 末尾，用 `PRAGMA user_version` 追踪（当前已用到 version 1）：

```typescript
const userVersion = this.db.pragma('user_version', { simple: true }) as number;

// M002: 创建 sessions / block_sessions / session_links 表
if (userVersion < 2) {
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (...);
    CREATE TABLE IF NOT EXISTS block_sessions (...);
    CREATE TABLE IF NOT EXISTS session_links (...);
    -- 索引
  `);
  this.db.pragma('user_version = 2');
}
```

---

## 核心流程

### 1. 写入时打标（主路径）

`corivo save` 命令新增 `--cwd <path>`（Claude Code 插件自动传入 `process.cwd()`，默认值为 `process.cwd()`，路径规范化为绝对路径）：

```
corivo save "内容" --cwd /Users/foo/Corivo
  ↓
1. path.resolve(cwd)                        -- 规范化为绝对路径
2. db.getOrCreateSession(resolvedPath)      -- 幂等创建
3. db.createBlock(...)                      -- 正常写入 block
4. db.linkBlockToSession(block.id, session.id)
5. db.updateSession(session.id, { last_active_at: now() })
```

`--cwd` 缺失时，跳过 session 关联（不强制要求）。

### 2. 历史 block 补链（Cold Scan）

`ColdScanner.scan(options: { projectPath: string })` 扫描结束后批量补链：

```
scan() 产出 blocks[]
  → db.getOrCreateSession(options.projectPath)
  → db.linkBlocksToSession(blocks.map(b => b.id), session.id)
```

`src/cold-scan/index.ts` 的 `scan()` 函数签名新增 `projectPath` 参数（可选，缺省时不补链）。

### 3. Session 自动标签（心跳，每 5 分钟）

`Heartbeat.processSessionTags()`（WAL 模式下单进程，无并发问题）：

```
for session of db.getRecentSessions({ activeSince: now - 24h }):
  1. blocks = db.getBlocksBySession(session.id)
  2. 统计 annotation 领域分布 + 合并 pattern.context_tags
  3. candidates = 频率 ≥ 2 的 tag，最多取 20 个
  4. newTags = union(session.tags, candidates).slice(0, 50)  // 只增不减，上限 50
  5. if newTags != session.tags:
       db.updateSession(session.id, { tags: newTags })
```

### 4. 跨 session 关联发现（心跳，每 30 分钟）

`Heartbeat.processSessionLinks()`（仅对最近 7 天活跃的 session 计算，控制 O(N²) 范围）：

```
recentSessions = db.getRecentSessions({ activeSince: now - 7d })

for (sessionA, sessionB) of pairs(recentSessions):  // from_id < to_id
  blocksA = block_sessions WHERE session_id = A
  blocksB = block_sessions WHERE session_id = B
  shared  = blocksA ∩ blocksB
  jaccard = |shared| / |blocksA ∪ blocksB|

  if jaccard >= 0.15:
    UPSERT session_links(from_id=min(A,B), to_id=max(A,B), confidence, reason)
  else:
    DELETE FROM session_links WHERE from_id=min(A,B) AND to_id=max(A,B)
```

---

## 新增 CLI 命令

**`src/cli/commands/session.ts`**（新建）：

| 命令 | 说明 |
|------|------|
| `corivo session list` | 列出所有 session，按 last_active_at 降序 |
| `corivo session show <id\|name>` | 显示 session 详情（blocks 列表 + tags + 关联 session） |
| `corivo session tag <id> <tag>` | 手动追加标签（幂等） |
| `corivo session delete <id>` | 删除 session 及关联数据（事务） |

**`src/cli/index.ts`** 注册 session 子命令。

---

## 受影响文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/models/session.ts` | 新建 | Session / SessionLink / CreateSessionInput 接口 |
| `src/models/index.ts` | 修改 | 导出 Session / SessionLink / CreateSessionInput |
| `src/storage/database.ts` | 修改 | createSchema M002 + 6 个新方法 |
| `src/engine/heartbeat.ts` | 修改 | processSessionTags / processSessionLinks 任务 |
| `src/cli/commands/save.ts` | 修改 | 新增 `--cwd` 参数 |
| `src/cli/commands/session.ts` | 新建 | session 子命令实现 |
| `src/cli/index.ts` | 修改 | 注册 session 子命令 |
| `src/cold-scan/index.ts` | 修改 | scan() 新增 projectPath 参数，补链逻辑 |

---

## 不在此次范围内

- 对话历史文件（`~/.claude/sessions/`）的实时采集
- session 的手动合并或拆分
- 多设备 session 同步（solver 层扩展）

---

## 验证

1. **编译**：`npm run build` 通过
2. **写入时打标**：`corivo save "测试" --cwd /path/to/project` → `corivo session list` 出现该项目
3. **幂等性**：相同 `--cwd` 连续 save 2 次 → `sessions` 表只有 1 条记录
4. **跨 session 关联**：单元测试直接调用 `heartbeat.processSessionLinks()`，跳过时间等待
5. **session delete**：删除后 `block_sessions` 和 `session_links` 相关记录全部清除
6. **单元测试**：`__tests__/unit/database.test.ts` 新增 sessions 相关 CRUD 用例
