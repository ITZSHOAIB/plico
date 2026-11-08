# Threads

`plico serve` stores threads and user messages in the same SQLite database as
runs. Create a thread with `POST /v1/threads`, list threads with
`GET /v1/threads`, and read one at `GET /v1/threads/:id`. Post a message as
`{ "content": "Hello" }` to `POST /v1/threads/:id/messages`, and read its
history with `GET /v1/threads/:id/messages`. Creation returns HTTP 201.

Thread creation and messages are persisted as native thread events, with their
read projections committed in the same transaction. When a provider is configured,
posting a message reserves and starts a run and returns its `runId`. Only one run
per thread may be active; a concurrent message receives `thread.busy` (HTTP 409).
The run uses earlier thread messages as conversation history, and its successful
answer is recorded as an assistant message. Stream run events at
`GET /v1/runs/:runId/events/stream`; reconnect with `Last-Event-ID` or `?after=`.
Without a configured provider the endpoint returns an actionable error. To store
a message without starting a run, explicitly include `"startRun": false`.

Run `plico serve --studio` and select **Chat** to create or reopen a thread,
send messages, follow the reply, and inspect the associated run's timeline and
events. Studio reconnects to active runs using their event cursor. Configure a
model provider for the project before sending messages from the playground.

If a server stops after reserving a run but before starting it, `servePlico`
resumes it only for the same project and provider account. A model change alone
does not prevent recovery. A mismatched account leaves the message queued rather
than sending its content to a different account.

A host that embeds Plico calls `createPlico({ projectRoot, databasePath })` from
`@plico/server`. It opens the thread store, run store, engine and provider from the
project and the database path, recovers interrupted runs, resumes queued ones, and
returns `plico.threads` (create, get, list, rename, messages, send), `plico.runs`
(start, get, list, cancel, events) and `plico.approvals`. Call `await plico.close()`
before the process exits; it stops open event iterators and closes the thread store.
`servePlico` is `createPlico` plus an HTTP listener and closes Plico when the server
closes. Readiness reports a thread and run store mismatch before a run is started.

## Host data: metadata and context

Plico has no user model; a host that serves users passes data and enforces access.

`metadata` is a JSON object set at creation and never changed:
`plico.threads.create({ metadata })`, `plico.runs.start({ metadata })`, or the `metadata`
body field of `POST /v1/threads` and `POST /v1/runs`. A thread's runs carry its metadata.
Lists filter by exact match on top-level keys: `plico.threads.list({ metadata })`,
`plico.runs.list({ metadata })`, or `?metadata=<url-encoded JSON>` on `GET /v1/threads` and
`GET /v1/runs`. A value that is not a JSON object is rejected with `request.invalid`.

`context` is JSON for one run, passed to tools as `ctx.context` and recorded on `run.started`,
so recovered and queued runs reuse it. Set it with `plico.threads.send(..., { context })` or
`plico.runs.start({ context })`; the HTTP API does not accept it. It lives in the event log, so
it must not carry secrets. `plico.approvals.decide(runId, requestId, approved, { context })`
records the deciding context on `approval.decided`; approval signals sent over HTTP have any
`context` dropped.
