# 20 · 团队版 CRDT 实现

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：CRDT 选型与集成方案

---

## 为什么使用现成库

CRDT（Conflict-free Replicated Data Types）实现复杂，容易出错。使用成熟的开源库：
- **开发成本**：从 3-6 个月降低到 1-2 周
- **正确性**：经过大规模验证
- **维护成本**：社区维护，bug 修复及时

---

## 推荐方案

### 方案对比

| 库 | 语言 | 类型 | 推荐度 | 理由 |
|-----|------|------|--------|------|
| **Yjs** | TypeScript/JS | 通用 | ⭐⭐⭐⭐⭐ | 完善、活跃、TypeScript 原生 |
| Automerge | TypeScript | 文本 | ⭐⭐⭐⭐ | 专注文本，但更通用 |
| AutomergeRust | Rust | 绑定 | ⭐⭐⭐ | 性能更好，但 FFI 复杂 |
| Diamond-types | TypeScript | 类型 | ⭐⭐⭐ | 轻量，但功能有限 |

**推荐：Yjs**

---

## Yjs 集成方案

### 安装

```bash
npm install yjs
```

### 数据模型映射

```typescript
// crivo/crdt.ts
import * as Y from 'yjs'

// Corivo Doc - Yjs 文档类型
export class CorivoDoc {
  private doc: Y.Doc

  constructor() {
    this.doc = new Y.Doc()
  }

  // 获取 Block Map
  getBlocks(): Y.Map<string, BlockData> {
    return this.doc.getMap('blocks')
  }

  // 获取用户信息
  getUserInfo(): Y.Map<UserData> {
    return this.doc.getMap('users')
  }

  // 获取文档状态
  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  // 应用更新
  applyUpdate(update: Uint8Array) {
    Y.applyUpdate(this.doc, update)
  }

  // 绑定事件
  onBlockChange(callback: (block: BlockData, transaction: Y.Transaction) => void) {
    this.doc.getMap('blocks').observe(callback)
  }

  // 创建 Transaction
  transact(fn: (doc: Y.Doc) => void) {
    this.doc.transact(fn)
  }
}

// Block 数据接口
interface BlockData {
  id: string
  content: string
  annotation: string
  refs: string[]
  namespace: string
  visibility: 'private' | 'team' | 'public'
  vitality: number
  status: 'active' | 'cooling' | 'cold' | 'archived'
  pattern?: DecisionPattern
  author?: string
  created_at: number
  updated_at: number
  deleted?: boolean  // 软删除标记
}

// 用户数据接口
interface UserData {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  joined_at: number
}
```

---

## CRDT 数据类型选择

### 1. Y.Map（主要数据结构）

```typescript
// blocks 是核心数据结构，使用 Y.Map
const blocks = ydoc.getMap<string, BlockData>('blocks')

// 操作示例
blocks.set('blk_1', {
  id: 'blk_1',
  content: '测试内容',
  annotation: '事实 · knowledge · 测试',
  refs: ['blk_2'],
  vitality: 100
})

// 读取
const block = blocks.get('blk_1')

// 删除（软删除）
blocks.set('blk_1', { ...blocks.get('blk_1'), deleted: true })
```

### 2. Y.Array（辅助数据结构）

```typescript
// 用于团队活动的日志
const activityLog = ydoc.getArray<ActivityItem>('activityLog')

activityLog.push([{
  type: 'block.created',
  blockId: 'blk_1',
  userId: 'user_1',
  timestamp: Date.now()
}])
```

### 3. Y.Text（协作内容）

```typescript
// 用于团队协作文档
const docContent = ydoc.getText('doc_content')

// 协作编辑
docContent.insert(0, '团队决策...')
docContent.delete(5, 3)  // 删除字符
```

---

## 同步协议

### 客户端同步

```typescript
// crivo/sync.ts
import { WebsocketProvider } from 'y-websocket'
import { WebrtcProvider } from 'y-webrtc'

// WebSocket 提供者（连接到中继服务器）
const wsProvider = new WebsocketProvider({
  document: corivoDoc,
  url: 'wss://relay.corivo.app/sync',
  // E2EE 加密层
  awarenesStates: true,
  connect: true
})

// WebRTC 提供者（P2P 直连，可选）
const webrtcProvider = new WebrtcProvider({
  document: corivoDoc,
  signaling: 'wss://relay.corivo.app/signaling',
  // E2EE 加密层
})

// 监听同步状态
wsProvider.on('sync', (isSynced: boolean) => {
  console.log('Sync status:', isSynced ? 'synced' : 'syncing...')
})

wsProvider.on('connection-error', (error) => {
  console.error('Sync error:', error)
})
```

### 中继服务器

```javascript
// relay/server.js (Node.js)
const WebSocket = require('ws')
const Y = require('yjs')

const Yws = require('y-websocket/bin/utils')

const server = new WebSocket.Server({ port: 1234 })

server.on('connection', (ws, req) => {
  const doc = new Y.Doc()
  const wsHandler = Yws.setupWSConnection(doc, ws)

  // E2EE：中继只看到加密数据
  // 解密在客户端进行
})
```

---

## 冲突解决策略

### 文本内容冲突

```typescript
// Yjs 自动处理，无需手动干预
// 但可以监听冲突事件

// 监听冲突
ydoc.on('update', (update, origin) => {
  if (origin === null) {
    // 本地更新
    console.log('本地修改')
  } else {
    // 远程更新
    console.log('远程修改')
  }
})
```

### 并发修改同一 Block

```typescript
// 用户 A 和 B 同时修改同一个 block
// Yjs 会自动合并，保留双方修改

// 场景：
// A 修改 content，B 修改 vitality
// Yjs 自动合并，两个修改都保留

// 如果修改同一字段：
// Yjs 使用 Last-Write-Wins
```

---

## 权限与 CRDT 的结合

### 服务器端权限验证

```typescript
// 权限中间件
class PermissionMiddleware {
  canWrite(user: User, block: BlockData): boolean {
    // 个人 block
    if (block.namespace === 'default') {
      return user.id === block.author
    }

    // 团队 block
    if (block.namespace.startsWith('team:')) {
      const teamId = extractTeamId(block.namespace)
      return canWriteToTeam(user, teamId)
    }

    return false
  }

  applyUpdate(user: User, blockId: string, updates: Partial<BlockData>): boolean {
    const block = this.blocks.get(blockId)

    if (!this.canWrite(user, block)) {
      throw new PermissionError('No write permission')
    }

    // 允许修改
    this.blocks.set(blockId, { ...block, ...updates })
    return true
  }
}
```

### 客户端权限检查

```typescript
// 客户端也做本地检查，避免无效请求
function canWriteLocally(user: User, block: BlockData): boolean {
  // 快速本地检查
  if (block.namespace === 'default') {
    return user.id === block.author
  }

  // 团队权限缓存
  const teamPerms = user.getCachedPermissions(block.namespace)
  return teamPerms.canWrite
}
```

---

## 性能优化

### 1. 增量同步

```typescript
// Yjs 自动增量同步
// 只传输变更的部分，不是完整文档

// 监听实际传输量
wsProvider.on('sync', (isSynced: boolean) => {
  if (!isSynced) {
    // 计算本次同步的数据量
    const updateSize = Y.encodeStateAsUpdate(corivoDoc).byteLength
    console.log(`Syncing ${updateSize} bytes...`)
  }
})
```

### 2. 压缩

```typescript
// 启用压缩
const wsProvider = new WebsocketProvider({
  document: corivoDoc,
  url: 'wss://relay.corivo.app/sync',
  params: {
    // Permessage-Deflate 压缩
    permessageDeflate: true,
    deflateThreshold: 1024  // 只压缩 >1KB 的消息
  }
})
```

### 3. 存储优化

```typescript
// 定期快照 + 增量更新
import { IndexedDBPersistence } from 'y-indexeddb'

// 本地持久化
const idbProvider = new IndexedDBPersistence({
  doc: corivoDoc,
  name: 'corivo-team-1'
})

// 每 5 分钟保存一次快照
setInterval(() => {
  const snapshot = Y.encodeStateAsUpdate(corivoDoc)
  localStorage.setItem('snapshot', JSON.stringify(snapshot))
}, 5 * 60 * 1000)
```

---

## 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        团队同步架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   客户端 A                        客户端 B                   中继服务器  │
│   ┌──────────┐                  ┌──────────┐                ┌─────────┐│
│   │ Corivo   │                  │ Corivo   │                │  Yjs    ││
│   │ + Yjs    │◄─────────────────►│ + Yjs    │◄─────────────►│ Relay   ││
│   └────┬─────┘                  └────┬─────┘                └────┬────┘│
│        │                             │                             │     │
│   ┌────▼─────┐                  ┌────▼─────┐               ┌────▼─────┐│
│   │SQLCipher │                  │SQLCipher │               │PostgreSQL││
│   │ 本地存储 │                  │ 本地存储 │               │ (可选)  ││
│   └──────────┘                  └──────────┘               └──────────┘│
│        │                             │                             │     │
└────────┴─────────────────────────┴─────────────────────────┴─────┘

         │                             │                             │
         ▼                             ▼                             ▼
    E2EE 加密同步（中继看不到明文）
```

---

## 实现 Checkpoint

### Phase 1: 基础集成（1 周）

```bash
# 安装依赖
npm install yjs y-websocket y-indexeddb

# 创建 CRDT 文档类
touch src/crdt/corivo-doc.ts

# 基础测试
npm test -- crdt/basic
```

### Phase 2: 同步集成（1 周）

```bash
# 中继服务器
cd relay && npm install yws y-websocket

# 客户端同步
npm test -- sync/websocket
```

### Phase 3: 权限集成（1 周）

```bash
# 权限中间件
touch src/permissions/middleware.ts

# 集成测试
npm test -- permissions/team
```

---

## 设计决策

**为什么选择 Yjs？**
- TypeScript 原生支持
- API 设计优秀，文档完善
- 社区活跃，问题响应快
- 支持多种同步提供者（WebSocket、WebRTC、IndexedDB）
- 性能优秀，增量同步高效

**为什么不自己实现 CRDT？**
- CRDT 实现极易出错
- 学术论文到工程代码的 gap 很大
- 测试覆盖需要专家级投入
- 现成库经过大规模验证

**为什么保留 E2EE？**
- 团队协作的隐私仍然重要
- 中继服务器仍然是可选的（可自托管）
- E2EE + CRDT 是最佳组合
