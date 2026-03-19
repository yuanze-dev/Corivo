# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
