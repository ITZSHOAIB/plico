# @plico-ai/core

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
