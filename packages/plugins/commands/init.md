---
description: 首次安装和初始化 Corivo 记忆系统
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# Corivo Init

首次使用 Corivo 的安装向导。

## 步骤 1: 检查 CLI

```bash
command -v corivo && corivo --version || echo "NOT_INSTALLED"
```

如果未安装：
```bash
npm install -g corivo
```

## 步骤 2: 初始化数据库

```bash
corivo init
```

创建 `~/.corivo/` 目录并设置加密数据库（AES-256-GCM via SQLCipher）。

## 步骤 3: 验证

```bash
corivo status --no-password
```

预期输出：
```
[corivo] 0块 | 🟢0%
```

## 完成

安装完成。现在可以：

1. 说 "保存这个" 或 "记住" → 保存记忆
2. 说 "我之前说过..." 或 "记得吗" → 查询记忆
3. 运行 `/corivo:info` → 查看数据库状态
