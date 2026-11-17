# @plico-ai/core

## 0.4.0

### Minor Changes

- 6d433d2: `plico eval --live` now grades cases with a judge model. Each bullet in a case body is a criterion the judge answers yes or no, and `scorers` take a `rubric` (levels 0 to n, scored as the level picked over the top level, passing at 0.7) and a `factuality` check against an expected answer (passing at 0.6), each with an optional `threshold` and `judge`. The judge is the entry's `judge`, then the case's, then the new `evals.judge` in `plico.config.ts`, then the agent's model in `plico.config.ts`; `--model` changes only the agent, never the judge. Each check is one model call at temperature 0, retried like the agent's calls, and failed checks print the judge's reasons; a run that failed is not judged. Judge calls count toward `--max-tokens`, and `plico readiness` warns when judged cases have no judge, a judge lacks its key, or the judge is the agent's own model. `runEvals` returns each case's `scores` with what the judge was asked and answered; `POST /v1/eval` does not serve them yet. `EvalScorerRef` is now a union of code, rubric and factuality scorers, model requests take an optional `temperature`, and the finish chunk carries the `modelId` that answered. The scaffold's README mentions the judged checks. The judge prompts are adapted from autoevals (MIT), credited in NOTICE.

### Patch Changes

- Updated dependencies [6d433d2]
  - @plico-ai/contracts@0.4.0
  - @plico-ai/sdk@0.4.0

## 0.3.0

### Patch Changes

- @plico-ai/contracts@0.3.0
  - @plico-ai/sdk@0.3.0

## 0.2.0

### Minor Changes

- e630671: Eval cases can be Markdown: `evals/<name>.md` with `expect` checks in frontmatter (`status`, `contains`, `tool`, `notTool`, `artifact`, `output` fields of `structuredOutput`, and `maxTokens` and `maxLatencyMs` for live runs) and judge criteria as bullets, replayed from a `<name>.script.json` fixture beside it. Custom scorers live in `evals/scorers/` and use `defineScorer` from `@plico-ai/sdk`. `plico validate` points at the line of a mistake, and `plico eval` lists cases it skipped. `plico eval --from-run` now writes `<name>.md` plus the fixture, and `evalCaseFromRun` records `contains` or `output` instead of `outputContains`. Fixture-only `*.script.json` cases keep working. `plico validate` also checks a case's `input` against the agent's input schema.
  
  Breaking: a `.md` file in `evals/` that starts with a `---` frontmatter block is now read as an eval case. If it is not one, `plico validate` reports its unknown keys as errors and `plico eval` stops on it; move such notes out of `evals/` or drop their frontmatter. `runEvals` now also returns `skipped`.

### Patch Changes

- Updated dependencies [e630671]
  - @plico-ai/contracts@0.2.0
  - @plico-ai/sdk@0.2.0

## 0.1.6

### Patch Changes

- @plico-ai/contracts@0.1.6
  - @plico-ai/sdk@0.1.6

## 0.1.5

### Patch Changes

- bedb438: `plico.config.ts` can import local TypeScript modules and the project's installed packages, so Zod `input` and `output` schemas in the config now load and validate. Previously any import other than `@plico-ai/sdk` failed.
- @plico-ai/contracts@0.1.5
  - @plico-ai/sdk@0.1.5

## 0.1.4

### Patch Changes

- 2197cc3: Expose typed run schemas and results: `GET /v1/schemas` returns the agent's `input` and `output` schemas as JSON Schema (also on scoped mounts), run summaries from `GET /v1/runs` and `GET /v1/runs/<run-id>` include `structuredOutput`, and Studio shows the declared schemas under Instructions and the validated result in the run inspector.
- Updated dependencies [2197cc3]
  - @plico-ai/contracts@0.1.4
  - @plico-ai/sdk@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [af1a206]
  - @plico-ai/contracts@0.1.3
  - @plico-ai/sdk@0.1.3

## 0.1.2

### Patch Changes

- 9b529c9: An agent with an `input` schema now takes typed input. `POST /v1/threads/:id/messages` and `plico.threads.send` accept `input`, and `plico run` accepts `--input` or `--input-file`. A missing or invalid value is rejected before any run starts: HTTP 400 `input.invalid` with each problem listed, or exit code 1 on the CLI.
- c5f5a13: `agent.md` frontmatter is now parsed as YAML, so nested values work, and invalid YAML is a `plico validate` error. `agent.md` and `plico.config.ts` accept optional `input` and `output` JSON Schemas, and `plico validate` rejects a schema that is not valid. Runs do not enforce them yet.
- 73426c2: `plico validate` warns about files in `evals/` that `plico eval` would skip, such as a case saved as `name.json`. The scaffolded `tools/readme.md` now describes the full handler context. Docs note that a dry run without `--script` calls no tools.
- 0ab0e80: Breaking: tool `inputSchema` supports Zod 4 and JSON Schema only. A Zod 3 schema is rejected with a message that says so. Projects on `zod` 3.25 can switch to `import { z } from "zod/v4"` without upgrading the package.
- Updated dependencies [c5f5a13]
  - @plico-ai/contracts@0.1.2
  - @plico-ai/sdk@0.1.2

## 0.1.1

### Patch Changes

- @plico-ai/contracts@0.1.1
  - @plico-ai/sdk@0.1.1

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
  - @plico-ai/sdk@0.1.0
