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

## 注意事项

- 查询结果可能为空，这是正常的
- 多个关键词用空格分隔
- 所有命令自动添加 `--no-password` 跳过密码输入
- 查询后向用户报告找到的记忆数量
