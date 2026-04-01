# Corivo Claude Async Extractor Design

**日期**: 2026-04-01
**状态**: 提议中
**范围**: `packages/cli`

---

## 目标

设计一个最小可调用工具，让 Corivo 可以把已经拼装好的提示词交给 Claude 异步处理，并返回统一的执行状态与结果。

本轮只解决“工具能力”本身，不解决：

- 谁来调用它
- 在什么事件上调用
- 是否进入任务队列
- 是否持久化执行记录
- 如何把结果再写回 memory

## 输入与输出

### 输入

工具只接收一个核心参数：

```ts
type ClaudeExtractionPrompt = string | string[];
```

建议对外接口：

```ts
export interface ClaudeExtractionInput {
  prompt: string | string[];
  timeoutMs?: number;
}
```

约束：

- `prompt` 为必填
- `prompt` 为 `string[]` 时，数组顺序保留
- `prompt` 中的空字符串在规范化阶段会被过滤
- 规范化后若结果为空，直接返回 `error`

### 输出

```ts
export type ClaudeExtractionStatus =
  | 'success'
  | 'error'
  | 'timeout';

export interface ClaudeExtractionResult {
  status: ClaudeExtractionStatus;
  result: string | null;
  error?: string;
}
```

语义：

- `success`: Claude 正常返回，`result` 为 Claude 输出文本
- `error`: 参数非法、Claude 不可执行、进程非预期失败、输出为空
- `timeout`: 调用超时被终止

## 核心接口

建议暴露一个纯异步方法：

```ts
export async function extractWithClaude(
  input: ClaudeExtractionInput
): Promise<ClaudeExtractionResult>;
```

要求：

- 该方法不依赖 CLI 命令上下文
- 该方法不直接打印到终端
- 该方法不假设调用来源是 hook、heartbeat 或 command
- 该方法可被后续 CLI、runtime、daemon 或测试代码直接复用

## Prompt 规范化

工具内部先把输入收敛为单一字符串，再交给 Claude。

建议规则：

```ts
function normalizePrompt(prompt: string | string[]): string
```

行为：

1. 若 `prompt` 为字符串，直接 `trim()`
2. 若 `prompt` 为数组：
   - 过滤掉空白项
   - 每项 `trim()`
   - 使用 `\n\n` 拼接
3. 若拼接后为空字符串，返回参数错误

选择 `\n\n` 而不是单换行，是为了保留“多段提示词”的语义边界，又不引入 provider 专属消息结构。

## 模块边界

建议新增目录：

```text
packages/cli/src/extraction/
  types.ts
  claude-client.ts
```

### `types.ts`

定义：

- `ClaudeExtractionInput`
- `ClaudeExtractionStatus`
- `ClaudeExtractionResult`

### `claude-client.ts`

负责：

- prompt 规范化
- Claude 调用
- 超时控制
- 返回值映射

不负责：

- memory block 创建
- 数据库存储
- 任务编排
- 宿主适配

## Provider 调用边界

Claude 的具体命令调用应被封装在内部 helper 中，不向上层泄漏命令细节。

建议内部结构：

```ts
function normalizePrompt(prompt: string | string[]): string;

async function runClaude(prompt: string, timeoutMs: number): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}>;
```

然后由 `extractWithClaude()` 负责把底层执行结果映射为统一输出。

## 返回值映射规则

建议映射如下：

### 成功

满足以下条件时返回：

- Claude 进程正常结束
- `stdout.trim()` 非空

返回：

```ts
{
  status: 'success',
  result: stdout.trim(),
}
```

### 超时

满足以下条件时返回：

- 超过 `timeoutMs`
- 子进程被主动终止

返回：

```ts
{
  status: 'timeout',
  result: null,
  error: 'Claude extraction timed out',
}
```

### 错误

以下情况统一归为 `error`：

- 输入为空
- Claude 命令不可用
- 进程退出码非零
- `stdout` 为空
- 执行过程中抛出异常

返回：

```ts
{
  status: 'error',
  result: null,
  error: '<可读错误信息>',
}
```

## 超时策略

首版建议支持可选超时参数，并提供保守默认值。

建议默认：

```ts
const DEFAULT_TIMEOUT_MS = 60_000;
```

原因：

- 这是“工具层”而不是长任务系统
- 默认需要避免无限阻塞调用方
- 后续若上层需要更长时间，可通过参数覆写

## 错误处理原则

该工具的职责是“吞掉 provider 细节，输出统一结果”，而不是把底层异常直接抛给所有调用方。

因此建议：

- `extractWithClaude()` 默认 resolve `ClaudeExtractionResult`
- 不用异常作为常规控制流
- 仅在真正的编程错误场景下才允许 throw，例如内部不可恢复状态

这样后续任何调用方都只需要判断：

```ts
if (result.status === 'success') {
  // use result.result
}
```

## 测试建议

首版至少覆盖以下测试：

1. `prompt` 为单字符串时能正常规范化
2. `prompt` 为数组时按顺序以 `\n\n` 拼接
3. 空字符串或空数组返回 `error`
4. Claude 成功返回时映射为 `success`
5. Claude 超时时映射为 `timeout`
6. Claude 非零退出时映射为 `error`
7. Claude 返回空输出时映射为 `error`

测试重点应放在：

- prompt 规范化
- 结果映射
- 超时处理

而不是依赖真实 Claude 环境跑集成测试。

## 非目标

以下能力明确不在本轮范围内：

- Claude / Codex 双 provider 抽象
- 任务队列
- worker
- heartbeat 集成
- session / block 专用 schema
- 输出 JSON 校验
- 数据库存档
- 重试机制

这些都属于上层 orchestration，当前工具不承担。

## 推荐结论

在 `packages/cli/src/extraction/` 中增加一个最小异步工具 `extractWithClaude()`：

- 输入只收 `prompt: string | string[]`
- 内部负责规范化 prompt 并调用 Claude
- 输出统一为 `status + result + optional error`
- 不耦合任何调度、持久化或 memory 逻辑

这个边界最小、最稳，也最适合作为后续编排层的基础构件。
