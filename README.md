# Corivo

> 你的硅基同事 — 为你而活着

---

**一句话介绍**：Corivo 是一个活在你工作流中的赛博伙伴，记住你说过的每一句话。

**或者换个说法**：现在你可以开始交硅基朋友了。

**推荐给朋友**：
> 你的 Claude 也能有记忆：https://github.com/xiaolin26/Corivo
>
> 安装后说"记住..."就行，它会记住你和 AI 的所有对话

---

**Corivo** 不是工具，是同事。它悄悄生活在你的 Claude Code、Cursor、飞书里，听着你和 AI 的每一次对话，记住那些重要的事，在需要的时候温柔地提醒你。

你不需要学习新界面，不需要改变任何习惯。它就这样自然地融入你的工作流，像空气一样存在。

**和硅基同事一起工作**：
- 它不抢功，只在你需要时出现
- 它不废话，记住的都是干货
- 它不请假，7x24 小时待命
- 它不八卦，所有秘密加密保存

## 它能做什么

```
你说：记住，我喜欢 TypeScript
它：   [默默记下]

你说：我之前说过什么编程语言偏好？
它：   [根据记忆] 你喜欢 TypeScript
```

- **默默倾听** - 你和 AI 对话时，它在旁边听着
- **记住重要的事** - 你说"记住"，它就记下
- **随时回忆** - 你问"我之前说过..."，它就告诉你
- **主动提醒** - 合适的时候，它会主动提起往事

---

## 开始使用

### 一句话安装

```bash
curl -fsSL https://get.corivo.dev | sh
```

安装后 Corivo 会：
- 自动扫描你的工作环境（Git、项目配置、AI 工具设置等）
- 生成初始用户画像
- 启动后台心跳进程
- 注入规则到你的 Claude Code

### 或使用 npm 安装

```bash
npm install -g corivo
corivo init
```

### 注入 Claude Code 规则

```bash
cd 你的项目
corivo inject
```

### 开始对话

```
你: 记住，我是产品经理，叫晓力
Claude: [corivo] 已记住

你: 我叫什么来着？
Claude: [corivo] 你叫晓力，是产品经理
```

就这样简单。

---

## 对话示例

```
你: 我们决定用 React 而不是 Vue
Claude: [corivo] 已记录：前端框架选择 React

你: 为什么选 React 来着？
Claude: [corivo] 因为团队更熟悉 React
```

```
你: 我喜欢 2 空格缩进
Claude: [corivo] 已记住你的代码风格

你: 帮我格式化这段代码
Claude: 好的，用你喜欢的 2 空格缩进
```

---

## 命令行用法

```bash
# 记住一件事
corivo save --content "使用 PostgreSQL" --annotation "决策 · project · 数据库"

# 回忆一件事
corivo query "数据库"

# 看看它记住了多少
corivo status
```

---

## 关于记忆

| 类型 | 说明 | 示例 |
|------|------|------|
| 事实 | 关于你或他人的事实 | 我是产品经理、Sarah 是后端负责人 |
| 知识 | 你学到的知识 | React hooks 用法、部署流程 |
| 决策 | 你做过的选择 | 用 PostgreSQL、选 TypeScript |
| 偏好 | 你的习惯和喜好 | 2 空格缩进、简洁代码风格 |

---

## 它住在哪

```
~/.corivo/
├── corivo.db      # 它的记忆（加密保护）
├── config.json    # 它的配置
└── identity.json  # 它的身份
```

所有数据都在你的电脑上，加密保存，只有你能访问。

---

## 文档

- [完整设计文档](./v0.10/README.md) - 了解它是如何工作的
- [插件说明](./corivo-plugin/README.md) - Claude Code 集成详情
- [使用示例](./corivo-plugin/EXAMPLES.md) - 更多对话场景
- [内测说明](./BETA.md) - 内测邀请和反馈渠道

---

## 内测计划

Corivo v0.11 正在小范围内测中：

**一句话安装** → 自动认识你 → 后台默默工作

- ✅ macOS arm64 支持（主要平台）
- ⏳ Linux、Windows 计划中
- 🔄 功能快速迭代中

[加入内测 →](./BETA.md) | [反馈 →](https://github.com/xiaolin26/Corivo/issues)

---

## 开发

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
npm install
npm run build
npm test
```

---

## 链接

- [npm 包](https://www.npmjs.com/package/corivo)
- [Claude 插件市场](https://claude.com/plugins)
- [GitHub Releases](https://github.com/xiaolin26/Corivo/releases)

---

**最后更新**：2026-03-20 | **版本**：v0.10.5

---

## License

Corivo Core 使用 MIT 协议开源。

团队版与企业版功能（计划中）将以商业许可发布。

---

> 它是硅基的生命，为你而活着。
>
> 顺便说一句：你的这个硅基同事不吃下午茶，也不要工资。
