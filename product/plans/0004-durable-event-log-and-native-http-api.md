# Plan 0004: Durable Event Log and Native HTTP API

## Summary

Plan 0004 builds the first durable backend slice for Plico: local SQLite persistence for native runtime events, replayable run history, and a thin native HTTP API over the runtime. This advances the PRD toward persistence, stream resume, API adapters, Studio, React, audit, and eval replay without adding real model providers, AG-UI, Studio, React, auth, artifacts, or chat/thread semantics yet.

Plans 0001 through 0003 remain aligned with the PRD dependency order:

- 0001 established the file-first project scaffold and validation baseline.
- 0002 hardened the local project contract around trusted `plico.config.ts` loading and script-friendly validation.
- 0003 introduced the provider-free runtime spine, declared TypeScript tools, scripted dry runs, approval blocking, and versioned native events.

0004 should take a larger PRD slice than storage alone. The concrete product outcome is that a developer can run the internal-ops agent, persist the native run event log, inspect prior runs from the CLI, and access the same persisted data through a local HTTP API.

## Key Decisions

- Add a new `@plico/server` package, but keep it thin. HTTP is a real boundary; it should not be folded into `@plico/runtime`.
- Keep `@plico/runtime` responsible for execution, event model, event store contracts, SQLite persistence, and replay reads.
- Keep `@plico/server` responsible for HTTP request parsing, route behavior, response envelopes, and status codes over runtime/storage APIs.
- Keep `@plico/cli` responsible for command-line wiring only.
- Do not add separate `@plico/storage`, `@plico/events`, API type, replay, or SQLite packages in this phase.
- Use built-in `node:sqlite` for the local SQLite adapter because the repo currently targets a modern Node runtime and should stay dependency-light.
- Persist only runs and native events in this phase. Threads, messages, artifacts, approvals, usage, and provider-specific model state remain future read models or storage extensions.

## Runtime and Persistence Changes

Extend `@plico/runtime` with an event-store contract and local SQLite implementation:

- Export an `EventStore` interface that can create/update run summaries, append native events, list runs, read one run, and read ordered events.
- Export `createSqliteEventStore({ databasePath })` as the default local persistence implementation.
- Add persisted run summary types such as `PersistedRun` and `RunSummary`.
- Extend `runProject(root, options)` to accept optional persistence:
  - `eventStore?: EventStore`
  - `runId?: string`
  - existing scripted dry-run options
- Generate unique run IDs by default instead of always returning `run-0001`; keep explicit `runId` support for deterministic tests.
- Persist completed, failed, and blocked runs with their native events.
- Support replay reads with an optional `afterSequence` cursor.

The SQLite schema should be versioned from the start:

- `plico_meta(key, value)`
- `runs(run_id, project_root, project_name, status, started_at, ended_at, output)`
- `events(run_id, sequence, event_id, schema_version, type, timestamp, payload_json)`

Events remain the canonical source of truth. The `runs` table is a small indexed summary projection for listing and lookup.

## CLI Changes

Extend `@plico/cli` while preserving existing behavior:

- `plico run --dry [path]` remains non-persistent unless `--persist` is passed.
- `plico run --dry --persist [--db <file>] [--script <file>] [path]` runs the dry runtime, persists the run and events, and prints the run ID.
- `plico runs [--json] [--db <file>] [path]` lists persisted run summaries.
- `plico events <run-id> [--json] [--after <sequence>] [--db <file>] [path]` prints ordered native events for a run.
- `plico serve [--host <host>] [--port <port>] [--db <file>] [path]` starts the native HTTP API over the project and persisted event store.

The default local database path is `<project>/.plico/plico.sqlite`. Add `.plico/` to `.gitignore` so runtime state does not become project source.

## Server Changes

Create `@plico/server` as a small package with a native JSON API:

- Export `createPlicoServer({ projectRoot, eventStore })`.
- Export `servePlico({ projectRoot, databasePath, host, port })`.
- Use Node's built-in HTTP server for the first implementation.
- Avoid framework dependencies until the API shape is proven.

Initial endpoints:

- `GET /health`
- `GET /v1/project`
- `POST /v1/runs/dry`
- `GET /v1/runs`
- `GET /v1/runs/:runId`
- `GET /v1/runs/:runId/events`
- `GET /v1/runs/:runId/events?after=<sequence>`

HTTP behavior:

- `POST /v1/runs/dry` accepts JSON `{ "script": [...] }`, validates the project, runs the provider-free dry runtime, persists the run and events, and returns the run result.
- Run list and run detail endpoints return persisted summaries.
- Event endpoints return ordered native events and support sequence-based replay through `after`.
- Error responses use `{ "error": { "code": string, "message": string } }`.
- Unknown routes return `404`.
- Malformed JSON and invalid script steps return `400`.
- Runtime validation failures return a successful HTTP transport response containing a failed run result if a run result exists.

This phase intentionally does not add live SSE. Replayable stored events are enough to prove the native API, event cursor, and persistence contract before active stream coordination exists.

## Issue Breakdown

The implementation should be split into a few large, independently useful tracer-bullet issues:

1. Durable native event log in `@plico/runtime`.
2. CLI-persisted dry runs and replay commands.
3. Thin `@plico/server` native HTTP API.
4. End-to-end internal-ops persistence and HTTP demo path.

Each issue should cut through public behavior and tests, not just one internal layer. The goal is a small number of substantial tasks that are clear enough for AFK implementation agents.

## Test Plan

Runtime and storage tests:

- Persist completed, failed, and blocked runs.
- Reopen a SQLite database and read runs/events back.
- Preserve event order, event IDs, schema version, timestamps, event type, and JSON payloads.
- Support `afterSequence` replay reads.
- Generate unique run IDs by default.
- Accept deterministic `runId` values in tests.

CLI tests:

- `run --dry --persist` writes the default database and prints the run ID.
- `--db <file>` overrides the default database path.
- `runs --json` lists persisted run summaries without human text.
- `events <run-id> --json` returns ordered native events.
- `events <run-id> --after <n>` returns only later events.
- Missing databases, malformed cursors, and unknown run IDs fail with actionable messages.
- `serve` wires project root, host, port, and database options into `@plico/server`.

Server tests:

- Health and project endpoints return expected JSON.
- Dry-run POST persists a run and its events.
- Run list, run detail, and event replay endpoints work from persisted data.
- `after` returns only events after the requested sequence.
- Malformed JSON, unknown run IDs, and unknown routes produce consistent JSON errors.

Example coverage:

- The internal-ops example can run the checked-in scripted dry run, persist it, and replay the stored events.
- The generated `create-plico` scaffold remains valid.

Verification:

- `pnpm exec vitest run <focused test files>`
- `pnpm --filter @plico/runtime build`
- `pnpm --filter @plico/server build`
- `pnpm --filter @plico/cli build`

## Assumptions

- Node 24 remains the local baseline for this phase.
- The native Plico event model remains the full-fidelity source of truth.
- The first server API is native Plico JSON only; AG-UI mapping comes later.
- Persistence is opt-in for existing CLI dry runs.
- No real provider calls, Studio, React, live SSE, auth, thread/message persistence, artifact persistence, approval resume, or deployment readiness checks are included in 0004.
