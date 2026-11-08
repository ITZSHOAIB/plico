# Plico Agent

Plico is a TypeScript-first agent app kit: a folder of Markdown instructions, skills, TypeScript tools, config, evals, memory, and artifacts becomes a runnable, inspectable agent app.

Keep the public mental model file-first and local-first. Do not let LangGraph, Mastra, OpenAI Agents SDK, or provider-specific shapes leak into the v1 project contract.

## Current Scope

The project contract, runtime spine, durable event log, native HTTP API, bundled Studio, scripted evals, and readiness checks exist. Delivery follows the epics in GitHub Issues, grouped by milestone. The plans in `product/plans/` are reference; where order differs, the epics win.

- Build on `pnpm`, ESM-only TypeScript, `tsc`, and Vitest.
- Keep `plico.config.ts` as the project anchor.
- Required project files/directories are `agent.md`, `skills/`, `tools/`, `evals/`, `artifacts/`, and `memory/`.
- Current packages are `@plico/contracts` (types only), `plico` (the `defineConfig` and `defineTool` authoring helpers, depending on contracts only), `@plico/core`, `@plico/runtime`, `@plico/server`, `@plico/cli`, `@plico/studio`, `@plico/docs` (the private docs site: Fumadocs on a Next.js static export, merged under `/docs` of the website build), and `create-plico`. Dependency direction: contracts <- plico <- core <- runtime <- server <- cli; studio depends on contracts only.
- `@plico/core` owns `loadProject(root)` and `validateProject(root)`.
- `@plico/cli` currently exposes `plico validate [path]`, `plico run --dry`, `plico runs`, `plico events`, `plico eval`, `plico readiness`, and `plico serve`.
- `@plico/server` owns the thin native HTTP API over the runtime and event store.
- `create-plico` creates the internal-ops pilot scaffold.

Build only what the current epic covers. Do not add real provider calls, threads, approvals, cancel, artifact semantics, MCP, memory, AG-UI, or React UI unless the work belongs to that feature's epic.

## Product Direction

Plico should own the project model, linear v1 runtime, canonical event log, Studio, API adapters, AG-UI mapping, React kit, persistence, approvals, artifacts, evals, and readiness checks.

Treat these as direction, not implementation license beyond the current epic. Add public contracts slowly and version them explicitly.

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
- Keep source files focused: one responsibility per module, roughly under 250 lines. Add commands, routes, readiness checks, and views as new modules and register them; do not grow dispatchers or `App.tsx`.
- Shared wire types live in `@plico/contracts`; never redefine them in a consumer.
- Wire changes follow `product/adrs/0006-wire-contract-versioning.md`. Update the snapshot in `packages/server/src/contract.test.ts` deliberately, never to silence a failure.
- Add dependencies only when they improve developer workflow or remove real maintenance cost.
- Keep generated projects valid through `validateProject`.
- For every implementation change, check `README.md` and the docs pages in `packages/docs/content/docs` for affected instructions, examples, and feature status. Update relevant pages in the same change so they match the implemented behavior.

## Verification

Run the narrowest useful check first:

- `pnpm exec vitest run <test files>` for focused behavior.
- `pnpm --filter <package> build` for changed packages.
- `pnpm check` runs lint, build, typecheck, and test (the CI gate). Build before typecheck: packages resolve each other through `dist`.
- `pnpm test` or root build only when cross-package behavior changed.
- Before raising a PR, all relevant tests must pass.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for ITZSHOAIB/plico, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md`, with ADRs in `product/adrs/`. See `docs/agents/domain.md`.
