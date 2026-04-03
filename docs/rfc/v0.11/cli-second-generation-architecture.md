# Corivo CLI Second-Generation Architecture RFC

Status: Draft  
Owner: CLI / Local Runtime  
Updated: 2026-04-03

## 1. Why This RFC Exists

`packages/cli` has crossed the point where first-generation structure is enough. The package already supports:

- a broad CLI surface
- local storage and indexing
- memory pipeline orchestration
- host install/import flows
- daemon/background execution
- prompt-time recall and review hooks

The current issue is not missing functionality. The issue is that several boundaries are now soft enough that adding new functionality keeps increasing structural debt.

Symptoms:

- command modules still perform too much orchestration
- `runtime`, `engine`, and `service` have overlapping meanings
- host implementation and host orchestration live in adjacent but partially duplicated layers
- `storage/database.ts` is at risk of becoming the center of everything
- `type/` is a catch-all with no stable meaning

This RFC defines the second-generation structure for `packages/cli`.

## 2. Goals

- Make `src/cli/*` a thin input/output shell.
- Make `src/application/*` the single orchestration layer.
- Introduce `src/domain/*` and `src/infrastructure/*` as durable homes for business logic and external adapters.
- Reduce `src/runtime/*` to runtime-only concerns.
- Split storage responsibilities without changing behavior.
- Keep public CLI behavior stable during migration.

## 3. Non-Goals

- No product redesign.
- No CLI flag redesign unless required by structural cleanup.
- No solver protocol changes.
- No memory schema redesign in this RFC.
- No plugin package re-architecture in this phase.

## 4. Design Principles

### 4.1 CLI Is An Adapter, Not The Product Core

The command layer parses flags, calls a use-case, then renders results. It does not decide business flow beyond selecting which use-case to run.

### 4.2 Application Is The Only Orchestration Layer

If a flow combines multiple dependencies and business steps, it belongs in `src/application/*`.

Examples:

- install host
- import host history
- run prompt query
- run review
- run carry-over
- trigger sync

### 4.3 Domain Owns Stable Business Concepts

`src/domain/*` is the home for concepts that remain meaningful outside the CLI shell:

- memory models
- memory rules
- trigger decision logic
- association/consolidation/conflict logic
- host contracts
- identity services

### 4.4 Infrastructure Owns External Systems

`src/infrastructure/*` owns all adapters to things outside the business model:

- SQLite
- filesystem
- config files
- OS service integration
- host install assets and adapter implementations
- LLM extraction providers
- output renderers if they are implementation-specific

### 4.5 Runtime Owns Process Concerns Only

`src/runtime/*` should answer questions like:

- how the daemon runs
- how scheduled work is triggered
- how host bridge policies map to commands
- how runtime state files are managed

It should not be the default place for product use-cases.

## 5. Target Package Shape

```text
packages/cli/src/
  cli/
    index.ts
    commands/
    context/
    presenters/
    utils/

  application/
    bootstrap/
    carry-over/
    hosts/
    memory/
    memory-ingest/
    query/
    review/
    sync/

  domain/
    host/
      contracts/
    identity/
      services/
    memory/
      models/
      rules/
      services/

  infrastructure/
    config/
    fs/
    hosts/
      adapters/
      importers/
      installers/
      registry/
    llm/
    output/
    platform/
    storage/
      lifecycle/
      repositories/
      schema/
      search/

  runtime/
    daemon/
    policies/
    scheduling/

  cold-scan/
  errors/
  memory-pipeline/
  raw-memory/
  tui/
  update/
  utils/
```

## 6. Layer Contracts

### 6.1 Allowed Dependency Direction

```text
cli -> application -> domain
cli -> application -> infrastructure
application -> domain
application -> infrastructure
runtime -> domain
runtime -> infrastructure

domain -X-> cli
domain -X-> infrastructure implementation details
```

### 6.2 What Each Layer May Import

`cli/*`
- Commander
- presenters
- `CliContext`
- application use-cases

`application/*`
- `CliContext` or narrower dependency slices
- domain services/contracts
- infrastructure adapters/repositories

`domain/*`
- local types and pure utilities only

`infrastructure/*`
- Node APIs
- third-party SDKs
- database libraries
- host/platform specific logic

`runtime/*`
- process state
- timers/scheduling
- application/domain/infrastructure modules as needed

## 7. Command Interface Standard

Every command should converge on this shape:

```ts
type CommandHandler<TOptions> = (
  context: CliContext,
  options: TOptions,
) => Promise<number | void>;
```

Rules:

- command file parses Commander options only
- command file never opens the database directly
- command file never imports `createLogger()` directly
- command file never formats business payloads inline if a presenter exists

### Example

```ts
export function createQueryCommand(context: CliContext): Command {
  return new Command('query')
    .option('--prompt <text>')
    .action(async (options) => {
      const result = await runPromptQuery(context, options);
      renderQueryResult(context.output, result, options.format);
    });
}
```

## 8. `CliContext` Contract

The current direction is correct and should become stricter, not broader.

Current stable members from [types.ts](/Users/airbo/Developer/corivo/Corivo/packages/cli/src/cli/context/types.ts):

- `logger`
- `config`
- `paths`
- `fs`
- `clock`
- `output`
- `db`

### What Belongs In `CliContext`

- logger
- config loading/saving
- path resolution
- file/json helpers
- clock
- user-facing output
- db accessor

### What Must Not Go Into `CliContext`

- `runReview()`
- `syncBlocks()`
- `processPendingBlocks()`
- `installHost()`
- any orchestration specific to one workflow

According to Corivo's memory, CLI command logging should append to a single `cli.log` under the user Corivo directory and stay separate from daemon logging. That means `CliContext` should remain the command-side runtime bundle, and daemon logging should not silently share its output file.

## 9. Use-Case Shape In `application`

Each use-case should expose:

- a request type
- a result type
- a factory or function
- explicit dependency injection

Example:

```ts
export interface RunPromptQueryRequest {
  prompt: string;
  format: RuntimeOutputFormat;
}

export interface RunPromptQueryResult {
  surface: string;
  source: 'memory-index' | 'raw-transcript' | 'legacy-block';
}

export interface RunPromptQueryDeps {
  loadDb: () => Promise<CorivoDatabase>;
  loadMemoryIndex: () => Promise<MemoryIndex | null>;
  logger: Pick<Logger, 'debug'>;
  now: () => number;
}

export function createRunPromptQueryUseCase(deps: RunPromptQueryDeps) {
  return async (input: RunPromptQueryRequest): Promise<RunPromptQueryResult> => {
    // orchestration only
  };
}
```

Rules:

- request/result types live beside the use-case
- no Commander types leak into use-cases
- if formatting is terminal-specific, keep it in presenters
- if data retrieval policy is product logic, keep it in application/domain

## 10. Domain Structure

### 10.1 `domain/memory/models`

Move:

- `models/block.ts`
- `models/association.ts`
- `models/pattern.ts`

No infra imports.

### 10.2 `domain/memory/rules`

Move:

- `engine/rules.ts`
- `engine/rules/*`

This layer should express memory classification and rule evaluation logic only.

### 10.3 `domain/memory/services`

Move pure memory logic here:

- associations
- consolidation
- conflict detection
- trigger decision
- suggestion if pure
- reminders if pure

If a module writes output, touches process state, or coordinates multiple adapters, it does not belong here.

### 10.4 `domain/host/contracts`

Move host contracts out of `hosts/types.ts` so adapters and application use-cases depend on a neutral contract layer.

### 10.5 `domain/identity/services`

Move identity logic here. If some files are really filesystem or crypto adapters, split them into infrastructure later.

## 11. Infrastructure Structure

### 11.1 `infrastructure/platform`

This replaces the vague `service/*` system-service layer.

Move:

- `service/index.ts`
- `service/linux.ts`
- `service/macos.ts`
- `service/unsupported.ts`
- `service/types.ts`

### 11.2 `infrastructure/llm`

This holds provider-specific extraction code.

Move:

- `service/extraction/index.ts`
- `service/extraction/types.ts`
- `service/extraction/providers/*`

### 11.3 `infrastructure/hosts`

Split by implementation concern:

- `adapters/*`
- `installers/*`
- `importers/*`
- `registry/*`

Rule:

- host implementation lives here
- host orchestration stays in `application/hosts/*`

### 11.4 `infrastructure/storage`

This is the most important decomposition.

Proposed shape:

```text
infrastructure/storage/
  lifecycle/
    open-database.ts
    database-paths.ts
  repositories/
    block-repository.ts
    raw-memory-repository.ts
    query-history-repository.ts
    import-cursor-repository.ts
  schema/
    migrations.ts
    bootstrap.ts
  search/
    block-search.ts
```

Keep a thin facade if needed:

```ts
export class CorivoDatabase {
  constructor(
    readonly blocks: BlockRepository,
    readonly rawMemory: RawMemoryRepository,
    readonly queryHistory: QueryHistoryRepository,
  ) {}
}
```

The goal is not to delete `CorivoDatabase` immediately. The goal is to make it a composition facade instead of a god object.

## 12. Runtime Structure

`src/runtime/*` should shrink to three categories:

### 12.1 `runtime/daemon`

- heartbeat process loop
- process state
- daemon lifecycle helpers

### 12.2 `runtime/scheduling`

- auto-sync scheduling
- periodic maintenance triggers

### 12.3 `runtime/policies`

- host bridge policy
- runtime support adapters
- query history policy
- render decision helpers if they are policy glue, not presenters

If a module is product-facing and directly maps to a user action, prefer `application/*` over `runtime/*`.

## 13. Presenter Layer

Add `src/cli/presenters/*` for text/json/hook-text formatting.

Why:

- format handling is a CLI concern
- it keeps use-cases testable with structured results
- it avoids `runtime/render.ts` becoming a dumping ground

Initial candidates:

- query presenter
- follow-up presenter
- status presenter
- host command presenter

## 14. File Migration Map

### Move First

- `service/*` -> `infrastructure/platform/*`
- `service/extraction/*` -> `infrastructure/llm/*`
- `hosts/adapters/*` -> `infrastructure/hosts/adapters/*`
- `hosts/importers/*` -> `infrastructure/hosts/importers/*`
- `hosts/installers/*` -> `infrastructure/hosts/installers/*`

### Move Second

- `runtime/recall.ts` -> `application/query/generate-recall.ts`
- `runtime/raw-recall.ts` -> `application/query/generate-raw-recall.ts`
- `runtime/query-pack.ts` -> `application/query/query-pack.ts`
- `runtime/review.ts` -> `application/review/run-review.ts`
- `runtime/carry-over.ts` -> `application/carry-over/run-carry-over.ts`
- `runtime/render.ts` -> `cli/presenters/*`

### Move Third

- `engine/associations.ts` -> `domain/memory/services/associations.ts`
- `engine/consolidation.ts` -> `domain/memory/services/consolidation.ts`
- `engine/conflict-detector.ts` -> `domain/memory/services/conflict-detector.ts`
- `engine/trigger-decision.ts` -> `domain/memory/services/trigger-decision.ts`
- `engine/heartbeat.ts` -> `runtime/daemon/heartbeat.ts`
- `engine/auto-sync.ts` -> `runtime/scheduling/auto-sync.ts`

### Move Last

- `storage/database.ts` -> split into `infrastructure/storage/*`
- `type/index.ts` -> delete after type relocation

## 15. Public Export Policy

`packages/cli/src/index.ts` must remain stable until the final cleanup batch.

Rules:

- use temporary re-export shims during one migration batch only
- never expose new internal directories accidentally from the public root
- after final cleanup, export domain contracts intentionally, not by folder convenience

## 16. Logging Policy

Command-side logging and daemon logging are separate concerns.

Rules:

- CLI commands write to `~/.corivo/cli.log`
- daemon/runtime logs do not share `cli.log`
- do not create per-command or per-host log files by default
- `CliContext` owns command-side logging setup
- daemon bootstrapping owns daemon-side logging setup

This keeps operator debugging simple and matches the current desired runtime model.

## 17. Rollout Plan

### Week 1

Day 1:
- create new skeleton directories
- update package architecture notes
- define layer rules in README

Day 2:
- migrate `service/*` to `infrastructure/platform/*`
- migrate `service/extraction/*` to `infrastructure/llm/*`

Day 3:
- migrate host implementations into `infrastructure/hosts/*`
- keep `application/hosts/*` as orchestration

Day 4:
- move query/review/carry-over orchestration into `application/*`
- add presenters

Day 5:
- fix import churn
- remove first round of compatibility shims
- run full tests

### Week 2

Day 6:
- split `engine/*` into domain services and runtime daemon pieces

Day 7:
- classify ambiguous modules: reminders, suggestion, push-queue, follow-up, query-history

Day 8:
- introduce `infrastructure/storage/*`
- keep `storage/database.ts` as thin delegating facade

Day 9:
- rehome all `type/*` exports
- reduce or delete legacy barrels

Day 10:
- final cleanup
- docs refresh
- remove stale shims
- run full verification

## 18. Verification Gates

Every batch must pass:

- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`

Final batch must also pass:

- `cd /Users/airbo/Developer/corivo/Corivo && pnpm -r run build`

If a batch introduces known failing tests, stop and fix before continuing. Do not stack multiple red batches.

## 19. Open Decisions

These need a deliberate choice during implementation:

1. Whether `push/*` belongs under `application/query`, `domain/memory/services`, or a dedicated `infrastructure/output`.
2. Whether `first-push/*` is a use-case in `application/` or a product subdomain.
3. Whether `sync-client.ts` should live in `application/sync` or `infrastructure/*` depending on how transport-specific it really is.
4. Whether `identity/*` needs a split between pure identity logic and platform/crypto adapters.

## 20. Decision Criteria For Ambiguous Modules

Use this test:

- if the module expresses a user action or workflow: `application`
- if the module expresses durable business rules or concepts: `domain`
- if the module speaks to the outside world: `infrastructure`
- if the module manages process lifecycle or scheduling: `runtime`
- if the module only formats output: `cli/presenters`

## 21. Expected Outcomes

If this RFC is implemented:

- new features will have a predictable landing zone
- CLI commands will stop being orchestration hubs
- `runtime` and `engine` will stop competing as grab-bag directories
- host integrations will scale without cloning patterns
- storage can evolve without making `database.ts` worse
- testing will improve because application and presenter boundaries will be explicit

## 22. Recommended Next Step

Implement the migration using the companion plan:

- [2026-04-03-cli-architecture-refactor.md](/Users/airbo/Developer/corivo/Corivo/docs/superpowers/plans/2026-04-03-cli-architecture-refactor.md)

This RFC defines the target architecture. The plan defines the execution order.
