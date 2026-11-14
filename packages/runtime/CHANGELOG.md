# @plico-ai/runtime

## 0.1.3

### Patch Changes

- af1a206: Enforce agent output schemas with native structured responses or a submit_result tool with one repair turn. Record validated structuredOutput on completed runs and final events, pin the schema across resume, and report structured output in readiness.
- Updated dependencies [af1a206]
  - @plico-ai/contracts@0.1.3
  - @plico-ai/core@0.1.3

## 0.1.2

### Patch Changes

- 959276e: Scripts can decide approvals: an `approval.decide` step (`approved: true` or `false`) right after a gated `tool.call` records the decision instead of waiting, so evals can cover the approved and denied paths. `--script` also accepts an eval case object, and script errors list the valid shapes. The `create-plico` scaffold now writes an `AGENTS.md` and `CLAUDE.md` for coding agents and prints the docs link.
- 102dea6: A server that rejects the reasoning text Plico replays after a tool call (Groq does) now gets one retry without it, so tool calls work. A provider rejection (HTTP 4xx) now ends with the provider's own message, such as an unknown model name. New Google projects use `gemini-3.5-flash`, because `gemini-2.5-flash` returns 404.
- c5f5a13: `agent.md` frontmatter is now parsed as YAML, so nested values work, and invalid YAML is a `plico validate` error. `agent.md` and `plico.config.ts` accept optional `input` and `output` JSON Schemas, and `plico validate` rejects a schema that is not valid. Runs do not enforce them yet.
- c6d5eb9: In a run with a real model, an unknown tool, invalid tool arguments, or a throwing tool handler is now returned to the model as the tool result (`{ "error": "..." }`) so it can correct the call, instead of ending the run. A run allows 2 such failures; the third fails it as before. This makes small local models, which often send numbers as strings, usable. Scripted runs are unchanged.
- 0ab0e80: Breaking: tool `inputSchema` supports Zod 4 and JSON Schema only. A Zod 3 schema is rejected with a message that says so. Projects on `zod` 3.25 can switch to `import { z } from "zod/v4"` without upgrading the package.
- Updated dependencies [9b529c9]
- Updated dependencies [c5f5a13]
- Updated dependencies [73426c2]
- Updated dependencies [0ab0e80]
  - @plico-ai/core@0.1.2
  - @plico-ai/contracts@0.1.2

## 0.1.1

### Patch Changes

- @plico-ai/contracts@0.1.1
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
  - @plico-ai/contracts@0.1.0
  - @plico-ai/core@0.1.0
