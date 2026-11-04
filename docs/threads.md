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
Without a configured provider the endpoint stores a message without starting a run.

If a server stops after reserving a run but before starting it, startup resumes
it only for the same project and provider identity. A mismatched identity leaves
the message queued rather than sending its content to a different account.

Hosts using `createPlicoServer` can enable these routes by passing a
`threadStore` from `createSqliteThreadStore({ databasePath })`. If no thread
store is supplied, thread routes return a `threads.unavailable` error.
The host owns an injected thread store and must call its `close()` method when
it is no longer needed. `servePlico` owns its thread store and closes it when
the server shuts down.
