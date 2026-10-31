# Organize the event log into run and thread streams

Status: accepted, partially implemented

Some events happen outside a run: a thread can exist, and a user message can arrive, before any run starts. Plico keeps one event log, as ADR 0002 requires, and files every event under a stream identified by `streamType` and `streamId`, with `sequence` counted per stream. Thread streams hold `thread.created` and `message.created`, so threads get the same ordered, resumable history as runs without a fake run or separate tables.

## Considered Options

- Log streams, chosen for the reasons above.
- A nullable `runId`. Every reader would handle the missing value, and non-run events would have no natural sequence.
- Everything inside a run. `POST /v1/threads` would need a fake run.
- Separate thread tables. This contradicts ADR 0002.

## Consequences

Run events keep `runId`, so run consumers are unaffected. Runs do not need a thread: `threadId` is recorded on `run.started` only for runs started from one, which leaves CLI dry runs and evals standalone.

The log also stores a global `position` for total order across streams. It stays internal, and public cursors remain per stream. SQLite requires the auto-incrementing `position` to be the primary key, so `(stream_type, stream_id, sequence)` is a unique constraint.

Assistant replies are copied into the thread stream as `message.created` at run end with a `runId` link, so reading a transcript does not require replaying runs. The copy is derived data, live streaming stays on the run stream, and a failed or cancelled run writes no assistant message.

Memory events stay inside run streams. Manual edits to `memory/` are not events, because the files are the source of truth for them.

## Implementation Status

The log has its final shape: `streamType`, `streamId`, per-stream `sequence` and `position` are in place, but `run` is the only stream type. Thread streams, `message.created`, `threadId` on `run.started` and copied assistant replies arrive with #71.

Persisting a run replaces its events, so re-persisting one would move them to the end of `position`. No code does this today: run ids are unique and each run is persisted once, and nothing reads `position` yet.
