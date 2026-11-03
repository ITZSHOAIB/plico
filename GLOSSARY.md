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
A view of a run at a chosen point in its recorded event sequence. Earlier points show only what was known up to that event.
