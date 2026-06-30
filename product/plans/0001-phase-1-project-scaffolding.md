# Phase 1 Plan: Project Scaffolding and Contract Baseline

## Summary

Build the initial Plico repository scaffold around the PRD's file-first promise: a developer can create a valid Plico project folder and validate it without any real model or runtime behavior yet. This phase is intentionally narrow for GPT mini implementation: TDD first, small packages, strict minimum contracts, and no Studio, server, React, or runtime expansion.

Resolved decisions:

- Use pnpm workspaces.
- Use the `@plico/*` package scope.
- Use `tsc` for package builds.
- Keep the workspace ESM-only.
- Use Vitest for tests.
- Use the internal-ops pilot template.
- Phase-one behavior is `create` plus `validate`.

## Implementation Changes

Create a TypeScript monorepo scaffold:

- Root workspace config: `package.json`, `pnpm-workspace.yaml`, shared TypeScript config, Vitest config, and `.gitignore`.
- Packages: `@plico/core`, `@plico/cli`, and `create-plico`.
- Sample app: `examples/internal-ops-agent`.
- Package builds emit ESM only and declarations from `tsc`, not `tsup`.

Implement the `@plico/core` contract first:

- Define the versioned project config shape anchored by `plico.config.ts`.
- Minimum valid project requires `schemaVersion: 1`, project name, `agent.md`, and declared standard folders: `skills/`, `tools/`, `evals/`, `artifacts/`, and `memory/`.
- Export `loadProject(root)` and `validateProject(root)` with structured diagnostics.
- Keep provider config optional and declarative only. Do not require API keys or real model calls in phase one.

Implement `create-plico`:

- Generate the internal-ops pilot project from fixtures.
- Output `plico.config.ts`, `agent.md`, standard folders, one Markdown skill, placeholder tool and eval files, and a README.
- Ensure generated output validates through `@plico/core`.

Implement `@plico/cli`:

- Provide `plico validate [path]`.
- Print human-readable diagnostics.
- Return a nonzero exit code for invalid projects.
- Do not add `run`, `studio`, `server`, or real provider commands yet.

## GPT Mini Work Slices

Split implementation into small, independently verifiable slices:

1. Root workspace/tooling plus empty package shells.
2. Core project schema and failing/passing validator tests.
3. Internal-ops template fixtures and create command tests.
4. CLI validate command and exit-code tests.
5. Example project validation and docs cleanup.
6. ESM-only package build cleanup and TypeScript strictness pass.

Each slice should start with tests that describe externally visible behavior, then implement the minimum code needed to pass.

## TDD Plan

Core validator tests:

- Valid internal-ops fixture passes.
- Missing `plico.config.ts` fails.
- Missing `agent.md` fails.
- Unsupported `schemaVersion` fails.
- Unknown or malformed required config fields fail clearly.

Create command tests:

- Creates expected files and folders.
- Does not overwrite an existing non-empty target without explicit force behavior.
- Generated project passes `validateProject`.

CLI tests:

- `plico validate examples/internal-ops-agent` exits `0`.
- Invalid temp project exits nonzero.
- CLI output includes actionable file/path diagnostics.

Workspace smoke tests:

- `pnpm test` runs all package tests.
- `pnpm build` builds core, CLI, and create package outputs.

## Assumptions

- Phase one does not implement runtime execution, event logs, persistence, AG-UI, Studio, React, approvals, artifact behavior, or real provider calls.
- The validator should be strict for the minimum project contract but avoid validating full PRD surfaces until those features enter implementation.
- `@plico/*` is used as the intended package namespace even though npm availability is not verified in this phase.
- Tooling should optimize for a small TypeScript framework monorepo rather than a large application workspace.
- TypeScript build settings should favor correctness over convenience: ESM-only output, strict optional property handling, and declaration emission from the compiler.
