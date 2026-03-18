# 16 · 测试策略

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：完整测试策略

---

## 测试金字塔

```
                    /\
                   /  \
                  / E2E \
                 /  10%  \
                /────────\
               /          \
              /            \
             /  Integration \
            /      30%       \
           /──────────────────\
          /                    \
         /                      \
        /        Unit Tests      \
       /           60%            \
      /──────────────────────────────\
```

- **单元测试 (60%)**：快速、隔离、覆盖边界情况
- **集成测试 (30%)**：验证组件交互
- **E2E 测试 (10%)**：验证关键用户路径

---

## 1. 单元测试

### 1.1 Block 模型测试

```typescript
// __tests__/block.test.ts
describe('Block', () => {
  describe('creation', () => {
    it('should create a valid block with minimal fields', () => {
      const block = new Block({
        content: 'Test content'
      })

      expect(block.id).toMatch(/^blk_/)
      expect(block.annotation).toBe('pending')
      expect(block.vitality).toBe(100)
      expect(block.status).toBe('active')
    })

    it('should reject empty content', () => {
      expect(() => new Block({ content: '' }))
        .toThrow('content cannot be empty')
    })

    it('should validate annotation format', () => {
      const block = new Block({
        content: 'Test',
        annotation: 'invalid format'
      })

      expect(block.validateAnnotation()).toBe(false)
    })
  })

  describe('vitality decay', () => {
    it('should decay at different rates based on annotation type', () => {
      const credentialBlock = new Block({
        content: 'API key',
        annotation: '事实 · asset · API Key'
      })

      const noteBlock = new Block({
        content: 'Temporary note',
        annotation: '知识 · knowledge · 临时笔记'
      })

      credentialBlock.decay()
      noteBlock.decay()

      // 凭证类衰减慢
      expect(credentialBlock.vitality).toBeGreaterThan(noteBlock.vitality)
    })
  })

  describe('pattern extraction', () => {
    it('should extract pattern from decision block', () => {
      const content = '选择使用 SQLCipher，因为需要 E2EE 和本地存储'
      const block = new Block({ content, annotation: '决策 · project · test' })

      block.extractPattern('rule')

      expect(block.pattern).toBeDefined()
      expect(block.pattern.decision).toBe('SQLCipher')
      expect(block.pattern.type).toBe('技术选型')
    })

    it('should fallback to LLM when rule fails', async () => {
      const complexContent = '综合考虑多方因素，最终采用了复杂的混合方案'
      const block = new Block({ content: complexContent })

      await block.extractPattern('llm')

      expect(block.pattern).toBeDefined()
      expect(block.pattern.confidence).toBeGreaterThan(0.5)
    })
  })
})
```

### 1.2 规则引擎测试

```typescript
// __tests__/rule-engine.test.ts
describe('RuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = new RuleEngine()
    engine.register(require('../rules/tech-choice'))
  })

  describe('tech choice rule', () => {
    it('should match simple selection statement', () => {
      const result = engine.extract('决定使用 React 作为前端框架')

      expect(result).toBeDefined()
      expect(result.decision).toBe('React')
      expect(result.type).toBe('技术选型')
    })

    it('should extract dimensions from content', () => {
      const result = engine.extract('选择 PostgreSQL，因为需要安全的数据存储')

      expect(result.dimensions).toContainEqual({
        name: '安全性',
        weight: 0.9,
        reason: '规则推断'
      })
    })

    it('should return null when no pattern matches', () => {
      const result = engine.extract('今天天气不错')

      expect(result).toBeNull()
    })

    it('should handle multiple candidates correctly', () => {
      const result = engine.extract('在 React 和 Vue 之间选择了 React')

      expect(result.decision).toBe('React')
      expect(result.alternatives_rejected).toContain('Vue')
    })
  })
})
```

### 1.3 密钥管理测试

```typescript
// __tests__/crypto.test.ts
describe('Key Management', () => {
  describe('master key derivation', () => {
    it('should derive consistent key from same password', () => {
      const key1 = deriveKey('password123', 'salt')
      const key2 = deriveKey('password123', 'salt')

      expect(key1).toEqual(key2)
    })

    it('should derive different keys from different passwords', () => {
      const key1 = deriveKey('password123', 'salt')
      const key2 = deriveKey('password456', 'salt')

      expect(key1).not.toEqual(key2)
    })

    it('should reject weak passwords', () => {
      expect(() => deriveKey('123', 'salt'))
        .toThrow('Password too weak')
    })
  })

  describe('device authorization', () => {
    it('should generate valid authorization code', () => {
      const code = generateAuthCode()

      expect(code).toMatch(/^CORIVO-AUTH-[A-Z0-9]{16}$/)
      expect(validateAuthCode(code)).toBe(true)
    })

    it('should reject expired authorization code', () => {
      const expiredCode = generateAuthCode({ age: 11 * 60 * 1000 }) // 11 minutes

      expect(validateAuthCode(expiredCode)).toBe(false)
    })
  })
})
```

---

## 2. 集成测试

### 2.1 心跳引擎测试

```typescript
// __tests__/integration/heartbeat.test.ts
describe('Heartbeat Integration', () => {
  let db: TestDatabase
  let heartbeat: Heartbeat

  beforeEach(async () => {
    db = new TestDatabase()
    heartbeat = new Heartbeat({ db, interval: 100 })
    await db.migrate()
  })

  afterEach(async () => {
    await heartbeat.stop()
    await db.close()
  })

  describe('pending block processing', () => {
    it('should process pending blocks on heartbeat', async () => {
      await db.createBlock({ content: 'Test', annotation: 'pending' })

      await heartbeat.runOnce()

      const block = await db.getBlock('blk_1')
      expect(block.annotation).not.toBe('pending')
    })

    it('should prioritize pending blocks over other tasks', async () => {
      await db.createBlock({ content: 'Pending', annotation: 'pending' })
      await db.createBlock({ content: 'Old', annotation: '事实 · knowledge · old', updated_at: Date.now() - 86400000 })

      const tasks = await heartbeat.getTasks()

      expect(tasks[0].type).toBe('annotate_pending')
    })
  })

  describe('pattern extraction integration', () => {
    it('should use rule engine when available', async () => {
      const block = await db.createBlock({
        content: '选择使用 SQLite',
        annotation: '决策 · project · test'
      })

      await heartbeat.runOnce()

      const updated = await db.getBlock(block.id)
      expect(updated.pattern).toBeDefined()
      expect(updated.pattern.pattern_source).toBe('rule')
    })

    it('should fallback to LLM when rule fails', async () => {
      mockLLMService.mockResolvedValue({
        type: '技术选型',
        decision: 'Complex Solution',
        dimensions: [],
        confidence: 0.75
      })

      const block = await db.createBlock({
        content: '经过深思熟虑，采用了复杂的混合方案',
        annotation: '决策 · project · test'
      })

      await heartbeat.runOnce()

      const updated = await db.getBlock(block.id)
      expect(updated.pattern).toBeDefined()
      expect(updated.pattern.pattern_source).toBe('llm')
    })
  })
})
```

### 2.2 同步测试

```typescript
// __tests__/integration/sync.test.ts
describe('Sync Integration', () => {
  describe('E2EE sync', () => {
    it('should encrypt changes before pushing to relay', async () => {
      const relay = new MockRelayServer()
      const client = new SyncClient({ relay })

      const change = { id: 'blk_1', content: 'Secret' }
      await client.push([change])

      const pushed = relay.getLastPush()
      expect(pushed.encrypted).toBeTruthy()
      expect(pushed.content).toBeUndefined() // 原文不应上传
    })

    it('should handle partial sync failure', async () => {
      const relay = new MockRelayServer({ failRate: 0.3 })
      const client = new SyncClient({ relay })

      const changes = Array.from({ length: 10 }, (_, i) => ({ id: `blk_${i}` }))
      const result = await client.push(changes)

      expect(result.success.length).toBeGreaterThan(0)
      expect(result.failed.length).toBeGreaterThan(0)

      // 失败的应该在重试队列
      expect(client.retryQueue.length).toBe(result.failed.length)
    })
  })
})
```

---

## 3. E2E 测试

### 3.1 关键用户路径

```typescript
// e2e/basic-workflow.test.ts
describe('E2E: Basic Workflow', () => {
  it('should complete full capture-query-update cycle', async () => {
    const corivo = new CorivoCLI()

    // 1. 初始化
    await corivo.exec('init')

    // 2. 保存信息
    await corivo.exec('save', '--content', '选择使用 PostgreSQL', '--annotation', '决策 · project · test')

    // 3. 查询
    const result = await corivo.exec('query', '数据库选型')

    expect(result.stdout).toContain('PostgreSQL')

    // 4. 更新
    await corivo.exec('update', 'blk_1', '--content', '改用 MySQL')

    // 5. 验证更新
    const updated = await corivo.exec('query', 'blk_1')
    expect(updated.stdout).toContain('MySQL')
  })
})
```

```typescript
// e2e/trust-workflow.test.ts
describe('E2E: Trust Building', () => {
  it('should progress through trust levels', async () => {
    const corivo = new CorivoCLI()

    // Level 0: 只读
    let status = await corivo.exec('trust', 'status')
    expect(status.stdout).toContain('Level 0')

    // 使用 Corivo 一周（模拟）
    await simulateUsage({ days: 7, pushAdoptions: 5 })

    // 提议升级
    const proposal = await corivo.exec('trust', 'upgrade-check')
    expect(proposal.stdout).toContain('可以升级到 Level 1')

    // 同意升级
    await corivo.exec('trust', 'upgrade', '--yes')

    status = await corivo.exec('trust', 'status')
    expect(status.stdout).toContain('Level 1')

    // 使用一个月
    await simulateUsage({ days: 30, revokeRate: 0 })

    // 提议升级到 Level 2
    const proposal2 = await corivo.exec('trust', 'upgrade-check')
    expect(proposal2.stdout).toContain('可以升级到 Level 2')
  })
})
```

---

## 4. 性能测试

### 4.1 基准测试

```typescript
// __tests__/benchmark/pattern-extraction.bench.ts
describe('Pattern Extraction Benchmark', () => {
  it('should extract patterns from 1000 blocks in under 5 seconds', async () => {
    const blocks = generateTestBlocks(1000)

    const start = Date.now()
    for (let block of blocks) {
      await engine.extract(block.content)
    }
    const duration = Date.now() - start

    expect(duration).toBeLessThan(5000)
  })

  it('should handle rule-only mode with 10000 blocks', async () => {
    const blocks = generateTestBlocks(10000, { type: 'rule-matched' })

    const start = Date.now()
    for (let block of blocks) {
      engine.extract(block.content) // 同步，无 LLM
    }
    const duration = Date.now() - start

    expect(duration).toBeLessThan(1000) // 规则引擎应该很快
  })
})
```

### 4.2 数据库性能

```typescript
// __tests__/benchmark/database.bench.ts
describe('Database Performance', () => {
  it('should query 10000 blocks in under 100ms', async () => {
    await seedDatabase(10000)

    const start = Date.now()
    const results = await db.query('SELECT * FROM blocks LIMIT 10000')
    const duration = Date.now() - start

    expect(duration).toBeLessThan(100)
  })

  it('should handle concurrent writes without deadlock', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      db.insert({ content: `Block ${i}`, annotation: 'pending' })
    )

    await expect(Promise.all(promises)).resolves.not.toThrow()
  })
})
```

---

## 5. 安全测试

### 5.1 加密测试

```typescript
// __tests__/security/encryption.test.ts
describe('Encryption Security', () => {
  it('should not store plaintext on relay', async () => {
    const relay = new MockRelayServer()
    const client = new SyncClient({ relay })

    await client.push([{ id: 'blk_1', content: 'Secret data' }])

    const relayData = relay.getData('blk_1')
    expect(relayData.content).toBeUndefined()
    expect(relayData.encrypted).toBeDefined()

    // 即使解密也需要正确的密钥
    const decrypted = decrypt(relayData.encrypted, 'wrong-key')
    expect(decrypted).toBeNull()
  })

  it('should generate unique nonces for each encryption', () => {
    const encrypted1 = encrypt('data', 'key')
    const encrypted2 = encrypt('data', 'key')

    expect(encrypted1.nonce).not.toBe(encrypted2.nonce)
  })
})
```

### 5.2 权限测试

```typescript
// __tests__/security/authorization.test.ts
describe('Authorization Security', () => {
  it('should prevent cross-namespace access', async () => {
    const user1 = await createUser()
    const user2 = await createUser()
    const team = await createTeam({ owner: user1 })

    // user1 创建团队 block
    await user1.createBlock({
      content: 'Team secret',
      namespace: `team:${team.id}`
    })

    // user2 尝试访问
    const result = await user2.query({ namespace: `team:${team.id}` })

    expect(result.blocks).toHaveLength(0)
  })

  it('should prevent privilege escalation', async () => {
    const member = await createTeamMember({ role: 'member' })

    // 尝试升级权限
    await expect(
      member.updateTeamRole({ role: 'owner' })
    ).rejects.toThrow('Insufficient permissions')
  })
})
```

---

## 6. LLM 测试

### 6.1 Mock LLM 响应

```typescript
// __tests__/mocks/llm.ts
export class MockLLMService {
  private responses: Map<string, any> = new Map()

  setResponse(pattern: string, response: any) {
    this.responses.set(pattern, response)
  }

  async extractPattern(content: string): Promise<Pattern> {
    for (let [pattern, response] of this.responses) {
      if (content.includes(pattern)) {
        return response
      }
    }

    // 默认响应
    return {
      type: '未知',
      decision: '默认选择',
      dimensions: [],
      confidence: 0.5
    }
  }

  async verifyPattern(pattern: Pattern, content: string): Promise<Pattern> {
    // 模拟验证逻辑
    if (pattern.confidence > 0.8) {
      return { ...pattern, confidence: 0.85 }
    }
    return pattern
  }
}
```

### 6.2 LLM 回归测试套件

```typescript
// __tests__/llm/regression.test.ts
describe('LLM Regression Tests', () => {
  const testCases = [
    {
      name: 'tech choice',
      input: '选择使用 React',
      expectedType: '技术选型',
      expectedDecision: 'React'
    },
    {
      name: 'communication style',
      input: '告诉张三：项目延期了',
      expectedType: '沟通策略',
      expectedDecision: '直接告知'
    }
  ]

  testCases.forEach(({ name, input, expectedType, expectedDecision }) => {
    it(`should correctly extract ${name}`, async () => {
      const result = await llmService.extractPattern(input)

      expect(result.type).toBe(expectedType)
      expect(result.decision).toContain(expectedDecision)
      expect(result.confidence).toBeGreaterThan(0.5)
    })
  })
})
```

---

## 7. 测试覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|------|-----------|------|
| Block 模型 | 90% | 核心数据结构 |
| 规则引擎 | 95% | 自动化覆盖 |
| 密钥管理 | 95% | 安全关键 |
| 心跳引擎 | 85% | 复杂逻辑 |
| 同步模块 | 80% | 依赖外部服务 |
| CLI | 75% | 命令行接口 |
| MCP Server | 80% | 协议实现 |
| GUI | 60% | 视觉测试 |

### 覆盖率命令

```bash
# 运行测试并生成覆盖率报告
npm test -- --coverage

# 查看覆盖率
open coverage/index.html

# 强制覆盖率阈值
npm test -- --coverage --coverageThreshold='{"global":{"lines":80}}'
```

---

## 8. 持续集成

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test -- tests/unit

      - name: Run integration tests
        run: npm test -- tests/integration

      - name: Run E2E tests
        run: npm test -- tests/e2e

      - name: Generate coverage
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3

      - name: Run benchmarks
        run: npm run benchmark

      - name: Security audit
        run: npm audit
```

---

## 9. 测试数据管理

### Fixture 数据

```typescript
// __tests__/fixtures/blocks.ts
export const testBlocks = {
  simpleDecision: {
    content: '选择使用 PostgreSQL 作为数据库',
    annotation: '决策 · project · test',
    expectedPattern: {
      type: '技术选型',
      decision: 'PostgreSQL',
      dimensions: expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String) })
      ])
    }
  },

  complexDecision: {
    content: '经过与团队的多轮讨论，综合考虑了安全性、成本、性能等因素，最终决定采用混合云架构，在敏感数据处理上使用私有云，非敏感数据使用公有云',
    annotation: '决策 · project · test',
    requiresLLM: true
  },

  credentialBlock: {
    content: 'AWS Access Key: AKIAIOSFODNN7EXAMPLE',
    annotation: '事实 · asset · AWS',
    sensitivity: 'high'
  }
}
```

### 测试数据库

```bash
# 测试专用数据库
export TEST_DATABASE=":memory:"
export TEST_MODE="true"

# 或使用测试文件
rm -f /tmp/corivo-test.db
export CORIVO_DB_PATH="/tmp/corivo-test.db"
```

---

## 设计决策

**为什么单元测试占 60%？** 单元测试运行快、定位准、维护便宜。大部分逻辑可以在单元测试中验证。

**为什么需要 Mock LLM？** 真实 LLM 调用慢、不稳定、成本高。Mock LLM 让测试快速、可预测。

**为什么 E2E 测试只占 10%？** E2E 测试脆弱、维护成本高。只用于验证关键用户路径。

**为什么安全测试单独列出？** 安全功能（加密、权限）错误成本高，需要专项测试验证。

**为什么需要测试数据管理？** 测试数据的一致性让测试更可靠。Fixture 数据集中管理，便于维护。
