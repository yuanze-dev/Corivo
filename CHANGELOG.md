# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
