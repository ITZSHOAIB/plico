# create-plico

## 0.2.0

### Minor Changes

- e630671: Eval cases can be Markdown: `evals/<name>.md` with `expect` checks in frontmatter (`status`, `contains`, `tool`, `notTool`, `artifact`, `output` fields of `structuredOutput`, and `maxTokens` and `maxLatencyMs` for live runs) and judge criteria as bullets, replayed from a `<name>.script.json` fixture beside it. Custom scorers live in `evals/scorers/` and use `defineScorer` from `@plico-ai/sdk`. `plico validate` points at the line of a mistake, and `plico eval` lists cases it skipped. `plico eval --from-run` now writes `<name>.md` plus the fixture, and `evalCaseFromRun` records `contains` or `output` instead of `outputContains`. Fixture-only `*.script.json` cases keep working. `plico validate` also checks a case's `input` against the agent's input schema.
  
  Breaking: a `.md` file in `evals/` that starts with a `---` frontmatter block is now read as an eval case. If it is not one, `plico validate` reports its unknown keys as errors and `plico eval` stops on it; move such notes out of `evals/` or drop their frontmatter. `runEvals` now also returns `skipped`.

### Patch Changes

- Updated dependencies [e630671]
  - @plico-ai/core@0.2.0

## 0.1.6

### Patch Changes

- 27d9123: Update dependencies: `@ai-sdk/anthropic` ^4.0.99 → ^4.0.104, `@ai-sdk/google` ^4.0.114 → ^4.0.120, `@ai-sdk/openai` ^4.0.111 → ^4.0.117, `@ai-sdk/openai-compatible` ^3.0.84 → ^3.0.92, `@clack/prompts` ^1.6.0 → ^1.9.0, `@hono/node-server` 2.1.6 → 2.1.8, `@opentelemetry/api` 1.9.0 → 1.9.1, `@tailwindcss/vite` ^4.3.4 → ^4.3.5, `ai` ^7.0.162 → ^7.0.172, `hono` 4.13.17 → 4.13.18, `lucide-react` ^1.67.0 → ^1.72.0, `picomatch` 4.0.4 → 4.0.7, `react` ^19.1.0 → ^19.3.1, `react-dom` ^19.1.0 → ^19.3.1, `tailwindcss` ^4.3.4 → ^4.3.5, `tsx` 4.22.4 → 4.23.15.
- @plico-ai/core@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [bedb438]
  - @plico-ai/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [2197cc3]
  - @plico-ai/core@0.1.4

## 0.1.3

### Patch Changes

- @plico-ai/core@0.1.3

## 0.1.2

### Patch Changes

- 959276e: Scripts can decide approvals: an `approval.decide` step (`approved: true` or `false`) right after a gated `tool.call` records the decision instead of waiting, so evals can cover the approved and denied paths. `--script` also accepts an eval case object, and script errors list the valid shapes. The `create-plico` scaffold now writes an `AGENTS.md` and `CLAUDE.md` for coding agents and prints the docs link.
- 102dea6: A server that rejects the reasoning text Plico replays after a tool call (Groq does) now gets one retry without it, so tool calls work. A provider rejection (HTTP 4xx) now ends with the provider's own message, such as an unknown model name. New Google projects use `gemini-3.5-flash`, because `gemini-2.5-flash` returns 404.
- 73426c2: `plico validate` warns about files in `evals/` that `plico eval` would skip, such as a case saved as `name.json`. The scaffolded `tools/readme.md` now describes the full handler context. Docs note that a dry run without `--script` calls no tools.
- 0ab0e80: Breaking: tool `inputSchema` supports Zod 4 and JSON Schema only. A Zod 3 schema is rejected with a message that says so. Projects on `zod` 3.25 can switch to `import { z } from "zod/v4"` without upgrading the package.
- Updated dependencies [9b529c9]
- Updated dependencies [c5f5a13]
- Updated dependencies [73426c2]
- Updated dependencies [0ab0e80]
  - @plico-ai/core@0.1.2

## 0.1.1

### Patch Changes

- bcaf47a: First-use fixes from a cold walkthrough: `plico <command> --help` prints that command's usage, `plico serve` explains a port that is already in use and suggests `--port`, and a waiting dry run prints its run id (or says to add `--persist`). The `create-plico` scaffold now includes a scripted eval case so `npm run eval` passes on a new project, and pins the provider adapter to `^4.0.0` instead of `latest`.
- @plico-ai/core@0.1.1

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
