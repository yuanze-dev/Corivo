# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 包概述

`@corivo/solver` — Corivo 的 CRDT 同步中继服务器。接收多设备推送的 changeset，存储后供其他设备拉取，实现跨设备记忆同步。

- Fastify v5，ESM TypeScript，Node ≥ 22
- 服务端数据库：`~/.corivo/solver.db`（独立于客户端 `corivo.db`）
- 开发时用 `tsx watch` 热重载，生产用编译后的 `dist/`

---

## 构建与运行

```bash
# 开发（热重载）
npm run dev            # tsx watch src/index.ts

# 构建
npm run build          # tsc → dist/

# 生产启动
npm run start          # node dist/index.js
```

**环境变量（均有默认值）：**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SOLVER_PORT` | `3141` | 监听端口 |
| `SOLVER_HOST` | `127.0.0.1` | 监听地址 |
| `SOLVER_DB_PATH` | `~/.corivo/solver.db` | 服务端数据库路径 |

---

## 目录结构与职责

```
src/
  index.ts          入口：buildServer() + listen()
  server.ts         Fastify 实例工厂，注册所有路由插件
  config.ts         从环境变量读取配置（port / host / dbPath / tokenTtlMs / challengeTtlMs）
  types.ts          Fastify 类型扩展（req.identityId）
  auth/
    challenge.ts    Challenge 存储与验证（内存 Map，TTL 5 分钟）
    auth-plugin.ts  Bearer Token 生成、校验与清理（内存 Map，TTL 1 小时）
  routes/
    health.routes.ts  GET /health
    auth.routes.ts    POST /auth/challenge、POST /auth/verify
    sync.routes.ts    POST /sync/push、POST /sync/pull（需 Bearer Token）
  db/
    server-db.ts    服务端 SQLite 单例（WAL 模式，进程退出自动关闭）
  sync/
    sync-handler.ts pushChangesets() / pullChangesets() 实现
```

---

## 认证流程

Challenge-Response → Bearer Token 两阶段认证：

```
1. POST /auth/challenge
   Body: { identity_id }
   Response: { challenge }         ← 随机字符串，5 分钟有效

2. POST /auth/verify
   Body: { identity_id, challenge, signature }
   Response: { token }             ← 1 小时有效的 Bearer Token

3. 后续请求
   Header: Authorization: Bearer <token>
   → authPreHandler 校验，通过后将 identityId 写入 req.identityId
```

Token 存储在进程内存 `tokenStore: Map<string, TokenEntry>`，每 5 分钟后台清理一次过期条目（`.unref()` 不阻塞退出）。

---

## 数据库 Schema

服务端 `solver.db` 包含三张表：

```sql
accounts     -- identity_id, fingerprints, shared_secret, created_at, last_seen_at
devices      -- device_id, identity_id, site_id, last_sync_version, ...
changesets   -- identity_id, site_id, table_name, pk(BLOB), col_name, col_version,
             --   db_version, value(BLOB), created_at
             -- UNIQUE(identity_id, site_id, table_name, pk, col_version)
```

Changeset 按 `identity_id` 隔离，跨账户不可见。`INSERT OR IGNORE` 保证幂等推送。

---

## 同步端点

**POST /sync/push**（需 Token）

```typescript
Body: {
  site_id: string;       // 推送方设备 ID
  db_version: number;    // 推送方当前版本
  changesets: ChangesetRow[];
}
Response: { stored: number }
```

**POST /sync/pull**（需 Token）

```typescript
Body: {
  site_id: string;
  since_version: number;  // 拉取此版本之后的 changesets
}
Response: {
  changesets: ChangesetRow[];
  current_version: number;
}
```

---

## 添加新功能时的注意事项

**新增路由**：在 `src/routes/` 新建 `*.routes.ts`，导出 Fastify 插件函数，在 `server.ts` 中 `app.register()` 注册。

**需要鉴权的路由**：在路由选项中添加 `preHandler: authPreHandler`（从 `auth/auth-plugin.ts` 导入）。处理函数内通过 `req.identityId` 获取当前身份。

**`req.identityId` 类型**：在 `src/types.ts` 通过 Fastify 类型扩展声明，需在使用前 `import '../types.js'`。
