# Corivo — Claude Code 开发配置

## 项目概述

Corivo 是一个融入用户已有工作流的赛博**伙伴**。它不是一个独立的 App，而是寄生在 Claude Code、Cursor、飞书等工具中的后台服务——自动从用户的 AI 对话和消息中采集信息，持续整理和更新，在合适的时机以 `[corivo]` 的名义主动提醒用户。

## 版本

当前版本：**v0.10**

详细设计文档见 [README.md](./README.md)

## 开发规范

### Git 分支

- ❌ 不在 main 直接修改
- ✅ 所有改动在子分支完成，完成后合并

### Commit 规范

```
<类型>: <描述>

原因：<为什么>
```

类型：feat / fix / refactor / docs / hotfix

### 分支命名

- `feature/功能名称` - 新功能
- `fix/问题描述` - Bug修复
- `refactor/模块名称` - 重构

---

## Design System

**Always read DESIGN.md before making any visual or UI decisions.**

All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.

**Key principles:**
- Aesthetic: Organic/Natural — 「记忆像植物一样生长」
- Colors: 暖灰基底 + 琥珀强调色（`#d97706`）
- Typography: Instrument Serif（Display）+ Instrument Sans（Body）
- Spacing: 8px base unit, Comfortable density

In QA mode, flag any code that doesn't match DESIGN.md.

---

最后更新：2026-03-19
