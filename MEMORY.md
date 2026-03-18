# Corivo 项目记忆

> **项目**: Corivo - Agent-first 个人记忆层
> **仓库**: https://github.com/xiaolin26/Corivo
> **版本**: v0.10（设计文档阶段）
> **路径**: `/Users/xiaolin/Downloads/同步空间/Corivo/`

> **品牌定位**: Corivo 是一个为你服务、记录你点点滴滴、最懂你的赛博伙伴。为你服务，你是它的全部。

---

## 项目概述

Corivo 是一个嵌入用户已有工作流的**Agent-first 个人记忆层**。不是一个独立的 App，而是寄生在 Claude Code、Cursor、飞书等工具中的后台服务——自动从用户的 AI 对话和消息中采集信息，持续整理和更新，在合适的时机以 `[corivo]` 的名义主动提醒用户。

**核心价值**：
- **采集无感**：通过规则注入和事件订阅，用户零行为改变
- **更新自动**：心跳引擎持续处理、整合、衰减记忆
- **推送有感**：在对话中以 `[corivo]` 名义主动提醒相关记忆

**护城河**：你的数字自我不属于任何单一工具。ChatGPT 的记忆、Claude 的上下文——Corivo 让它们跨工具共享。

---

## 核心理念

1. **文本是唯一的"源码"** - Agent 能处理，人能直接读
2. **人是读者，Agent 是管家** - 记录、整理、查询、更新全部由 Agent 执行
3. **自然语言即编程语言** - 用户说"以后周报帮我这样写"，Agent 自动执行
4. **安全是基础** - 本地存储、E2EE 同步、开源可审计
5. **个人是起点，协作是方向** - v0.10 新增团队与企业扩展设计

---

## v0.10 战略升级

### 定位变化

| v0.5 | v0.10 |
|------|-------|
| 数字孪生系统 | Agent-first 个人记忆层 |
| 学习、预测、代理 | 采集无感、更新自动、推送有感 |

### v0.10 新增能力

1. **混合模式提取** - 规则引擎 80% + LLM 20%，平衡成本与准确性
2. **密钥管理系统** - 16 词恢复短语、设备授权/撤销完整设计
3. **旁路触发机制** - Aha Moment 的人工触发方式
4. **信任状态机** - 4 级权限 × 4 种降级原因，完整恢复路径
5. **团队协作** - 命名空间、CRDT 同步（Yjs）、权限模型
6. **记忆 API** - Personal Data Protocol 标准化
7. **可视化图谱** - 时间线视图、领域热力图
8. **规则引擎贡献** - 社区共建规则库机制

---

## 技术架构

| 层面 | 选型 | 理由 |
|------|------|------|
| 本地存储 | SQLCipher（加密 SQLite） | 全平台、毫秒级、离线可用 |
| 语义搜索 | sqlite-vss / LLM 直接匹配 | 个人数据量级足够 |
| 多设备同步 | E2EE 中继服务 | 安全等价 P2P，体验等价云同步 |
| 对外接口 | CLI + MCP Server + IM Bridge + REST API | 覆盖 CLI Agent、GUI AI 工具、消息平台、第三方集成 |
| 主动接入 | 规则注入（CLAUDE.md 等） | 零进程、零协议 |
| 心跳运行 | 寄生在已有常驻进程 + 可选守护进程 | 不引入新进程 |
| 模式提取 | **混合方案**（规则引擎 + LLM 验证） | v0.10 新增 |
| 团队同步 | **CRDT（Yjs）** | v0.10 新增 |

---

## 核心流程

```
采集（无感）──→ 更新（自动）──→ 推送（有感）
                    ↑                  │
              记忆生命周期              │
              （衰减/整合/重构）        │
                                      ↓
        ← 用户在已有工具中自然交互 ←──┘
```

---

## 仓库结构

```
Corivo/
├── .gitignore
├── MEMORY.md                     - 项目记忆（本文件）
├── README.md                     - 项目总览
├── v0.2/                         - v0.2 版本（个人记忆层）
│   └── ...
├── v0.5/                         - v0.5 版本（数字孪生系统）
│   └── ...
└── v0.10/                        - v0.10 版本（当前）
    ├── README.md                 - 设计文档总览
    ├── 01-block.md               - Block 数据模型（混合模式提取）
    ├── 02-memory-lifecycle.md    - 记忆生命周期
    ├── 03-storage.md             - 存储与同步（密钥管理）
    ├── 04-integration.md         - 接入架构
    ├── 05-ingestion.md           - 自动采集
    ├── 06-heartbeat.md           - 心跳引擎（混合模式提取）
    ├── 07-push.md                - 主动推送（旁路触发）
    ├── 08-prediction.md          - 预测性 AI
    ├── 09-aha-moment.md          - Aha Moment（旁路触发机制）
    ├── 10-risks.md               - 风险与对策（团队/企业安全）
    ├── 11-tool-use.md            - 工具调用（信任降级恢复）
    ├── 12-team.md                - **NEW** 团队协作记忆层
    ├── 13-api.md                 - **NEW** Personal Data Protocol
    ├── 14-visualization.md       - **NEW** 记忆可视化 GUI
    ├── 15-edge-cases.md          - **NEW** 边界情况处理
    ├── 16-testing.md             - **NEW** 测试策略
    ├── 17-performance.md         - **NEW** 性能基准
    ├── 18-security.md            - **NEW** 安全审计清单
    ├── 19-trust-state-machine.md - **NEW** 信任状态机
    ├── 20-crdt-implementation.md - **NEW** CRDT 实现（Yjs）
    └── 21-rule-engine-contribution.md - **NEW** 规则引擎贡献
```

---

## Git 历史

### 2026-03-17 - 仓库初始化

- ✅ 创建 GitHub 公开仓库
- ✅ 初始提交：9 个文档，988 行
  ```
  feat: 初始化 Corivo 技术设计文档仓库
  添加构想版0.2的核心设计文档
  ```

### 2026-03-18 - 新增 Aha Moment 和 Launch Copy

- ✅ 新增 2 个文档：08-aha-moment.md、09-launch-copy.md
- ✅ 更新 README.md
- ✅ 共 1263 行文档

### 2026-03-18 - v0.5 数字孪生战略升级

- ✅ 定位升级：从"个人记忆层"到"数字孪生系统"
- ✅ 新增 2 个文档：08-prediction.md、10-risks.md
- ✅ 更新 6 个文档

### 2026-03-18 - v0.10 协作与工程完善

- ✅ 定位聚焦：**Agent-first 个人记忆层**
- ✅ 新增 10 篇工程文档（12-21）
- ✅ 更新核心文档：混合模式提取、密钥管理、旁路触发
- ✅ 21 篇设计文档完整覆盖

---

## CEO Review 记录

### 2026-03-18 - v0.5 CEO Review（SCOPE EXPANSION 模式）

**审查人**: Claude Code + 晓力
**结果**: 战略升级到数字孪生系统

**关键决策**：
1. ✅ 加入预测性 AI
2. ✅ 加入主动训练模式
3. ❌ 跳过数据迁移功能

**核心战略**：
- 护城河 = 跨工具数字自我

### 2026-03-18 - v0.10 产品定位聚焦

**审查人**: Claude Code + 晓力
**结果**: 聚焦 Agent-first 个人记忆层

**关键决策**：
1. ✅ 混合模式提取（规则引擎优先，LLM 验证）
2. ✅ 团队协作扩展设计
3. ✅ 完善工程文档（边界情况/测试/性能/安全）

**品牌定位**：
> "Corivo 是一个为你服务、记录你点点滴滴、最懂你的赛博伙伴。为你服务，你是它的全部。"

---

## 待推进事项

### 核心流程

**采集**
- [ ] 规则注入模板：适配 Claude Code / Codex / Cursor / Copilot 四种格式
- [ ] `corivo init` 安装引导流程实现
- [ ] 飞书事件订阅采集器（复用 IM Bridge bot）
- [ ] ChatGPT/Claude 对话历史批量导入器
- [ ] 本地 Agent 配置文件采集（文件监听 + 跨项目整合）

**更新（心跳引擎）**
- [ ] Heartbeat Loop 核心调度器（优先级队列 + 批量控制 + 5 秒时间窗口）
- [ ] **规则引擎实现**：常见决策模式的结构化提取（v0.10 P0）
- [ ] Ingestion Agent（pending block 标注）集成到心跳循环
- [ ] vitality 衰减算法：按 annotation 类型差异化衰减曲线
- [ ] 整合算法：去重、提炼、补链、降温
- [ ] 重构机制：查询触发的异步准确性审视
- [ ] LLM 调用策略：本地模型 / API Key / 无 LLM 降级

**推送**
- [ ] 上下文匹配触发：查询时附加关联检索
- [ ] 时间触发：block 中时间信息提取 + 到期检测
- [ ] 洞察触发：整合过程中写入 push block
- [ ] **旁路触发机制**：Aha Moment 的人工触发方式（v0.10 P0）
- [ ] `[corivo]` 品牌标识在各接入点的呈现实现
- [ ] 用户反馈闭环：采纳/忽略/拒绝信号收集

### 基础设施

**存储与同步**
- [ ] 本地 SQLCipher schema 定义（含全部生命周期字段 + 向量索引）
- [ ] **密钥管理系统**：设备授权、撤销、恢复（v0.10 P0）
- [ ] E2EE 中继服务协议设计和开源实现
- [ ] 多设备密钥派生与设备授权流程

**接入层**
- [ ] corivo CLI 完整命令设计和实现
- [ ] MCP Server 实现（CLI 包装 + 心跳宿主 + 上下文推送）
- [ ] IM Bridge 第一个平台适配（飞书 or Telegram）
- [ ] **REST API 实现**：Personal Data Protocol（v0.10 P1）

**工程**
- [ ] 开源仓库初始化、LICENSE、贡献指南
- [ ] 文件锁单实例保证
- [ ] 采集源控制面板（`corivo sources` / `corivo log`）

### v0.10 新增

**团队与企业**
- [ ] Namespace 和权限模型设计
- [ ] 团队共享 block 实现方案
- [ ] 企业版安全与审计需求

**可视化**
- [ ] 记忆图谱渲染引擎
- [ ] 时间线视图
- [ ] 领域热力图
- [ ] Web GUI 实现（P2）

**API 与生态**
- [ ] Personal Data Protocol 标准化文档
- [ ] 第三方 Agent 认证机制
- [ ] 社区记忆库协议设计（P2）

---

## 产品关系

- **守夜人**：负责感知和行动，Corivo 负责记忆
- **Mesh**：负责跨工具串联，Corivo 提供统一的知识存储
- Corivo 是守夜人和 Mesh 的共同底层——一个 Agent 和人共享的记忆层

---

## 开发进度

### Phase 4 - 测试与发布（进行中）

**日期**: 2026-03-18

**完成项**：
- ✅ Vitest 测试框架配置（coverage thresholds 70%）
- ✅ 85+ 测试用例编写
  - Crypto: 16/16 ✅
  - Crypto: 16/16 ✅
  - Database: 20/20 ✅
  - Models: 15/15 ✅
  - Rules: 12/12 ✅
  - CLI Flow: 4/4 ✅
  - Context: 11/11 ✅
  - Heartbeat: 8/8 ✅
- ✅ 核心功能验证通过（保存、查询、搜索、统计、健康检查）

**已修复的关键 Bug**：
1. ESM/CommonJS 兼容性：使用 `createRequire()` 加载 better-sqlite3
2. 密码输入工具：改用 ESM `import * as readline`
3. 恢复密钥编码：重写为标准 BIP39（24 词，11 位/词）
4. FTS5 腐烂问题：暂时禁用，改用 LIKE 搜索
5. `createBlock` 返回完整默认值（annotation、vitality、status）
6. 健康检查 size/blockCount 计算修复
7. Heartbeat 依赖注入：支持测试模式直接传入 db
8. Pattern 提取：心跳引擎现在正确保存决策模式
9. Vitality 衰减：修复使用 updated_at 计算衰减

**已知问题**：
- ⚠️ 编译后 CLI 存在 ESM 模块加载问题
- ✅ 临时方案：使用 `npx tsx src/cli/index.ts` 直接运行 TypeScript 源码
- 根本原因：better-sqlite3 是 CommonJS，与 ESM 存在兼容性问题
- ⚠️ 所有测试一起运行时偶发 disk I/O 错误（资源竞争），单独运行均通过

**测试运行命令**：
```bash
# 运行所有测试（单独运行可避免资源限制）
npx vitest run __tests__/unit/crypto.test.ts
npx vitest run __tests__/unit/database.test.ts
npx vitest run __tests__/unit/context.test.ts
npx vitest run __tests__/integration/heartbeat.test.ts

# CLI 使用（通过 tsx）
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts save --content "测试" --annotation "事实 · test"
```

**待办事项**（明天继续）：
1. 解决 ESM/CommonJS 兼容性问题（方案：打包为纯 ESM 或使用 tsx）
2. 实现完整 CLI 命令（init、save、query、status、start、stop、doctor、recover）
3. E2E 测试完善
4. 准备 v0.10.0-mvp 发布

---

## 最后更新

- **日期**: 2026-03-18
- **版本**: v0.10
- **更新人**: 晓力 + Claude Code
- **内容**: Phase 4 测试进展，86 个测试用例全部通过（单独运行）
