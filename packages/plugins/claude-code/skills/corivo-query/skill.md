---
name: corivo-query
description: 从 Corivo 数据库查询记忆。当用户说"我之前说过""记得吗""我们之前决定""我的偏好"或涉及过去对话中的信息时，自动触发此技能。
---

# Corivo 查询记忆

从 Corivo 记忆数据库中检索相关信息，帮助 AI 更好地理解上下文。

## 使用时机

当用户问以下内容时，考虑查询记忆：
- "我之前说过..."
- "记得吗..."
- "我们之前决定..."
- 涉及过去对话中的信息
- 需要了解用户偏好/历史决策

## 查询方法

### 前置检测

**0. 检测 Corivo 是否安装**：
   ```bash
   which corivo || echo "NOT_INSTALLED"
   ```

   - 如果返回 `NOT_INSTALLED`：提示用户安装
     ```
     [corivo] 需要先安装 Corivo：

     npm install -g corivo
     corivo init
     ```

   - 如果已安装：继续查询

### 1. 关键词搜索
```bash
corivo query "关键词" --limit 10 --no-password
```

### 2. 按类型过滤
```bash
corivo query "关键词" --annotation "决策 · project" --limit 5 --no-password
```

### 3. 查看状态
```bash
corivo status --no-password
```

## 查询结果解读

```
[corivo] 找到 3 条相关记忆:

1. [决策 · project · 前端框架]
   我们决定使用 React 而不是 Vue，因为团队更熟悉...

2. [知识 · knowledge · React]
   React hooks 的 useEffect 依赖数组为空时...

3. [指令 · self · 代码风格]
   用户喜欢简洁的代码风格...
```

## 查询策略

### 开场查询
每次对话开始时，可以查询用户的基本信息：
```bash
corivo query "" --annotation "指令 · self" --limit 5 --no-password
```

### 上下文相关查询
当讨论特定主题时，查询相关记忆：
```bash
corivo query "React" --limit 10 --no-password
```

### 决策查询
当需要了解历史决策时：
```bash
corivo query "" --annotation "决策 · project" --limit 10 --no-password
```

## 示例对话

```
用户: 我之前对代码风格有什么要求？
Agent: [查询记忆]
       让我查一下你的偏好...

       [执行 corivo query "代码风格" --annotation "指令 · self"]

       [corivo] 找到 2 条相关记忆:
       1. 使用 2 空格缩进，优先使用 const
       2. 函数名使用 camelCase

       根据记忆，你喜欢：
       - 2 空格缩进
       - 优先使用 const 而非 let
       - 函数名使用 camelCase
```

```
用户: 我们用什么数据库？
Agent: [查询记忆]
       根据之前的记录...

       [执行 corivo query "数据库" --annotation "决策 · project"]

       [corivo] 找到 1 条相关记忆:
       选择 PostgreSQL 因为需要更好的 JSON 支持

       你们选择了 PostgreSQL，主要因为需要更好的 JSON 支持和 ACID 特性。
```

## 注意事项

- 查询结果可能为空，这是正常的
- 多个关键词用空格分隔
- 所有命令自动添加 `--no-password` 跳过密码输入
- 查询后向用户报告找到的记忆数量
