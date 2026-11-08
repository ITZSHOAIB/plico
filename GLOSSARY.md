# Plico

Plico turns a folder of Markdown instructions, skills, TypeScript tools, and config into a runnable, inspectable agent app. This glossary covers the language of that project model and its runtime.

## Language

**Terminal run**:
A run that has finished for good, as completed, failed, or cancelled. A waiting run is not a terminal run.
_Avoid_: Ended run, closed run

**Waiting run**:
A run that has stopped executing because it needs something from outside, recorded durably so no process has to hold it. The reason it is waiting is recorded separately from its status.
_Avoid_: Blocked run, paused run, suspended run

**Engine**:
The part that runs a run's loop durably. The loop calls `step` and `wait` on it and never learns which engine is behind it. Plico's own engine uses SQLite. No engine type appears in the project contract, the events or the API.
_Avoid_: Workflow runner, orchestrator

**Step**:
One named unit of work in a run, such as a model call or a tool call. Its result is recorded once and replayed after a crash. A step runs at least once, so a step with side effects needs an idempotency key.
_Avoid_: Task, action

**Journal**:
The engine's private record of finished steps and open waits. It decides where a run resumes. It never says what happened; the event log does.
_Avoid_: History, checkpoint

**Lease**:
The time a worker holds a step before another worker may claim it. A worker that stalls past the lease repeats its step.
_Avoid_: Lock, heartbeat timeout

**Run replay**:
A Studio view of a run at a chosen event in its recorded sequence, showing only what was known up to that point. It does not mean the engine replaying recorded steps after a crash.
_Avoid_: Step replay, engine replay

**Host**:
The backend application that embeds Plico by importing `createPlico`. It owns users, login, permissions and routes; Plico owns the agent's threads, runs, events and artifacts.
_Avoid_: Client app, consumer

**Embedded mode**:
Running Plico inside the host's process, through the programmatic API or the mounted `/v1` handlers, instead of as a separate `plico serve` process. The host's own authentication replaces the loopback-only rule.
_Avoid_: In-process server, SDK mode

**Scope**:
The JSON the host computes per request on the mounted API. Plico stamps it on new threads and runs and filters every read and action by it. It is not a permission system; the host decides what the scope is.
_Avoid_: Tenant, user, permission

**Metadata**:
A JSON map the host attaches to a thread or run at creation. It is immutable and can be filtered by exact match on top-level keys.
_Avoid_: Tags, labels

**Context**:
JSON the host passes with a call. Tools read it as `ctx.context`, and it is recorded with the run. It must not carry secrets.
_Avoid_: Auth context, session
