# @plico-ai/cli

## 0.6.1

### Patch Changes

- 9f5ed25: Report MCP server reachability and allowlist gaps in readiness checks, and expose declared and configured MCP tools with effective approval policy through `GET /v1/tools` and Studio's Tools view.
- Updated dependencies [9f5ed25]
  - @plico-ai/runtime@0.6.1
  - @plico-ai/server@0.6.1
  - @plico-ai/core@0.6.1

## 0.6.0

### Patch Changes

- a49eb20: Update dependencies: `@ai-sdk/anthropic` ^4.0.104 → ^4.0.106, `@ai-sdk/google` ^4.0.120 → ^4.0.122, `@ai-sdk/openai` ^4.0.117 → ^4.0.121, `@ai-sdk/openai-compatible` ^3.0.92 → ^3.0.93, `@hono/node-server` 2.1.8 → 2.1.9, `ai` ^7.0.172 → ^7.0.176, `hono` 4.13.18 → 4.13.19, `lucide-react` ^1.72.0 → ^1.75.0.
- Updated dependencies [a49eb20]
- Updated dependencies [d7e9084]
  - @plico-ai/runtime@0.6.0
  - @plico-ai/server@0.6.0
  - @plico-ai/core@0.6.0

## 0.5.4

### Patch Changes

- Updated dependencies [c5512d7]
- Updated dependencies [5e7c30c]
  - @plico-ai/runtime@0.5.4
  - @plico-ai/core@0.5.4
  - @plico-ai/server@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies [313f061]
  - @plico-ai/core@0.5.3
  - @plico-ai/runtime@0.5.3
  - @plico-ai/server@0.5.3

## 0.5.2

### Patch Changes

- 0b746c3: Clarify eval case guidance in generated projects and improve eval baseline output and help.
- @plico-ai/core@0.5.2
  - @plico-ai/runtime@0.5.2
  - @plico-ai/server@0.5.2

## 0.5.1

### Patch Changes

- 47ac54e: Browse saved eval reports in Studio, inspect trial transcripts with scores and judge reasons, and compare two reports side by side.
- @plico-ai/core@0.5.1
  - @plico-ai/runtime@0.5.1
  - @plico-ai/server@0.5.1

## 0.5.0

### Minor Changes

- 252526c: Save eval reports with scores and trial transcripts; compare baselines with tolerance, rescore saved runs, export Markdown and JUnit, and read reports over HTTP.

### Patch Changes

- Updated dependencies [252526c]
  - @plico-ai/runtime@0.5.0
  - @plico-ai/server@0.5.0
  - @plico-ai/core@0.5.0

## 0.4.0

### Minor Changes

- 6d433d2: `plico eval --live` now grades cases with a judge model. Each bullet in a case body is a criterion the judge answers yes or no, and `scorers` take a `rubric` (levels 0 to n, scored as the level picked over the top level, passing at 0.7) and a `factuality` check against an expected answer (passing at 0.6), each with an optional `threshold` and `judge`. The judge is the entry's `judge`, then the case's, then the new `evals.judge` in `plico.config.ts`, then the agent's model in `plico.config.ts`; `--model` changes only the agent, never the judge. Each check is one model call at temperature 0, retried like the agent's calls, and failed checks print the judge's reasons; a run that failed is not judged. Judge calls count toward `--max-tokens`, and `plico readiness` warns when judged cases have no judge, a judge lacks its key, or the judge is the agent's own model. `runEvals` returns each case's `scores` with what the judge was asked and answered; `POST /v1/eval` does not serve them yet. `EvalScorerRef` is now a union of code, rubric and factuality scorers, model requests take an optional `temperature`, and the finish chunk carries the `modelId` that answered. The scaffold's README mentions the judged checks. The judge prompts are adapted from autoevals (MIT), credited in NOTICE.

### Patch Changes

- Updated dependencies [6d433d2]
  - @plico-ai/core@0.4.0
  - @plico-ai/runtime@0.4.0
  - @plico-ai/server@0.4.0

## 0.3.0

### Minor Changes

- bd62633: `plico eval --live` runs eval cases against the configured model: each case's `input` is sent as `plico run --input` sends it, and the same `expect` checks and scorers run on the result, with `maxTokens` and `maxLatencyMs` now applied. A case's `mocks` give fixed tool results, and `--mock-tools` takes every tool result from the case's `.script.json` fixture so no handler runs. `trials: n` runs a case n times and passes only when every trial does. `--model <provider:model>` runs the suite on another model, `--max-tokens` caps the suite's tokens, starting no model call expected to pass the cap even under concurrency (exiting 1 when a case did not run), and `--concurrency` sets how many live runs go at once (4 by default). `runEvals` takes these as `live` and returns `tokenCapReached`; `runProject` takes `mockToolResult`. Live results are not stored as the project's eval report, and `POST /v1/eval` stays scripted.

### Patch Changes

- Updated dependencies [bd62633]
  - @plico-ai/runtime@0.3.0
  - @plico-ai/server@0.3.0
  - @plico-ai/core@0.3.0

## 0.2.0

### Minor Changes

- e630671: Eval cases can be Markdown: `evals/<name>.md` with `expect` checks in frontmatter (`status`, `contains`, `tool`, `notTool`, `artifact`, `output` fields of `structuredOutput`, and `maxTokens` and `maxLatencyMs` for live runs) and judge criteria as bullets, replayed from a `<name>.script.json` fixture beside it. Custom scorers live in `evals/scorers/` and use `defineScorer` from `@plico-ai/sdk`. `plico validate` points at the line of a mistake, and `plico eval` lists cases it skipped. `plico eval --from-run` now writes `<name>.md` plus the fixture, and `evalCaseFromRun` records `contains` or `output` instead of `outputContains`. Fixture-only `*.script.json` cases keep working. `plico validate` also checks a case's `input` against the agent's input schema.
  
  Breaking: a `.md` file in `evals/` that starts with a `---` frontmatter block is now read as an eval case. If it is not one, `plico validate` reports its unknown keys as errors and `plico eval` stops on it; move such notes out of `evals/` or drop their frontmatter. `runEvals` now also returns `skipped`.

### Patch Changes

- Updated dependencies [e630671]
  - @plico-ai/core@0.2.0
  - @plico-ai/runtime@0.2.0
  - @plico-ai/server@0.2.0

## 0.1.6

### Patch Changes

- 27d9123: Update dependencies: `@ai-sdk/anthropic` ^4.0.99 → ^4.0.104, `@ai-sdk/google` ^4.0.114 → ^4.0.120, `@ai-sdk/openai` ^4.0.111 → ^4.0.117, `@ai-sdk/openai-compatible` ^3.0.84 → ^3.0.92, `@clack/prompts` ^1.6.0 → ^1.9.0, `@hono/node-server` 2.1.6 → 2.1.8, `@opentelemetry/api` 1.9.0 → 1.9.1, `@tailwindcss/vite` ^4.3.4 → ^4.3.5, `ai` ^7.0.162 → ^7.0.172, `hono` 4.13.17 → 4.13.18, `lucide-react` ^1.67.0 → ^1.72.0, `picomatch` 4.0.4 → 4.0.7, `react` ^19.1.0 → ^19.3.1, `react-dom` ^19.1.0 → ^19.3.1, `tailwindcss` ^4.3.4 → ^4.3.5, `tsx` 4.22.4 → 4.23.15.
- Updated dependencies [27d9123]
  - @plico-ai/runtime@0.1.6
  - @plico-ai/server@0.1.6
  - @plico-ai/core@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [bedb438]
  - @plico-ai/core@0.1.5
  - @plico-ai/runtime@0.1.5
  - @plico-ai/server@0.1.5

## 0.1.4

### Patch Changes

- 2197cc3: Expose typed run schemas and results: `GET /v1/schemas` returns the agent's `input` and `output` schemas as JSON Schema (also on scoped mounts), run summaries from `GET /v1/runs` and `GET /v1/runs/<run-id>` include `structuredOutput`, and Studio shows the declared schemas under Instructions and the validated result in the run inspector.
- Updated dependencies [2197cc3]
  - @plico-ai/core@0.1.4
  - @plico-ai/runtime@0.1.4
  - @plico-ai/server@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [af1a206]
  - @plico-ai/runtime@0.1.3
  - @plico-ai/core@0.1.3
  - @plico-ai/server@0.1.3

## 0.1.2

### Patch Changes

- 959276e: Scripts can decide approvals: an `approval.decide` step (`approved: true` or `false`) right after a gated `tool.call` records the decision instead of waiting, so evals can cover the approved and denied paths. `--script` also accepts an eval case object, and script errors list the valid shapes. The `create-plico` scaffold now writes an `AGENTS.md` and `CLAUDE.md` for coding agents and prints the docs link.
- 93befc9: Validate typed CLI run input before resolving the model provider so schema diagnostics take precedence over model configuration errors.
- 9b529c9: An agent with an `input` schema now takes typed input. `POST /v1/threads/:id/messages` and `plico.threads.send` accept `input`, and `plico run` accepts `--input` or `--input-file`. A missing or invalid value is rejected before any run starts: HTTP 400 `input.invalid` with each problem listed, or exit code 1 on the CLI.
- 73426c2: `plico validate` warns about files in `evals/` that `plico eval` would skip, such as a case saved as `name.json`. The scaffolded `tools/readme.md` now describes the full handler context. Docs note that a dry run without `--script` calls no tools.
- Updated dependencies [959276e]
- Updated dependencies [102dea6]
- Updated dependencies [9b529c9]
- Updated dependencies [c5f5a13]
- Updated dependencies [c6d5eb9]
- Updated dependencies [73426c2]
- Updated dependencies [0ab0e80]
  - @plico-ai/runtime@0.1.2
  - @plico-ai/core@0.1.2
  - @plico-ai/server@0.1.2

## 0.1.1

### Patch Changes

- bcaf47a: First-use fixes from a cold walkthrough: `plico <command> --help` prints that command's usage, `plico serve` explains a port that is already in use and suggests `--port`, and a waiting dry run prints its run id (or says to add `--persist`). The `create-plico` scaffold now includes a scripted eval case so `npm run eval` passes on a new project, and pins the provider adapter to `^4.0.0` instead of `latest`.
- @plico-ai/core@0.1.1
  - @plico-ai/runtime@0.1.1
  - @plico-ai/server@0.1.1

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
  - @plico-ai/core@0.1.0
  - @plico-ai/runtime@0.1.0
  - @plico-ai/server@0.1.0
