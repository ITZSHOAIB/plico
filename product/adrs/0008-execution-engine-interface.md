# Run durable execution through a Plico engine interface

Status: accepted (2026-11-02), not yet built; delivered by epic #95

Runs must survive a restart and may wait for days on an approval. Plico runs its own loop on a small engine interface. The loop calls `ctx.step(name, fn, { retries })` and `ctx.wait(name, { timeoutMs })`. The host calls `start`, `run`, `signal`, `cancel` and `status`. A step's result is recorded once and replayed after a crash, and a wait survives a restart.

The local engine is Plico's own, on SQLite. The production engine is DBOS on Postgres, as an optional adapter. No engine type appears in the project contract, the events or the public API. Subagents are not part of v1, so the interface has no spawn or send; a later ADR adds them. The evidence is in `product/audits/0005-reuse-or-build-layers.md`: PoC 1 (durable execution), PoC 2 (crash recovery with real failures) and the "PoC 13 results" section (the 14 shared scenarios, several workers, load).

## Considered Options

- Own engine locally, DBOS in production, behind one interface. Chosen. Both passed the same 14 scenarios, and the interface keeps a vendor change from reaching users.
- Own engine only. Fine on one machine, but it has no fencing of stale workers, has not run on Postgres, and growing it into a second production engine is the largest maintenance cost on offer.
- DBOS only. It needs Postgres even for the first local run, which breaks the local-first path. It ran on embedded Postgres in the PoCs, but that is a 107 MB binary. PGlite lost writes when two processes opened the same folder (audit PoC 4), so it cannot be the local store.
- Workflow SDK as the core. Its default lease was 860 s, so recovery from a crash mid-step was slow; a 5 s setting fixed that. It also needs a compile step and installs at 226 MB. It may be added as an adapter later if it passes the same scenarios; so may Temporal.

## Consequences

**The event log and the engine journal do different jobs.** The native event log stays the source of truth for what happened: replay, audit, Studio, evals, stream resume and every adapter (ADR 0002). The engine's journal only decides where execution resumes. Events are written by `(stream, sequence)`, so an event written again after a crash changes nothing. This needs the idempotent append that ADR 0007 requires and that is not built yet. A run that fails must write a terminal `run.failed` event, or its log just stops and Studio shows nothing.

**Every step runs at least once.** Both engines are at-least-once for anything in flight, and neither engine fences a stale worker. A tool with a side effect receives an idempotency key that Plico derives as `runId:turn:callIndex`, because the model provider may not return call IDs. A step with `retries: 0` can still repeat after a crash, as PoC 2 and PoC 13 recorded.

**Waits are named per request.** Each approval uses one wait name, built from its request ID. A wait ends with a decision or a timeout, and a timeout is reported separately from a denial. The first decision wins, and a late one changes nothing. Cancel resolves the wait as cancelled and aborts a running step through an abort signal.

**Production needs a takeover owner.** DBOS recovers only runs owned by its own worker ID, so a surviving worker does not take over a dead peer's runs. The deployer gives each worker a unique, stable ID and restarts it automatically. Two processes must never share one ID, since that repeated a side effect in testing.

**Runs in flight do not survive a code change.** DBOS will not recover a paused run on a new code version, and the own engine has no answer yet. Step names are therefore part of what is saved. Epic #95 owns a versioning rule before the first publish.

**Model calls make no retries of their own.** The model adapter sets provider retries to zero and the engine retries the step, so retries are counted once. A real provider outage used up DBOS's default retries after side effects had run (PoC 2), so the model step needs backoff and a retry budget set by Plico config. Tool retries also come from Plico config, and a side-effect tool defaults to none.

**The own engine's lease is a trade-off.** The lease is the time a worker holds a step before another worker may claim it. A worker that stalls past it repeats its step. The default is 30 s, renewed every 10 s while a step runs, and it is a config setting. The own engine is supported for single-machine local use only.

**Where it lives.** The interface and the own engine live in `@plico/runtime` under `engine/`. The engine's tables are private to it, prefixed `engine_`, in the same database file. A separate package waits for the DBOS adapter (#82).

**Code changes fail loudly.** The journal stores step names. If a resumed run's steps no longer match, the run ends as `run.failed` with the reason that the project changed during the run. It never replays against different code.

**Recovery replaces the interim killed-run handling.** A killed run resumes from its journal at the next start. Only a run that cannot be recovered is marked failed.
