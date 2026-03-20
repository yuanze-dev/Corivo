<h1 align="center">Corivo</h1>

<p align="center">
  <strong>你的 AI 工作流记忆层</strong><br/>
  <sub>住在 Claude Code、Cursor 和飞书里，记住你说过的每一句话</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corivo"><img src="https://img.shields.io/npm/v/corivo?color=d97706&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d97706" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20arm64-lightgrey" alt="macOS arm64" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/status-内测中-orange" alt="Beta" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/readme-hero-img.jpeg" alt="Corivo — 你的硅基同事" width="100%" />
</p>

---

## Corivo 是什么？

Corivo 是一个**后台记忆伙伴**，寄生在你已有的工具里——Claude Code、Cursor、飞书。它悄悄倾听你和 AI 的每一次对话，记住重要的事，在恰当的时机为你提示上下文。

不需要学习新界面，不需要改变任何习惯，它就这样自然地运行。

```
你：    记住，我更喜欢 TypeScript。
Claude: [corivo] 已记住。

— 三周后 —

你：    这个新模块用什么语言好？
Claude: [corivo] 你之前说过更喜欢 TypeScript。
```

---

## 核心特性

| | |
|---|---|
| **被动倾听** | 自动从 AI 对话中捕捉决策、事实与偏好 |
| **结构化记忆** | 将记忆分类为*决策*、*事实*、*知识*、*偏好* |
| **生命力衰减** | 记忆自然老化——重大决策衰减最慢，碎片知识最快消退 |
| **关联引擎** | 自动发现记忆间的关系（相似、冲突、覆盖…） |
| **全文搜索** | FTS5 即时检索，中文场景优雅降级为 LIKE 搜索 |
| **端对端加密** | 所有数据本地存储于 `~/.corivo/`，可选 SQLCipher 加密 |
| **多设备同步** | 基于 CRDT 的同步服务器，无缝跨机器共享记忆 |
| **CLI 优先** | 所有功能通过简洁的命令行接口访问 |

---

## 快速开始

### 一句话安装

```bash
curl -fsSL https://corivo.ai | sh
```

安装后 Corivo 会自动：
1. 全局安装 `corivo` CLI
2. 扫描你的工作环境（Git 配置、项目设置、AI 工具配置）
3. 生成初始记忆画像
4. 启动后台心跳进程
5. 将 Corivo 规则注入 Claude Code

### 或使用 npm 安装

```bash
npm install -g corivo
corivo init
```

### 注入到项目

```bash
cd 你的项目
corivo inject   # 将 Corivo 规则写入 .claude/CLAUDE.md
```

---

## 使用方式

### 在对话中（Claude Code）

```
你：    记住，Sarah 是我们的后端负责人。
Claude: [corivo] 已记录。

你：    后端是谁负责？
Claude: [corivo] Sarah——她是你们的后端负责人。
```

```
你：    我们决定用 React 而不是 Vue。
Claude: [corivo] 已记录：前端框架 → React

你：    为什么选 React 来着？
Claude: [corivo] 因为团队更熟悉 React。
```

### 命令行

```bash
# 记住一件事
corivo save --content "主数据库用 PostgreSQL" \
            --annotation "决策 · project · database"

# 查询记忆
corivo query "数据库"

# 查看记忆状态
corivo status

# 向 AI 会话推送上下文
corivo push

# 查看守护进程日志
corivo logs
```

---

## 记忆类型

| 类型 | 说明 | 示例 |
|------|------|------|
| **决策** | 你做过的选择 | "用 PostgreSQL"、"选 TypeScript" |
| **事实** | 关于人或项目的事实 | "Sarah 是后端负责人" |
| **知识** | 你学到的知识 | "React hooks 用法"、"部署流程" |
| **偏好** | 你的习惯与风格 | "2 空格缩进"、"简洁代码风格" |

每条记忆都有一个 **生命力值**（0–100），随时间自然衰减。决策衰减最慢，碎片知识最快消退。状态流转：`active → cooling → cold → archived`。

---

## 架构

```
Claude Code / Cursor / 飞书
        │
        ▼
  Ingestors / Cold Scan          ← 采集原始信号
        │
        ▼
  CorivoDatabase                 ← better-sqlite3，~/.corivo/corivo.db
  (Blocks · Associations · Query Logs)
        │
        ▼
  心跳引擎（每 5 秒）
  ├── processPendingBlocks   → RuleEngine 标注
  ├── processVitalityDecay   → 按类型差异化衰减
  ├── processAssociations    → 关联发现（每 30s）
  └── processConsolidation   → 去重 + 摘要（每 1min）
        │
        ▼
  CLI 命令 · CRDT 同步服务器
```

### 包结构

| 包 | 说明 |
|----|------|
| [`@corivo/cli`](packages/cli) | 核心 CLI、本地数据库、心跳引擎 |
| [`@corivo/solver`](packages/solver) | CRDT 同步中继服务器（Fastify v5） |
| [`@corivo/plugins`](packages/plugins) | Claude Code 插件集成 |

---

## 数据与隐私

- 所有数据存储在你自己机器的 **`~/.corivo/`** 目录下
- SQLite 数据库，可选 **SQLCipher** 加密；SQLCipher 不可用时自动降级为应用层加密（`KeyManager`）
- 无遥测、无分析、无云端——除非你主动开启多设备同步

```
~/.corivo/
├── corivo.db       # 加密记忆存储
├── config.json     # 你的配置
└── identity.json   # 设备指纹（无需密码）
```

---

## 本地开发

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
npm install

# 构建所有包
npm run build

# 开发单个包
cd packages/cli
npm run dev          # 监听模式

# 运行测试（cli 包）
cd packages/cli
node --test          # 全部测试
node --test __tests__/unit/database.test.ts
```

### 技术栈

- **运行时**: Node.js ≥ 18，纯 ESM TypeScript（ES2022）
- **数据库**: better-sqlite3（WAL 模式，FTS5）
- **同步服务器**: Fastify v5，CRDT changeset
- **认证**: Challenge-Response + Bearer Token
- **ORM**: Drizzle ORM（类型安全查询）
- **守护进程**: macOS launchd

---

## 路线图

- [x] Claude Code 集成
- [x] 本地 SQLite 记忆 + 生命力衰减
- [x] 关联引擎
- [x] CRDT 同步服务器
- [x] Drizzle ORM 类型安全 Schema
- [ ] Cursor 集成
- [ ] 飞书集成
- [ ] Linux & Windows 支持
- [ ] Web 面板
- [ ] 团队 / 企业版功能

---

## 内测计划

Corivo v0.11 正在 **macOS arm64** 上小范围内测中。

[加入内测 →](BETA.md) · [提交反馈 →](https://github.com/Principle-Labs/Corivo/issues)

---

## 参与贡献

欢迎提交 Pull Request！请先开 Issue 讨论你想做的改动。

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/你的功能`
3. 按照 [conventional commits](https://www.conventionalcommits.org) 规范提交
4. Push 并向 `main` 开 PR

---

## License

Corivo Core 使用 **[MIT 协议](LICENSE)** 开源。

团队版与企业版功能（计划中）将以商业许可发布。

---

<p align="center">
  <sub>为每天与 AI 协作的人而生 · v0.11.0</sub>
</p>
