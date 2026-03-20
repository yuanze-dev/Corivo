# 13 · 记忆 API（Personal Data Protocol）

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> E2 扩展：记忆 API 标准化 · P1 优先级

---

## 定位

Corivo CLI 是核心接口，但 Corivo 的愿景不止于此。

Personal Data Protocol（PDP）让 Corivo 成为"个人数据的标准协议"——任何 AI 工具、任何服务，都可以通过统一的 API 访问用户的个人记忆层。

---

## 核心理念

**个人数据应该像 DNS 一样——分布式、标准协议、多方实现。**

- Corivo 提供参考实现
- 协议开源，任何人可以实现自己的 PDP 服务器
- 客户端（AI 工具）只需要实现 PDP 客户端

---

## 协议设计

### REST API 结构

```
GET    /pdp/v1/status                    # 服务状态
GET    /pdp/v1/blocks                    # 列出 block
POST   /pdp/v1/blocks                    # 创建 block
GET    /pdp/v1/blocks/:id                # 获取 block
PATCH  /pdp/v1/blocks/:id                # 更新 block
DELETE /pdp/v1/blocks/:id                # 删除 block（归档）

POST   /pdp/v1/query                     # 查询 block
POST   /pdp/v1/sync                      # 同步数据

GET    /pdp/v1/namespaces                # 列出命名空间
GET    /pdp/v1/namespaces/:id            # 获取命名空间信息

POST   /pdp/v1/actions                   # 执行工具调用
GET    /pdp/v1/actions/:id               # 获取执行状态
POST   /pdp/v1/actions/:id/cancel        # 取消执行
```

### 核心数据结构

```typescript
// Block 对象
interface Block {
  id: string                    // 唯一标识
  content: string               // 自然语言内容
  annotation: string            // 双维度标注
  refs: string[]                // 引用的 block ID
  source: string                // 来源标识
  namespace: string             // 命名空间
  visibility: "private" | "team" | "public"
  vitality: number              // 生命力 0-100
  status: "active" | "cooling" | "cold" | "archived"
  pattern?: DecisionPattern     // 决策模式
  author?: string               // 创建者（团队版）
  created_at: string            // ISO 8601
  updated_at: string            // ISO 8601
}

// 查询请求
interface QueryRequest {
  query: string                  // 自然语言查询
  filters?: {
    annotation?: string          // 标注过滤
    namespace?: string           // 命名空间过滤
    status?: string              // 状态过滤
    after?: string               // 时间过滤
    before?: string
  }
  limit?: number                 // 返回数量限制
  offset?: number                // 分页偏移
}

// 查询响应
interface QueryResponse {
  blocks: Block[]
  total: number
  related?: Block[]              // 相关推荐
  context?: {                    // 额外上下文
    pattern_match?: DecisionPattern[]
    confidence?: number
  }
}

// 同步请求
interface SyncRequest {
  device_id: string
  last_seq: number               // 上次同步的序列号
  changes: SyncChange[]          // 推送的变更
}

interface SyncChange {
  id: string
  encrypted: string              // 加密数据（Base64）
  nonce: string                  // 加密 nonce
  timestamp: number
}

// 同步响应
interface SyncResponse {
  server_seq: number             // 服务器当前序列号
  changes: SyncChange[]          // 需要拉取的变更
}
```

---

## 认证与授权

### API Token

```bash
# 创建 API Token
$ corivo token create --name "Claude Desktop"

Token 已创建：
corivo_pat_xxxxx.xxxxxxxxxxxxxxx

请妥善保管，仅显示一次。

# 列出 Token
$ corivo token list

活跃的 Token：
  ├── Claude Desktop (corivo_pat_xxxxx...)  创建于 2026-03-10
  ├── Cursor (corivo_pat_yyyyy...)          创建于 2026-03-15
  └── Test Script (corivo_pat_zzzzz...)     创建于 2026-03-18

# 撤销 Token
$ corivo token revoke corivo_pat_xxxxx...
```

### Token 权限

| Token 类型 | 权限范围 | 用途 |
|-----------|---------|------|
| **读取** | `read:blocks` | 只读访问 |
| **写入** | `read:blocks`, `write:blocks` | 读写 block |
| **同步** | `read:blocks`, `write:blocks`, `sync` | 完整同步 |
| **管理** | `*` | 所有权限 |

```bash
# 创建受限 Token
$ corivo token create --name "Read-only bot" --scope read:blocks

# 创建同步 Token
$ corivo token create --name "My Phone" --scope "read:blocks,write:blocks,sync"
```

### 请求头

```http
Authorization: Bearer corivo_pat_xxxxx.xxxxxxxxxxxxxxx
Content-Type: application/json
X-PDP-Client: claude-desktop/1.0
X-PDP-Device: my-macbook-pro
```

---

## 使用示例

### 基础操作

```bash
# 创建 block
curl -X POST http://localhost:3000/pdp/v1/blocks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Corivo 使用 SQLCipher 作为本地存储",
    "annotation": "决策 · project · corivo",
    "namespace": "default"
  }'

# 查询 block
curl -X POST http://localhost:3000/pdp/v1/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "数据库选型",
    "filters": {
      "annotation": "决策"
    },
    "limit": 10
  }'

# 更新 block
curl -X PATCH http://localhost:3000/pdp/v1/blocks/blk_a3f29x \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "更新后的内容"
  }'
```

### 同步流程

> 底层 E2EE 实现详见 [03-storage.md](./03-storage.md#多设备同步e2ee-中继)。

```bash
# 推送本地变更
curl -X POST http://localhost:3000/pdp/v1/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "my-macbook-pro",
    "last_seq": 123,
    "changes": [
      {
        "id": "blk_a3f29x",
        "encrypted": "base64data...",
        "nonce": "random",
        "timestamp": 1709234567
      }
    ]
  }'

# 响应：拉取服务器的变更
{
  "server_seq": 456,
  "changes": [
    {
      "id": "blk_new1",
      "encrypted": "base64data...",
      "nonce": "random2",
      "timestamp": 1709234600
    }
  ]
}
```

---

## MCP 映射

Corivo MCP Server 是 PDP API 的一个包装：

```typescript
// MCP Tool 定义
const tools = {
  "corivo.save": {
    description: "保存一个 block 到 Corivo",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        annotation: { type: "string" }
      },
      required: ["content"]
    }
  },

  "corivo.query": {
    description: "查询 Corivo 中的 block",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        filters: { type: "object" }
      },
      required: ["query"]
    }
  }
}

// MCP Tool 实现 → PDP API
async function corivoSave(args: any) {
  const response = await fetch(`${API_BASE}/blocks`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  })
  return await response.json()
}
```

---

## 第三方集成

### Webhook

Corivo 支持配置 Webhook，在特定事件发生时通知第三方服务：

```bash
# 创建 Webhook
$ corivo webhook create \
  --url "https://myapp.com/corivo/events" \
  --events "block.created,block.updated"

Webhook 已创建：
URL: https://myapp.com/corivo/events
Secret: whsec_xxxxx
事件: block.created, block.updated
```

### Webhook Payload

```json
{
  "event": "block.created",
  "timestamp": "2026-03-18T14:23:45Z",
  "data": {
    "id": "blk_a3f29x",
    "content": "...",
    "annotation": "决策 · project · corivo"
  }
}
```

### Webhook 签名验证

```typescript
import crypto from 'crypto'

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return signature === `sha256=${digest}`
}
```

---

## SDK

### TypeScript/JavaScript SDK

```typescript
import { CorivoClient } from '@corivo/sdk'

const client = new CorivoClient({
  baseURL: 'http://localhost:3000',
  token: 'corivo_pat_xxxxx...'
})

// 创建 block
const block = await client.blocks.create({
  content: '示例内容',
  annotation: '知识 · knowledge · 示例'
})

// 查询
const results = await client.blocks.query({
  query: '数据库选型',
  filters: { annotation: '决策' }
})

// 同步
await client.sync.push({
  device_id: 'my-device',
  changes: localChanges
})
const pullResult = await client.sync.pull({
  device_id: 'my-device',
  last_seq: lastSyncSeq
})
```

### Python SDK

```python
from corivo import CorivoClient

client = CorivoClient(
    base_url='http://localhost:3000',
    token='corivo_pat_xxxxx...'
)

# 创建 block
block = client.blocks.create(
    content='示例内容',
    annotation='知识 · knowledge · 示例'
)

# 查询
results = client.blocks.query(
    query='数据库选型',
    filters={'annotation': '决策'}
)
```

---

## 协议版本化

### 版本策略

- **主版本（Major）**：不兼容的 API 变更
- **次版本（Minor）**：向后兼容的新增功能
- **补丁版本（Patch）**：向后兼容的问题修复

### 版本协商

```http
GET /pdp/v1/status
X-PDP-Version: 1.0
```

响应头：

```http
X-PDP-Version: 1.0
X-PDP-Min-Version: 1.0
X-PDP-Latest-Version: 1.2
```

---

## 设计决策

**为什么 REST 而非 GraphQL？** REST 更简单，对于 CRUD 操作足够。GraphQL 的查询能力在 Corivo 场景中不是必需的，反而增加复杂度。

**为什么 API Token 而非 OAuth？** Corivo 是本地优先的服务，用户与服务器在同一信任域。OAuth 对于本地服务过于复杂。

**为什么需要 SDK？** API 是标准，SDK 是便利。良好的 SDK 降低集成成本，让更多工具愿意接入 Corivo。

**为什么需要 Webhook？** 被动等待查询不够，Corivo 需要主动推送事件。Webhook 让第三方服务可以实时响应 Corivo 的变化。

**为什么协议开源？** 只有开源才能成为标准。如果协议是 Corivo 私有的，其他工具不会愿意深度集成。开源协议 + 参考实现 = 生态系统。

---

## 生态愿景

### PDP 成为个人数据标准

```
┌─────────────────────────────────────────────────────────────┐
│                      PDP 生态系统                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  参考实现                                                   │
│  ├── Corivo CLI + MCP Server                               │
│  ├── Corivo 团队版服务器                                    │
│  └── 第三方 PDP 服务器实现                                  │
│                                                             │
│  客户端                                                     │
│  ├── Claude Desktop (MCP)                                  │
│  ├── Cursor (MCP)                                          │
│  ├── VS Code (扩展)                                        │
│  ├── 飞书/Slack (Bot)                                       │
│  └── 第三方 AI 工具                                        │
│                                                             │
│  扩展协议                                                   │
│  ├── PDP Sync Protocol（同步协议）                         │
│  ├── PDP Query Language（查询语言）                        │
│  └── PDP Event Format（事件格式）                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 愿景：个人数据的 DNS

- **个人控制**：数据存在本地，用户完全控制
- **标准协议**：PDP 是开放标准，任何人可以实现
- **多方实现**：Corivo 是参考实现，不是唯一实现
- **工具无关**：任何 AI 工具都可以接入，不绑定特定厂商

这就像 DNS：
- 你可以运行自己的 DNS 服务器
- 也可以使用第三方 DNS 服务
- 协议是标准的，客户端不需要关心后端实现

Corivo 愿景中的 PDP 也是如此——**个人数据的标准协议**。
