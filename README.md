# Corivo

> 你的赛博伙伴 — 记忆存储与智能推送

**Corivo** 是一个融入用户已有工作流的记忆服务。它寄生在 Claude Code、Cursor、飞书等工具中，自动从 AI 对话中采集信息，持续整理和更新，在合适的时机主动提醒你。

## 特性

- **无感采集** - 自动从对话中提取关键信息
- **持久化记忆** - SQLite 本地存储，AES-256 加密
- **智能检索** - 全文搜索，按类型过滤，活力值排序
- **Claude Code 集成** - 插件支持，自动保存和查询记忆

---

## 快速开始

### 1. 安装

```bash
npm install -g corivo
```

### 2. 初始化

```bash
corivo init
```

这会在 `~/.corivo/` 创建加密数据库。

### 3. Claude Code 集成

```bash
# 安装插件
/plugin install xiaolin26/corivo
```

安装后，Claude 会自动：
- 保存你说的重要信息
- 查询之前保存的记忆
- 在状态栏显示记忆统计

---

## 使用示例

### 保存记忆

```
你: 我叫晓力，是产品经理
Claude: [corivo] 已记录：用户个人信息
```

### 查询记忆

```
你: 我之前对代码风格有什么要求？
Claude: [corivo] 根据记忆，你喜欢简洁的代码风格...
```

### CLI 使用

```bash
# 保存信息
corivo save "使用 PostgreSQL" --annotation "决策 · project · 数据库"

# 查询信息
corivo query "数据库"

# 查看状态
corivo status

# 启动心跳守护进程
corivo start
```

---

## 记忆类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 事实 (Fact) | 客观信息 | 用户生日、服务器配置 |
| 知识 (Knowledge) | 学习内容 | API 用法、部署流程 |
| 决策 (Decision) | 技术选择 | 使用 React、选择 PostgreSQL |
| 指令 (Instruction) | 用户偏好 | 代码风格、命名习惯 |

---

## Claude Code 插件技能

### corivo-save
保存对话中的重要信息

**触发词**：保存这个、记住、记下来

### corivo-query
查询之前保存的记忆

**触发词**：我之前说过、记得吗、我们决定

### corivo-status
状态栏显示记忆统计

---

## 配置

```bash
~/.corivo/
├── corivo.db      # SQLite 数据库（加密）
├── config.json    # 配置文件
└── recovery.key   # 恢复密钥（请妥善保管）
```

---

## 文档

- [设计文档 v0.10](./v0.10/README.md) - 完整的架构和设计
- [插件 README](./corivo-plugin/README.md) - Claude Code 插件详情
- [使用示例](./corivo-plugin/EXAMPLES.md) - 实际使用场景

---

## 开发

```bash
# 克隆仓库
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo

# 安装依赖
npm install

# 构建
npm run build

# 测试
npm test
```

---

## 链接

- [npm 包](https://www.npmjs.com/package/corivo)
- [Claude 插件市场](https://claude.com/plugins)
- [GitHub Releases](https://github.com/xiaolin26/Corivo/releases)

---

## License

MIT

---

**最后更新**：2026-03-19 | **版本**：v0.10.5
