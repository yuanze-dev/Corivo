# Service Manager 重构设计

**日期**：2026-03-21
**状态**：已批准
**目标**：统一后台常驻进程为系统 service 方式（macOS launchd），废弃 detached child + pid-file 方案

---

## 背景

当前仓库存在两套后台常驻机制并存：

1. **`corivo start`（pid-file 方式）**
   - spawn `dist/engine/heartbeat.js` 为 detached child process
   - 通过 `~/.corivo/heartbeat.pid` 管理进程生命周期
   - 无崩溃自动重启，无开机自启

2. **`corivo daemon start`（launchd 方式）**
   - 生成 `~/Library/LaunchAgents/com.corivo.daemon.plist`
   - 通过 `launchctl` 管理，支持 `KeepAlive` 和 `RunAtLoad`
   - 入口为 `corivo daemon run` → `Heartbeat` 类

**核心问题**：
- `init` 走 pid-file 路径，`corivo status` 只感知 pid 文件，导致 daemon 方式运行时 status 显示"未启动"
- 两条 heartbeat 入口（`dist/engine/heartbeat.js` vs `corivo daemon run`）
- 安装脚本额外调用 `corivo daemon start`，可能造成双份心跳
- `start --watch` 手动实现了 launchd 本已提供的能力

---

## 决策

统一采用系统 service 方式。macOS 以 launchd 为唯一正式方案，未来 Linux 对齐 `systemd --user`。`corivo start/stop/status` 作为用户主入口，底层统一委托给 `ServiceManager`。

---

## 模块结构

### 新增：`src/service/`

```
src/service/
  types.ts          ServiceManager 接口、ServiceConfig、ServiceStatus、ServiceResult
  index.ts          getServiceManager() 平台路由 + resolveCorivoBin() 工具函数
  macos.ts          MacOSServiceManager（从 daemon/macos.ts 迁移）
  linux.ts          LinuxServiceManager stub（预留，方法均返回 { success: false, error: '...' }）
  unsupported.ts    UnsupportedServiceManager（其他平台，方法均返回明确错误）
```

### 删除：`src/daemon/`

`daemon/macos.ts` 逻辑迁移至 `service/macos.ts`，`daemon/index.ts` 删除。

### 保留：`daemon run` 子命令

`daemon.ts` 只保留 `run` 子命令，其余 `start/stop/status` 子命令删除。`daemon run` 是 service manager（launchd / systemd）调用的唯一 heartbeat 入口。

---

## 接口定义（`types.ts`）

```typescript
export interface ServiceManager {
  install(config: ServiceConfig): Promise<ServiceResult>
  uninstall(): Promise<ServiceResult>
  getStatus(): Promise<ServiceStatus>
  isSupported(): boolean
}

export interface ServiceConfig {
  /** corivo 二进制路径或 "node /path/to/cli.js" 字符串，由 MacOSServiceManager 内部负责解析拆分 */
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
```

**关于 `corivoBin` 解析**：`corivoBin` 保持 `string` 类型，`MacOSServiceManager.install()` 内部继承现有 `daemon/macos.ts` 中 `generatePlist()` 的字符串拆分逻辑（检测是否包含 `"node "` 前缀，分割为 ProgramArguments 数组）。调用方（`start.ts`）只负责传入路径字符串，不做拆分。

---

## 平台路由与 `resolveCorivoBin()`（`index.ts`）

```typescript
export function getServiceManager(): ServiceManager {
  switch (process.platform) {
    case 'darwin': return new MacOSServiceManager()
    case 'linux':  return new LinuxServiceManager()
    default:       return new UnsupportedServiceManager()
  }
}

/**
 * 探测当前环境下的 corivo 二进制路径。
 * 从 daemon.ts 的 start action 迁移过来，统一由 service 层管理。
 */
export async function resolveCorivoBin(): Promise<string> {
  const possiblePaths = [
    process.env.CORIVO_BIN,
    path.join(process.cwd(), 'bin', 'corivo'),
    path.join(os.homedir(), '.corivo', 'bin', 'corivo'),
  ]
  for (const p of possiblePaths) {
    if (p && await fs.access(p).then(() => true).catch(() => false)) {
      return p
    }
  }
  // fallback：开发模式，假设用户在 packages/cli 目录下执行
  // 注意：process.cwd() 取决于用户的工作目录，这是继承自现有 daemon.ts 的开发模式假设
  const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js')
  return `${process.execPath} ${cliPath}`
}
```

`start.ts` 调用 `resolveCorivoBin()` 获取 `corivoBin`，不再自行探测路径。

---

## 命令层改动

### `corivo start`（`commands/start.ts`）

**删除**：
- `spawn(process.execPath, ['./dist/engine/heartbeat.js'], ...)` 及相关 pid-file 写入逻辑
- `startWatchCommand` 整个函数（launchd `KeepAlive: true` 覆盖此需求）
- `--watch` flag（从 CLI 注册和 `index.ts` 导入中移除）

**新逻辑**：
1. 读取 `~/.corivo/config.json`，验证 `db_key` 存在
2. `const corivoBin = await resolveCorivoBin()`
3. `const manager = getServiceManager()`
4. `const result = await manager.install({ corivoBin, dbKey, dbPath })`
5. `result.success`：打印"已启动"；`!result.success`：打印错误 + 手动启动提示（不做 fallback）

### `corivo stop`（`commands/stop.ts`）

**删除**：读 PID 文件、`process.kill(pid, 'SIGTERM')`、删 PID 文件

**新逻辑**：
1. `const manager = getServiceManager()`
2. `const result = await manager.uninstall()`
3. `result.success`：打印"已停止"；`!result.success`：打印 `result.error`（服务未安装时 `uninstall()` 静默成功，返回 `{ success: true }`，与现有 `daemon/macos.ts` `uninstall()` 行为一致）

### `corivo status`（`commands/status.ts`）

**删除**：读 `heartbeat.pid` 文件、`process.kill(pid, 0)` 检查存活

**新逻辑**：
1. `const manager = getServiceManager()`
2. `const serviceStatus = await manager.getStatus()`
3. 展示 `loaded / running / pid`，取代原"检查 pid 文件"那段逻辑；输出格式与原 `daemon status` 风格合并（不展示 plist 路径，保持简洁）

### `corivo init`（`commands/init.ts`）

两处 `await startCommand()` 调用保持不变，因为 `startCommand` 内部已改为走 service manager。

### `corivo daemon`（`commands/daemon.ts`）

删除 `daemon start / stop / status` 子命令及其相关 action。只保留 `daemon run`（内部入口）：
- 顶层 `daemon` 命令的 `.description()` 更新为"内部使用，由 service manager 调用"
- `daemon run` 的 description 保持"运行心跳循环（由系统调用，不应手动执行）"

---

## launchd plist 入口

plist 的 `ProgramArguments` 不变，仍指向 `corivo daemon run`：

```xml
<key>ProgramArguments</key>
<array>
  <string>/path/to/node</string>
  <string>/path/to/dist/cli/index.js</string>
  <string>daemon</string>
  <string>run</string>
</array>
```

`daemon run` 通过环境变量 `CORIVO_DB_KEY` 和 `CORIVO_DB_PATH`（由 plist `EnvironmentVariables` 注入）获取配置，`heartbeat.ts` 无需修改。

### `daemon run` 写入自身 PID

`daemon run` 启动后，由 `daemon.ts` 的 run action 负责写入 `~/.corivo/heartbeat.pid`，关闭时删除。这样 TUI hook（见下节）无需感知 launchd，继续通过 PID 文件判断存活状态。

**`heartbeat.ts` 不修改。** PID 写入和信号处理器注册由 `daemon.ts` 的 run action 负责，因为它是进程入口，比引擎类更适合管理生命周期。

`daemon.ts` run action 新增逻辑：

```typescript
daemonCommand.command('run').action(async () => {
  // 1. 写入 PID 文件
  const pidPath = path.join(getConfigDir(), 'heartbeat.pid')
  await fs.writeFile(pidPath, String(process.pid))

  // 2. 注册信号处理器，关闭时删除 PID 文件
  const cleanup = async () => {
    await fs.unlink(pidPath).catch(() => {})
    process.exit(0)
  }
  process.once('SIGTERM', cleanup)
  process.once('SIGINT', cleanup)

  // 3. 启动 heartbeat
  const { Heartbeat } = await import('../../engine/heartbeat.js')
  const heartbeat = new Heartbeat()
  await heartbeat.start()
})

---

## TUI Hook 兼容（`src/tui/hooks/useDaemon.ts`）

**不改变接口和现有逻辑**。`useDaemon` 继续读取 `heartbeat.pid` + `.heartbeat-health`。

兼容性由上一节保证：`daemon run`（heartbeat 进程）自己写入并管理 PID 文件，launchd 保证进程存活，两者配合后 `useDaemon` 感知不到机制变化。

---

## 错误处理策略

### 平台不支持（`UnsupportedServiceManager`）

所有方法返回 `{ success: false, error: '此平台不支持 service manager（当前：win32）\n请手动运行: node ./dist/engine/heartbeat.js' }`，`isSupported()` 返回 `false`。

### Linux stub（`LinuxServiceManager`）

`isSupported()` 返回 `false`（表示尚未实现，仅供外部查询，不影响路由）。`install / uninstall / getStatus` 均返回：

```typescript
{ success: false, error: 'Linux systemd --user 支持尚未实现，请关注后续更新' }
```

不抛出异常，确保错误路径走到统一的"启动失败"提示。

**`isSupported()` 的语义**：该方法仅供外部信息查询（如文档、诊断工具），`start.ts` 不检查它。`start.ts` 直接调用 `install()`，通过 `ServiceResult.success` 判断是否成功。这样 Linux 用户会收到"启动失败: Linux systemd --user 支持尚未实现"的提示，而不是静默失败。

### `install` 失败时的输出

```
❌ 启动失败: <result.error>

你可以手动启动心跳：
  node ./dist/engine/heartbeat.js
```

---

## 删除的代码清单

- `src/daemon/macos.ts`（逻辑迁移至 `src/service/macos.ts`）
- `src/daemon/index.ts`
- `start.ts` 中 `spawn` + pid-file 写入逻辑
- `start.ts` 中 `startWatchCommand` 函数
- `stop.ts` 中读 PID 文件 + SIGTERM 逻辑
- `status.ts` 中读 `heartbeat.pid` 文件逻辑
- `daemon.ts` 中 `start / stop / status` 子命令
- CLI 主入口中 `startWatchCommand` 的导入和 `--watch` 注册

---

## 未来 Linux 支持路径

实现 `src/service/linux.ts` 中的 `LinuxServiceManager`：

- `isSupported()`：返回 `true`
- `install()`：生成 `~/.config/systemd/user/corivo.service`，调用 `systemctl --user enable --now corivo`
- `uninstall()`：`systemctl --user disable --now corivo`，删除 unit 文件
- `getStatus()`：解析 `systemctl --user is-active corivo` 输出

不需要改动任何命令层代码。
