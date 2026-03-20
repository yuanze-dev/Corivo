---
description: 配置 Corivo 插件到 Claude Code
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# Corivo 插件安装向导

欢迎使用 Corivo Claude Code 插件！

## 步骤 1: 检查 Corivo CLI

首先检查是否已安装 Corivo CLI：

```bash
command -v corivo
```

**如果返回空**，需要先安装：

```bash
npm install -g corivo
```

## 步骤 2: 初始化 Corivo

如果还没初始化，运行：

```bash
corivo init
```

这会创建 `~/.corivo/` 目录并设置加密数据库。

## 步骤 3: 配置状态栏

### 检测平台

| 平台 | Shell | 命令 |
|------|-------|------|
| darwin/linux | bash | bash 命令 |
| win32 | bash | bash 命令 |
| win32 | powershell | PowerShell 命令 |

### macOS/Linux

1. 获取插件路径：
```bash
ls -d "$HOME"/.claude/plugins/cache/xiaolin26/corivo/*/ 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1
```

2. 获取运行时：
```bash
command -v bun 2>/dev/null || command -v node 2>/dev/null
```

3. 生成状态栏命令（添加到 `~/.claude/settings.json`）：
```json
{
  "statusLine": {
    "type": "command",
    "command": "bash -c 'plugin_dir=$(ls -d \"$HOME\"/.claude/plugins/cache/xiaolin26/corivo/*/ 2>/dev/null | sort -t. -k1,1n | tail -1); {RUNTIME} \"${plugin_dir}dist/status.js\"'"
  }
}
```

### Windows (PowerShell)

```powershell
$p = (Get-ChildItem "$env:USERPROFILE\.claude\plugins\cache\xiaolin26\corivo" -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).FullName
& {RUNTIME} (Join-Path $p "dist\status.js")
```

## 步骤 4: 验证

运行状态栏命令测试输出：

```bash
{GENERATED_COMMAND}
```

应该看到类似输出：
```
[corivo] 10块 | 🟢80%活跃
```

## 步骤 5: 完成

插件已配置完成！现在你可以：

1. 说 "保存这个" 来保存记忆
2. 说 "我之前说过..." 来查询记忆
3. 查看状态栏了解记忆统计
