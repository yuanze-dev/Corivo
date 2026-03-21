# Service Manager 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一后台常驻进程为 `ServiceManager` 抽象层，macOS 走 launchd，废弃 detached child + pid-file 方案，`corivo start/stop/status` 作为用户唯一入口。

**Architecture:** 新建 `src/service/` 模块，定义 `ServiceManager` 接口，`MacOSServiceManager` 从现有 `daemon/macos.ts` 迁移。`corivo start/stop/status` 委托给 `getServiceManager()`，`daemon run` 保留为 launchd 调用的 heartbeat 唯一入口，并负责写入/清理 `heartbeat.pid`（保持 TUI hook 兼容）。

**Tech Stack:** TypeScript ESM, Node.js built-in `node:test`, tsup build, macOS launchd (`launchctl`)

**Spec:** `docs/superpowers/specs/2026-03-21-service-manager-design.md`

---

## 文件变更地图

**新建：**
- `packages/cli/src/service/types.ts` — `ServiceManager` 接口 + `ServiceConfig / ServiceStatus / ServiceResult`
- `packages/cli/src/service/macos.ts` — `MacOSServiceManager`（从 `daemon/macos.ts` 迁移）
- `packages/cli/src/service/linux.ts` — `LinuxServiceManager` stub
- `packages/cli/src/service/unsupported.ts` — `UnsupportedServiceManager`
- `packages/cli/src/service/index.ts` — `getServiceManager()` + `resolveCorivoBin()`
- `packages/cli/__tests__/unit/service-manager.test.ts` — 单元测试

**修改：**
- `packages/cli/src/cli/commands/daemon.ts` — 只保留 `run` 子命令，添加 PID 写入 + 信号处理
- `packages/cli/src/cli/commands/start.ts` — 替换 spawn+pid 为 `ServiceManager`
- `packages/cli/src/cli/commands/stop.ts` — 替换 pid-file 为 `ServiceManager`
- `packages/cli/src/cli/commands/status.ts` — 替换 pid-file 检查为 `ServiceManager.getStatus()`
- `packages/cli/src/cli/index.ts` — 移除 `startWatchCommand` 导入和 `--watch` 注册

**删除：**
- `packages/cli/src/daemon/macos.ts`
- `packages/cli/src/daemon/index.ts`
- `packages/cli/__tests__/unit/daemon-macos.test.ts`（使用了未安装的 vitest，被新测试替代）

---

## Task 1: 定义 ServiceManager 接口

**Files:**
- Create: `packages/cli/src/service/types.ts`

- [ ] **Step 1: 创建 `types.ts`**

```typescript
// packages/cli/src/service/types.ts

export interface ServiceConfig {
  /** corivo 二进制路径或 "node /path/to/cli.js" 字符串，由 MacOSServiceManager 内部负责拆分 */
  corivoBin: string
  dbKey: string
  dbPath: string
}

export interface ServiceStatus {
  loaded: boolean
  running: boolean
  pid?: number
}

export interface ServiceResult {
  success: boolean
  error?: string
}

export interface ServiceManager {
  install(config: ServiceConfig): Promise<ServiceResult>
  uninstall(): Promise<ServiceResult>
  getStatus(): Promise<ServiceStatus>
  /** 仅供信息查询，不影响路由；start.ts 不检查此方法，直接调用 install() */
  isSupported(): boolean
}
```

- [ ] **Step 2: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误（此时 types.ts 仅定义接口，无依赖）

- [ ] **Step 3: commit**

```bash
git add packages/cli/src/service/types.ts
git commit -m "feat(service): define ServiceManager interface and types"
```

---

## Task 2: 创建 MacOSServiceManager

从 `src/daemon/macos.ts` 迁移逻辑，包装为实现 `ServiceManager` 接口的类。

**Files:**
- Create: `packages/cli/src/service/macos.ts`
- Reference: `packages/cli/src/daemon/macos.ts`（迁移来源，之后删除）

- [ ] **Step 1: 写测试（先验证行为契约）**

```typescript
// packages/cli/__tests__/unit/service-manager.test.ts
// 注意：项目用 node:test，先 npm run build，再用 node --test 跑 dist 下的编译文件
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// import 路径是相对于编译后的 dist/__tests__/unit/ 目录
// 即 ../../service/xxx.js
describe('MacOSServiceManager', () => {
  const isMacOS = process.platform === 'darwin'

  it('isSupported() returns true on darwin', { skip: !isMacOS }, async () => {
    const { MacOSServiceManager } = await import('../../service/macos.js')
    const mgr = new MacOSServiceManager()
    assert.equal(mgr.isSupported(), true)
  })
})

describe('UnsupportedServiceManager', () => {
  it('install() returns success:false with error message', async () => {
    const { UnsupportedServiceManager } = await import('../../service/unsupported.js')
    const mgr = new UnsupportedServiceManager()
    const result = await mgr.install({ corivoBin: 'x', dbKey: 'y', dbPath: 'z' })
    assert.equal(result.success, false)
    assert.ok(result.error && result.error.length > 0)
  })

  it('uninstall() returns success:false', async () => {
    const { UnsupportedServiceManager } = await import('../../service/unsupported.js')
    const mgr = new UnsupportedServiceManager()
    const result = await mgr.uninstall()
    assert.equal(result.success, false)
  })

  it('getStatus() returns loaded:false running:false', async () => {
    const { UnsupportedServiceManager } = await import('../../service/unsupported.js')
    const mgr = new UnsupportedServiceManager()
    const status = await mgr.getStatus()
    assert.equal(status.loaded, false)
    assert.equal(status.running, false)
  })
})

describe('LinuxServiceManager', () => {
  it('install() returns success:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../service/linux.js')
    const mgr = new LinuxServiceManager()
    const result = await mgr.install({ corivoBin: 'x', dbKey: 'y', dbPath: 'z' })
    assert.equal(result.success, false)
    assert.ok(result.error?.includes('尚未实现'))
  })
})
```

- [ ] **Step 2: 创建 `service/macos.ts`**

将 `daemon/macos.ts` 的函数式导出重构为 class，实现 `ServiceManager` 接口：

```typescript
// packages/cli/src/service/macos.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

const PLIST_NAME = 'com.corivo.daemon.plist'
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME)

function generatePlist(config: ServiceConfig): string {
  // 解析命令：如果是 "node /path/to/cli.js" 格式，拆分为数组
  let programArgs: string[]
  if (config.corivoBin.includes('node ') || config.corivoBin.includes('nodejs ')) {
    programArgs = [...config.corivoBin.trim().split(/\s+/), 'daemon', 'run']
  } else {
    programArgs = [config.corivoBin, 'daemon', 'run']
  }

  const programArgsXml = programArgs.map(arg => `    <string>${arg}</string>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.corivo.daemon</string>

  <key>ProgramArguments</key>
  <array>
${programArgsXml}
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>CORIVO_DB_KEY</key>
    <string>${config.dbKey}</string>
    <key>CORIVO_DB_PATH</key>
    <string>${config.dbPath}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>

  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.log')}</string>

  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.err')}</string>

  <key>ProcessType</key>
  <string>Interactive</string>

</dict>
</plist>
`
}

export class MacOSServiceManager implements ServiceManager {
  isSupported(): boolean {
    return process.platform === 'darwin'
  }

  async install(config: ServiceConfig): Promise<ServiceResult> {
    try {
      await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true })
      await fs.writeFile(PLIST_PATH, generatePlist(config), { mode: 0o644 })
      execSync(`launchctl load "${PLIST_PATH}"`, { encoding: 'utf-8' })
      execSync(`launchctl start com.corivo.daemon`, { encoding: 'utf-8' })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async uninstall(): Promise<ServiceResult> {
    try {
      try { execSync(`launchctl stop com.corivo.daemon`, { encoding: 'utf-8' }) } catch {}
      try { execSync(`launchctl unload "${PLIST_PATH}"`, { encoding: 'utf-8' }) } catch {}
      await fs.unlink(PLIST_PATH).catch(() => {})
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      const loaded = await fs.access(PLIST_PATH).then(() => true).catch(() => false)
      if (!loaded) return { running: false, loaded: false }

      const output = execSync(`launchctl list | grep com.corivo.daemon`, { encoding: 'utf-8' })
      const match = output.match(/^(\d+)\s+\d+\s+com\.corivo\.daemon/)
      const pid = match ? parseInt(match[1], 10) : undefined
      return { running: pid !== undefined && pid > 0, loaded: true, pid }
    } catch {
      return { running: false, loaded: false }
    }
  }
}
```

- [ ] **Step 3: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 4: commit**

```bash
git add packages/cli/src/service/macos.ts
git commit -m "feat(service): add MacOSServiceManager"
```

---

## Task 3: 创建平台 stub 和路由模块

**Files:**
- Create: `packages/cli/src/service/linux.ts`
- Create: `packages/cli/src/service/unsupported.ts`
- Create: `packages/cli/src/service/index.ts`

- [ ] **Step 1: 创建 `unsupported.ts`**

```typescript
// packages/cli/src/service/unsupported.ts
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

export class UnsupportedServiceManager implements ServiceManager {
  isSupported(): boolean { return false }

  async install(_config: ServiceConfig): Promise<ServiceResult> {
    return {
      success: false,
      error: `此平台不支持 service manager（当前：${process.platform}）\n请手动运行: node ./dist/engine/heartbeat.js`,
    }
  }

  async uninstall(): Promise<ServiceResult> {
    return { success: false, error: `此平台不支持 service manager（当前：${process.platform}）` }
  }

  async getStatus(): Promise<ServiceStatus> {
    return { loaded: false, running: false }
  }
}
```

- [ ] **Step 2: 创建 `linux.ts`**

```typescript
// packages/cli/src/service/linux.ts
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

const NOT_IMPLEMENTED_ERROR = 'Linux systemd --user 支持尚未实现，请关注后续更新'

export class LinuxServiceManager implements ServiceManager {
  /** 尚未实现，仅供外部查询；不影响路由行为 */
  isSupported(): boolean { return false }

  async install(_config: ServiceConfig): Promise<ServiceResult> {
    return { success: false, error: NOT_IMPLEMENTED_ERROR }
  }

  async uninstall(): Promise<ServiceResult> {
    return { success: false, error: NOT_IMPLEMENTED_ERROR }
  }

  async getStatus(): Promise<ServiceStatus> {
    return { loaded: false, running: false }
  }
}
```

- [ ] **Step 3: 创建 `index.ts`**

```typescript
// packages/cli/src/service/index.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { ServiceManager } from './types.js'
import { MacOSServiceManager } from './macos.js'
import { LinuxServiceManager } from './linux.js'
import { UnsupportedServiceManager } from './unsupported.js'

export * from './types.js'

export function getServiceManager(): ServiceManager {
  switch (process.platform) {
    case 'darwin': return new MacOSServiceManager()
    case 'linux':  return new LinuxServiceManager()
    default:       return new UnsupportedServiceManager()
  }
}

/**
 * 探测当前环境的 corivo 二进制路径。
 * 注意：fallback 中 process.cwd() 取决于用户执行 corivo 时的目录，
 * 这是继承自旧 daemon.ts 的开发模式假设。
 */
export async function resolveCorivoBin(): Promise<string> {
  const candidates = [
    process.env.CORIVO_BIN,
    path.join(process.cwd(), 'bin', 'corivo'),
    path.join(os.homedir(), '.corivo', 'bin', 'corivo'),
  ]

  for (const p of candidates) {
    if (p && await fs.access(p).then(() => true).catch(() => false)) {
      return p
    }
  }

  // fallback: 开发模式，假设在 packages/cli 目录执行
  const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js')
  return `${process.execPath} ${cliPath}`
}
```

- [ ] **Step 4: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 5: build**

```bash
cd packages/cli && npm run build
```

期望：`dist/` 成功生成，无错误

- [ ] **Step 6: 编译测试专用 tsconfig 并运行**

`tsconfig.json` 的 `rootDir` 是 `src/`，且排除了 `*.test.ts`，无法直接编译测试文件。需要创建一个测试专用配置（只用于本步骤，不提交）：

```bash
cd packages/cli

# 创建临时测试 tsconfig（只用于编译测试，不需提交）
cat > tsconfig.test.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist-test",
    "noEmit": false
  },
  "include": ["src/**/*", "__tests__/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

npx tsc --project tsconfig.test.json
node --test dist-test/__tests__/unit/service-manager.test.js
```

期望：所有测试 pass（`UnsupportedServiceManager` 和 `LinuxServiceManager` 的测试无需 macOS 即可运行）

清理临时文件：

```bash
rm -rf dist-test tsconfig.test.json
```

- [ ] **Step 7: commit**

```bash
git add packages/cli/src/service/
git commit -m "feat(service): add platform stubs and getServiceManager routing"
```

---

## Task 4: 更新 `daemon.ts` — 只保留 `run`，添加 PID 管理

**Files:**
- Modify: `packages/cli/src/cli/commands/daemon.ts`

- [ ] **Step 1: 读取现有文件**

读取 `packages/cli/src/cli/commands/daemon.ts`，确认要删除的内容：
- `daemon start` action（第 16–106 行）
- `daemon stop` action（第 108–135 行）
- `daemon status` action（第 137–174 行）
- 所有与 `manager.install/uninstall/getStatus` 相关的导入和逻辑

- [ ] **Step 2: 重写 `daemon.ts`**

将文件替换为以下内容（保留 `run` 子命令，添加 PID 写入和信号处理）：

```typescript
/**
 * Daemon 命令 - 内部使用，由 service manager 调用
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { getConfigDir } from '../../storage/database.js'

export const daemonCommand = new Command('daemon')

daemonCommand
  .description('内部使用，由 service manager 调用')

daemonCommand
  .command('run')
  .description('运行心跳循环（由系统调用，不应手动执行）')
  .action(async () => {
    const pidPath = path.join(getConfigDir(), 'heartbeat.pid')

    // 写入 PID 文件，供 TUI hook（useDaemon.ts）检测存活状态
    await fs.writeFile(pidPath, String(process.pid))

    // 关闭时删除 PID 文件
    const cleanup = async () => {
      await fs.unlink(pidPath).catch(() => {})
      process.exit(0)
    }
    process.once('SIGTERM', cleanup)
    process.once('SIGINT', cleanup)

    try {
      const { Heartbeat } = await import('../../engine/heartbeat.js')
      const heartbeat = new Heartbeat()

      console.log('[corivo] 后台心跳启动中...')
      console.log('[corivo] 我会一直在后台默默工作。')

      await heartbeat.start()
      // heartbeat.start() 是无限循环，正常不会返回。
      // 若意外返回（测试或未来改动），也确保 PID 文件被清理。
      await cleanup()
    } catch (error) {
      console.error('[corivo] 后台心跳启动失败:', error)
      await fs.unlink(pidPath).catch(() => {})
      process.exit(1)
    }
  })

export default daemonCommand
```

- [ ] **Step 3: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 4: commit**

```bash
git add packages/cli/src/cli/commands/daemon.ts
git commit -m "refactor(daemon): keep only run subcommand, add PID file management"
```

---

## Task 5: 更新 `start.ts` — 使用 ServiceManager

**Files:**
- Modify: `packages/cli/src/cli/commands/start.ts`

- [ ] **Step 1: 重写 `start.ts`**

删除所有 spawn + pid-file 逻辑（`startCommand` 和 `startWatchCommand`），替换为：

```typescript
/**
 * CLI 命令 - start
 *
 * 启动心跳守护进程（通过系统 service manager）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfigDir, getDefaultDatabasePath } from '../../storage/database.js'
import { ConfigError } from '../../errors/index.js'
import { getServiceManager, resolveCorivoBin } from '../../service/index.js'

export async function startCommand(): Promise<void> {
  const configDir = getConfigDir()
  const configPath = path.join(configDir, 'config.json')

  let config
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    config = JSON.parse(content)
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init')
  }

  const dbKey = config.db_key

  if (!dbKey && config.encrypted_db_key) {
    console.log('⚠️  检测到旧版配置格式（需要密码）')
    console.log('')
    console.log('Corivo v0.10+ 已移除密码系统，请按以下步骤迁移：')
    console.log('  1. 备份数据库：cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup')
    console.log('  2. 重新初始化：corivo init')
    return
  }

  if (!dbKey) {
    throw new ConfigError('配置文件无效：缺少 db_key')
  }

  const manager = getServiceManager()
  const corivoBin = await resolveCorivoBin()
  const dbPath = getDefaultDatabasePath()

  console.log('正在启动心跳守护进程...')

  const result = await manager.install({ corivoBin, dbKey, dbPath })

  if (result.success) {
    console.log('✅ 心跳守护进程已启动')
    console.log('\n日志路径:')
    console.log(`  stdout: ${path.join(configDir, 'daemon.log')}`)
    console.log(`  stderr: ${path.join(configDir, 'daemon.err')}`)
  } else {
    console.log(`❌ 启动失败: ${result.error}`)
    console.log('')
    console.log('你可以手动启动心跳：')
    console.log('  node ./dist/engine/heartbeat.js')
  }
}
```

- [ ] **Step 2: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 3: commit**

```bash
git add packages/cli/src/cli/commands/start.ts
git commit -m "refactor(start): replace spawn+pid-file with ServiceManager"
```

---

## Task 6: 更新 `stop.ts` — 使用 ServiceManager

**Files:**
- Modify: `packages/cli/src/cli/commands/stop.ts`

- [ ] **Step 1: 重写 `stop.ts`**

```typescript
/**
 * CLI 命令 - stop
 *
 * 停止心跳守护进程
 */

import { getServiceManager } from '../../service/index.js'

export async function stopCommand(): Promise<void> {
  const manager = getServiceManager()

  console.log('正在停止心跳守护进程...')

  const result = await manager.uninstall()

  if (result.success) {
    console.log('✅ 心跳守护进程已停止')
  } else {
    console.log(`❌ 停止失败: ${result.error}`)
  }
}
```

- [ ] **Step 2: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 3: commit**

```bash
git add packages/cli/src/cli/commands/stop.ts
git commit -m "refactor(stop): replace pid-file with ServiceManager"
```

---

## Task 7: 更新 `status.ts` — 使用 ServiceManager.getStatus()

**Files:**
- Modify: `packages/cli/src/cli/commands/status.ts`

- [ ] **Step 1: 读取现有 `status.ts`**

定位第 28–37 行（读 pid 文件那段），确认替换范围。

- [ ] **Step 2: 添加顶层 import，删除 pid-file 检查**

在 `status.ts` 文件**顶部**的 import 区域，添加一行：

```typescript
import { getServiceManager } from '../../service/index.js'
```

然后将函数体内的旧 pid-file 代码：

```typescript
  // 检查守护进程状态
  const pidPath = path.join(configDir, 'heartbeat.pid');
  let heartbeatRunning = false;
  try {
    if (await fs.stat(pidPath)) {
      const pid = parseInt(await fs.readFile(pidPath, 'utf-8'));
      process.kill(pid, 0);
      heartbeatRunning = true;
    }
  } catch {}
```

替换为：

```typescript
  // 检查守护进程状态（通过 ServiceManager）
  const serviceManager = getServiceManager()
  const serviceStatus = await serviceManager.getStatus()
  const heartbeatRunning = serviceStatus.running
```

- [ ] **Step 3: 更新状态输出行**

定位第 78–79 行：

```typescript
  console.log(chalk.cyan('\n⚡ 心跳守护进程'));
  console.log(chalk.gray('  状态:   ') + (heartbeatRunning ? chalk.green('🟢 运行中') : chalk.gray('⚪ 未启动')));
```

在"未启动"后追加 PID 信息（如果有）：

```typescript
  console.log(chalk.cyan('\n⚡ 心跳守护进程'))
  console.log(chalk.gray('  状态:   ') + (serviceStatus.running ? chalk.green('🟢 运行中') : chalk.gray('⚪ 未启动')))
  if (serviceStatus.pid) {
    console.log(chalk.gray('  PID:    ') + chalk.white(serviceStatus.pid.toString()))
  }
```

- [ ] **Step 4: 清理不再需要的 import**

检查 `status.ts` 顶部，移除 `fs` 的导入（如果 status.ts 其他地方不再用 `fs.stat`）。注意：`fs` 在 `statusCommand` 里仍然用于读取 `config.json`，只需确认移除了 `fs.stat`/`fs.readFile` 对 pid 文件的引用即可，不要误删整个 `fs` import。

- [ ] **Step 5: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误

- [ ] **Step 6: commit**

```bash
git add packages/cli/src/cli/commands/status.ts
git commit -m "refactor(status): replace pid-file check with ServiceManager.getStatus()"
```

---

## Task 8: 清理 CLI 入口 + 删除 daemon/ 模块

**Files:**
- Modify: `packages/cli/src/cli/index.ts`
- Delete: `packages/cli/src/daemon/macos.ts`
- Delete: `packages/cli/src/daemon/index.ts`
- Delete: `packages/cli/__tests__/unit/daemon-macos.test.ts`

- [ ] **Step 1: 更新 `cli/index.ts`**

移除 `startWatchCommand` 的导入和 `--watch` flag 注册：

将：
```typescript
import { startCommand, startWatchCommand } from './commands/start.js';
```
改为：
```typescript
import { startCommand } from './commands/start.js'
```

将 `start` 命令注册从：
```typescript
program
  .command('start')
  .description('启动守护进程')
  .option('-w, --watch', '监控模式：自动重启崩溃的进程')
  .action(async (options) => {
    if (options.watch) {
      await startWatchCommand();
    } else {
      await startCommand();
    }
  });
```
改为：
```typescript
program
  .command('start')
  .description('启动守护进程')
  .action(startCommand)
```

- [ ] **Step 2: 删除 `daemon/` 模块**

```bash
rm packages/cli/src/daemon/macos.ts
rm packages/cli/src/daemon/index.ts
```

- [ ] **Step 3: 删除旧测试**

```bash
rm packages/cli/__tests__/unit/daemon-macos.test.ts
```

> 该测试依赖未安装的 vitest，已被 Task 3 中的 `service-manager.test.ts` 替代。

- [ ] **Step 4: typecheck**

```bash
cd packages/cli && npm run typecheck
```

期望：无错误（特别是确认没有残留的 `daemon/macos.js` import）

- [ ] **Step 5: build**

```bash
cd packages/cli && npm run build
```

期望：`dist/cli/index.js` 和 `dist/engine/heartbeat.js` 生成，无错误

- [ ] **Step 6: commit**

```bash
git add packages/cli/src/cli/index.ts
git rm packages/cli/src/daemon/macos.ts packages/cli/src/daemon/index.ts
git rm packages/cli/__tests__/unit/daemon-macos.test.ts
git commit -m "refactor: remove daemon/ module and clean up CLI entry"
```

---

## Task 9: 冒烟测试（手动验证）

**前提：** 已完成上述全部 Task，`npm run build` 通过。

- [ ] **Step 1: 验证 `corivo start`**

```bash
cd packages/cli && node dist/cli/index.js start
```

期望（macOS）：
```
正在启动心跳守护进程...
✅ 心跳守护进程已启动
日志路径:
  stdout: /Users/<you>/.corivo/daemon.log
  stderr: /Users/<you>/.corivo/daemon.err
```

- [ ] **Step 2: 验证 launchd 注册**

```bash
launchctl list | grep com.corivo.daemon
```

期望：输出包含 `com.corivo.daemon` 和 PID

- [ ] **Step 3: 验证 `corivo status`**

```bash
node dist/cli/index.js status
```

期望：`⚡ 心跳守护进程` 一行显示 `🟢 运行中`，不再依赖 pid 文件

- [ ] **Step 4: 验证 PID 文件由 daemon run 写入**

```bash
cat ~/.corivo/heartbeat.pid
```

期望：显示一个正整数（launchd 管理的进程 PID）

- [ ] **Step 5: 验证 `corivo stop`**

```bash
node dist/cli/index.js stop
```

期望：
```
正在停止心跳守护进程...
✅ 心跳守护进程已停止
```

- [ ] **Step 6: 验证 stop 后状态**

```bash
node dist/cli/index.js status
```

期望：`⚡ 心跳守护进程` 显示 `⚪ 未启动`

- [ ] **Step 7: 验证 TUI 兼容**

```bash
node dist/cli/index.js start
node dist/cli/index.js status --tui
```

期望：TUI 心跳状态行显示"运行中"，不出现报错

- [ ] **Step 8: 最终 commit**

```bash
git add -A
git commit -m "chore: smoke test complete — service manager refactor done"
```

---

## 附录：各平台预期行为速查

| 平台 | `corivo start` 结果 |
|------|---------------------|
| macOS | ✅ 通过 launchd 安装并启动 |
| Linux | ❌ 打印"Linux systemd --user 支持尚未实现" |
| Windows | ❌ 打印"此平台不支持 service manager" |
