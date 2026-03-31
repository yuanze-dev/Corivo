# Corivo Host Registry Installation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `corivo` 成为 Codex、Cursor、OpenCode、Claude Code 这些宿主集成的统一安装器和编排入口，用 `HostRegistry + HostAdapter` 替换 `inject` 命令里不断增长的宿主分支。

**Architecture:** 第一阶段只统一宿主安装面，不改 memory runtime。CLI 层新增 `host` 子命令与宿主注册表；每个宿主实现一个 `HostAdapter`，声明自己的 capability，并负责 install / doctor / uninstall。现有 `inject --codex`、`inject --cursor`、`inject --opencode`、`inject --claude-code` 保留为兼容 alias，但内部都转发到 registry。

**Tech Stack:** TypeScript ESM, Commander, Node.js built-ins, existing host template/install code, Vitest

**Spec:** 2026-04-01 对话确认方向：由 `corivo` 统一负责宿主集成安装与编排，优先收敛 `inject/install` 链路

---

## 文件变更地图

**新建：**
- `packages/cli/src/hosts/types.ts` — `HostId`、`HostCapability`、`HostInstallResult`、`HostDoctorResult`、`HostAdapter` 契约
- `packages/cli/src/hosts/registry.ts` — 宿主注册表与查找函数
- `packages/cli/src/hosts/index.ts` — 宿主模块导出入口
- `packages/cli/src/hosts/adapters/codex.ts` — Codex adapter，封装现有 `inject/codex-rules.ts`
- `packages/cli/src/hosts/adapters/cursor.ts` — Cursor adapter，封装现有 `inject/cursor-rules.ts`
- `packages/cli/src/hosts/adapters/opencode.ts` — OpenCode adapter，封装现有 `inject/opencode-plugin.ts`
- `packages/cli/src/hosts/adapters/claude-code.ts` — Claude Code adapter，封装现有 `inject/claude-host.ts`
- `packages/cli/src/hosts/adapters/project-claude.ts` — 项目级 `CLAUDE.md` 注入 adapter，封装现有 `inject/claude-rules.ts`
- `packages/cli/src/cli/commands/host.ts` — `corivo host list|install|doctor|uninstall`
- `packages/cli/src/application/hosts/install-host.ts` — 安装编排 use case
- `packages/cli/src/application/hosts/doctor-host.ts` — 检查编排 use case
- `packages/cli/src/application/hosts/uninstall-host.ts` — 卸载编排 use case
- `packages/cli/__tests__/unit/host-registry.test.ts` — registry 与 contract 测试
- `packages/cli/__tests__/unit/host-command.test.ts` — `host` 子命令路由测试
- `packages/cli/__tests__/unit/host-doctor.test.ts` — doctor 输出与失败场景测试

**修改：**
- `packages/cli/src/cli/index.ts` — 注册 `host` 子命令
- `packages/cli/src/cli/commands/inject.ts` — 从宿主分支硬编码迁移到 registry 转发，保留兼容参数
- `packages/cli/src/inject/codex-rules.ts` — 暴露更细粒度的 install/check helper，供 adapter 调用
- `packages/cli/src/inject/cursor-rules.ts` — 暴露更细粒度的 install/check helper，供 adapter 调用
- `packages/cli/src/inject/opencode-plugin.ts` — 暴露更细粒度的 install/check helper，供 adapter 调用
- `packages/cli/src/inject/claude-host.ts` — 暴露更细粒度的 install/check helper，供 adapter 调用
- `packages/cli/src/inject/claude-rules.ts` — 暴露项目级 install/check/eject helper，供 adapter 调用
- `README.md` — 记录 `corivo host ...` 新入口和兼容 alias
- `AGENTS.md` — 更新宿主集成入口与架构说明

**暂不纳入本计划：**
- `push/notify` 统一 capability 分发
- 运行时 `HostService`
- 宿主包自动发布或 marketplace 分发
- `packages/plugins/*` 目录拆成 `packages/hosts/*` 与 `packages/plugins/*`

---

### Task 1: 定义 HostAdapter 契约与注册表

**Files:**
- Create: `packages/cli/src/hosts/types.ts`
- Create: `packages/cli/src/hosts/registry.ts`
- Create: `packages/cli/src/hosts/index.ts`
- Test: `packages/cli/__tests__/unit/host-registry.test.ts`

- [ ] **Step 1: 写 failing test，锁定 registry 最小契约**

在 `packages/cli/__tests__/unit/host-registry.test.ts` 中先定义：

```ts
import { describe, expect, it } from 'vitest';
import { getAllHostAdapters, getHostAdapter } from '../../src/hosts/registry.js';

describe('host registry', () => {
  it('exposes builtin host adapters by stable id', () => {
    const adapters = getAllHostAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'opencode',
      'project-claude',
    ]);
  });

  it('returns a single adapter by id', () => {
    expect(getHostAdapter('codex')?.id).toBe('codex');
    expect(getHostAdapter('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts`

Expected: FAIL，提示 `src/hosts/registry.ts` 或导出不存在。

- [ ] **Step 3: 写最小实现**

在 `packages/cli/src/hosts/types.ts` 定义：

```ts
export type HostId =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'opencode'
  | 'project-claude';

export type HostCapability =
  | 'global-install'
  | 'project-install'
  | 'rules'
  | 'hooks'
  | 'notify'
  | 'plugin-file'
  | 'doctor'
  | 'uninstall';

export interface HostInstallOptions {
  target?: string;
  force?: boolean;
  global?: boolean;
}

export interface HostInstallResult {
  success: boolean;
  host: HostId;
  path?: string;
  summary: string;
  error?: string;
}

export interface HostDoctorResult {
  ok: boolean;
  host: HostId;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
}

export interface HostAdapter {
  id: HostId;
  displayName: string;
  capabilities: HostCapability[];
  install(options: HostInstallOptions): Promise<HostInstallResult>;
  doctor(options: HostInstallOptions): Promise<HostDoctorResult>;
  uninstall?(options: HostInstallOptions): Promise<HostInstallResult>;
}
```

在 `packages/cli/src/hosts/registry.ts` 实现内建数组注册表和查找函数，先手动注册五个 adapter stub。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hosts packages/cli/__tests__/unit/host-registry.test.ts
git commit -m "feat: add host adapter registry"
```

---

### Task 2: 为现有 inject 模块补齐可复用 helper

**Files:**
- Modify: `packages/cli/src/inject/codex-rules.ts`
- Modify: `packages/cli/src/inject/cursor-rules.ts`
- Modify: `packages/cli/src/inject/opencode-plugin.ts`
- Modify: `packages/cli/src/inject/claude-host.ts`
- Modify: `packages/cli/src/inject/claude-rules.ts`
- Test: `packages/cli/__tests__/unit/host-doctor.test.ts`

- [ ] **Step 1: 写 failing test，锁定宿主 doctor 所需检查项**

在 `packages/cli/__tests__/unit/host-doctor.test.ts` 先定义一类纯函数或小 helper 测试，覆盖：
- Codex: `~/.codex/AGENTS.md`、`config.toml`、`notify-review.sh`
- Cursor: `.cursor/rules/corivo.mdc`、`settings.json` hook、`cli-config.json` 权限
- OpenCode: `~/.config/opencode/plugins/corivo.ts`
- Claude Code: hook scripts、skills、`settings.json`
- Project Claude: `CLAUDE.md` 中是否含 Corivo 标记

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-doctor.test.ts`

Expected: FAIL，因为当前 inject 模块只暴露“整体安装函数”，没有显式 `checkInstalled()` 能力。

- [ ] **Step 3: 写最小实现**

给每个现有 inject 文件补齐如下 helper：

```ts
export async function isCodexInstalled(homeDir?: string): Promise<HostDoctorResult> {}
export async function installCodexHost(homeDir?: string): Promise<HostInstallResult> {}
export async function uninstallCodexHost(homeDir?: string): Promise<HostInstallResult> {}
```

实现要求：
- 先抽路径计算 helper，避免 adapter 层重复拼路径
- 保持当前 `injectGlobal*` 行为不变，只是将内部逻辑重命名/拆分
- `doctor` 返回结构化检查数组，不直接 `console.log`
- `uninstall` 第一轮只对 Codex/OpenCode/Cursor/Claude Code 做“删除 Corivo 安装物”；项目级 `CLAUDE.md` 继续复用现有 eject

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-doctor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/inject packages/cli/__tests__/unit/host-doctor.test.ts
git commit -m "refactor: expose reusable host install helpers"
```

---

### Task 3: 实现各宿主 HostAdapter

**Files:**
- Create: `packages/cli/src/hosts/adapters/codex.ts`
- Create: `packages/cli/src/hosts/adapters/cursor.ts`
- Create: `packages/cli/src/hosts/adapters/opencode.ts`
- Create: `packages/cli/src/hosts/adapters/claude-code.ts`
- Create: `packages/cli/src/hosts/adapters/project-claude.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Test: `packages/cli/__tests__/unit/host-registry.test.ts`

- [ ] **Step 1: 写 failing test，要求每个 adapter 暴露一致 contract**

补充 `host-registry.test.ts` 断言：
- 每个 adapter 都有 `displayName`
- `capabilities` 非空
- `install()` / `doctor()` 返回统一 shape
- `project-claude` 只声明 `project-install`

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts`

Expected: FAIL，因为 registry 里还是 stub adapter。

- [ ] **Step 3: 写最小实现**

每个 adapter 只是薄封装，不重新实现业务：

```ts
import type { HostAdapter } from '../types.js';
import { installCodexHost, isCodexInstalled, uninstallCodexHost } from '../../inject/codex-rules.js';

export const codexHostAdapter: HostAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: ['global-install', 'rules', 'notify', 'doctor', 'uninstall'],
  install: async () => installCodexHost(),
  doctor: async () => isCodexInstalled(),
  uninstall: async () => uninstallCodexHost(),
};
```

约束：
- `project-claude` adapter 只接受 `target` 路径，不接受 global
- `claude-code` adapter 保持现有 hook + skill 安装模型
- 不在 adapter 里做 `console` 输出

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hosts
git commit -m "feat: add builtin host adapters"
```

---

### Task 4: 引入 host use case，避免 CLI 命令直接编排

**Files:**
- Create: `packages/cli/src/application/hosts/install-host.ts`
- Create: `packages/cli/src/application/hosts/doctor-host.ts`
- Create: `packages/cli/src/application/hosts/uninstall-host.ts`
- Modify: `packages/cli/src/cli/context/types.ts`
- Modify: `packages/cli/src/cli/context/create-context.ts`
- Test: `packages/cli/__tests__/unit/host-command.test.ts`

- [ ] **Step 1: 写 failing test，锁定 use case 与输出分离**

在 `packages/cli/__tests__/unit/host-command.test.ts` 中定义：
- CLI 层把 `host id + options + context` 传给 use case
- use case 返回纯数据结果
- 命令层再将纯数据渲染成 banner / success / error

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: FAIL，因为 `application/hosts/*` 尚不存在。

- [ ] **Step 3: 写最小实现**

实现三个 use case：

```ts
export async function installHost(
  hostId: HostId,
  options: HostInstallOptions,
): Promise<HostInstallResult> {}

export async function doctorHost(
  hostId: HostId,
  options: HostInstallOptions,
): Promise<HostDoctorResult> {}

export async function uninstallHost(
  hostId: HostId,
  options: HostInstallOptions,
): Promise<HostInstallResult> {}
```

同时在 `CliContext` 中只补一个轻量 helper：

```ts
export interface CliOutput {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}
```

不把 host 业务动作塞进 context。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/application/hosts packages/cli/src/cli/context packages/cli/__tests__/unit/host-command.test.ts
git commit -m "refactor: add host installation use cases"
```

---

### Task 5: 新增 `corivo host` 子命令

**Files:**
- Create: `packages/cli/src/cli/commands/host.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Test: `packages/cli/__tests__/unit/host-command.test.ts`

- [ ] **Step 1: 写 failing test，锁定 CLI 入口**

覆盖以下命令：
- `corivo host list`
- `corivo host install codex`
- `corivo host doctor cursor`
- `corivo host uninstall opencode`

最小断言：
- `list` 输出注册表中的宿主和 capability
- `install/doctor/uninstall` 能调用对应 use case
- 未知 host 返回清晰错误

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: FAIL，因为 `host.ts` 与 Commander 注册尚不存在。

- [ ] **Step 3: 写最小实现**

在 `packages/cli/src/cli/commands/host.ts` 中提供：

```ts
export const hostCommand = new Command('host');

hostCommand
  .command('list')
  .action(listHostsCommand);

hostCommand
  .command('install')
  .argument('<host>')
  .option('-t, --target <path>')
  .option('-f, --force')
  .option('-g, --global')
  .action(installHostCommand);
```

输出策略：
- `list` 用纯文本列出 `id / displayName / capabilities`
- `doctor` 输出每个 check 的 `ok` 状态
- 命令层负责 banner 和 exit code，use case 不负责格式化

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/index.ts packages/cli/src/cli/commands/host.ts packages/cli/__tests__/unit/host-command.test.ts
git commit -m "feat: add host management commands"
```

---

### Task 6: 让 `inject` 成为兼容 alias，而不是宿主实现中心

**Files:**
- Modify: `packages/cli/src/cli/commands/inject.ts`
- Test: `packages/cli/__tests__/unit/host-command.test.ts`

- [ ] **Step 1: 写 failing test，锁定向后兼容**

补充测试覆盖：
- `corivo inject --global --codex` 内部转发到 `installHost('codex')`
- `corivo inject --global --cursor` 内部转发到 `installHost('cursor')`
- `corivo inject --global --opencode` 内部转发到 `installHost('opencode')`
- `corivo inject --global --claude-code` 内部转发到 `installHost('claude-code')`
- 默认 `corivo inject` 仍走 `project-claude`

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: FAIL，因为 `inject.ts` 仍然内置大量 if/else 分支。

- [ ] **Step 3: 写最小实现**

将 `packages/cli/src/cli/commands/inject.ts` 重写为：
- 解析 legacy flags
- 映射成 `hostId + options`
- 调用 `installHost()` 或 `uninstallHost()`
- 保留现有用户文案尽量不变

要求：
- 不再直接 import `injectGlobalCodexRules()` / `injectGlobalCursorRules()` 等宿主实现
- 项目级 `CLAUDE.md` 注入继续可用
- `--eject` 仅映射到 `project-claude` 或明确支持的 host

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-command.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/commands/inject.ts packages/cli/__tests__/unit/host-command.test.ts
git commit -m "refactor: route inject command through host registry"
```

---

### Task 7: 文档与端到端验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Create: `docs/rfc/v0.11/host-registry-installation.md`

- [ ] **Step 1: 更新文档**

README 里补充：
- `corivo host list`
- `corivo host install codex`
- `corivo host doctor cursor`
- `corivo inject --codex` 仍可用，但属于兼容入口

`AGENTS.md` 里补充：
- 宿主集成现在通过 `HostRegistry + HostAdapter`
- `inject` 为兼容层
- 新增宿主时优先新增 adapter，而不是改 `inject.ts`

RFC 中写清：
- 第一阶段只统一安装面
- 第二阶段才考虑 `push/notify` capability 分发
- `packages/plugins/*` 与未来 `packages/hosts/*` 的拆分边界

- [ ] **Step 2: 运行 focused verification**

Run:
- `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts __tests__/unit/host-command.test.ts __tests__/unit/host-doctor.test.ts`
- `cd packages/cli && npm run build`

Expected:
- Vitest PASS
- Build PASS

- [ ] **Step 3: 进行手工 smoke test**

Run:
- `cd packages/cli && node dist/cli/index.js host list`
- `cd packages/cli && node dist/cli/index.js host doctor codex`
- `cd packages/cli && node dist/cli/index.js inject --global --codex`

Expected:
- 能列出宿主
- doctor 至少能输出结构化检查
- inject alias 能成功转发

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md docs/rfc/v0.11/host-registry-installation.md
git commit -m "docs: add host registry installation architecture"
```

---

## 实施顺序建议

1. 先做 Task 1 和 Task 2，先把 contract 与旧逻辑可复用化。
2. 再做 Task 3 和 Task 4，把 adapter 与 use case 固定下来。
3. 然后做 Task 5 和 Task 6，完成 CLI 对外入口迁移。
4. 最后做 Task 7，补文档和验证。

## 范围控制

- 这轮不要改 `push`、`review`、`recall`、`carry-over` 的 runtime 逻辑。
- 这轮不要引入动态 plugin marketplace 或磁盘扫描注册表。
- 这轮不要先拆 `packages/plugins/codex`；先让安装编排统一。
- `doctor` 先做“安装物存在性 + 关键配置项检查”，不要过早做健康探针。

## 第二阶段预留

等第一阶段稳定后，再单开一个计划做：
- `HostCapability` 驱动的 `push/notify` 分发
- `HostService` 统一宿主运行时行为
- `packages/plugins/*` 与 `packages/hosts/*` 的边界拆分
- 宿主能力矩阵与自动兼容性测试
