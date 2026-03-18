# 17 · 性能基准

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：性能指标与基准测试

---

## 性能目标

```
┌─────────────────────────────────────────────────────────────┐
│                      性能目标金字塔                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                        P99                                  │
│                      ────────                               │
│                     用户感知延迟                            │
│                  < 100ms 感知即时                            │
│                                                             │
│                        P95                                  │
│                      ───────                                │
│                    正常使用体验                              │
│                  < 50ms 流畅响应                             │
│                                                             │
│                        P50                                  │
│                      ─────                                 │
│                     核心操作                                │
│                  < 10ms 即时处理                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 核心操作性能指标

| 操作 | P50 | P95 | P99 | 说明 |
|------|-----|-----|-----|------|
| `corivo save` | < 10ms | < 50ms | < 100ms | 写入本地数据库 |
| `corivo query` | < 20ms | < 100ms | < 200ms | 语义搜索 |
| 规则引擎提取 | < 5ms | < 10ms | < 20ms | 纯本地计算 |
| LLM 模式提取 | < 500ms | < 2s | < 5s | 网络 LLM 调用 |
| 心跳循环 | < 1s | < 3s | < 5s | 完整一轮心跳 |
| 同步推送 | < 100ms | < 500ms | < 2s | E2EE 中继通信 |

---

## 2. 数据库性能

### 2.1 SQLCipher 性能特性

```
操作                │ 加密开销 │ 性能建议
────────────────────┼─────────┼──────────────────────────
单条插入            │ +10%    │ 批量写入使用事务
主键查询            │ +5%     │ 自动优化
全文搜索 (FTS5)     │ +15%    │ 索引优化
向量相似度 (vss)    │ +20%    │ 限制结果集
大规模扫描          │ +30%    │ 分页 + 状态过滤
```

### 2.2 查询优化策略

```sql
-- 状态索引（核心优化）
CREATE INDEX idx_blocks_status_vitality ON blocks(status, vitality DESC);

-- 全文搜索索引
CREATE VIRTUAL TABLE blocks_fts USING fts5(content, content=blocks);

-- 向量索引（如果使用 sqlite-vss）
CREATE VIRTUAL TABLE blocks_vss USING vss0(
  content_vector(1536)
);
```

### 2.3 并发控制

```javascript
// WAL 模式配置
PRAGMA journal_mode = WAL;        -- 提高并发
PRAGMA synchronous = NORMAL;       -- 平衡性能和安全
PRAGMA cache_size = -64000;        -- 64MB 缓存
PRAGMA temp_store = MEMORY;         -- 临时表在内存
PRAGMA mmap_size = 30000000000;     -- 30GB mmap
```

---

## 3. 规则引擎性能

### 3.1 规则索引

```javascript
// 按匹配频率排序规则
const RULE_PRIORITY = {
  'tech-choice': 100,      // 最常见
  'communication': 90,
  'time-commitment': 80,
  'preference': 70,
  // ...
}

// 提前编译正则表达式
class Rule {
  constructor(config) {
    this.patterns = config.patterns.map(p => new RegExp(p, 'gi'))
    this.compiled = true
  }

  extract(content) {
    for (let regex of this.patterns) {
      const match = content.match(regex)
      if (match) return this.processMatch(match)
    }
    return null
  }
}
```

### 3.2 短路优化

```javascript
// 高频规则优先
const sortedRules = rules.sort((a, b) => b.priority - a.priority)

// 匹配成功立即返回
function extractWithRules(content) {
  for (let rule of sortedRules) {
    const result = rule.extract(content)
    if (result) return result  // 短路
  }
  return null
}
```

### 3.3 性能基准

| 场景 | Block 数 | 目标时间 | 实测时间 |
|------|---------|---------|---------|
| 纯规则提取 | 1,000 | < 100ms | ~80ms |
| 纯规则提取 | 10,000 | < 1s | ~750ms |
| 混合提取 (80% 规则) | 1,000 | < 500ms | ~400ms |
| 混合提取 (20% LLM) | 1,000 | < 3s | ~2.5s |

---

## 4. LLM 调用优化

### 4.1 批处理

```javascript
// 单次调用 vs 批处理
async function extractPatternsBatch(blocks) {
  // ❌ 串行：1000 次 × 2s = 33 分钟
  for (let block of blocks) {
    await llm.extract(block)
  }

  // ✅ 批量：10 次 × 2s = 20 秒
  const batches = chunk(blocks, 100)
  for (let batch of batches) {
    await llm.extractBatch(batch)
  }
}
```

### 4.2 本地模型优先

```
模型      │ 延迟    │ 成本    │ 质量
─────────┼────────┼────────┼────────
Qwen 7B  │ ~200ms │ $0     │ 良好
Qwen 14B │ ~500ms │ $0     │ 很好
Claude API│ ~2s   │ ~$0.002│ 优秀
```

**策略：** 本地模型处理 80%，API 处理 20% 复杂场景。

### 4.3 缓存策略

```javascript
// 模式提取缓存
const patternCache = new LRU({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24  // 24 小时
})

async function extractPatternWithCache(block) {
  const cacheKey = hash(block.content)

  let pattern = patternCache.get(cacheKey)
  if (pattern) {
    return { ...pattern, from_cache: true }
  }

  pattern = await extractPattern(block)
  patternCache.set(cacheKey, pattern)

  return pattern
}
```

---

## 5. 心跳引擎性能

### 5.1 任务队列优化

```javascript
// 优先级队列
class HeartbeatQueue {
  private pending: PriorityQueue<Task>
  private running: Set<string>

  async run(duration: number) {
    const start = Date.now()
    let processed = 0

    while (Date.now() - start < duration) {
      // 优先处理 pending block
      const task = this.pending.dequeue()

      if (!task) break

      await this.execute(task)
      processed++
    }

    return { processed, remaining: this.pending.size }
  }
}
```

### 5.2 批量控制

| 任务类型 | 单次批量 | 目标时间 |
|---------|---------|---------|
| 标注 pending | 10 条 | < 500ms |
| 模式提取 | 5 条 | < 2s |
| 重构 | 5 条 | < 1s |
| 热区整合 | 20 条 | < 500ms |

### 5.3 时间分配

```
5 秒心跳窗口分配：
├── pending 标注：最多 1.5s（30%）
├── 模式提取：最多 2s（40%）
├── 重构：最多 500ms（10%）
├── 整合：最多 500ms（10%）
└── 预留：500ms（10%）
```

---

## 6. 同步性能

### 6.1 压缩策略

```javascript
// diff 压缩
async function prepareChanges(blocks) {
  // 只传输变更的字段
  const diffs = blocks.map(block => ({
    id: block.id,
    changed: diff(block.original, block.updated),
    timestamp: block.updated_at
  }))

  // 压缩
  const compressed = await gzip(JSON.stringify(diffs))

  return compressed
}
```

### 6.2 增量同步

```
全量同步 vs 增量同步：
├── 全量：传输所有 block（假设 1000 个 × 1KB = 1MB）
└── 增量：只传输变更（假设 10 个 × 100 字节 diff = 1KB）

压缩比：1000x
```

### 6.3 冲突检测优化

```javascript
// 向量时钟优化
interface BlockVersion {
  id: string
  version: number          // 单调递增
  deviceVersions: Map<string, number>  // 各设备版本

  isConflicting(other: BlockVersion): boolean {
    // 冲突：双方都有对方没有的版本
    const hasNewer = this.version > other.version
    const hasOtherNewer = Object.keys(other.deviceVersions).some(
      device => (this.deviceVersions.get(device) || 0) < other.deviceVersions.get(device)
    )

    return hasNewer && hasOtherNewer
  }
}
```

---

## 7. GUI 性能

### 7.1 图谱渲染优化

```javascript
// 虚拟化滚动
import { VirtualScroller } from 'virtual-scroller'

// 只渲染可见节点
<GraphVirtualScroller
  items={nodes}
  itemHeight={50}
  viewportHeight={600}
  renderItem={(node) => <GraphNode node={node} />}
/>

// 分层渲染
{
  hot: { render: true, detail: 'full' },
  cooling: { render: true, detail: 'simple' },
  cold: { render: false, detail: 'none' }
}
```

### 7.2 WebSocket 推送优化

```javascript
// 批量推送
const updateBuffer = new EventEmitter()
let bufferTimer: NodeJS.Timeout

updateBuffer.on('update', (update) => {
  buffer[update.id] = update

  // 100ms 后批量发送
  clearTimeout(bufferTimer)
  bufferTimer = setTimeout(() => {
    ws.send(JSON.stringify(Object.values(buffer)))
    buffer = {}
  }, 100)
})
```

---

## 8. 内存管理

### 8.1 内存目标

| 组件 | 内存上限 | 说明 |
|------|---------|------|
| CLI 进程 | 100MB | 基础运行 |
| MCP Server | 200MB | + 连接管理 |
| GUI 进程 | 300MB | + 图谱缓存 |
| 心跳队列 | 50MB | 任务队列 |

### 8.2 缓存策略

```javascript
// LRU 缓存配置
const QUERY_CACHE = new LRU({
  max: 1000,              // 最多 1000 个
  maxSize: 50 * 1024 * 1024,  // 50MB
  ttl: 1000 * 60 * 5       // 5 分钟
})

// 定期清理
setInterval(() => {
  QUERY_CACHE.prune()
}, 60 * 1000)  // 每分钟
```

### 8.3 流式处理

```javascript
// 大量数据分批处理
async function* streamBlocks(filters) {
  let offset = 0
  const BATCH_SIZE = 100

  while (true) {
    const batch = await db.query({
      ...filters,
      limit: BATCH_SIZE,
      offset
    })

    if (batch.length === 0) break

    yield* batch
    offset += BATCH_SIZE
  }
}

// 使用
for await (let block of streamBlocks({ status: 'active' })) {
  process(block)
}
```

---

## 9. 性能监控

### 9.1 指标收集

```javascript
// 性能指标
class PerformanceMonitor {
  private metrics: Map<string, Histogram>

  record(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, new Histogram())
    }
    this.metrics.get(operation).record(duration)
  }

  report() {
    const report: Record<string, any> = {}

    for (let [op, hist] of this.metrics) {
      report[op] = {
        p50: hist.percentile(50),
        p95: hist.percentile(95),
        p99: hist.percentile(99),
        avg: hist.mean()
      }
    }

    return report
  }
}

// 使用
const monitor = new PerformanceMonitor()

async function traced<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    monitor.record(name, Date.now() - start)
  }
}
```

### 9.2 性能报告

```bash
# 性能报告命令
$ corivo benchmark

性能报告（最近 7 天）：
┌─────────────────┬─────────┬─────────┬─────────┬─────────┐
│ 操作           │ P50     │ P95     │ P99     │ 目标    │
├─────────────────┼─────────┼─────────┼─────────┼─────────┤
│ save           │ 8ms     │ 45ms    │ 95ms    │ <100ms  │ ✓
│ query          │ 15ms    │ 85ms    │ 180ms   │ <200ms  │ ✓
│ 规则提取        │ 3ms     │ 8ms     │ 18ms    │ <20ms   │ ✓
│ LLM 提取        │ 450ms   │ 1.8s    │ 4.5s    │ <5s     │ ✓
│ 心跳循环        │ 800ms   │ 2.5s    │ 4.8s    │ <5s     │ ✓
│ 同步推送        │ 90ms    │ 420ms   │ 1.8s    │ <2s     │ ✓
└─────────────────┴─────────┴─────────┴─────────┴─────────┘

热路径：
1. query (占比 45%)
2. save (占比 30%)
3. 规则提取 (占比 15%)

性能退化警告：
⚠ query P95 从上周的 70ms 增加到 85ms
```

---

## 10. 性能测试套件

```bash
# 运行性能测试
npm run benchmark

# 持续性能监控
npm run benchmark:watch

# 性能回归检测
npm run benchmark:compare --against=main
```

### 基准测试文件

```typescript
// benchmarks/pattern-extraction.bench.ts
import { Benchmark } from 'benchmark'

const suite = new Benchmark()

suite
  .add('规则引擎提取', () => {
    ruleEngine.extract('选择使用 React 作为前端框架')
  })
  .add('LLM 提取（模拟）', async () => {
    await llmService.extract('选择使用 React 作为前端框架')
  })
  .on('cycle', (event) => {
    console.log(String(event.target))
  })
  .run()
```

---

## 设计决策

**为什么 P99 比 P50 更重要？** 用户对最差情况的体验决定整体满意度。P99 是用户感知的"正常最坏情况"。

**为什么需要批处理？** 网络调用有固定开销。批量处理将 N 次开销降为 1 次，显著提升吞吐量。

**为什么规则引擎需要索引？** 规则数量增加后，线性扫描变慢。按优先级排序和短路优化保持性能稳定。

**为什么需要性能监控？** 性能退化是渐进的，容易被忽略。监控让退化可见，在成为问题前修复。

**为什么 GUI 需要虚拟化？** 图谱可能有数千节点，全部渲染会卡顿。虚拟化只渲染可见部分，保持流畅。
