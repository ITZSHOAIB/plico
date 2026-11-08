# Run Plico inside the host's backend

Status: accepted (2026-11-08), implemented by epic #161. Research: `product/audits/0016-library-first-embedding.md`.

Plico is a library a Node backend imports. `plico serve` stays the local and sidecar path. The main production path is `createPlico` inside the host's process, so the host can pass identity to tools without a network hop.

## Files define the agent; code only runs it

The programmatic API accepts a project folder and per-call data. It rejects agent definitions.

| Allowed | Rejected |
|---|---|
| `projectRoot`, `databasePath` | instructions, tools, skills, model overrides, agent definitions in code |
| per-call data: message text, `metadata`, `context`, `scope`, cursors | anything that changes what the agent is |

`plico validate`, `plico eval` and Studio therefore see the whole agent without starting the host app.

## Agent state and app state

Plico owns agent state: threads, runs, events, approvals, artifacts. The host owns app state: users, login, permissions, routes. Plico has no user model. The host enforces access; Plico stores and filters by the `scope` and `metadata` the host supplies.

## The `createPlico` surface

`createPlico({ projectRoot, databasePath })` from `@plico/server` opens the stores, engine and provider, recovers interrupted runs, resumes queued ones, and returns:

- `threads`: `create`, `get`, `list`, `rename`, `messages`, `send`.
- `runs`: `start`, `get`, `list`, `cancel`, `events`. _Proposed:_ `start({ script })` exposes the dry-run script to host code, which can drive tool handlers without a model; `servePlico` keeps it behind `allowScript`. `events(runId, { after, signal })` is an async iterator over the event log from a cursor. The SSE route is a writer over the same iterator.
- `approvals`: `decide(runId, requestId, approved)`. _Proposed shape:_ it wraps the approval signal that `POST /v1/runs/:id/signal` already carries. Settle it with the other approval work. _Proposed:_ export the `PlicoError` class so hosts can narrow on `code`.
- `close()`: ends open event iterators, stops recovery from starting more work and closes the thread store. The SQLite event store and engine expose no `close()` yet; adding one belongs with production storage (#82).

`servePlico` and `plico serve` are `createPlico` plus `listen`. The `/v1` routes call the same layer as the library, so the two cannot drift. `createPlicoServer` is removed before the first publish, with no alias. Stores, engine, provider and recovery keys are not public. Tests that need a scripted model use an internal factory.

HTTP-only options (`allowScript`, `allowRemote`, `publicOrigin`, `studioPath`) belong to the listener, not to `createPlico`.

`plico.node()` and `plico.fetch()` mount the `/v1` API in a host (later slice). They take `scope` and `context` functions of the request.

## `scope`, `metadata` and `context`

- **`scope`** is computed by the host per request on the mounted API. Plico stamps it on new threads and runs and adds it as a filter to every read and action. A client cannot widen it.
- **`metadata`** is a JSON map on threads and runs. It is set at creation, immutable, and filtered by exact match on top-level keys. The programmatic API takes it directly; the mounted API takes it only from `scope`.
- **`context`** is JSON the host passes per call. Tools read it as `ctx.context`. It is recorded on `run.started`, so recovered and queued runs reuse it, and `approval.decided` records the context of whoever decided. It must not carry secrets.

## Studio

Studio is a local development tool. It runs separately, is never mounted inside the host app, and is not deployed against production data. Studio beside a host on the same database is inspection-only: it never recovers, starts, cancels or approves runs. Production runs reach Studio through export (#82); OpenTelemetry is the production observability path.

## Consequences

- Wire and store additions (`metadata`, `context`, `scope`) follow ADR 0006 and update the contract snapshot deliberately. The first slices change no wire shape.
- The shared layer throws coded errors (`thread.not_found`, `thread.busy`); one table in the server maps codes to HTTP statuses, so wire codes stay identical.
- Framework-neutral `node` and `fetch` handlers come first. A per-framework package waits for users to ask.
- The Hono move (ADR 0009) lands in this epic, behind the existing `/v1` routes.
