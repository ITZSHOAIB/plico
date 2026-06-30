# Plico Agent

Plico is a TypeScript-first agent app kit: a folder of Markdown instructions, skills, TypeScript tools, config, evals, memory, and artifacts becomes a runnable, inspectable agent app.

Keep the public mental model file-first and local-first. Do not let LangGraph, Mastra, OpenAI Agents SDK, or provider-specific shapes leak into the v1 project contract.

## Current Scope

Phase one is deliberately narrow: scaffold and validate Plico projects.

- Build on `pnpm`, ESM-only TypeScript, `tsc`, and Vitest.
- Keep `plico.config.ts` as the project anchor.
- Required project files/directories are `agent.md`, `skills/`, `tools/`, `evals/`, `artifacts/`, and `memory/`.
- Current packages are `@plico/core`, `@plico/cli`, and `create-plico`.
- `@plico/core` owns `loadProject(root)` and `validateProject(root)`.
- `@plico/cli` currently exposes `plico validate [path]`.
- `create-plico` creates the internal-ops pilot scaffold.

Do not add runtime execution, Studio, server APIs, persistence, AG-UI, React UI, provider calls, approvals, or artifact semantics unless the work explicitly enters that phase.

## Product Direction

Future Plico should own the project model, linear v1 runtime, canonical event log, Studio, API adapters, AG-UI mapping, React kit, persistence, approvals, artifacts, evals, and readiness checks.

Treat these as direction, not current implementation license. Add public contracts slowly and version them explicitly.

## TDD Rule

Use small vertical slices:

`RED -> GREEN -> REFACTOR`

- Write one failing behavior test through a public surface.
- Implement only enough code to pass.
- Refactor only while green.
- Prefer observable outputs: files, diagnostics, exit codes, validation results.
- Avoid tests that assert private helpers, internal class names, or duplicated implementation logic.

## Design Rules

- Preserve noninteractive CLI paths for scripts; interactive prompts are a fallback or enhancement.
- Keep package boundaries clear: core has contracts, CLI has command behavior, create package writes scaffolds.
- Prefer simple public interfaces over broad framework abstractions.
- Add dependencies only when they improve developer workflow or remove real maintenance cost.
- Keep generated projects valid through `validateProject`.

## Verification

Run the narrowest useful check first:

- `pnpm exec vitest run <test files>` for focused behavior.
- `pnpm --filter <package> build` for changed packages.
- `pnpm test` or root build only when cross-package behavior changed.
