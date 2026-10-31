# Audit 0002: Architecture and Modularity Review (main @ cc54f9e)

Scope: structure, boundaries and file organisation after PRs #57 and #58 merged. Complements [0001](./0001-baseline-audit.md), which lists concrete bugs. Read-only review; nothing here is implemented yet.

## Verdict

The **package-level architecture is sound**; the **module-level organisation is not yet**. Package boundaries match AGENTS.md and the ADRs, but several files have become "everything for this package" files and one contract (the event/run types) is hand-copied across packages. This is cheap to fix now and expensive after Plan 0006 lands another ~5k lines on top.

## What is good (keep)

- **Acyclic, layered package graph:** `core ← runtime ← server ← cli`, `create-plico → core`, `studio` standalone. No cycles, no deep imports.
- **Seams that already exist:** `EventStore` interface (storage is swappable), `ModelProvider` port (provider-neutral), `getProjectPaths`/`PROJECT_LAYOUT` (layout contract), `HttpError` + `sendJson` helpers.
- Strict TS config (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `isolatedDeclarations`), ESM-only, tests beside code, public surface limited to each package's `index.ts`, ADR-backed decisions.

## Problems, by priority

### A. Oversized multi-responsibility files

| File | Lines | Mixed concerns |
| --- | --- | --- |
| `cli/src/cli.ts` | 896 | 8 commands, 6 hand-written arg parsers, script loading + validation, output formatting, DB path resolution, Studio resolution, server startup — in one `main()` if-chain |
| `studio/src/App.tsx` | 744 | state for 12 concerns, data fetching, layout, 5 views, event rows, file preview, ~70 inline `style={{}}` objects |
| `runtime/src/run.ts` | 388 | run lifecycle, three execution strategies (default dry, scripted, provider loop), terminal-state/persistence handling repeated 4× |
| `runtime/src/types.ts` | 235 | events, run results, provider port, tools, artifacts, evals, readiness, store options — all domains in one file |
| `runtime/src/readiness.ts` | 225 | one 150-line function running 6 unrelated checks sequentially |
| Test files | 1464 / 850 / 791 | `runtime/src/index.test.ts`, `cli.test.ts`, `server/src/index.test.ts` each test the whole package; no per-module tests |

### B. Duplicated and drifting contracts

1. **Event/run/readiness/eval/artifact types are copied by hand** into `studio/src/types.ts` (92 lines) from `runtime/src/types.ts`. They match today, but Studio types `PlicoEvent.type` as plain `string` and nothing links the copies, so every Plan 0006 contract change (new statuses, event types) can silently drift from Studio with no compile error.
2. **Script-step normalisation exists twice** (`cli/src/cli.ts#normalizeScriptStep`, `server/src/script.ts`) with different error text. It belongs next to `DryRunScriptStep` in runtime.
3. `isRecord` redefined in 6 files; TS-loader code (`transpileModule` + `createRequire`) duplicated in core and runtime.
4. Layout constants bypassed: `runtime` hard-codes `"evals"`, `"artifacts"` instead of `getProjectPaths`.

### C. Boundary smells

- `runtime` owns SQLite, the scripted engine, the provider loop, evals, readiness and artifacts. It is becoming the "second core". Plan 0006 adds MCP, memory, approvals and cancellation here. Split by responsibility before that.
- `@plico/cli` depends on `@plico/studio`, a private Vite app, to find its `dist/`. A published CLI cannot resolve it.
- `create-plico` lists `@plico/runtime` as a dependency but only its test imports it (`index.test.ts`); it should be a devDependency.
- `readiness` dynamically `import("@plico/core")` though core is already a static dependency.
- Server `routes.ts` is an `if`-chain of regex matches; every Plan 0006 endpoint (threads, approvals, cancel, AG-UI) will extend it linearly.

### D. Missing structure for what is coming

- No event-type discriminated union (payload is `Record<string, unknown>`), so Studio, evals, projections and AG-UI mapping would each re-parse payloads with casts.
- No shared test utilities (project fixture builders are re-written per test file).
- No `typecheck` over tests/Studio (see 0001 F-12).

## Target structure

```
packages/
  core/src/            project/ (layout, loader, config schema)  validation/  loader/ (TS module loader)  shared/guards.ts
  contracts/src/       NEW: events (union), runs, artifacts, evals, readiness DTOs, API response shapes. Types only, zero runtime deps.
                       Consumed by runtime, server, cli, studio, future @plico/react. Replaces studio/src/types.ts.
  runtime/src/
    events/             event log, event types helpers
    run/                lifecycle.ts, finalize.ts, strategies/{default,scripted,provider}.ts, persistence.ts
    tools/              discover.ts, load.ts, normalize.ts, schema/ (validate.ts, guard.ts)
    instructions/  artifacts/  evals/ (discover, run, expect)
    readiness/          index.ts + checks/{project,tools,evals,persistence,artifacts}.ts (each returns diagnostics)
    storage/            EventStore port + sqlite/ (schema.ts, queries.ts, store.ts)   <- candidate for @plico/store-sqlite
  server/src/           routes/{health,project,runs,events,workspace,eval,readiness}.ts, router.ts (method+path table), http/{body,responses,sse,static}.ts
  cli/src/              main.ts (dispatch), commands/{validate,run,runs,events,eval,readiness,serve}.ts, args.ts, format/*.ts, script-file.ts
  studio/src/           App.tsx (shell only), hooks/ (useProject, useRuns, ...), views/, components/, styles.css (replace inline styles), uses @plico/contracts
```

Rules to codify in AGENTS.md: ≤ ~250 lines per source file as a smell threshold; one exported concern per module; tests mirror modules; shared DTOs only in `contracts`; no `Record<string, unknown>` payloads in public types.

## Suggested refactor order (behaviour-preserving, tests stay green)

1. Add `@plico/contracts` (types only) and move runtime/Studio types into it; Studio imports it. Highest leverage: removes the drift.
2. Split `runtime/types.ts` per domain and `run.ts` into lifecycle + strategies + `finalizeRun` (single terminal/persist path).
3. Split `cli.ts` into `commands/*` with one argument parser (`node:util parseArgs`); move script normalisation to runtime.
4. Server router table + route modules; move HTTP helpers under `http/`.
5. Readiness `checks/*`; sqlite store split into schema/queries.
6. Studio: hooks, views, components, stylesheet.
7. Split mega test files to mirror modules; add `test-utils`.

Do 1–2 **before** merging the rest of the Plan 0006 stack, because those PRs touch exactly `run.ts`, `types.ts`, `sqlite-store.ts`, `routes.ts` and `readiness.ts`; refactoring first means rebasing 9 open PRs, refactoring last means untangling 5k more lines. Either way it must be sequenced deliberately.
