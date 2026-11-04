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

Hosts using `createPlicoServer` can enable these routes by passing a
`threadStore` from `createSqliteThreadStore({ databasePath })`. If no thread
store is supplied, thread routes return a `threads.unavailable` error.
The host owns an injected thread store and must call its `close()` method when
it is no longer needed. `servePlico` owns its thread store and closes it when
the server shuts down. Hosts using `createPlicoServer` should call and await the
returned `recover()` method at startup, supplying stable provider recovery and
account keys in the server options when using a provider. Readiness reports a
thread and run store mismatch before a run is started.
