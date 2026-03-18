# 15 · 边界情况与错误处理

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：边界情况完整设计

---

## 设计原则

**错误是正常的，系统必须优雅降级。**

Corivo 在各种异常情况下的行为必须可预测、可恢复、对用户透明。

---

## 错误分类

```
┌─────────────────────────────────────────────────────────────┐
│                      错误分类体系                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  可恢复错误                                               │
│  ├── 网络错误：超时、连接失败、DNS 解析失败                │
│  ├── 临时故障：服务暂时不可用、限流                         │
│  ├── 资源不足：磁盘空间、内存不足                           │
│  └── 并发冲突：数据库锁定、版本冲突                         │
│                                                             │
│  不可恢复错误                                             │
│  ├── 数据损坏：加密数据无法解密                             │
│  ├── 密钥丢失：主密码和恢复密钥都丢失                       │
│  └── 硬件故障：存储设备损坏                                 │
│                                                             │
│  预期错误                                                 │
│  ├── 输入无效：参数错误、格式错误                           │
│  ├── 权限不足：无法访问文件、拒绝授权                       │
│  └── 功能不支持：操作在当前配置下不可用                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. LLM 相关错误

### 1.1 超时处理

```javascript
// 配置
const LLM_CONFIG = {
  timeout: 10000,           // 10 秒超时
  retries: 2,               // 重试 2 次
  backoff: 'exponential',   // 指数退避
  fallback: 'rule'          // 降级到规则引擎
}

// 处理逻辑
async function callLLM(prompt) {
  for (let attempt = 0; attempt <= LLM_CONFIG.retries; attempt++) {
    try {
      return await llmService.call(prompt, {
        timeout: LLM_CONFIG.timeout
      })
    } catch (error) {
      if (error.code === 'TIMEOUT') {
        if (attempt < LLM_CONFIG.retries) {
          // 指数退避重试
          await sleep(Math.pow(2, attempt) * 1000)
          continue
        }
        // 重试失败，降级
        logger.warn('LLM timeout after retries, falling back to rules')
        return fallbackToRules(prompt)
      }
      throw error  // 非超时错误直接抛出
    }
  }
}
```

### 1.2 限流处理

```javascript
// LLM API 限流响应
if (error.code === 'RATE_LIMIT') {
  const retryAfter = error.headers['retry-after']

  if (retryAfter) {
    // 记录到心跳队列，延后处理
    heartbeat.scheduleRetry({
      task: currentTask,
      after: retryAfter * 1000
    })
  } else {
    // 使用默认退避
    heartbeat.scheduleRetry({
      task: currentTask,
      after: 60000  // 1 分钟后重试
    })
  }
}
```

### 1.3 响应格式错误

```javascript
// LLM 返回无效 JSON
try {
  const result = JSON.parse(llmResponse)
} catch (error) {
  logger.error('Invalid LLM response', { llmResponse, error })

  // 标记为需要人工审查
  block.markForReview({
    reason: 'llm_parse_error',
    rawResponse: llmResponse
  })

  // 降级到 pending，等待后续处理
  block.annotation = 'pending'
  block.status = 'active'
}
```

### 1.4 内容安全拒绝

```javascript
// LLM 拒绝处理（内容策略）
if (error.code === 'CONTENT_POLICY') {
  logger.warn('LLM content policy rejection', { content: block.content })

  // 不存储，记录为噪音
  block.annotation = 'noise · archived'
  block.status = 'archived'
  block.metadata = {
    rejection_reason: 'content_policy',
    timestamp: Date.now()
  }
}
```

---

## 2. 数据库相关错误

### 2.1 并发冲突（SQLCipher）

```sql
-- SQLite 使用 WAL 模式提高并发
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;  -- 5 秒等待

-- 写冲突处理
BEGIN IMMEDIATE;
  -- 写操作
COMMIT;
-- 或 ROLLBACK;
```

```javascript
// 应用层重试
async function writeBlock(block) {
  const MAX_RETRIES = 3

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await db.insert(block)
    } catch (error) {
      if (error.code === 'SQLITE_BUSY') {
        await sleep(100 * (attempt + 1))  // 递增延迟
        continue
      }
      throw error
    }
  }

  throw new Error('Database write failed after retries')
}
```

### 2.2 数据库锁定

```javascript
// 检测锁定
async function checkDatabaseLock() {
  try {
    await db.execute('SELECT 1')
    return false  // 未锁定
  } catch (error) {
    if (error.code === 'SQLITE_LOCKED') {
      return true  // 已锁定
    }
    throw error
  }
}

// 锁定时的行为
if (await checkDatabaseLock()) {
  logger.warn('Database locked, deferring write')

  // 加入队列，等待解锁
  writeQueue.push(block)

  // 通知用户
  if (writeQueue.length > 100) {
    notifyUser('数据库繁忙，写入队列积压')
  }
}
```

### 2.3 数据库损坏恢复

```bash
# 检测损坏
$ corivo doctor

检查数据库完整性...
✓ 数据库结构正常
⚠ 检测到 2 个损坏的 block

# 修复选项
$ corivo repair

修复选项：
[1] 从同步服务器恢复
[2] 从备份恢复
[3] 删除损坏的 block
[4] 手动修复
```

```javascript
// 损坏检测
async function detectCorruption() {
  try {
    await db.execute('PRAGMA integrity_check')
    return []
  } catch (error) {
    // 记录损坏的 block
    const corrupted = await db.execute(`
      SELECT id FROM blocks WHERE content IS NULL
    `)
    return corrupted
  }
}
```

---

## 3. 存储相关错误

### 3.1 磁盘空间不足

```javascript
// 写入前检查
async function checkDiskSpace() {
  const stats = await fs.statfs(config.dataDir)
  const freeGB = stats.bavail * stats.frsize / (1024 ** 3)

  if (freeGB < 1) {  // 小于 1GB
    logger.error('Disk space critical', { freeGB })

    // 采取行动
    notifyUser('磁盘空间不足，Corivo 将暂停写入')

    // 清理归档数据
    await cleanupArchivedBlocks()

    // 如果仍不足，停止采集
    if (freeGB < 0.5) {
      ingestion.pause()
      throw new Error('Disk space critical, ingestion paused')
    }
  }
}

// 定期清理
async function cleanupArchivedBlocks() {
  const oldBlocks = await db.query(`
    SELECT id FROM blocks
    WHERE status = 'archived'
      AND vitality = 0
      AND updated_at < datetime('now', '-90 days')
  `)

  for (let block of oldBlocks) {
    await db.delete(block.id)
  }

  logger.info(`Cleaned up ${oldBlocks.length} old archived blocks`)
}
```

### 3.2 权限错误

```javascript
// 文件访问权限
try {
  await fs.access(config.dataDir, fs.constants.R_OK | fs.constants.W_OK)
} catch (error) {
  logger.error('Data directory not accessible', { path: config.dataDir })

  // 提示用户修复
  notifyUser(`无法访问数据目录：${config.dataDir}`)
  notifyUser('请检查目录权限')

  // 降级到只读模式
  config.readOnlyMode = true
}
```

---

## 4. 网络相关错误

### 4.1 同步失败

```javascript
// E2EE 中继不可用
async function syncWithRelay() {
  try {
    await relay.push(changes)
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      // 中继服务不可用
      logger.warn('Relay server unavailable')

      // 存储到本地队列，等待恢复
      syncQueue.push(changes)

      // 指数退避重试
      scheduleRetry(calculateBackoff())

      // 通知用户（非阻塞）
      notifyUser('同步暂时不可用，变更已缓存到本地')
    }
  }
}
```

### 4.2 部分同步失败

```javascript
// 批量同步时的部分失败
async function batchSync(items) {
  const results = {
    success: [],
    failed: []
  }

  for (let item of items) {
    try {
      await syncItem(item)
      results.success.push(item.id)
    } catch (error) {
      results.failed.push({ id: item.id, error })
    }
  }

  // 记录失败项
  if (results.failed.length > 0) {
    logger.warn('Partial sync failure', {
      failed: results.failed.length,
      total: items.length
    })

    // 重试失败的项
    syncQueue.retry(results.failed)
  }

  return results
}
```

---

## 5. 密钥相关错误

### 5.1 密钥验证失败

```bash
$ corivo unlock

错误：密钥验证失败

可能的原因：
[1] 主密码错误
[2] 数据库文件已损坏
[3] 密钥存储文件丢失

解决方法：
[1] 重新输入主密码
[2] 使用恢复密钥恢复
[3] 从备份恢复
[4] 初始化新数据库（将丢失所有数据）
```

```javascript
// 密钥验证逻辑
async function verifyMasterKey(password) {
  try {
    const derivedKey = await deriveKey(password)
    const testDecrypt = await decrypt(derivedKey, header.salt)

    if (testDecrypt === header.expected) {
      return true
    }

    return false  // 密码错误
  } catch (error) {
    if (error.code === 'DECRYPTION_FAILED') {
      logger.error('Key verification failed')

      // 检查是否是恢复密钥
      if (isRecoveryKey(password)) {
        return 'recovery_key'
      }
    }
    throw error
  }
}
```

### 5.2 设备授权失败

```javascript
// 新设备注册失败
async function registerDevice(authCode) {
  try {
    const response = await relay.registerDevice(authCode)
    return response
  } catch (error) {
    if (error.code === 'AUTH_INVALID') {
      throw new Error('授权码无效或已过期')
    }
    if (error.code === 'AUTH_MAX_DEVICES') {
      throw new Error('已达到最大设备数，请先撤销一个设备')
    }
    throw error
  }
}
```

---

## 6. 输入验证错误

### 6.1 无效参数

```javascript
// CLI 参数验证
function validateSaveOptions(options) {
  const errors = []

  // content 必需
  if (!options.content || options.content.trim() === '') {
    errors.push('content 不能为空')
  }

  // annotation 格式
  if (options.annotation) {
    const parts = options.annotation.split(' · ')
    if (parts.length !== 3) {
      errors.push('annotation 格式应为：性质 · 领域 · 标签')
    }
  }

  // vitality 范围
  if (options.vitality !== undefined) {
    if (options.vitality < 0 || options.vitality > 100) {
      errors.push('vitality 必须在 0-100 之间')
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '))
  }
}
```

### 6.2 恶意输入

```javascript
// SQL 注入防护
async function safeQuery(query, params) {
  // 使用参数化查询
  return await db.execute(query, params)
}

// 路径遍历防护
function safePath(userPath) {
  const resolved = path.resolve(userPath)
  const allowedBase = path.resolve(config.allowedDir)

  if (!resolved.startsWith(allowedBase)) {
    throw new Error('路径超出允许范围')
  }

  return resolved
}

// XSS 防护（GUI）
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
```

---

## 7. 降级策略

```
┌─────────────────────────────────────────────────────────────┐
│                      降级策略层级                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 0: 完整功能                                          │
│  ├── LLM 可用 → 混合模式提取                                │
│  ├── 网络可用 → 实时同步                                    │
│  └── 磁盘充足 → 正常写入                                    │
│                                                             │
│  Level 1: 部分降级                                         │
│  ├── LLM 不可用 → 纯规则模式（70% 覆盖）                    │
│  ├── 网络不可用 → 本地队列缓存                              │
│  └── 磁盘警告 → 清理归档数据                                │
│                                                             │
│  Level 2: 只读模式                                          │
│  ├── 数据库锁定 → 只读查询                                  │
│  ├── 磁盘不足 → 停止写入，保留查询                          │
│  └── 权限不足 → 只读模式                                    │
│                                                             │
│  Level 3: 完全故障                                          │
│  ├── 数据损坏 → 提示修复                                    │
│  ├── 密钥丢失 → 提示恢复                                    │
│  └── 核心崩溃 → 错误报告 + 安全退出                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 自动降级触发

```javascript
const healthChecks = {
  llm: async () => {
    try {
      await llmService.ping()
      return 'available'
    } catch {
      return 'unavailable'
    }
  },

  disk: async () => {
    const freeGB = await getFreeDiskSpace()
    if (freeGB < 0.5) return 'critical'
    if (freeGB < 1) return 'warning'
    return 'ok'
  },

  database: async () => {
    try {
      await db.ping()
      return 'ok'
    } catch {
      return 'locked'
    }
  }
}

// 心跳中检查
async function healthCheck() {
  const results = await Promise.all([
    healthChecks.llm(),
    healthChecks.disk(),
    healthChecks.database()
  ])

  // 根据健康状态调整行为
  if (results[0] === 'unavailable') {
    config.llmEnabled = false
    logger.warn('LLM unavailable, switched to rule-only mode')
  }

  if (results[1] === 'critical') {
    config.writeEnabled = false
    notifyUser('磁盘空间严重不足，已切换到只读模式')
  }

  if (results[2] === 'locked') {
    logger.warn('Database locked, deferring writes')
  }
}
```

---

## 8. 错误报告

### 用户友好的错误消息

```bash
# 错误消息格式
$ corivo save --content "测试"

错误：无法保存 block

原因：数据库已锁定，另一个进程正在访问

建议：
[1] 等待 10 秒后重试
[2] 检查是否有其他 Corivo 进程在运行
[3] 运行 corivo doctor 检查系统状态

查看详细日志：corivo log --tail 20
```

### 诊断命令

```bash
# 系统诊断
$ corivo doctor

系统诊断报告：
├── 数据库状态: ✓ 正常
├── 同步状态: ⚠ 离线（最后同步：2 小时前）
├── 磁盘空间: ✓ 45GB 可用
├── 内存使用: ✓ 120MB
├── 心跳状态: ✓ 运行中
├── LLM 服务: ✓ 可用（Ollama）
└── 待处理 block: 12 个

建议：运行 corivo sync 同步离线变更
```

### 崩溃报告

```javascript
// 全局异常处理
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error })

  // 保存崩溃信息
  const crashReport = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    system: {
      platform: os.platform(),
      version: os.version(),
      corivoVersion: package.version
    }
  }

  fs.writeJsonSync(
    path.join(config.dataDir, 'crash-report.json'),
    crashReport
  )

  // 安全退出
  process.exit(1)
})
```

---

## 设计决策

**为什么需要多级降级？** 用户环境多样，不能假设所有服务都可用。降级策略让 Corivo 在各种情况下都能提供至少部分功能。

**为什么错误消息要分级？** 技术错误对普通用户没有意义。错误消息应该告诉用户发生了什么、为什么、如何解决。

**为什么需要诊断命令？** 用户（和支持人员）需要快速定位问题。`corivo doctor` 提供一站式诊断。

**为什么崩溃时要保存报告？** 崩溃信息对开发者至关重要。崩溃报告应自动保存，用户可以选择提交。
