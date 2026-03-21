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
  index.ts          getServiceManager() — 平台路由
  macos.ts          MacOSServiceManager（从 daemon/macos.ts 迁移）
  linux.ts          LinuxServiceManager stub（预留，方法均抛出 NotImplementedError）
  unsupported.ts    UnsupportedServiceManager（其他平台，方法均抛出明确错误）
```

### 删除：`src/daemon/`

`daemon/macos.ts` 逻辑迁移至 `service/macos.ts`，`daemon/index.ts` 删除。

### 保留：`daemon run` 子命令

`daemon.ts` 只保留 `run` 子命令，其余 `start/stop/status` 子命令删除。`daemon run` 是 service manager（launchd / systemd）调用的唯一 heartbeat 入口，description 保持"由系统调用，不应手动执行"。

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
  corivoBin: string   // corivo 二进制路径或 "node /path/to/cli.js"
  dbKey: string       // base64 数据库密钥
  dbPath: string      // 数据库文件路径
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

---

## 平台路由（`index.ts`）

```typescript
export function getServiceManager(): ServiceManager {
  switch (process.platform) {
    case 'darwin': return new MacOSServiceManager()
    case 'linux':  return new LinuxServiceManager()
    default:       return new UnsupportedServiceManager()
  }
}
```

---

## 命令层改动

### `corivo start`（`commands/start.ts`）

**删除**：
- `spawn(process.execPath, ['./dist/engine/heartbeat.js'], ...)` 及相关 pid-file 写入逻辑
- `startWatchCommand` 整个函数（launchd `KeepAlive: true` 覆盖此需求）
- `--watch` flag

**新逻辑**：
1. 读取 `~/.corivo/config.json`，验证 `db_key` 存在
2. `const manager = getServiceManager()`
3. `await manager.install({ corivoBin, dbKey, dbPath })`
4. 成功：打印"已启动"
5. 失败：打印错误 + 手动启动提示（不做 fallback）

### `corivo stop`（`commands/stop.ts`）

**删除**：读 PID 文件、`process.kill(pid, 'SIGTERM')`、删 PID 文件

**新逻辑**：
1. `const manager = getServiceManager()`
2. `await manager.uninstall()`

### `corivo status`（`commands/status.ts`）

**删除**：读 `heartbeat.pid` 文件、`process.kill(pid, 0)` 检查存活

**新逻辑**：
1. `const manager = getServiceManager()`
2. `const serviceStatus = await manager.getStatus()`
3. 展示 `loaded / running / pid`，合并原 `daemon status` 的输出风格

### `corivo init`（`commands/init.ts`）

两处 `await startCommand()` 调用保持不变，因为 `startCommand` 内部已改为走 service manager。

### `corivo daemon`（`commands/daemon.ts`）

删除 `daemon start / stop / status` 子命令。只保留 `daemon run`（内部入口，不对用户暴露）。

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

---

## 错误处理策略

### 平台不支持（`UnsupportedServiceManager`）

```
此平台不支持 service manager（当前：win32）
请手动运行: node ./dist/engine/heartbeat.js
```

不做 pid-file fallback，明确告知用户。

### Linux stub（`LinuxServiceManager`）

```
Linux systemd --user 支持尚未实现
请追踪 issue 或手动运行心跳
```

`isSupported()` 返回 `true`，其余方法抛 `NotImplementedError`。占位确保平台路由结构完整，未来只需填充 `linux.ts` 内部实现。

### `install` 失败

```
❌ 启动失败: <原因>

你可以手动启动心跳：
  node ./dist/engine/heartbeat.js
```

---

## 删除的代码清单

- `src/daemon/macos.ts`（迁移至 `src/service/macos.ts`）
- `src/daemon/index.ts`
- `start.ts` 中 `spawn` + pid-file 写入逻辑
- `start.ts` 中 `startWatchCommand` 函数
- `stop.ts` 中读 PID 文件 + SIGTERM 逻辑
- `status.ts` 中读 PID 文件逻辑
- `daemon.ts` 中 `start / stop / status` 子命令
- CLI 主入口中 `startWatchCommand` 的导入和 `--watch` 注册

---

## 未来 Linux 支持路径

实现 `src/service/linux.ts` 中的 `LinuxServiceManager`：

- `install()`：生成 `~/.config/systemd/user/corivo.service`，调用 `systemctl --user enable --now corivo`
- `uninstall()`：`systemctl --user disable --now corivo`，删除 unit 文件
- `getStatus()`：解析 `systemctl --user is-active corivo` 输出

不需要改动任何命令层代码。
