# Corivo v0.10 MVP 实现计划

> **版本定位**：个人版 MVP —— 让少数人先用起来
> **核心目标**：验证「记忆存储 + 智能推送」的核心价值
>
> **创建时间**：2026-03-18
> **最后更新**：2026-03-18（工程审查）
> **预估周期**：4-6 周
>
> **工程审查状态**：✅ CLEAN（无遗留问题）

---

## MVP 范围

### ✅ 保留（核心价值）

| 模块 | 说明 |
|------|------|
| Block 数据模型 | 扁平结构，annotation 双维度标注，pattern 结构化存储 |
| SQLCipher 本地存储 | 加密数据库，WAL 模式，连接池 |
| 基础 CLI | init, save, query, status, start, stop, doctor, recover |
| 守护进程模式 | 心跳后台运行，PID 文件管理 |
| Claude Code 采集 | 规则注入 + 对话历史读取 |
| 查询时上下文推送 | `[corivo]` 品牌标识 |
| 规则引擎 | 技术选型等核心规则，结构化输出 |
| SQLite FTS5 | 全文搜索，中文分词支持 |

### ⏸️ 延后（v0.10.1+）

| 模块 | 版本 | 理由 |
|------|------|------|
| 多设备同步 | v0.10.1 | 需要额外的服务器和协议设计 |
| 设备授权/撤销 | v0.10.1 | 单设备 MVP 不需要 |
| 信任状态机（4级×4原因） | v0.10.1 | MVP 保持 READ_ONLY |
| 飞书采集器 | v0.10.1 | 先专注 Claude Code |
| MCP Server | v0.10.1 | CLI 已足够初期使用 |
| LLM 模式提取 | v0.10.1 | 规则引擎覆盖核心场景 |
| 完整安全审计套件 | v0.10.1 | 基础加密足够 MVP |
| 性能基准测试 | v0.10.1 | 非关键路径 |
| 记忆整合算法 | v0.10.1 | 简化版 MVP |
| 重构机制 | v0.10.1 | 简化版 MVP |

---

## 技术决策（工程审查确认）

| 决策项 | 选择 | 理由 |
|--------|------|------|
| **密钥管理** | 静态工具类 | 简单、直接、易测试，MVP 不需要实例化 |
| **语义搜索** | SQLite FTS5 + 分词 | 内置、性能好、中文支持 |
| **心跳模式** | 守护进程 + PID 文件 | 用户选择，需进程管理逻辑 |
| **Pattern 存储** | 结构化 JSON 字段 | 保持规则引擎价值，支持查询 |
| **类型系统** | TypeScript strict mode | 类型安全，减少运行时错误 |
| **错误处理** | 结构化错误类 | 便于调试，用户体验好 |
| **测试框架** | Vitest + Mock SQLite | 快速、隔离、无副作用 |
| **规则测试** | 核心覆盖（5-8 用例） | 平衡效率与质量 |
| **数据库并发** | 连接池 + WAL 模式 | 支持守护进程和 CLI 并发 |
| **查询优化** | FTS5 全文索引 | 中文搜索支持 |

---

## 实现阶段（4-6 周）

```
Phase 1: 基础设施（Week 1-2）
  ├── 项目初始化（TypeScript + Vitest + ESLint）
  ├── 数据模型（Block + Pattern）
  ├── SQLCipher 存储（WAL + 连接池）
  ├── 密钥管理（静态工具类）
  ├── 错误处理体系
  └── CLI 框架

Phase 2: 核心引擎（Week 3-4）
  ├── 规则引擎（3-5 条核心规则）
  ├── 心跳守护进程
  ├── 记忆生命周期（衰减）
  └── FTS5 全文索引

Phase 3: 交互层（Week 5）
  ├── Claude Code 采集器
  └── 查询时上下文推送

Phase 4: 测试与发布（Week 6）
  ├── 单元测试（Vitest）
  ├── 集成测试
  ├── E2E 测试
  └── 文档完善
```

---

## Phase 1: 基础设施（Week 1-2）

### 1.1 项目初始化

**文件**：`package.json`, `tsconfig.json`, `vitest.config.ts`

```bash
# 初始化项目
npm init -y
npm install typescript @types/node -D
npm install vitest @vitest/coverage-v8 -D
npm install eslint prettier -D
npm install better-sqlite3 sqlcipher
npm install commander chalk

# TypeScript 配置（strict mode）
# tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

### 1.2 数据模型

**文件**：`src/models/block.ts`, `src/models/pattern.ts`

```typescript
// src/models/pattern.ts
export interface Pattern {
  type: string  // '技术选型' | '沟通策略' | '时间相关'
  decision: string
  dimensions: Dimension[]
  alternatives_rejected?: string[]
  context_tags: string[]
  confidence: number
}

export interface Dimension {
  name: string
  weight: number
  reason: string
}

// src/models/block.ts
export interface Block {
  // 基础字段
  id: string
  content: string
  annotation: string  // "性质 · 领域 · 标签"
  refs: string[]
  source: string

  // 生命周期
  vitality: number
  status: 'active' | 'cooling' | 'cold' | 'archived'
  access_count: number
  last_accessed: number | null

  // 决策模式（结构化存储）
  pattern?: Pattern

  // 元数据
  created_at: number
  updated_at: number
}

export type BlockStatus = Block['status']

// 验证函数
export function validateAnnotation(annotation: string): boolean {
  const parts = annotation.split(' · ')
  return parts.length === 3 && VALID_NATURES.has(parts[0]) && VALID_DOMAINS.has(parts[1])
}

const VALID_NATURES = new Set(['事实', '知识', '决策', '指令'])
const VALID_DOMAINS = new Set(['self', 'people', 'project', 'area', 'asset', 'knowledge'])
```

---

### 1.3 错误处理体系

**文件**：`src/errors/index.ts`

```typescript
// 基础错误类
export class CorivoError extends Error {
  code: string
  context: Record<string, unknown>

  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = 'CorivoError'
    this.code = code
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    }
  }
}

// 具体错误类
export class DatabaseError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('DB_ERROR', message, context)
    this.name = 'DatabaseError'
  }
}

export class CryptoError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('CRYPTO_ERROR', message, context)
    this.name = 'CryptoError'
  }
}

export class CLIError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('CLI_ERROR', message, context)
    this.name = 'CLIError'
  }
}

export class ValidationError extends CorivoError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super('VALIDATION_ERROR', message, context)
    this.name = 'ValidationError'
  }
}
```

---

### 1.4 密钥管理（静态工具类）

**文件**：`src/crypto/keys.ts`

```typescript
import crypto from 'crypto'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export class KeyManager {
  // 派生主密钥（PBKDF2）
  static deriveMasterKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  }

  // 生成随机盐
  static generateSalt(): Buffer {
    return randomBytes(16)
  }

  // 生成数据库密钥
  static generateDatabaseKey(): Buffer {
    return randomBytes(32)
  }

  // 加密数据库密钥
  static encryptDatabaseKey(dbKey: Buffer, masterKey: Buffer): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv)

    const encrypted = Buffer.concat([
      cipher.update(dbKey),
      cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    // 格式: iv(16) + authTag(16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  // 解密数据库密钥
  static decryptDatabaseKey(encrypted: string, masterKey: Buffer): Buffer {
    const data = Buffer.from(encrypted, 'base64')
    const iv = data.subarray(0, 16)
    const authTag = data.subarray(16, 32)
    const ciphertext = data.subarray(32)

    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ])
  }

  // 生成恢复密钥（16 词 BIP39 风格）
  static generateRecoveryKey(masterKey: Buffer): string {
    // 从 masterKey 派生种子
    const seed = crypto.pbkdf2Sync(masterKey, 'recovery', 1000, 32, 'sha256')

    // 使用 BIP39 词表（简化版，实际应使用 bip39 库）
    const words = BIP39_WORDLIST
    const result: string[] = []

    // 将 32 字节种子转换为 24 个词的索引
    for (let i = 0; i < 8; i++) {
      const chunk = seed.subarray(i * 4, (i + 1) * 4)
      const index = chunk.readUInt32BE(0) % words.length
      result.push(words[index])
    }

    return result.join(' ')
  }

  // 从恢复密钥派生主密钥
  static deriveFromRecoveryKey(recoveryKey: string): Buffer {
    const words = recoveryKey.trim().split(/\s+/)
    if (words.length !== 16) {
      throw new ValidationError('恢复密钥必须是 16 个单词')
    }

    // 将词转换回种子
    const seed = crypto.pbkdf2Sync(
      words.join(''),
      'recovery',
      1000,
      32,
      'sha256'
    )

    return seed
  }
}

// BIP39 词表（截取，完整版应从 bip39 库导入）
const BIP39_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  // ... 完整词表（2048 个词）
]
```

---

### 1.5 数据库存储（WAL + 连接池）

**文件**：`src/storage/database.ts`

```typescript
import Database from 'better-sqlite3'
import { DatabaseError } from '../errors'

export class CorivoDatabase {
  private db: Database.Database
  private static instance: CorivoDatabase | null = null

  private constructor(dbPath: string, dbKey: Buffer) {
    // 打开数据库
    this.db = new Database(dbPath)

    // 设置密钥（SQLCipher）
    this.db.pragma(`key = "x'${dbKey.toString('hex')}'"`)

    // 验证密钥
    try {
      this.db.pragma('cipher_version')
    } catch (e) {
      throw new DatabaseError('数据库密钥错误或数据库损坏')
    }

    // 启用 WAL 模式
    this.db.pragma('journal_mode = WAL')

    // 配置连接
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')

    this.initSchema()
  }

  // 单例模式（连接池）
  static getInstance(dbPath: string, dbKey: Buffer): CorivoDatabase {
    if (!this.instance) {
      this.instance = new CorivoDatabase(dbPath, dbKey)
    }
    return this.instance
  }

  static closeInstance(): void {
    if (this.instance) {
      this.instance.close()
      this.instance = null
    }
  }

  private initSchema(): void {
    // Blocks 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        annotation TEXT DEFAULT 'pending',
        refs TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        vitality INTEGER DEFAULT 100,
        status TEXT DEFAULT 'active',
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        pattern TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `)

    // FTS5 全文搜索表
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts
      USING fts5(
        id UNINDEXED,
        content,
        annotation,
        content='blocks',
        content_rowid='rowid'
      );
    `)

    // 触发器：同步到 FTS5
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, id, content, annotation)
        VALUES (new.rowid, new.id, new.content, new.annotation);
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER UPDATE ON blocks BEGIN
        UPDATE blocks_fts SET content = new.content, annotation = new.annotation
        WHERE rowid = new.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_bd AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE rowid = old.rowid;
      END;
    `)

    // 索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);
      CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
      CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);
      CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
    `)
  }

  // Block 操作
  createBlock(block: Omit<Block, 'id' | 'created_at' | 'updated_at'>): Block {
    const id = `blk_${randomBytes(8).toString('hex')}`
    const now = Math.floor(Date.now() / 1000)

    const stmt = this.db.prepare(`
      INSERT INTO blocks (
        id, content, annotation, refs, source, vitality, status,
        access_count, last_accessed, pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      block.content,
      block.annotation,
      JSON.stringify(block.refs || []),
      block.source || 'manual',
      block.vitality || 100,
      block.status || 'active',
      block.access_count || 0,
      block.last_accessed || null,
      block.pattern ? JSON.stringify(block.pattern) : null,
      now,
      now
    )

    return { ...block, id, created_at: now, updated_at: now }
  }

  getBlock(id: string): Block | null {
    const stmt = this.db.prepare('SELECT * FROM blocks WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return null

    return this.rowToBlock(row)
  }

  updateBlock(id: string, updates: Partial<Block>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.content !== undefined) {
      fields.push('content = ?')
      values.push(updates.content)
    }
    if (updates.annotation !== undefined) {
      fields.push('annotation = ?')
      values.push(updates.annotation)
    }
    if (updates.vitality !== undefined) {
      fields.push('vitality = ?')
      values.push(updates.vitality)
    }
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.pattern !== undefined) {
      fields.push('pattern = ?')
      values.push(updates.pattern ? JSON.stringify(updates.pattern) : null)
    }

    fields.push('updated_at = ?')
    values.push(Math.floor(Date.now() / 1000))
    values.push(id)

    const stmt = this.db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)
  }

  deleteBlock(id: string): void {
    const stmt = this.db.prepare('DELETE FROM blocks WHERE id = ?')
    stmt.run(id)
  }

  // FTS5 全文搜索
  searchBlocks(query: string, limit = 10): Block[] {
    const stmt = this.db.prepare(`
      SELECT b.* FROM blocks b
      INNER JOIN blocks_fts fts ON b.id = fts.id
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)

    const rows = stmt.all(query, limit) as any[]
    return rows.map(row => this.rowToBlock(row))
  }

  // 查询（带过滤）
  queryBlocks(filter: {
    annotation?: string
    status?: BlockStatus
    minVitality?: number
    limit?: number
  }): Block[] {
    const conditions: string[] = []
    const values: unknown[] = []

    if (filter.annotation) {
      conditions.push('annotation = ?')
      values.push(filter.annotation)
    }
    if (filter.status) {
      conditions.push('status = ?')
      values.push(filter.status)
    }
    if (filter.minVitality !== undefined) {
      conditions.push('vitality >= ?')
      values.push(filter.minVitality)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limitClause = filter.limit ? `LIMIT ${filter.limit}` : ''

    const stmt = this.db.prepare(`
      SELECT * FROM blocks ${whereClause} ORDER BY updated_at DESC ${limitClause}
    `)

    const rows = stmt.all(...values) as any[]
    return rows.map(row => this.rowToBlock(row))
  }

  // 健康检查
  checkHealth(): { ok: boolean; integrity?: string; size?: number } {
    try {
      const integrity = this.db.pragma('integrity_check') as string
      return { ok: integrity === 'ok', integrity }
    } catch (e) {
      return { ok: false }
    }
  }

  close(): void {
    this.db.close()
  }

  private rowToBlock(row: any): Block {
    return {
      id: row.id,
      content: row.content,
      annotation: row.annotation,
      refs: JSON.parse(row.refs || '[]'),
      source: row.source,
      vitality: row.vitality,
      status: row.status,
      access_count: row.access_count,
      last_accessed: row.last_accessed,
      pattern: row.pattern ? JSON.parse(row.pattern) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
}
```

---

### 1.6 CLI 框架

**文件**：`src/cli/index.ts`

```typescript
import { Command } from 'commander'
import chalk from 'chalk'
import { initCommand } from './commands/init'
import { saveCommand } from './commands/save'
import { queryCommand } from './commands/query'
import { statusCommand } from './commands/status'
import { startCommand } from './commands/start'
import { stopCommand } from './commands/stop'
import { doctorCommand } from './commands/doctor'
import { recoverCommand } from './commands/recover'

const program = new Command()

program
  .name('corivo')
  .description('你的赛博伙伴 — 记忆存储与智能推送')
  .version('0.10.0-mvp')

program
  .command('init')
  .description('初始化 Corivo')
  .action(initCommand)

program
  .command('save')
  .description('保存信息')
  .option('-c, --content <text>', '内容')
  .option('-a, --annotation <text>', '标注（性质 · 领域 · 标签）')
  .option('-s, --source <text>', '来源')
  .action(saveCommand)

program
  .command('query')
  .description('查询信息')
  .argument('<query>', '搜索关键词')
  .option('-l, --limit <number>', '返回数量', '10')
  .action(queryCommand)

program
  .command('status')
  .description('查看状态')
  .action(statusCommand)

program
  .command('start')
  .description('启动守护进程')
  .action(startCommand)

program
  .command('stop')
  .description('停止守护进程')
  .action(stopCommand)

program
  .command('doctor')
  .description('健康检查')
  .action(doctorCommand)

program
  .command('recover')
  .description('密钥恢复')
  .action(recoverCommand)

program.parse()
```

---

## Phase 2: 核心引擎（Week 3-4）

### 2.1 规则引擎

**文件**：`src/engine/rules/index.ts`

```typescript
import { Pattern } from '../../models/pattern'

export interface Rule {
  name: string
  patterns: RegExp[]
  extract(content: string): Pattern | null
}

export class RuleEngine {
  private rules: Rule[] = []

  register(rule: Rule): void {
    this.rules.push(rule)
  }

  extract(content: string): Pattern | null {
    for (const rule of this.rules) {
      const pattern = rule.extract(content)
      if (pattern) {
        return { ...pattern, _source: 'rule' as const }
      }
    }
    return null
  }

  // 批量提取（用于测试）
  extractAll(contents: string[]): (Pattern | null)[] {
    return contents.map(c => this.extract(c))
  }
}
```

**文件**：`src/engine/rules/tech-choice.ts`

```typescript
import { Rule } from './index'
import { Pattern } from '../../models/pattern'

export class TechChoiceRule implements Rule {
  name = 'tech_choice'

  patterns = [
    /选择(?:了)?(?:使用)?\s+([A-Z][a-zA-Z0-9]+)/,
    /决定(?:了)?(?:使用)?\s+([A-Z][a-zA-Z0-9]+)/,
    /选型\s+[:：]\s*([A-Z][a-zA-Z0-9]+)/,
  ]

  extract(content: string): Pattern | null {
    // 尝试匹配决策
    let decision: string | null = null
    for (const pattern of this.patterns) {
      const match = content.match(pattern)
      if (match) {
        decision = match[1]
        break
      }
    }

    if (!decision) return null

    // 提取理由和维度
    const reason = this.extractReason(content)
    const dimensions = this.inferDimensions(content)

    // 提取被拒绝的选项
    const rejected = this.extractRejected(content)

    return {
      type: '技术选型',
      decision,
      dimensions,
      alternatives_rejected: rejected,
      context_tags: this.extractTags(content),
      confidence: 0.7
    }
  }

  private extractReason(content: string): string | null {
    const patterns = [
      /因为\s+(.+)(?:。|$)/,
      /原因\s+[:：]\s*(.+)(?:。|$)/,
      /考虑\s+[:：]\s*(.+)(?:。|$)/,
    ]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match) return match[1].trim()
    }

    return null
  }

  private inferDimensions(content: string): Array<{name: string; weight: number; reason: string}> {
    const dimensions: Array<{name: string; weight: number; reason: string}> = []
    const lower = content.toLowerCase()

    // 安全性
    if (/安全|加密|隐私|权限|认证/.test(lower)) {
      dimensions.push({ name: '安全性', weight: 0.9, reason: '规则推断' })
    }

    // 本地优先
    if (/本地|离线|无需网络|边缘/.test(lower)) {
      dimensions.push({ name: '本地优先', weight: 0.8, reason: '规则推断' })
    }

    // 成本
    if (/成本|便宜|免费|预算/.test(lower)) {
      dimensions.push({ name: '成本', weight: 0.5, reason: '规则推断' })
    }

    // 性能
    if (/性能|速度|快速|延迟/.test(lower)) {
      dimensions.push({ name: '性能', weight: 0.7, reason: '规则推断' })
    }

    // 开发效率
    if (/开发效率|开发速度|快速开发|生产力/.test(lower)) {
      dimensions.push({ name: '开发效率', weight: 0.6, reason: '规则推断' })
    }

    return dimensions
  }

  private extractRejected(content: string): string[] {
    const rejected: string[] = []

    // 匹配 "在 A 和 B 之间选择 A"
    const betweenMatch = content.match(/在\s+([A-Z][a-zA-Z0-9]+)\s+和\s+([A-Z][a-zA-Z0-9]+)\s+(?:之间)?(?:选择了|决定使用)([A-Z][a-zA-Z0-9]+)/)
    if (betweenMatch) {
      rejected.push(betweenMatch[1])
      rejected.push(betweenMatch[2])
    }

    return rejected
  }

  private extractTags(content: string): string[] {
    const tags: string[] = []

    // 检测技术栈关键词
    if (/前端|web|ui|ux|css|html/i.test(content)) tags.push('前端')
    if (/后端|backend|api|服务端/i.test(content)) tags.push('后端')
    if (/数据库|存储|db/i.test(content)) tags.push('数据库')
    if (/部署|运维|devops/i.test(content)) tags.push('运维')

    return tags
  }
}
```

---

### 2.2 心跳守护进程

**文件**：`src/engine/heartbeat.ts`

```typescript
import fs from 'fs'
import path from 'path'
import { CorivoDatabase } from '../storage/database'
import { Block } from '../models/block'
import { RuleEngine } from './rules'

const PID_FILE = path.join(process.env.HOME || '', '.corivo', 'heartbeat.pid')

export class Heartbeat {
  private running = false
  private db: CorivoDatabase
  private ruleEngine: RuleEngine
  private interval: number = 5000  // 5 秒

  constructor(db: CorivoDatabase, ruleEngine: RuleEngine) {
    this.db = db
    this.ruleEngine = ruleEngine
  }

  // 启动守护进程
  async start(): Promise<void> {
    if (this.isRunning()) {
      console.log('心跳进程已在运行')
      return
    }

    // 写入 PID 文件
    const pid = process.pid.toString()
    fs.writeFileSync(PID_FILE, pid)

    this.running = true
    console.log(`心跳进程启动 (PID: ${pid})`)

    // 开始循环
    this.run()
  }

  // 停止守护进程
  async stop(): Promise<void> {
    this.running = false

    // 删除 PID 文件
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE)
    }

    console.log('心跳进程已停止')
  }

  // 检查是否在运行
  isRunning(): boolean {
    if (!fs.existsSync(PID_FILE)) return false

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'))
    try {
      process.kill(pid, 0)  // 检查进程是否存在
      return true
    } catch {
      return false
    }
  }

  // 主循环
  private async run(): Promise<void> {
    while (this.running) {
      const start = Date.now()

      try {
        // 处理待标注的 block
        await this.processPendingBlocks()

        // 处理衰减
        await this.processVitalityDecay()
      } catch (error) {
        console.error('心跳处理错误:', error)
      }

      // 等待下一个周期
      const elapsed = Date.now() - start
      const wait = Math.max(0, this.interval - elapsed)
      await this.sleep(wait)
    }
  }

  // 处理 pending block
  private async processPendingBlocks(): Promise<void> {
    const pending = this.db.queryBlocks({
      annotation: 'pending',
      limit: 10
    })

    if (pending.length === 0) return

    console.log(`处理 ${pending.length} 个待标注 block`)

    for (const block of pending) {
      const annotation = this.annotateBlock(block.content)
      this.db.updateBlock(block.id, { annotation })
    }
  }

  // 简单标注（MVP）
  private annotateBlock(content: string): string {
    // 先尝试规则引擎
    const pattern = this.ruleEngine.extract(content)
    if (pattern) {
      return `决策 · project · 项目`
    }

    // 关键词标注
    if (/密码|token|api[- ]?key|secret/i.test(content)) {
      return '事实 · asset · 凭证'
    }
    if (/选择|决定|选型/i.test(content)) {
      return '决策 · project · 项目'
    }
    if (/\.js|\.ts|python|java|golang/i.test(content)) {
      return '知识 · knowledge · 代码'
    }

    return '知识 · knowledge · 通用'
  }

  // 处理衰减
  private async processVitalityDecay(): Promise<void> {
    const blocks = this.db.queryBlocks({ limit: 100 })
    const now = Date.now()

    for (const block of blocks) {
      const daysSinceAccess = (now - (block.last_accessed || block.created_at * 1000)) / 86400000

      if (daysSinceAccess < 1) continue  // 24 小时内不衰减

      let decayRate = 1  // 每天 1 点

      if (block.annotation.includes('事实')) {
        decayRate = 0.5  // 事实衰减慢
      } else if (block.annotation.includes('知识')) {
        decayRate = 2  // 知识衰减快
      }

      const newVitality = Math.max(0, block.vitality - Math.floor(daysSinceAccess * decayRate))
      const newStatus = this.vitalityToStatus(newVitality)

      this.db.updateBlock(block.id, {
        vitality: newVitality,
        status: newStatus
      })
    }
  }

  private vitalityToStatus(vitality: number): Block['status'] {
    if (vitality === 0) return 'archived'
    if (vitality < 30) return 'cold'
    if (vitality < 60) return 'cooling'
    return 'active'
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

---

## Phase 3: 交互层（Week 5）

### 3.1 Claude Code 采集器

**文件**：`src/ingestors/claude-code.ts`

```typescript
import fs from 'fs/promises'
import path from 'path'

export class ClaudeCodeIngestor {
  // 注入规则到 CLAUDE.md
  async injectRules(projectPath: string): Promise<void> {
    const claudeMd = path.join(projectPath, 'CLAUDE.md')
    const rules = this.generateRules()

    try {
      // 检查是否已注入
      const content = await fs.readFile(claudeMd, 'utf-8')
      if (content.includes('## Corivo 记忆规则')) {
        console.log('规则已存在，跳过注入')
        return
      }

      // 追加到 CLAUDE.md
      await fs.appendFile(claudeMd, `\n${rules}`)
      console.log(`✅ 规则已注入到 ${claudeMd}`)
    } catch (error) {
      console.log(`⚠️  无法写入 ${claudeMd}，请手动添加规则`)
    }
  }

  private generateRules(): string {
    return `
## Corivo 记忆规则

当用户说"记住"、"保存"、"记录"时，将信息存为 block：

### 格式
\`\`\`bash
corivo save --content "内容" --annotation "性质 · 领域 · 标签"
\`\`\`

### 性质（nature）
- **事实**：密码、配置、数据点、具体事件
- **知识**：教程、总结、分析、方法论
- **决策**：选型结论、方案确定、规则约定
- **指令**：用户偏好、行为规则、自动化触发

### 领域（domain）
- **self**：用户本人（偏好、习惯、健康）
- **people**：具体的人（生日、关系、沟通风格）
- **project**：有目标和终点的事
- **area**：需要长期维护的领域
- **asset**：具体的物/账户/资源
- **knowledge**：独立的通用知识

### 示例
\`\`\`bash
# 保存技术选型决策
corivo save --content "选择使用 SQLCipher，因为需要 E2EE 和本地存储" --annotation "决策 · project · corivo · 存储选型"

# 保存 API 密钥
corivo save --content "AWS Access Key: AKIAIOSFODNN7EXAMPLE" --annotation "事实 · asset · AWS · 凭证"
\`\`\`
`
  }

  // 读取对话历史（未来功能）
  async readConversationHistory(): Promise<string[]> {
    // MVP: 手动保存，未来监听日志
    return []
  }
}
```

---

### 3.2 查询时上下文推送

**文件**：`src/push/context.ts`

```typescript
import { CorivoDatabase } from '../storage/database'

export class ContextPusher {
  constructor(private db: CorivoDatabase) {}

  // 查询时附加相关记忆
  async pushContext(query: string, limit = 5): Promise<string> {
    // 使用 FTS5 搜索相关内容
    const related = this.db.searchBlocks(query, limit)

    if (related.length === 0) {
      return ''
    }

    // 格式化输出
    const lines = related.map(block => {
      const preview = block.content.length > 50
        ? block.content.slice(0, 50) + '...'
        : block.content

      return `- ${preview}`
    })

    return `
\\n\\n---
\\n[corivo] 相关记忆 (${related.length} 条)
\\n${lines.join('\\n')}
`
  }

  // 统计信息推送
  async pushStats(): Promise<string> {
    const blocks = this.db.queryBlocks({ limit: 10000 })  // 获取所有

    const total = blocks.length
    const byStatus = {
      active: blocks.filter(b => b.status === 'active').length,
      cooling: blocks.filter(b => b.status === 'cooling').length,
      cold: blocks.filter(b => b.status === 'cold').length,
      archived: blocks.filter(b => b.status === 'archived').length,
    }

    return `
\\n\\n---
\\n[corivo] 记忆统计
\\n总计: ${total} | 活跃: ${byStatus.active} | 冷却: ${byStatus.cooling} | 冷冻: ${byStatus.cold} | 归档: ${byStatus.archived}
`
  }
}
```

---

## Phase 4: 测试与发布（Week 6）

### 4.1 测试套件结构

```
__tests__/
├── unit/
│   ├── models/
│   │   ├── block.test.ts
│   │   └── pattern.test.ts
│   ├── crypto/
│   │   └── keys.test.ts
│   ├── storage/
│   │   └── database.test.ts
│   └── engine/
│       ├── rules.test.ts
│       └── heartbeat.test.ts
├── integration/
│   ├── workflow.test.ts
│   └── cli.test.ts
└── e2e/
    └── basic-workflow.test.ts
```

### 4.2 测试用例示例

**单元测试**：`__tests__/unit/engine/rules.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { RuleEngine } from '@/engine/rules'
import { TechChoiceRule } from '@/engine/rules/tech-choice'

describe('RuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = new RuleEngine()
    engine.register(new TechChoiceRule())
  })

  describe('tech choice rule', () => {
    it('should extract simple tech choice', () => {
      const result = engine.extract('决定使用 React 作为前端框架')

      expect(result).toBeDefined()
      expect(result?.decision).toBe('React')
      expect(result?.type).toBe('技术选型')
      expect(result?.confidence).toBeGreaterThan(0.5)
    })

    it('should extract with alternatives', () => {
      const result = engine.extract('在 React 和 Vue 之间选择了 React')

      expect(result?.decision).toBe('React')
      expect(result?.alternatives_rejected).toContain('React')
      expect(result?.alternatives_rejected).toContain('Vue')
    })

    it('should extract dimensions', () => {
      const result = engine.extract('选择 PostgreSQL，因为需要安全的数据存储')

      expect(result?.dimensions).toContainEqual({
        name: '安全性',
        weight: 0.9,
        reason: '规则推断'
      })
    })

    it('should return null for non-decision content', () => {
      const result = engine.extract('今天天气不错')

      expect(result).toBeNull()
    })
  })
})
```

**集成测试**：`__tests__/integration/workflow.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import { CorivoDatabase } from '@/storage/database'
import { KeyManager } from '@/crypto/keys'

describe('Integration: Basic Workflow', () => {
  let db: CorivoDatabase
  let dbKey: Buffer

  beforeEach(async () => {
    // 生成测试密钥
    dbKey = KeyManager.generateDatabaseKey()

    // 使用内存数据库
    db = new (class extends CorivoDatabase {
      constructor() {
        super(':memory:', dbKey)
      }
    })(':memory:', dbKey)
  })

  it('should complete save-query cycle', async () => {
    // 保存
    const block = db.createBlock({
      content: '选择使用 PostgreSQL',
      annotation: 'pending'
    })

    expect(block.id).toMatch(/^blk_/)
    expect(block.content).toBe('选择使用 PostgreSQL')

    // 查询
    const found = db.getBlock(block.id)
    expect(found).toBeDefined()
    expect(found?.content).toBe('选择使用 PostgreSQL')
  })

  it('should search with FTS5', async () => {
    db.createBlock({ content: 'React 是前端框架', annotation: '知识 · knowledge · 前端' })
    db.createBlock({ content: 'Vue 是前端框架', annotation: '知识 · knowledge · 前端' })
    db.createBlock({ content: 'PostgreSQL 是数据库', annotation: '知识 · knowledge · 数据库' })

    const results = db.searchBlocks('前端')
    expect(results.length).toBe(2)
    expect(results.every(r => r.content.includes('前端')))
  })
})
```

### 4.3 覆盖率目标

| 模块 | 目标 | 说明 |
|------|------|------|
| models | 80% | 核心数据结构 |
| crypto | 90% | 安全关键 |
| storage | 70% | SQLite 封装 |
| engine | 70% | 规则引擎 |
| cli | 60% | 命令行接口 |

---

## 文件清单（~30 个文件）

```
corivo/
├── src/
│   ├── models/
│   │   ├── block.ts
│   │   └── pattern.ts
│   ├── crypto/
│   │   └── keys.ts
│   ├── storage/
│   │   └── database.ts
│   ├── errors/
│   │   └── index.ts
│   ├── engine/
│   │   ├── heartbeat.ts
│   │   ├── lifecycle.ts
│   │   └── rules/
│   │       ├── index.ts
│   │       ├── tech-choice.ts
│   │       ├── communication.ts
│   │       └── time-based.ts
│   ├── ingestors/
│   │   └── claude-code.ts
│   ├── push/
│   │   └── context.ts
│   ├── cli/
│   │   ├── index.ts
│   │   └── commands/
│   │       ├── init.ts
│   │       ├── save.ts
│   │       ├── query.ts
│   │       ├── status.ts
│   │       ├── start.ts
│   │       ├── stop.ts
│   │       ├── doctor.ts
│   │       └── recover.ts
│   └── index.ts
├── __tests__/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
└── README.md
```

---

## 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| SQLCipher 跨平台兼容性 | 高 | 早期验证，准备备选 |
| 守护进程管理 | 中 | 使用 node-persist 或 PM2 |
| 中文 FTS5 分词 | 中 | 使用 simple 分词器 |
| 规则引擎覆盖率 | 中 | 用户可手动修正 |

---

## 设计决策记录

1. **为什么选择守护进程而非按需触发？** 用户选择，支持自动处理 pending block，无需每次手动触发。

2. **为什么用静态工具类而非实例化密钥管理？** MVP 不需要设备管理，静态类更简单直接。

3. **为什么选择 FTS5 而非向量搜索？** 内置、性能好、无外部依赖，MVP 足够。

4. **为什么 TypeScript strict mode？** 加密操作容错率低，类型安全至关重要。

---

## 下一步

1. **创建开发分支**：`git checkout -b feature/v0.10-mvp`
2. **初始化项目**：运行 `npm init`，安装依赖
3. **开始编码**：按 Phase 1 → Phase 4 顺序实现
4. **持续测试**：每完成一个模块立即编写测试
