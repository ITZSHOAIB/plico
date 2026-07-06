# Plan 0005: Studio Workbench, Artifacts, Native Streams, Trace Evals, and Readiness

## Summary

Plan 0005 builds the first visible local workbench slice on top of the runtime, durable event log, and native HTTP API completed in Plan 0004.

The product outcome is that a developer can run or eval the internal-ops Plico project, persist and stream native events, inspect runs/tools/instructions/artifacts in a bundled local Studio, and run a local readiness check before handing the project to another agent or developer.

This is intentionally a large vertical slice. It should advance the PRD across Studio, artifacts, stream resume, evals, readiness, and the internal-ops demo path while preserving the v1 public mental model:

- file-first and local-first
- `plico.config.ts` remains the project anchor
- native Plico events remain the canonical source of truth
- Studio, evals, readiness, CLI, and server APIs derive from the same runtime contracts
- provider-specific, AG-UI, React embedding, auth, and production deployment concerns stay out of this phase

## Key Decisions

- Add a bundled `@plico/studio` package using Vite and React.
- Keep `@plico/studio` separate from a future public `@plico/react` embedding package.
- Serve Studio from `@plico/server` and wire it through `plico serve`, rather than generating Studio files into each Plico project.
- Add native SSE for Plico events before AG-UI mapping.
- Add a minimal v1 artifact workspace contract based on versioned virtual files and native artifact events.
- Add scripted trace evals before provider-backed evals or LLM judges.
- Add a local readiness report before production deployment adapters.
- Keep real provider execution deferred. The existing scripted dry runtime remains the execution surface for this plan.

## Runtime, Events, and Artifacts

Extend `@plico/runtime` with a minimal artifact workspace that is event-log primary:

- Add artifact event types:
  - `artifact.workspace.created`
  - `artifact.file.written`
  - `artifact.snapshot.created`
- Add public artifact workspace types for virtual files, snapshots, preview metadata, and workspace summaries.
- Store artifact workspace state under local Plico runtime state, not as uncontrolled writes into arbitrary project paths.
- Support text, Markdown, and JSON artifact previews.
- Keep binary artifacts, object storage, diffs, export flows, sandbox execution, and React preview rendering out of this plan.
- Persist artifact metadata and artifact events so artifact state survives process restart and can be replayed through the existing event log.

The artifact workspace should remain deliberately small, but it must be a real contract. Studio, server endpoints, eval replay, and readiness checks should all consume the same workspace model rather than each inventing local artifact behavior.

## Native Streaming and Server API

Extend `@plico/server` with native streaming and Studio/read-model endpoints:

- Add `GET /v1/runs/:runId/events/stream?after=<sequence>` for native Plico SSE.
- Replay stored events after the requested cursor before following live events when a run is active.
- Include heartbeat SSE events so browser clients can detect a live connection.
- Close naturally after terminal run states for completed, failed, or blocked runs.
- Preserve existing persisted event endpoints for replay and refresh.
- Return consistent JSON errors for malformed cursors, unknown run IDs, unknown artifact IDs, and unknown routes.

Add read endpoints for:

- project summary
- run list/detail/events
- artifact workspace, file, and snapshot reads
- eval summaries/results
- readiness report
- Studio static assets

The server remains a thin native HTTP API over runtime/storage/read-model contracts. Do not introduce a web framework in this plan unless the implementation demonstrates that the native server is actively blocking the slice.

## CLI, Studio, Evals, and Readiness

Extend `@plico/cli`:

- `plico serve [--studio] [--host <host>] [--port <port>] [--db <file>] [path]`
- `plico eval [--json] [--db <file>] [path]`
- `plico readiness [--json] [path]`

`plico serve --studio` should serve the bundled Studio and API together. If `--studio` is omitted, existing API serving behavior should remain usable.

`plico eval` should:

- discover `.script.json` fixtures under `evals/`
- execute them through the scripted dry runtime
- persist eval run traces
- report deterministic pass/fail results
- support JSON output for scripts and CI
- leave provider-backed evals, LLM judges, and external datasets out of scope

`plico readiness` should:

- reuse a single readiness implementation that can be surfaced by CLI, server, and Studio
- include project validation results
- inspect declared tools and schema-readiness problems
- report whether eval fixtures exist and whether recent eval results passed
- report whether the default or configured persistence path is writable
- report whether the artifact workspace can be initialized
- report whether server and Studio configuration is locally usable
- return machine-readable JSON in `--json` mode

Add `@plico/studio` as a dense local inspection workbench with screens for:

- project overview
- run timeline from persisted/native events
- raw event replay
- tool calls, tool results, and approval-required events
- composed instructions and skill source inspection
- artifact file browser and preview for text, Markdown, and JSON
- eval result summaries
- readiness report

The Studio should feel like a developer workbench, not a marketing page. The first screen should be useful immediately after `plico serve --studio`.

## Issue Breakdown

The implementation should be split into a small number of large tracer-bullet issues. Each issue should be demoable on its own and should cut through tests, runtime/server/CLI, and Studio where relevant.

Suggested issue order:

1. Bundled Studio shell and native event inspection.
2. Native SSE stream resume for run events.
3. Minimal artifact workspace with Studio preview.
4. Scripted trace eval runner with persisted results and Studio visibility.
5. Local readiness report across CLI, server, and Studio.

Every issue must follow strict TDD:

- RED: add one or more failing behavior tests through public surfaces.
- GREEN: implement the smallest complete vertical slice that passes.
- REFACTOR: clean up only while tests are green.

Tests should assert observable behavior such as CLI output, HTTP responses, persisted events, artifact records, eval summaries, readiness diagnostics, and Studio-renderable data. Avoid tests that lock onto private helpers or internal class boundaries.

## Test Plan

Runtime and persistence tests:

- artifact events are emitted in event order with stable run IDs, event IDs, timestamps, schema version, and payloads
- artifact metadata persists and replays after reopening SQLite
- eval run traces are persisted using the same native event model
- readiness can evaluate validation, tools, evals, persistence, artifacts, and server/Studio configuration without provider setup

Server tests:

- native SSE replays events after a cursor
- malformed cursors fail with JSON errors
- heartbeat and terminal stream behavior are observable
- artifact, eval, readiness, and Studio data endpoints return stable response shapes
- unknown runs, artifacts, evals, and routes return consistent errors

CLI tests:

- `plico serve --studio` serves Studio assets and the native API together
- `plico eval` discovers fixtures, runs them, persists traces, and returns nonzero on failed evals
- `plico eval --json` emits machine-readable result summaries without human text
- `plico readiness` reports actionable warnings/errors
- `plico readiness --json` emits machine-readable diagnostics

Studio tests:

- run timeline renders from persisted events
- tool calls/results and approval-required events are visible
- composed instructions and source list are visible
- artifact text, Markdown, and JSON previews render
- eval summaries and readiness report render from server data

Verification:

- `pnpm exec vitest run <focused test files>`
- `pnpm --filter @plico/runtime build`
- `pnpm --filter @plico/server build`
- `pnpm --filter @plico/cli build`
- `pnpm --filter @plico/studio build`
- root `pnpm test` when shared contracts or workspace config change

## Assumptions

- Node 24 remains the local baseline.
- Native Plico events remain the full-fidelity contract for Studio, persistence, replay, evals, artifacts, audit, and diagnostics.
- The first Studio is bundled and served by Plico; it is not generated into app projects.
- The first eval runner is scripted and deterministic.
- The first readiness report is a local ship check, not a production compliance or deployment certification system.
- The internal-ops example remains the flagship demo path.

## Explicit Deferrals

- Real model provider calls.
- Vercel AI SDK integration.
- AG-UI mapping.
- Public `@plico/react` package.
- Auth, rate limits, tenant model, and production deployment adapters.
- Postgres adapter.
- Binary artifact storage, full diffs, export flows, object storage, and sandboxed file execution.
