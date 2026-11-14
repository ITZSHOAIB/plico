# @plico-ai/cli

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
