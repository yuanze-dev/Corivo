# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 注：部分历史 tag（尤其是 `0.1.x` 与若干 `0.10.x` 补丁版）对应的是发布流程修正、版本对齐或重新打 tag。以下内容已按 git 历史补齐；若某个 tag 没有独立功能改动，会明确标注为“版本元数据发布”。

## [0.12.3] - 2026-03-26

### Added
- **自动 Release Notes**: 新增 `.github/workflows/release-notes.yml` 与 `scripts/generate-release-notes.mjs`，支持自动生成并 AI 改写发布说明
- **插件化采集架构**: 引入 `RealtimeIngestor / IngestorPlugin` 接口、`ingestors` 配置项，以及独立的 `@corivo/openclaw` 插件包
- **CLI**: 新增 `corivo list` 命令
- **同步能力增强**:
  - Sync 增加 token-based auth 工具、脚本与测试
  - solver 配对码有效期延长至 24 小时
  - solver 请求增加基于 `randomUUID` 的请求 ID
- **查询能力**: `BlockFilter` 新增 `annotationPrefix` 前缀匹配和排序选项

### Changed
- OpenClaw 从 CLI 内建 ingestor 迁移为插件加载器机制
- 后台日志改为结构化输出，并增加日志级别与时间戳
- 更新检查从 GitHub 发布源切换到 npm registry
- 移除 consolidation 中自动摘要生成逻辑及相关数据库清理迁移

### Fixed
- sync pull 现在正确使用 server cursor 分页并写入远端拉取的 blocks
- `corivo sync` 在 pairing 时正确尊重 `--server`
- Linux systemd unit 增加日志重定向
- solver 启动时自动创建数据库目录
- `@corivo/openclaw` 类型声明与 `NodeNext` 构建解析问题得到修复

## [0.10.24] - 2026-03-26

### Fixed
- 修正 `publish.yml` 中 pnpm build 的命令写法，避免发布流程执行失败

## [0.10.23] - 2026-03-26

### Changed
- 发布工作流改为使用 pnpm 执行安装与构建步骤

## [0.10.22] - 2026-03-26

### Added
- 为 sync 流程补充 token-based authentication 工具、脚本与测试

### Changed
- `better-sqlite3` 升级至 `12.8.0`

## [0.12.2] - 2026-03-23

### Fixed
- CI 中移除不存在的 `test` 脚本调用，避免流水线误失败

### Changed
- 更新 `package-lock.json` 以匹配当前依赖状态

## [0.12.1] - 2026-03-23

### Changed
- **OpenClaw 采集器** 从定时轮询改为文件监听模式
  - 使用 `fs.watch` 监听 `gateway.log` 文件变化
  - 添加 500ms 防抖机制，避免频繁触发
  - 监听失败时自动回退到轮询模式
  - 延迟从最多 60 秒降低到 <500ms
- **BlockFilter** 接口新增 `source` 字段，支持按来源筛选
- **文档**: 更新 `docs/hooks-ingestor.md`，添加 OpenClaw 采集器说明

### Fixed
- 类型检查错误：正确导入 `FSWatcher` 类型
- `queryBlocks` 方法支持 `source` 参数过滤

## [0.10.21] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.20] - 2026-03-23

### Added
- **OpenClaw 集成补丁线汇总**:
  - 添加 OpenClaw 采集支持
  - Claude Code 插件新增 Hooks 实时采集对话能力
  - pnpm workspace 纳入 `plugins` 子目录

### Changed
- 发布流程继续收敛：移除旧 `release.yml`，并移除 `npm publish --provenance`

### Fixed
- CLI 包名对齐为 `corivo`
- 修复 `shared` 包的 workspace 链接问题
- `better-sqlite3` 升级到 `9.6.0`

## [0.10.19] - 2026-03-23

### Fixed
- CLI 包名改为 `corivo`，与 npm 发布名称保持一致

## [0.10.18] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.17] - 2026-03-23

### Fixed
- 修复工作目录设置，确保相关命令在正确路径下运行

## [0.10.16] - 2026-03-23

### Changed
- 版本对齐发布，承接此前发布流程与版本号修正

## [0.10.15] - 2026-03-23

### Changed
- 更新 npm 发布命令，补充 `--access public`

### Fixed
- 调整发布用 Node.js 版本以适配当时的发布需求

## [0.10.14] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.13] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.12] - 2026-03-23

### Fixed
- 包名改为 `corivo`，与 npm 包名称保持一致

## [0.10.11] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.10] - 2026-03-23

### Fixed
- 发布流程切换为 OIDC Trusted Publisher，移除 `NPM_TOKEN`

## [0.10.9] - 2026-03-23

### Changed
- 版本元数据发布，无额外代码变更

## [0.10.8] - 2026-03-23

### Fixed
- 修复 pnpm cache 路径错误指向仓库根目录 `pnpm-lock.yaml` 的问题

## [0.10.7] - 2026-03-23

### Changed
- 更新发布工作流，移除旧 `release.yml` 并优化 `publish.yml`

## [0.10.6] - 2026-03-23

### Added
- 安装与发布能力增强:
  - 自动检测 Corivo CLI 安装状态
  - 新增安装 / 卸载脚本
  - 新增 GitHub Actions release pipeline
- 首次使用体验增强:
  - 新增 Cold Scan 初始画像提取框架
  - 新增 First Push 与首轮 heartbeat 模式
- 系统集成:
  - 新增 macOS launchd 守护进程集成
  - 新增自动更新系统
  - 新增规则注入能力
- 架构演进:
  - 重构 Claude Code 插件架构
  - 代码库重组为 monorepo
  - 引入 solver 包并完成认证、同步 relay 与 CLI sync 集成
  - 增加多平台支持方向（Codex / VS Code / shared）
  - 引入主动提醒与上下文建议系统
  - 增加 `corivo status --tui`、AutoSync 与 ServiceManager 体系

### Fixed
- 修复数据库持久化与 annotation 保留问题
- 修复卸载脚本清理 CLAUDE.md、`--no-password`、加密模式搜索、launchd plist 路径等一批 CLI/守护进程问题

## [0.12.0] - 2026-03-20

### Added
- **主动提醒系统** (`ReminderManager`): 5种提醒类型（进展/需关注/矛盾/周总结/自定义），支持优先级、过期、忽略
- **上下文建议引擎** (`SuggestionEngine`): 基于长期记忆预测用户下一步，支持会话启动和请求后两种上下文
- **触发决策引擎** (`TriggerDecisionEngine`): 检测矛盾、被遗忘的决策、需要关注的事项，智能推送
- **推送队列** (`PushQueue`): 持久化存储推送项，支持去重和过期机制
- **CLI 命令**: `reminders`（提醒管理）、`suggest`（建议生成）、`push-queue`（队列管理）
- **Hook 集成**: `stop-suggest.sh` 在请求完成后自动推送建议
- **文档**: `push-system-design.md`、`suggestion-design.md`、`trigger-decision-design.md`

### Changed
- First Push 文案优化：「几秒钟」→「一点时间」

### Fixed
- 测试隔离问题: 使用随机 ID 而非 `Date.now()` 生成临时数据库路径
- daemon-macos 测试: 修正 `launchctl list` 输出格式 mock

## [0.11.0] - 2026-03-20

### Added
- **一键安装**: `npm i -g corivo && corivo init` 即可完成初始化并启动心跳
- **Cold Scan**: 首次运行时自动提取用户信息（git config、package.json、Claude Code settings、编辑器配置等）
- **macOS 后台心跳**: 通过 launchd 实现系统级守护进程，心跳持续自动运行
- **自动更新系统**: 检查新版本，支持破坏性更新提醒和手动更新
- **GitHub Actions CI/CD**: 自动化构建、测试和发布流程
- **身份识别系统**: 基于平台指纹（Claude Code、飞书）的跨设备身份关联
- **CLI 新命令**: `update`、`daemon`、`identity`、`cold-scan`、`inject`、`push`、`query`

### Changed
- 重构配置管理，统一配置读取逻辑到 `src/config.ts`
- 补全 BIP39 词表到完整的 2048 个单词，恢复密钥生成现已可用

### Fixed
- Update Checker 破坏性更新逻辑反转的问题
- 测试清理: 修复数据库单例模式导致的测试间干扰

## [0.1.3] - 2026-03-23

### Changed
- 历史兼容 tag，未引入独立代码变更

## [0.1.2] - 2026-03-23

### Changed
- 历史兼容 tag，未引入独立代码变更

## [0.1.1] - 2026-03-23

### Changed
- 历史兼容 tag，未引入独立代码变更

## [0.10.5] - 2026-03-19

### Fixed
- 心跳 `runOnce()` 方法现在正确调用关联发现（`processAssociations()`）
- 标注验证放宽：允许任意三段式格式，仅检查结构而非特定类型值
- 修复边界情况测试中过时的验证用例

## [0.10.4.0] - 2026-03-19

### Added
- **Phase 5 - Claude Code 集成**: CLI 改进和插件支持
  - `--no-password` 选项：支持非交互式环境（Claude Code、自动化脚本）
  - `inject` 命令：一键将 Corivo 规则注入到项目 CLAUDE.md
  - `--eject` 选项：移除已注入的规则
  - 动态版本号：CLI 版本从 package.json 读取
  - 正确的 shebang：修复全局安装后的可执行文件问题

- **Claude Code 插件支持**:
  - `corivo-plugin/` 目录：完整的插件结构
  - `corivo-save.md` skill：保存信息到记忆库
  - `corivo-query.md` skill：查询记忆库
  - `status.js`：状态栏显示记忆统计
  - `.claude-plugin/plugin.json` 和 `marketplace.json`：插件元数据

- **.npmignore**：排除开发文件，优化 npm 包大小

### Changed
- `readPassword` 函数新增 `allowEmpty` 选项支持非 TTY 环境
- CLI 命令现在检查 `CORIVO_NO_PASSWORD` 环境变量
- Claude Code 规则模板改进：更清晰的说明和示例

### Fixed
- 全局安装后 `corivo` 命令无法执行的问题（缺少 shebang）
- 版本号硬编码导致显示不一致的问题

## [0.10.0.0] - 2026-03-18

### Added
- **Phase 1 - 基础设施**: 数据模型、错误处理系统、密钥管理
  - Block 模型（ID 生成、标注验证、生命力衰减）
  - Pattern 模型（决策模式提取和验证）
  - 统一错误处理（CryptoError, ValidationError, DatabaseError）
  - 密钥管理（PBKDF2 派生、AES-256-GCM 加密、BIP39 恢复密钥）

- **Phase 2 - 核心引擎**: SQLite 存储层和心跳引擎
  - CorivoDatabase 类（CRUD、搜索、统计、健康检查）
  - HeartbeatEngine（待标注块处理、模式提取、生命力衰减）
  - 技术选型规则引擎（TypeScript、PostgreSQL、Redis 等）

- **Phase 3 - 交互层**: 完整 CLI 命令接口
  - `init` - 初始化 Corivo 数据目录
  - `save` - 保存信息块（内容 + 标注）
  - `query` - 搜索信息块（全文搜索）
  - `status` - 显示数据库统计和健康状态
  - `start` - 启动心跳守护进程
  - `stop` - 停止心跳守护进程
  - `doctor` - 诊断工具
  - `recover` - 从恢复密钥重建主密钥

- **测试覆盖**: 86 个测试用例
  - 单元测试: crypto, database, models, rules, context
  - 集成测试: heartbeat engine
  - E2E 测试: CLI flow

### Changed
- 从纯设计文档到可执行 CLI 工具
- ESM 模块架构（使用 tsx 运行）

### Fixed
- ESM/CommonJS 兼容性问题（better-sqlite3）
- 恢复密钥编码（标准 BIP39 24 词）
- Vitality 衰减计算（使用 updated_at）
- Pattern 提取和持久化

[0.10.0.0]: https://github.com/xiaolin26/Corivo/releases/tag/v0.10.0.0
