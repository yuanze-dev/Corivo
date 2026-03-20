# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
