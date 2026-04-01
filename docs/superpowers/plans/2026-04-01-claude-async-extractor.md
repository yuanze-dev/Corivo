# Claude Async Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/cli` 中新增一个最小异步工具，接收 `prompt: string | string[]`，调用 Claude，并返回统一的 `status + result` 结果。

**Architecture:** 该实现只增加一个独立的 extraction 模块，不接入 CLI 命令、heartbeat、host hooks 或任务系统。模块内部负责 prompt 规范化、子进程调用、超时控制和结果映射，对外只暴露一个纯 async 函数 `extractWithClaude()`。

**Tech Stack:** TypeScript ESM, Node.js child process/timers, existing package export surface, Vitest

**Spec:** [2026-04-01-claude-async-extractor-design.md](/Users/airbo/Developer/corivo/Corivo/docs/superpowers/specs/2026-04-01-claude-async-extractor-design.md)

---

## 文件变更地图

**新建：**
- `packages/cli/src/extraction/types.ts` — Claude async extractor 的输入输出类型
- `packages/cli/src/extraction/claude-client.ts` — `normalizePrompt()`、`runClaude()`、`extractWithClaude()` 实现
- `packages/cli/__tests__/unit/claude-extractor.test.ts` — prompt 规范化、结果映射、超时与错误处理测试

**修改：**
- `packages/cli/src/index.ts` — 导出 extraction 公共类型与 `extractWithClaude`

**暂不纳入本计划：**
- CLI 命令入口
- host/runtime/heartbeat 调用
- 数据库存储
- 多 provider 抽象
- JSON schema 输出

---

### Task 1: 定义 extraction 类型与公开接口

**Files:**
- Create: `packages/cli/src/extraction/types.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/__tests__/unit/claude-extractor.test.ts`

- [ ] **Step 1: 写 failing test，锁定最小 public contract**

在 `packages/cli/__tests__/unit/claude-extractor.test.ts` 中先定义：

```ts
import { describe, expect, it } from 'vitest';
import type {
  ClaudeExtractionInput,
  ClaudeExtractionResult,
  ClaudeExtractionStatus,
} from '../../src/extraction/types.js';

describe('claude extraction public contract', () => {
  it('defines a stable result status union', () => {
    const statuses: ClaudeExtractionStatus[] = ['success', 'error', 'timeout'];
    expect(statuses).toEqual(['success', 'error', 'timeout']);
  });

  it('accepts string or string[] prompts', () => {
    const single: ClaudeExtractionInput = { prompt: 'hello' };
    const multi: ClaudeExtractionInput = { prompt: ['a', 'b'] };

    expect(single.prompt).toBe('hello');
    expect(multi.prompt).toEqual(['a', 'b']);
  });

  it('uses nullable result text in the output shape', () => {
    const output: ClaudeExtractionResult = { status: 'success', result: 'ok' };
    expect(output.result).toBe('ok');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: FAIL，提示 `src/extraction/types.ts` 不存在。

- [ ] **Step 3: 写最小类型实现**

在 `packages/cli/src/extraction/types.ts` 定义：

```ts
export type ClaudeExtractionPrompt = string | string[];

export type ClaudeExtractionStatus =
  | 'success'
  | 'error'
  | 'timeout';

export interface ClaudeExtractionInput {
  prompt: ClaudeExtractionPrompt;
  timeoutMs?: number;
}

export interface ClaudeExtractionResult {
  status: ClaudeExtractionStatus;
  result: string | null;
  error?: string;
}
```

并在 `packages/cli/src/index.ts` 增加导出：

```ts
export type {
  ClaudeExtractionInput,
  ClaudeExtractionPrompt,
  ClaudeExtractionResult,
  ClaudeExtractionStatus,
} from './extraction/types.js';
export { extractWithClaude } from './extraction/claude-client.js';
```

注意：这里先导出函数名，即使实现文件下一任务才创建，也能提前锁定公共 API。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/extraction/types.ts packages/cli/src/index.ts packages/cli/__tests__/unit/claude-extractor.test.ts
git commit -m "feat: define claude extraction contract"
```

---

### Task 2: 实现 prompt 规范化与底层进程适配

**Files:**
- Create: `packages/cli/src/extraction/claude-client.ts`
- Test: `packages/cli/__tests__/unit/claude-extractor.test.ts`

- [ ] **Step 1: 扩展 failing test，锁定 prompt 规范化规则**

在 `packages/cli/__tests__/unit/claude-extractor.test.ts` 中新增：

```ts
import { normalizePrompt } from '../../src/extraction/claude-client.js';

describe('normalizePrompt', () => {
  it('trims a single string prompt', () => {
    expect(normalizePrompt('  hello  ')).toBe('hello');
  });

  it('joins prompt parts with blank lines', () => {
    expect(normalizePrompt([' first ', '', 'second', '   '])).toBe('first\n\nsecond');
  });

  it('returns an empty string when prompt content is blank', () => {
    expect(normalizePrompt([' ', '\n'])).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: FAIL，提示 `normalizePrompt` 或 `claude-client.ts` 不存在。

- [ ] **Step 3: 写最小实现**

在 `packages/cli/src/extraction/claude-client.ts` 中实现：

```ts
import type { ClaudeExtractionPrompt } from './types.js';

export const DEFAULT_TIMEOUT_MS = 60_000;

export function normalizePrompt(prompt: ClaudeExtractionPrompt): string {
  if (typeof prompt === 'string') {
    return prompt.trim();
  }

  return prompt
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');
}
```

同时为后续任务预留一个未导出的 `runClaude()` helper 签名：

```ts
async function runClaude(prompt: string, timeoutMs: number): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> { /* stub in next task */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/extraction/claude-client.ts packages/cli/__tests__/unit/claude-extractor.test.ts
git commit -m "feat: add claude prompt normalization"
```

---

### Task 3: 实现 `extractWithClaude()` 的结果映射

**Files:**
- Modify: `packages/cli/src/extraction/claude-client.ts`
- Test: `packages/cli/__tests__/unit/claude-extractor.test.ts`

- [ ] **Step 1: 写 failing test，锁定 success/error 映射**

在 `packages/cli/__tests__/unit/claude-extractor.test.ts` 中通过 mock 底层执行函数覆盖：

```ts
import { describe, expect, it, vi } from 'vitest';

describe('extractWithClaude', () => {
  it('returns success when claude exits normally with non-empty stdout', async () => {
    const result = await extractWithClaude({ prompt: 'hello' });
    expect(result).toEqual({ status: 'success', result: 'done' });
  });

  it('returns error when normalized prompt is empty', async () => {
    const result = await extractWithClaude({ prompt: [' ', ''] });
    expect(result).toEqual({
      status: 'error',
      result: null,
      error: expect.stringContaining('empty'),
    });
  });

  it('returns error when claude exits with a non-zero code', async () => {
    const result = await extractWithClaude({ prompt: 'hello' });
    expect(result.status).toBe('error');
    expect(result.result).toBeNull();
  });

  it('returns error when stdout is empty', async () => {
    const result = await extractWithClaude({ prompt: 'hello' });
    expect(result.status).toBe('error');
  });
});
```

测试实现建议：
- 不调用真实 Claude
- 在 `claude-client.ts` 中把底层执行逻辑收敛到一个可 mock 的 helper
- 用 `vi.spyOn()` 或模块级 mock 控制 `runClaude()`

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: FAIL，因为 `extractWithClaude()` 还未完成映射逻辑。

- [ ] **Step 3: 写最小实现**

在 `packages/cli/src/extraction/claude-client.ts` 中实现：

```ts
import type {
  ClaudeExtractionInput,
  ClaudeExtractionResult,
} from './types.js';

export async function extractWithClaude(
  input: ClaudeExtractionInput
): Promise<ClaudeExtractionResult> {
  const prompt = normalizePrompt(input.prompt);

  if (!prompt) {
    return {
      status: 'error',
      result: null,
      error: 'Claude extraction prompt is empty',
    };
  }

  try {
    const execution = await runClaude(prompt, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    if (execution.timedOut) {
      return {
        status: 'timeout',
        result: null,
        error: 'Claude extraction timed out',
      };
    }

    if (execution.exitCode !== 0) {
      return {
        status: 'error',
        result: null,
        error: execution.stderr.trim() || `Claude exited with code ${execution.exitCode}`,
      };
    }

    const output = execution.stdout.trim();
    if (!output) {
      return {
        status: 'error',
        result: null,
        error: 'Claude returned empty output',
      };
    }

    return {
      status: 'success',
      result: output,
    };
  } catch (error) {
    return {
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : 'Claude extraction failed',
    };
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/extraction/claude-client.ts packages/cli/__tests__/unit/claude-extractor.test.ts
git commit -m "feat: add claude extraction result mapping"
```

---

### Task 4: 实现真实的 Claude 子进程调用与超时控制

**Files:**
- Modify: `packages/cli/src/extraction/claude-client.ts`
- Test: `packages/cli/__tests__/unit/claude-extractor.test.ts`

- [ ] **Step 1: 写 failing test，锁定超时和进程适配行为**

在 `packages/cli/__tests__/unit/claude-extractor.test.ts` 中新增覆盖：

```ts
it('returns timeout when the claude process exceeds timeoutMs', async () => {
  const result = await extractWithClaude({ prompt: 'hello', timeoutMs: 5 });
  expect(result).toEqual({
    status: 'timeout',
    result: null,
    error: 'Claude extraction timed out',
  });
});

it('passes the normalized prompt to the claude runner', async () => {
  await extractWithClaude({ prompt: ['first', 'second'] });
  expect(mockedRunClaude).toHaveBeenCalledWith('first\n\nsecond', expect.any(Number));
});
```

如果 `runClaude()` 直接包内实现而不导出，测试可以通过 mock `node:child_process` 的 `spawn` 或提取一个内部 `createClaudeRunner()` helper 来断言行为。

- [ ] **Step 2: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: FAIL，因为真实子进程调用与超时逻辑尚未完成。

- [ ] **Step 3: 写最小实现**

在 `packages/cli/src/extraction/claude-client.ts` 中用 Node 内建实现 `runClaude()`：

```ts
import { spawn } from 'node:child_process';
```

实现要求：
- 以非交互方式调用 Claude CLI
- 把规范化后的 prompt 传给 Claude
- 收集 `stdout` / `stderr`
- 在 `timeoutMs` 到期后终止子进程
- 返回 `{ stdout, stderr, exitCode, timedOut }`

注意：
- CLI 参数选择要以仓库当前实际可用的 Claude 调用方式为准
- 若本地暂时无法在测试中验证真实命令，可把命令拼装收敛到一个小 helper，测试只断言参数与结果映射
- 不要在这一层打印日志或写文件

- [ ] **Step 4: 运行目标测试与类型检查**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: PASS

Run: `cd packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/extraction/claude-client.ts packages/cli/__tests__/unit/claude-extractor.test.ts
git commit -m "feat: run claude extraction via async process"
```

---

### Task 5: 回归导出面并验证包级稳定性

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/__tests__/unit/claude-extractor.test.ts`

- [ ] **Step 1: 写或补充 failing test，锁定包级导出**

在 `packages/cli/__tests__/unit/claude-extractor.test.ts` 或新增一个轻量导出测试中验证：

```ts
const mod = await import('../../src/index.js');

expect(typeof mod.extractWithClaude).toBe('function');
```

- [ ] **Step 2: 运行测试，确认导出面正确**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts`

Expected: PASS

- [ ] **Step 3: 跑最小回归集**

Run: `cd packages/cli && npm run test -- __tests__/unit/claude-extractor.test.ts __tests__/unit/cli.test.ts __tests__/unit/context.test.ts`

Expected: PASS

- [ ] **Step 4: 跑完整验证**

Run: `cd packages/cli && npm run typecheck`

Expected: PASS

Run: `cd packages/cli && npm run test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/__tests__/unit/claude-extractor.test.ts
git commit -m "test: verify claude extraction export surface"
```

---

## 实施注意事项

- 不要把该能力塞进 `hosts/`、`inject/` 或 `engine/`
- `extractWithClaude()` 默认应返回结构化结果，而不是抛异常作为常规流程
- 真实 Claude 调用参数如果在本地环境存在不确定性，先把命令构造封装成最小 helper，避免将 provider 细节散落到映射逻辑中
- 测试优先 mock 子进程，不依赖本机已安装并登录 Claude
- 若仓库现有测试风格更偏向单文件集中断言，继续沿用，不要额外拆太多测试文件
