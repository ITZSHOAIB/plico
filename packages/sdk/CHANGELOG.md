# @plico-ai/sdk

## 0.5.0

### Patch Changes

- Updated dependencies [252526c]
  - @plico-ai/contracts@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [6d433d2]
  - @plico-ai/contracts@0.4.0

## 0.3.0

### Patch Changes

- @plico-ai/contracts@0.3.0

## 0.2.0

### Minor Changes

- e630671: Eval cases can be Markdown: `evals/<name>.md` with `expect` checks in frontmatter (`status`, `contains`, `tool`, `notTool`, `artifact`, `output` fields of `structuredOutput`, and `maxTokens` and `maxLatencyMs` for live runs) and judge criteria as bullets, replayed from a `<name>.script.json` fixture beside it. Custom scorers live in `evals/scorers/` and use `defineScorer` from `@plico-ai/sdk`. `plico validate` points at the line of a mistake, and `plico eval` lists cases it skipped. `plico eval --from-run` now writes `<name>.md` plus the fixture, and `evalCaseFromRun` records `contains` or `output` instead of `outputContains`. Fixture-only `*.script.json` cases keep working. `plico validate` also checks a case's `input` against the agent's input schema.
  
  Breaking: a `.md` file in `evals/` that starts with a `---` frontmatter block is now read as an eval case. If it is not one, `plico validate` reports its unknown keys as errors and `plico eval` stops on it; move such notes out of `evals/` or drop their frontmatter. `runEvals` now also returns `skipped`.

### Patch Changes

- Updated dependencies [e630671]
  - @plico-ai/contracts@0.2.0

## 0.1.6

### Patch Changes

- @plico-ai/contracts@0.1.6

## 0.1.5

### Patch Changes

- @plico-ai/contracts@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [2197cc3]
  - @plico-ai/contracts@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [af1a206]
  - @plico-ai/contracts@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [c5f5a13]
  - @plico-ai/contracts@0.1.2

## 0.1.1

### Patch Changes

- @plico-ai/contracts@0.1.1

## 0.1.0

### Minor Changes

- cfd453f: First public developer preview of Plico, a TypeScript-first agent app kit. A folder of Markdown instructions, skills, TypeScript tools, config, evals, memory and artifacts becomes a runnable, inspectable agent app.
  
  - Start a project with `npm create plico`, then use `plico validate`, `plico run`, `plico eval`, `plico readiness` and `plico serve --studio`.
  - Every run is recorded in a durable event log, with approvals, cancel, threads, artifacts and OpenTelemetry tracing.
  - Embed Plico in your backend with `createPlico` from `@plico-ai/server`. Write tools and config with `defineTool` and `defineConfig` from `@plico-ai/sdk`.
  - Needs Node 22.18 or later.
  
  What may change: this is a `0.x` release, so the TypeScript exports of every package can change in any minor version. The HTTP API under `/v1` takes additive changes only from this release on; a breaking change would be `/v2`. Saved data such as events and eval reports carries its own `schemaVersion`.

### Patch Changes

- Updated dependencies [cfd453f]
  - @plico-ai/contracts@0.1.0
