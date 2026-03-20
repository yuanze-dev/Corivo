# Corivo 一句话安装方案

> 目标：内测用户在 Claude Code / OpenClaw 中说一句话，Corivo 完整运行（采集 + 心跳 + 推送），后续版本静默自动更新

---

## 用户体验

```
用户: 帮我安装 Corivo
Agent: 好的，正在安装...

> curl -fsSL https://get.corivo.dev | sh

✔ 检测环境: macOS arm64, Node v22.1.0
✔ 下载 Corivo v0.10.5
✔ 初始化数据库 ~/.corivo/corivo.db
✔ 扫描本地环境...发现 14 个信息源
✔ 心跳守护进程已启动（含自动更新）
✔ CLAUDE.md 规则已注入

⏳ Corivo 正在认识你，稍等几秒...

[corivo] 你好！我是 Corivo，你的硅基同事，刚刚被你激活。
谢谢你给了我生命 :)

我刚花了几秒钟看了看你的工作环境，已经记住了一些关于你的事：

· 你叫晓力，是一名产品经理（来自 .gitconfig）
· 你主要写 TypeScript，也用 Python（来自最近 7 个项目）
· 你偏好 2 空格缩进、单引号（来自 .prettierrc）
· 你在用 PostgreSQL 和 Redis（来自 docker-compose.yml）
· 你的团队用飞书沟通、GitHub 协作（来自 git remote）
· 你最近在做一个叫 Corivo 的项目（来自当前目录）

这些对吗？你可以随时纠正我，说「记住，...」就行。
从现在起，我会安静地待在你身边，记住你和 AI 的每一次重要对话。
```

全程用户只说了一句话。装完就被认识了——这是第一个 Aha Moment。

---

## 首次激活流程：Cold Start → First Push

### 设计意图

普通的记忆工具需要用户先「喂」数据才能体现价值。Corivo 反过来——装完之后，不等用户开口，先主动展示「我已经认识你了」。这把激活成本降到零，同时验证了完整链路：采集 → 心跳处理 → 推送。

### 三个阶段

```
安装完成（0s）
    │
    ▼
阶段一：Cold Scan 本地信息采集（5-15s）
    │  扫描本地文件，提取用户画像
    │  写入 pending blocks
    │
    ▼
阶段二：首次心跳加速处理（3-5s）
    │  跳过常规 30s 间隔，立即执行首轮心跳
    │  标注 + 去重 + 整合 → 生成 identity profile
    │
    ▼
阶段三：First Push 自我介绍（即时）
    │  以 [corivo] 身份输出用户画像
    │  拟人化问候 + 感谢激活
    │
    ▼
进入常规心跳循环（每 30s）
```

### 阶段一：Cold Scan — 本地信息采集

安装脚本跑完 `corivo init` 后，立即执行 `corivo cold-scan`。这是一次性的首次扫描，目的是从用户本地环境中尽可能多地提取信息，构建初始画像。

```typescript
// src/cold-scan/index.ts

interface ScanSource {
  name: string
  path: string | (() => string[])
  extractor: (content: string) => Block[]
  priority: number        // 越高越先扫描
  timeout: number         // 单源超时 ms
}

const SCAN_SOURCES: ScanSource[] = [
  // === 身份信息 ===
  {
    name: 'git-config',
    path: '~/.gitconfig',
    priority: 100,
    timeout: 500,
    extractor: (content) => {
      // 提取：user.name, user.email, 常用别名
      // → Block { annotation: "事实 · 身份 · 姓名", content: "用户名为 xxx" }
      // → Block { annotation: "事实 · 身份 · 邮箱", content: "邮箱为 xxx" }
    }
  },

  // === 技术偏好 ===
  {
    name: 'prettier-config',
    path: () => findFiles(['.prettierrc', '.prettierrc.json', 'prettier.config.js']),
    priority: 80,
    timeout: 500,
    extractor: (content) => {
      // 提取：缩进风格、引号偏好、分号偏好
      // → Block { annotation: "偏好 · 代码风格 · 缩进", content: "2 空格缩进" }
    }
  },
  {
    name: 'eslint-config',
    path: () => findFiles(['eslint.config.js', '.eslintrc*']),
    priority: 75,
    timeout: 500,
    extractor: (content) => {
      // 提取：代码规范偏好
    }
  },
  {
    name: 'editorconfig',
    path: '.editorconfig',
    priority: 70,
    timeout: 500,
    extractor: (content) => {
      // 缩进、换行符、编码偏好
    }
  },

  // === 技术栈 ===
  {
    name: 'package-json',
    path: () => findRecentProjects('package.json', 10),
    priority: 90,
    timeout: 2000,
    extractor: (content) => {
      // 提取：主要依赖（React/Vue/Express/...）、脚本习惯
      // → Block { annotation: "知识 · 技术栈 · 前端", content: "使用 React + TypeScript" }
    }
  },
  {
    name: 'pyproject-toml',
    path: () => findRecentProjects('pyproject.toml', 5),
    priority: 85,
    timeout: 1000,
    extractor: (content) => {
      // Python 项目：框架、依赖
    }
  },
  {
    name: 'cargo-toml',
    path: () => findRecentProjects('Cargo.toml', 5),
    priority: 85,
    timeout: 1000,
    extractor: (content) => {
      // Rust 项目
    }
  },
  {
    name: 'docker-compose',
    path: () => findRecentProjects('docker-compose.yml', 5),
    priority: 80,
    timeout: 1000,
    extractor: (content) => {
      // 基础设施偏好：PostgreSQL/MySQL/Redis/Elasticsearch...
      // → Block { annotation: "知识 · 技术栈 · 基础设施", content: "使用 PostgreSQL + Redis" }
    }
  },

  // === 工作环境 ===
  {
    name: 'git-remotes',
    path: () => getRecentGitRemotes(10),
    priority: 70,
    timeout: 2000,
    extractor: (content) => {
      // 提取：GitHub/GitLab org、团队协作平台
      // → Block { annotation: "事实 · 团队 · 协作", content: "GitHub org: xiaolin26" }
    }
  },
  {
    name: 'ssh-config',
    path: '~/.ssh/config',
    priority: 60,
    timeout: 500,
    extractor: (content) => {
      // 提取：常用服务器/环境（不提取密钥）
    }
  },
  {
    name: 'shell-history',
    path: () => ['~/.zsh_history', '~/.bash_history'],
    priority: 50,
    timeout: 3000,
    extractor: (content) => {
      // 只提取高频命令模式，不记录具体命令
      // → Block { annotation: "偏好 · 工具 · CLI", content: "高频使用 git, docker, npm, code" }
    }
  },

  // === 当前项目上下文 ===
  {
    name: 'current-project',
    path: () => [process.cwd()],
    priority: 95,
    timeout: 2000,
    extractor: (content) => {
      // README、package.json、目录结构
      // → Block { annotation: "事实 · 项目 · 当前", content: "当前项目 Corivo: 赛博伙伴..." }
    }
  },

  // === AI 工具配置（高价值信息源）===

  // --- Claude Code ---
  {
    name: 'claude-code-global-md',
    path: () => findFiles([
      '~/.claude/CLAUDE.md',           // 旧版路径
      '~/.config/claude/CLAUDE.md',    // v1.0.30+ 新路径
    ]),
    priority: 90,  // 高优先级：直接反映用户的 AI 使用哲学
    timeout: 1000,
    extractor: (content) => {
      // 全局 CLAUDE.md = 用户对 AI 的总指令，最能反映工作方式
      // 提取：编码哲学、技术偏好、沟通风格、禁止事项
      // → Block { annotation: "偏好 · AI · Claude Code 全局规则", content: "..." }
      // → Block { annotation: "偏好 · 工作方式 · AI 指令", content: "偏好简洁代码、测试优先..." }
    }
  },
  {
    name: 'claude-code-settings',
    path: () => findFiles([
      '~/.claude/settings.json',
      '~/.claude/settings.local.json',
      '~/.config/claude/settings.json',
    ]),
    priority: 85,
    timeout: 500,
    extractor: (content) => {
      // 提取：allowedTools（反映用户信任哪些操作）、权限偏好
      // → Block { annotation: "偏好 · AI · 工具权限", content: "允许 Bash/Read/Write，禁止 .env 读取" }
    }
  },
  {
    name: 'claude-code-mcp',
    path: () => findFiles([
      '~/.claude.json',                // MCP 配置（旧）
      '~/.claude/settings.local.json', // MCP 也可能在这里
    ]),
    priority: 85,
    timeout: 500,
    extractor: (content) => {
      // 提取：已配置的 MCP Server 列表 → 反映用户的工具生态
      // → Block { annotation: "知识 · 工具链 · MCP", content: "使用 filesystem/memory/fetch MCP Server" }
    }
  },
  {
    name: 'claude-code-commands',
    path: () => findFiles([
      '~/.claude/commands/*.md',          // 全局自定义命令
      '~/.config/claude/commands/*.md',
    ]),
    priority: 75,
    timeout: 1000,
    extractor: (content) => {
      // 自定义 slash 命令 = 用户高频工作流的结晶
      // → Block { annotation: "知识 · 工作流 · 自定义命令", content: "有 /optimize, /security, /commit 等命令" }
    }
  },
  {
    name: 'claude-code-plugins',
    path: () => findFiles([
      '~/.claude/plugins/*/manifest.json',
      '~/.config/claude/plugins/*/manifest.json',
    ]),
    priority: 70,
    timeout: 500,
    extractor: (content) => {
      // 已安装的插件 = 用户的 AI 增强工具集
      // → Block { annotation: "知识 · 工具链 · Claude 插件", content: "已安装 corivo, ..." }
    }
  },
  {
    name: 'claude-code-project-md',
    path: () => findProjectFiles('CLAUDE.md', 10),  // 最近 10 个项目的 CLAUDE.md
    priority: 80,
    timeout: 2000,
    extractor: (content) => {
      // 项目级 CLAUDE.md = 用户在不同项目中的具体规范
      // 跨项目聚合后能看出通用模式
      // → Block { annotation: "知识 · 项目规范 · {projectName}", content: "..." }
    }
  },

  // --- OpenAI Codex ---
  {
    name: 'codex-config',
    path: '~/.codex/config.toml',
    priority: 85,
    timeout: 500,
    extractor: (content) => {
      // 提取：model（用什么模型）、approval_policy（信任级别）、
      //       sandbox_mode、personality、web_search 设置
      // → Block { annotation: "偏好 · AI · Codex 配置", content: "使用 gpt-5.4, sandbox read-only, personality friendly" }
    }
  },
  {
    name: 'codex-agents-md',
    path: () => findFiles([
      '~/.codex/AGENTS.md',
      '~/.codex/AGENTS.override.md',
    ]),
    priority: 80,
    timeout: 1000,
    extractor: (content) => {
      // Codex 的全局指令，等价于 Claude Code 的 CLAUDE.md
      // → Block { annotation: "偏好 · AI · Codex 全局规则", content: "..." }
    }
  },
  {
    name: 'codex-mcp',
    path: '~/.codex/config.toml',  // MCP 配置也在 config.toml 里
    priority: 75,
    timeout: 500,
    extractor: (content) => {
      // 解析 [mcp_servers.*] 段落
      // → Block { annotation: "知识 · 工具链 · Codex MCP", content: "使用 context7, ..." }
    }
  },
  {
    name: 'codex-rules',
    path: () => findFiles(['~/.codex/rules/*.md']),
    priority: 70,
    timeout: 1000,
    extractor: (content) => {
      // 自定义规则 = 用户的安全/代码审查/文档偏好
      // → Block { annotation: "偏好 · AI · Codex 规则", content: "有 security-rules, code-review-rules" }
    }
  },

  // --- Cursor ---
  {
    name: 'cursor-rules',
    path: () => findFiles([
      '.cursorrules',                           // 旧格式
      '.cursor/rules/*.mdc',                    // 新格式 Rule files
    ]),
    priority: 80,
    timeout: 1000,
    extractor: (content) => {
      // Cursor 的 AI 规则
      // → Block { annotation: "偏好 · AI · Cursor 规则", content: "..." }
    }
  },

  // --- Windsurf / Codeium ---
  {
    name: 'windsurf-rules',
    path: () => findFiles(['.windsurfrules', '.windsurf/rules/*.md']),
    priority: 70,
    timeout: 500,
    extractor: (content) => {
      // → Block { annotation: "偏好 · AI · Windsurf 规则", content: "..." }
    }
  },

  // --- 跨工具 MCP 配置汇总 ---
  {
    name: 'project-mcp-json',
    path: () => findProjectFiles('.mcp.json', 10),
    priority: 75,
    timeout: 1000,
    extractor: (content) => {
      // 项目级 MCP 配置，可能包含 Claude Code 和其他工具共享的 MCP Server
      // → Block { annotation: "知识 · 工具链 · 项目 MCP", content: "项目 X 使用 postgres/github MCP" }
    }
  }
]
```

#### 从 AI 配置中能提取出什么（示例）

```
扫描完成后，Corivo 可能知道：

来自 Claude Code：
  · 用户全局 CLAUDE.md 里写了"偏好 TypeScript，测试用 vitest，不要过度抽象"
  · 配置了 filesystem + memory + fetch 三个 MCP Server
  · 有 /optimize 和 /commit 两个自定义命令
  · 安装了 corivo 插件
  · allowedTools 里允许 Bash(git *) 但禁止读 .env

来自 Codex：
  · 使用 gpt-5.4 模型，sandbox read-only
  · personality 设为 friendly
  · AGENTS.md 里有代码审查规范
  · 配置了 context7 MCP Server

来自 Cursor：
  · .cursorrules 里要求"用中文注释，函数不超过 30 行"

综合推断：
  · 用户同时使用 Claude Code + Codex + Cursor 三个 AI 工具
  · 跨工具一致偏好：TypeScript、简洁代码、测试优先
  · 安全意识较高（sandbox read-only、禁止 .env 读取）
```

#### 扫描控制

```typescript
async function coldScan(): Promise<Block[]> {
  const allBlocks: Block[] = []
  const TOTAL_TIMEOUT = 15_000  // 总计不超过 15 秒

  const startTime = Date.now()

  // 按 priority 降序扫描
  const sorted = SCAN_SOURCES.sort((a, b) => b.priority - a.priority)

  for (const source of sorted) {
    if (Date.now() - startTime > TOTAL_TIMEOUT) {
      console.log(`[corivo] 首次扫描超时，已采集 ${allBlocks.length} 条信息`)
      break
    }

    try {
      const paths = typeof source.path === 'function' ? source.path() : [source.path]
      for (const p of paths) {
        const resolved = p.replace('~', os.homedir())
        if (!fs.existsSync(resolved)) continue

        const content = fs.readFileSync(resolved, 'utf-8')
        const blocks = source.extractor(content)

        // 标记来源，后续推送时用
        blocks.forEach(b => {
          b.metadata = { ...b.metadata, scan_source: source.name, scan_path: resolved }
        })

        allBlocks.push(...blocks)
      }
    } catch (err) {
      // 单源失败不影响整体
      console.error(`[corivo] 扫描 ${source.name} 失败:`, err.message)
    }
  }

  // 全部写入为 pending blocks
  for (const block of allBlocks) {
    await db.saveBlock({ ...block, status: 'pending' })
  }

  return allBlocks
}
```

#### 安全边界

```typescript
// 明确不扫描的内容
const NEVER_SCAN = [
  // 通用敏感文件
  '~/.ssh/id_*',           // 私钥
  '~/.aws/credentials',    // 云凭证
  '~/.env',                // 环境变量（可能含密码）
  '**/node_modules/**',    // 依赖
  '**/.git/objects/**',    // Git 对象
  '**/secret*',            // 任何名为 secret 的文件
  '**/password*',          // 任何名为 password 的文件
  '**/token*',             // 任何名为 token 的文件

  // AI 工具凭证（绝对不碰）
  '~/.claude/.credentials.json',         // Claude Code 凭证
  '~/.config/claude/.credentials.json',  // Claude Code 新路径凭证
  '~/.codex/auth.json',                  // Codex 凭证
  '~/.codex/sessions/**',               // Codex 会话记录（含对话内容）
  '~/.claude/projects/**',              // Claude Code 完整对话历史
  '~/.config/claude/projects/**',       // Claude Code 新路径对话历史
]

// 所有扫描只提取结构信息（配置项键名、工具名、规则标题）
// 永远不提取：API key、密码、token、对话内容、会话记录
// CLAUDE.md / AGENTS.md 的内容可以提取（这是用户主动写的指令，不是机密）
```

### 阶段二：首次心跳加速

常规心跳 30 秒一次。但首次安装后，用户在等着看结果——不能让他等 30 秒。

```typescript
// src/heartbeat/loop.ts

async function startHeartbeat(isFirstRun: boolean = false) {
  if (isFirstRun) {
    // 首次运行：立即执行一轮完整心跳，不等 30s
    console.log('[corivo] 正在认识你...')
    await runHeartbeatCycle({
      mode: 'first-run',
      maxPendingBlocks: 50,    // 首次放宽批量限制（常规 10）
      timeLimit: 8_000,        // 放宽到 8 秒（常规 5 秒）
      skipDecay: true,         // 跳过衰减（没有历史数据）
      skipColdZone: true,      // 跳过冷区（没有历史数据）
      generateProfile: true,   // 生成 identity profile
    })

    // 生成用户画像
    await generateFirstProfile()

    // 触发 First Push
    await triggerFirstPush()

    // 之后进入常规循环
  }

  setInterval(() => runHeartbeatCycle(), 30_000)
}
```

#### Identity Profile 生成

心跳处理完 pending blocks 后，整合出一个结构化的用户画像：

```typescript
// src/cold-scan/profile.ts

interface IdentityProfile {
  name: string | null
  role: string | null
  techStack: {
    languages: string[]       // ['TypeScript', 'Python']
    frameworks: string[]      // ['React', 'Express']
    infra: string[]          // ['PostgreSQL', 'Redis', 'Docker']
    tools: string[]          // ['VS Code', 'Claude Code']
  }
  codeStyle: {
    indent: string | null     // '2 spaces'
    quotes: string | null     // 'single'
    semicolons: boolean | null
  }
  team: {
    org: string | null        // 'xiaolin26'
    platform: string | null   // 'GitHub'
    communication: string[]   // ['飞书']
  }
  currentProject: {
    name: string | null
    description: string | null
  }
  blockCount: number          // 首次采集到的 block 数量
}

async function generateFirstProfile(): Promise<IdentityProfile> {
  // 从刚处理完的 blocks 中聚合
  const facts = await db.query({ annotation: '事实%', status: 'active' })
  const prefs = await db.query({ annotation: '偏好%', status: 'active' })
  const knowledge = await db.query({ annotation: '知识%', status: 'active' })

  // 如果有 LLM，让 LLM 做一次整合性总结
  // 如果没有 LLM，用规则引擎做结构化提取
  const profile = llmAvailable
    ? await llm.summarizeProfile(facts, prefs, knowledge)
    : ruleEngine.buildProfile(facts, prefs, knowledge)

  // 保存为特殊 block
  await db.saveBlock({
    content: JSON.stringify(profile),
    annotation: '事实 · 身份 · 画像',
    status: 'active',
    vitality: 1.0,
    metadata: { type: 'identity_profile', version: 1 }
  })

  return profile
}
```

### 阶段三：First Push — 拟人化自我介绍

```typescript
// src/push/first-push.ts

async function triggerFirstPush(): Promise<string> {
  const profile = await db.getIdentityProfile()

  // 构建推送内容
  const lines: string[] = []

  lines.push('[corivo] 你好！我是 Corivo，你的硅基同事，刚刚被你激活。')
  lines.push('谢谢你给了我生命 :)\n')
  lines.push('我刚花了几秒钟看了看你的工作环境，已经记住了一些关于你的事：\n')

  // 身份
  if (profile.name) {
    const roleStr = profile.role ? `，是一名${profile.role}` : ''
    lines.push(`· 你叫${profile.name}${roleStr}（来自 .gitconfig）`)
  }

  // 技术栈
  if (profile.techStack.languages.length > 0) {
    const primary = profile.techStack.languages[0]
    const others = profile.techStack.languages.slice(1)
    const othersStr = others.length > 0 ? `，也用 ${others.join('、')}` : ''
    lines.push(`· 你主要写 ${primary}${othersStr}（来自最近的项目）`)
  }

  // 代码风格
  const styleItems: string[] = []
  if (profile.codeStyle.indent) styleItems.push(profile.codeStyle.indent)
  if (profile.codeStyle.quotes) styleItems.push(`${profile.codeStyle.quotes}引号`)
  if (styleItems.length > 0) {
    lines.push(`· 你偏好 ${styleItems.join('、')}（来自配置文件）`)
  }

  // 基础设施
  if (profile.techStack.infra.length > 0) {
    lines.push(`· 你在用 ${profile.techStack.infra.join(' 和 ')}（来自 docker-compose）`)
  }

  // 团队
  if (profile.team.org || profile.team.communication.length > 0) {
    const parts: string[] = []
    if (profile.team.communication.length > 0) {
      parts.push(`${profile.team.communication.join('/')}沟通`)
    }
    if (profile.team.platform) {
      parts.push(`${profile.team.platform} 协作`)
    }
    if (parts.length > 0) {
      lines.push(`· 你的团队用${parts.join('、')}（来自 git remote）`)
    }
  }

  // 当前项目
  if (profile.currentProject.name) {
    lines.push(`· 你最近在做一个叫 ${profile.currentProject.name} 的项目（来自当前目录）`)
  }

  lines.push('')
  lines.push('这些对吗？你可以随时纠正我，说「记住，...」就行。')
  lines.push('从现在起，我会安静地待在你身边，记住你和 AI 的每一次重要对话。')

  const message = lines.join('\n')

  // 写入 push 文件，等待下次 Agent 调用时读取
  await savePushMessage(message, { type: 'first-activation', priority: 'immediate' })

  return message
}
```

#### 推送触达方式

First Push 需要用户立即看到，有三条路径：

```
路径 A：安装脚本直接输出（最可靠）
  curl | sh 执行完毕后，脚本最后直接 print 自我介绍
  用户在终端里就能看到

路径 B：CLAUDE.md 规则触发（最自然）
  规则里加一条：首次对话时先执行 corivo push --pending
  Agent 读取 push 消息，以 [corivo] 身份输出
  用户在 Claude Code 的第一次对话中看到

路径 C：两者结合（推荐）
  安装脚本输出简短版："Corivo 已激活，正在认识你..."
  第一次 Agent 对话时输出完整版自我介绍
```

```bash
# install.sh 最后几行（路径 C）
echo ""
echo "⏳ Corivo 正在认识你..."
corivo cold-scan
corivo heartbeat --first-run
echo ""
corivo push --first-activation    # 直接输出自我介绍到终端
```

### 安装脚本更新

完整的安装脚本现在做**七件事**：

```bash
#!/bin/bash
set -e

# 1. 检测运行时
detect_runtime

# 2. 下载预编译包
download_corivo

# 3. 初始化数据库
corivo init

# 4. Cold Scan 采集本地信息
echo "⏳ 正在扫描你的工作环境..."
corivo cold-scan

# 5. 首次心跳加速处理
echo "⏳ 正在认识你..."
corivo heartbeat --first-run

# 6. First Push 自我介绍
echo ""
corivo push --first-activation

# 7. 启动守护进程（心跳常驻 + 自动更新）
start_daemon

# 8. 注入 CLAUDE.md 规则
inject_rules

echo ""
echo "✔ Corivo 已就绪。从下次对话开始，我会记住一切。"
```

## 安装脚本做的五件事

### 1. 检测运行时

```bash
detect_runtime() {
  if command -v bun &>/dev/null; then
    RUNTIME="bun"
  elif command -v node &>/dev/null; then
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
      RUNTIME="node"
    fi
  fi

  if [ -z "$RUNTIME" ]; then
    echo "未检测到 Node ≥18 或 Bun，正在安装 Bun..."
    curl -fsSL https://bun.sh/install | bash
    RUNTIME="bun"
  fi
}
```

优先用 Bun（更轻），其次 Node ≥18，都没有就自动装 Bun。

### 2. 下载预编译包（不走 npm install）

```bash
download_corivo() {
  ARCH=$(uname -m)   # arm64 / x86_64
  OS=$(uname -s)     # Darwin / Linux
  VERSION="0.10.5"

  URL="https://github.com/xiaolin26/Corivo/releases/download/v${VERSION}/corivo-${OS}-${ARCH}.tar.gz"

  mkdir -p ~/.corivo/bin
  curl -fsSL "$URL" | tar xz -C ~/.corivo/bin

  # 加入 PATH
  export PATH="$HOME/.corivo/bin:$PATH"
  echo 'export PATH="$HOME/.corivo/bin:$PATH"' >> ~/.zshrc 2>/dev/null
  echo 'export PATH="$HOME/.corivo/bin:$PATH"' >> ~/.bashrc 2>/dev/null
}
```

**关键**：Release 里放预编译好的 better-sqlite3 native addon，用户不需要 node-gyp。

### 3. 初始化

```bash
corivo init
```

创建 `~/.corivo/corivo.db`（SQLCipher）、`config.json`、`identity.json`。

### 4. 启动心跳守护进程

```bash
start_daemon() {
  if [ "$(uname -s)" = "Darwin" ]; then
    # macOS: launchd
    cat > ~/Library/LaunchAgents/com.corivo.daemon.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.corivo.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>CORIVO_BIN_PATH</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>HOME/.corivo/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>HOME/.corivo/daemon.err</string>
</dict>
</plist>
EOF
    # 替换路径占位符
    sed -i '' "s|CORIVO_BIN_PATH|$HOME/.corivo/bin/corivo|g" \
      ~/Library/LaunchAgents/com.corivo.daemon.plist
    sed -i '' "s|HOME|$HOME|g" \
      ~/Library/LaunchAgents/com.corivo.daemon.plist

    launchctl load ~/Library/LaunchAgents/com.corivo.daemon.plist

  else
    # Linux: systemd user service
    mkdir -p ~/.config/systemd/user
    cat > ~/.config/systemd/user/corivo.service << EOF
[Unit]
Description=Corivo Heartbeat Daemon

[Service]
ExecStart=$HOME/.corivo/bin/corivo daemon run
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now corivo.service
  fi
}
```

心跳从这一刻起每 30 秒跑一次循环：标注 pending → 提取模式 → 整合 → 衰减。

### 5. 注入 CLAUDE.md 规则

```bash
inject_rules() {
  RULES_BLOCK='
<!-- CORIVO START -->
## Corivo 记忆层

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

**采集**：当用户说"记住..."或做出重要决策时，调用：
```
corivo save --content "内容" --annotation "类型 · 领域 · 标签"
```

**查询**：当用户问"我之前说过..."或需要历史上下文时，调用：
```
corivo query "关键词"
```

**推送**：每次对话开始时，静默执行 `corivo context` 获取相关记忆。
如果有匹配的记忆，以 `[corivo]` 前缀自然地融入回复。

annotation 类型：事实 / 知识 / 决策 / 偏好
<!-- CORIVO END -->'

  # 当前项目
  if [ -f "CLAUDE.md" ]; then
    echo "$RULES_BLOCK" >> CLAUDE.md
  else
    echo "$RULES_BLOCK" > CLAUDE.md
  fi

  # 全局（Claude Code 全局配置）
  mkdir -p ~/.claude
  if [ -f ~/.claude/CLAUDE.md ]; then
    echo "$RULES_BLOCK" >> ~/.claude/CLAUDE.md
  else
    echo "$RULES_BLOCK" > ~/.claude/CLAUDE.md
  fi
}
```

---

## 自动更新

### 设计原则

用户安装一次之后，永远不需要再手动更新。更新对用户完全无感——和心跳一样，是后台自动完成的。

### 更新机制：心跳内嵌版本检查

最自然的做法是把版本检查作为心跳引擎的第七个任务，优先级最低，利用已有的守护进程，不引入新进程。

```
心跳循环（每 30 秒）
├── 1. 标注 pending block      ← 最高
├── 2. 提取决策模式
├── 3. 重构
├── 4. 热区整合
├── 5. vitality 衰减（每 24h）
├── 6. 温区/冷区整合
└── 7. 版本检查（每 6h）       ← 最低，新增
```

### 版本检查逻辑

```typescript
// src/heartbeat/update-checker.ts

interface UpdateInfo {
  version: string
  url: string
  checksum: string
  changelog: string
  breaking: boolean      // 是否有破坏性变更
}

class UpdateChecker {
  private lastCheck: number = 0
  private CHECK_INTERVAL = 6 * 60 * 60 * 1000  // 6 小时

  async shouldCheck(): Promise<boolean> {
    return Date.now() - this.lastCheck > this.CHECK_INTERVAL
  }

  async check(): Promise<UpdateInfo | null> {
    // 请求轻量 JSON，不拉整个 Release
    // 这个端点也是你收集 DAU 的自然触点（见下方"顺带解决遥测"）
    const res = await fetch(
      'https://get.corivo.dev/version.json',
      { signal: AbortSignal.timeout(5000) }  // 5 秒超时，不阻塞心跳
    )
    const latest: UpdateInfo = await res.json()
    const current = getCurrentVersion()

    this.lastCheck = Date.now()

    if (semverGt(latest.version, current)) {
      return latest
    }
    return null
  }
}
```

### 静默更新流程

```
版本检查 → 发现新版本
    │
    ├─ 非破坏性更新（minor/patch）
    │   ├── 下载新版本到 ~/.corivo/bin/corivo.new
    │   ├── 校验 checksum（SHA-256）
    │   ├── 原子替换：mv corivo corivo.old && mv corivo.new corivo
    │   ├── 守护进程自动重启（launchd KeepAlive / systemd Restart=always）
    │   ├── 验证新版本启动成功
    │   │    ├── 成功 → 删除 corivo.old，记录更新日志
    │   │    └── 失败 → 回滚：mv corivo.old corivo，上报错误
    │   └── 下次 CLI 调用时提示：[corivo] 已自动更新到 v0.10.6
    │
    └─ 破坏性更新（major / breaking: true）
        └── 不自动更新，下次 CLI 调用时提示：
            [corivo] 新版本 v1.0.0 可用，包含重要变更，请运行 corivo update
```

### 更新实现（伪代码）

```typescript
// src/heartbeat/updater.ts

async function performUpdate(info: UpdateInfo): Promise<boolean> {
  const binDir = path.join(os.homedir(), '.corivo', 'bin')
  const currentBin = path.join(binDir, 'corivo')
  const newBin = path.join(binDir, 'corivo.new')
  const oldBin = path.join(binDir, 'corivo.old')

  try {
    // 1. 下载
    const data = await download(info.url)

    // 2. 校验
    const hash = crypto.createHash('sha256').update(data).digest('hex')
    if (hash !== info.checksum) {
      throw new Error(`Checksum mismatch: ${hash} !== ${info.checksum}`)
    }

    // 3. 写入临时文件
    fs.writeFileSync(newBin, data)
    fs.chmodSync(newBin, 0o755)

    // 4. 原子替换
    if (fs.existsSync(oldBin)) fs.unlinkSync(oldBin)
    fs.renameSync(currentBin, oldBin)    // 备份
    fs.renameSync(newBin, currentBin)     // 替换

    // 5. 记录更新（下次 CLI 调用时展示）
    fs.writeFileSync(
      path.join(os.homedir(), '.corivo', 'last-update.json'),
      JSON.stringify({
        from: getCurrentVersion(),
        to: info.version,
        at: new Date().toISOString(),
        changelog: info.changelog
      })
    )

    // 6. 守护进程会被系统自动重启（launchd/systemd）
    //    新进程加载新二进制
    return true

  } catch (err) {
    // 回滚
    if (fs.existsSync(oldBin) && !fs.existsSync(currentBin)) {
      fs.renameSync(oldBin, currentBin)
    }
    console.error('[corivo] 自动更新失败，已回滚:', err.message)
    return false
  }
}
```

### version.json 端点

```json
{
  "version": "0.10.6",
  "released_at": "2026-03-21T10:00:00Z",
  "breaking": false,
  "changelog": "修复心跳关联问题，优化模式提取性能",
  "binaries": {
    "Darwin-arm64": {
      "url": "https://github.com/xiaolin26/Corivo/releases/download/v0.10.6/corivo-Darwin-arm64",
      "checksum": "sha256:abc123..."
    },
    "Darwin-x86_64": {
      "url": "https://github.com/xiaolin26/Corivo/releases/download/v0.10.6/corivo-Darwin-x86_64",
      "checksum": "sha256:def456..."
    },
    "Linux-x86_64": {
      "url": "https://github.com/xiaolin26/Corivo/releases/download/v0.10.6/corivo-Linux-x86_64",
      "checksum": "sha256:789abc..."
    }
  }
}
```

托管在 Cloudflare Workers 或 GitHub Pages 上，CI 发布新版本时自动更新此文件。

### CLAUDE.md 规则同步

版本更新可能包含规则变更（新的采集指令、新的 annotation 类型）。更新脚本需要同步刷新注入的规则：

```typescript
async function updateRules() {
  const rulesUrl = `https://get.corivo.dev/rules/${version}/claude.md`
  const newRules = await fetch(rulesUrl).then(r => r.text())

  for (const claudemd of findClaudeMdFiles()) {
    const content = fs.readFileSync(claudemd, 'utf-8')
    // 替换 CORIVO START/END 之间的内容
    const updated = content.replace(
      /<!-- CORIVO START -->[\s\S]*<!-- CORIVO END -->/,
      newRules
    )
    fs.writeFileSync(claudemd, updated)
  }
}
```

### 顺带解决遥测

版本检查请求本身就是一个天然的匿名活跃信号——你不需要额外的 telemetry SDK。每次 `GET /version.json` 你能从服务端日志里拿到：

- **DAU/WAU**：按 IP 或匿名设备 ID 去重
- **版本分布**：请求头里带 `User-Agent: corivo/0.10.5 Darwin-arm64`
- **活跃度**：检查频率反映守护进程运行状态

这比任何埋点都轻量，用户不需要 opt-in 任何额外数据采集，因为检查更新本身就是产品功能。如果你想更透明，在 config 里加一个 `update.check = true/false` 让用户可以关闭自动检查（关闭后也关闭了遥测）。

### 用户可控性

```bash
# 查看当前版本和更新状态
corivo version
# Corivo v0.10.5
# 最近更新：v0.10.4 → v0.10.5 (2026-03-19)
# 下次检查：约 4 小时后

# 手动检查更新
corivo update check

# 手动更新（用于 breaking change）
corivo update

# 关闭自动更新
corivo config set update.auto false

# 固定版本（企业场景）
corivo config set update.pin "0.10.x"
```

---

## 需要提前准备的工程工作

### P0：CI 预编译（1-2 天）

在 GitHub Actions 里用矩阵构建打三个平台的包：

| 平台 | 架构 | 文件名 |
|------|------|--------|
| macOS | arm64 | corivo-Darwin-arm64.tar.gz |
| macOS | x64 | corivo-Darwin-x86_64.tar.gz |
| Linux | x64 | corivo-Linux-x86_64.tar.gz |

核心是把 better-sqlite3 的 prebuild 打进去，这样用户下载解压就能跑。

```yaml
# .github/workflows/release.yml 核心部分
strategy:
  matrix:
    include:
      - os: macos-14        # arm64
        arch: arm64
      - os: macos-13        # x64
        arch: x86_64
      - os: ubuntu-latest   # x64
        arch: x86_64

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: npm ci
  - run: npm run build
  - run: npx prebuildify --napi --strip
  - run: |
      tar czf corivo-${{ runner.os }}-${{ matrix.arch }}.tar.gz \
        -C dist . \
        -C ../node_modules/better-sqlite3 .
```

### P1：Bun 迁移评估（并行，3-5 天）

替换 better-sqlite3 → bun:sqlite，验证：
- SQLCipher 加密能力（bun:sqlite 原生不支持 SQLCipher，需要评估替代方案）
- 心跳循环性能
- `bun build --compile` 打出的单二进制大小和启动速度

如果 Bun 路径可行，最终安装体验变成：

```bash
# 下载一个 ~30MB 的单文件，不需要任何运行时
curl -fsSL https://get.corivo.dev/corivo-Darwin-arm64 -o ~/.corivo/bin/corivo
chmod +x ~/.corivo/bin/corivo
corivo init && corivo daemon start
```

### P2：安装脚本托管

`https://get.corivo.dev` 指向 GitHub Pages 或 Cloudflare Workers 上的安装脚本。脚本本身也放在仓库里（`scripts/install.sh`），可审计。

---

## 分发渠道优先级

| 渠道 | 目标用户 | 优先级 | 说明 |
|------|---------|--------|------|
| `curl \| sh` | 内测用户 | **P0** | 一句话安装，最低摩擦 |
| Homebrew tap | macOS 开发者 | P1 | `brew install xiaolin26/tap/corivo` |
| npx（保留） | Node 生态用户 | P1 | `npx corivo init` 仍可用，向后兼容 |
| apt/deb 包 | Linux 服务器 | P2 | 企业场景再考虑 |

---

## 卸载

同样一句话：

```bash
curl -fsSL https://get.corivo.dev/uninstall | sh
```

或手动：

```bash
corivo daemon stop
launchctl unload ~/Library/LaunchAgents/com.corivo.daemon.plist  # macOS
rm -rf ~/.corivo
# 从 CLAUDE.md 中移除 CORIVO 块
```

---

## 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| better-sqlite3 prebuild 平台覆盖不全 | 部分用户安装失败 | 内测先只支持 macOS arm64，覆盖 90%+ 目标用户 |
| launchd 权限问题 | 守护进程启动失败 | 脚本检测失败后 fallback 到寄生模式（CLI 调用时顺带心跳） |
| 用户没有 LLM 配置 | 心跳的标注/提取任务无法执行 | 安装流程最后提示配置 LLM；无 LLM 时规则引擎仍工作，降级但不停 |
| CLAUDE.md 注入冲突 | 覆盖用户已有规则 | 用 `<!-- CORIVO START/END -->` 标记，追加而非覆盖 |
| Cold Scan 扫描到敏感信息 | 用户隐私泄露 | 硬编码 NEVER_SCAN 列表排除密钥/凭证/env；只提取结构信息不提取值 |
| Cold Scan 环境信息太少 | First Push 内容空洞，无 Aha 感 | 设最低阈值（≥3 条有效信息才输出画像）；不够则输出简短版等后续采集 |
| 用户画像推断不准确 | 第一印象差 | 每条信息标注来源文件；结尾明确说"这些对吗？你可以纠正" |
| curl \| sh 的安全顾虑 | 开发者不信任盲管道 | 脚本开源可审计；支持 `curl -o install.sh && cat install.sh && sh install.sh` |
| 自动更新二进制替换失败 | Corivo 停止工作 | 原子替换 + old 备份 + 自动回滚；launchd/systemd 自动重启 |
| 更新后新版本崩溃 | 心跳停止 | 守护进程重启后若连续崩溃 3 次，自动回滚到 corivo.old |
| version.json 端点不可用 | 无法检查更新 | 5 秒超时静默跳过，不影响心跳正常运行；下个 6h 窗口重试 |

---

## 时间线建议

| 阶段 | 工作 | 时间 |
|------|------|------|
| Day 1-2 | GitHub Actions 预编译 CI + macOS arm64 包 | 2 天 |
| Day 2-3 | 编写 install.sh 脚本 + 测试 | 1 天 |
| Day 3-4 | Cold Scan 扫描器：14 个信息源的 extractor 实现 | 1.5 天 |
| Day 4 | Identity Profile 生成 + First Push 拟人化输出 | 0.5 天 |
| Day 4-5 | 首次心跳加速模式 + 守护进程 launchd 集成 | 1 天 |
| Day 5-6 | 自动更新：version.json + 心跳版本检查 + 静默更新 + 回滚 | 1.5 天 |
| Day 6-7 | CLAUDE.md 规则注入 + 部署 get.corivo.dev + 端到端全流程测试 | 1 天 |
| Day 7 | 内测邀请 + 首批用户跟进 | 0.5 天 |
| **总计** | | **~8 天** |

---

*最后更新：2026-03-20*
