<h1 align="center">Corivo</h1>

<p align="center">
  <strong>融入 AI 工作流的长期记忆伙伴</strong><br/>
  <sub>Corivo 在后台持续整理对话中的关键信息，并在需要时把上下文带回来。</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corivo"><img src="https://img.shields.io/npm/v/corivo?color=d97706&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d97706" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20arm64-lightgrey" alt="平台支持" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/status-beta-orange" alt="Beta 状态" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/readme-hero-img.jpeg" alt="Corivo 头图" width="100%" />
</p>

---

## Corivo 是什么

Corivo 不是一个需要你切换过去使用的新 App，而是一层“寄生”在现有 AI 工作流中的后台服务。

它会从持续对话里捕捉决策、事实和偏好，落到本地记忆系统里，再在后续时机通过 `[corivo]` 形式主动补充上下文。

```text
你：    记住，后端服务默认优先 TypeScript。
Agent:  [corivo] 已保存。

...两周后...

你：    这个服务应该用什么语言？
Agent:  [corivo] 你之前对后端服务的偏好是 TypeScript。
```

目前最成熟的使用路径仍然是本地 `corivo` CLI 加 Claude Code 集成。仓库里的其他集成包大多还处于早期或实验阶段。

## 当前状态

Corivo 目前处于活跃迭代期的 beta 阶段，可用但仍在快速演进。

| 模块 | 状态 |
|---|---|
| `corivo` CLI（`packages/cli`） | Beta，可作为主入口使用 |
| 本地记忆引擎（SQLite + heartbeat） | 可用 |
| Claude Code 集成 | 可用 |
| 同步中继（`packages/solver`） | 早期阶段 |
| Codex / OpenClaw 插件包 | 实验性能力面 |
| 官方支持平台 | 以 macOS arm64 为主 |

## 快速开始

使用 npm 安装：

```bash
npm install -g corivo
corivo init
```

常用起步命令：

```bash
corivo status
corivo save --content "计费模块用 PostgreSQL" --annotation "决策 · project · database"
corivo query "database"
corivo inject
```

说明：
- `corivo inject` 会把规则写入当前项目的 `.claude/CLAUDE.md`。
- `scripts/install.sh` 已经可以检测并配置同一台机器上的 Claude Code、Codex、Cursor 和 OpenCode。
- 路线图中的部分集成还在推进中，暂不承诺全量可用。

## 按宿主安装

Corivo 支持多个 AI coding agent。你既可以使用一次性安装脚本自动探测本机宿主，也可以按需单独安装某一个宿主适配器。

### 一次性安装脚本

```bash
curl -fsSL https://i.corivo.ai/install.sh | bash
```

这个安装脚本会：

- 在缺少 Node.js 时自动补装
- 安装 `corivo` CLI
- 执行 `corivo init`
- 检测你机器上的 Claude Code、Codex、Cursor 和 OpenCode
- 自动安装匹配到的 Corivo 宿主适配器

### Claude Code

你会得到什么：

- 用于 carry-over、recall、review 的 Claude Code hooks
- 面向 Claude Code 工作流的 Corivo skills 和命令文档
- 通过 Corivo CLI 完成的全局 Claude Code 适配

安装命令：

```bash
corivo inject --global --claude-code
```

安装脚本会做什么：

- 安装 Claude Code 的 hook 脚本和 skills
- 更新 Claude Code 设置，让生命周期 hooks 调用 Corivo
- 启用 Claude Code 的主主动记忆流程

注意事项：

- 这是当前仓库里最成熟的一条集成路径。
- 如果你希望检测到 Claude Code 后自动配置，直接使用一次性安装脚本即可。

### Codex

你会得到什么：

- 全局 Codex 主动记忆指令
- 用于答后 review 的 notify 适配器
- 仓库内可直接使用的本地插件资产和 marketplace 打包结构

安装命令：

```bash
corivo inject --global --codex
```

安装脚本会做什么：

- 写入全局 Codex Corivo 指令
- 把 Codex notify 适配器安装到 `~/.codex/corivo/`
- 更新 Codex 全局配置，让 Corivo 参与主动记忆流程

注意事项：

- 安装完成后需要重启 Codex，配置才会生效。
- 如果脚本检测到 `codex` 命令或 `~/.codex` 目录，一次性安装脚本会自动配置 Codex。

### Cursor

你会得到什么：

- 用于 carry-over、recall、review 的全局 Cursor rules
- 原生 Cursor 生命周期 hooks 接线
- 允许 Cursor 调用 `corivo` 的 CLI 权限配置

安装命令：

```bash
corivo inject --global --cursor
```

安装脚本会做什么：

- 写入全局 `corivo.mdc` 规则文件
- 把 Corivo hook 脚本安装到 `~/.cursor/corivo/`
- 更新 `~/.cursor/settings.json`，写入 Cursor 生命周期 hooks
- 确保 Cursor CLI 权限允许 `Shell(corivo)`

注意事项：

- 如果 Cursor Agent 已安装但尚未登录，安装结果会提示你还需要额外处理。
- 如果脚本检测到 `cursor` 命令或 `~/.cursor` 目录，一次性安装脚本会自动配置 Cursor。

### OpenCode

你会得到什么：

- 一个把 OpenCode 原生事件映射到 Corivo 记忆流程的插件
- 通过本地 Corivo CLI 接入的 carry-over、recall、review 能力

安装命令：

```bash
corivo inject --global --opencode
```

安装脚本会做什么：

- 把本地 `corivo.ts` 插件安装到 `~/.config/opencode/plugins/`
- 将 OpenCode 原生事件接入 Corivo 的 carry-over、recall、review 调用

注意事项：

- 安装后你可能还需要检查默认 OpenCode provider 配置。
- 如果脚本检测到 `opencode` 命令或 `~/.config/opencode` 目录，一次性安装脚本会自动配置 OpenCode。

## 为什么会有 Corivo

AI 很擅长当前这一轮对话，但不擅长长期连续性。

Corivo 想补的正是这个空缺：你反复说过的偏好、已经做出的决策、不该在下个会话里消失的事实，以及那些本应该在你再次提问前就出现的项目上下文。

## 工作方式

```text
AI 工具（Claude Code / others）
        |
        v
采集器 + 冷启动扫描
        |
        v
Corivo 数据库（~/.corivo/corivo.db）
Blocks + associations + query logs
        |
        v
Heartbeat 引擎
- 标注
- 生命力衰减
- 关联发现
- 整理归并
        |
        v
CLI 命令与可选同步能力
```

记忆以 block 为核心，并带有生命力状态（`active -> cooling -> cold -> archived`）。重大决策衰减更慢，确保长期项目约束更容易被找回。

## 仓库地图

本仓库是 pnpm workspace monorepo。

| 路径 | 包名 | 作用 |
|---|---|---|
| [`packages/cli`](packages/cli) | `corivo` | 核心 CLI、本地存储、heartbeat 引擎 |
| [`packages/solver`](packages/solver) | `@corivo/solver` | 同步中继服务包 |
| [`packages/shared`](packages/shared) | `@corivo/shared` | 共享 API 与类型定义 |
| [`packages/plugins/claude-code`](packages/plugins/claude-code) | `@corivo/claude-code` | Claude Code 插件资产 |
| [`packages/plugins/codex`](packages/plugins/codex) | `@corivo/codex` | 面向 Codex 的插件资产 |
| [`packages/plugins/openclaw`](packages/plugins/openclaw) | `@corivo/openclaw` | OpenClaw 实时采集插件包 |

仓库里所有对外可见的 package 现在都有各自的 README，贡献者不需要再自己猜目录含义。

## 数据与隐私

Corivo 默认本地优先。

- 数据存放在你机器上的 `~/.corivo/`。
- 持久化使用 SQLite，可选 SQLCipher，不可用时可回退到应用层加密。
- 核心本地能力不依赖遥测上报。
- 网络行为主要来自你主动启用的同步流程。

## 开发

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
pnpm install
pnpm build
```

常用 workspace 命令：

```bash
pnpm dev
pnpm lint
pnpm test
```

包级示例：

```bash
cd packages/cli
npm run build
node --test

cd ../solver
npm run dev
```

## 贡献与社区

- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 社区行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 安全策略：[SECURITY.md](SECURITY.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- Beta 说明：[BETA.md](BETA.md)
- 问题反馈：[github.com/xiaolin26/Corivo/issues](https://github.com/xiaolin26/Corivo/issues)

欢迎提交高质量 Bug 报告、文档改进、测试补齐和新集成支持。

## 路线图快照

- 提升插件稳定性与跨工具采集覆盖
- 拓展 macOS arm64 之外的平台支持
- 继续增强同步链路可靠性与运维文档
- 打磨更清晰的外部 API 与生态接入方式

## License

Corivo 采用 [MIT License](LICENSE) 开源。

---

<p align="center">
  <sub>为每天与 AI 协作的人而做。</sub>
</p>
