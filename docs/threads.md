# Threads

`plico serve` stores threads and user messages in the same SQLite database as
runs. Create a thread with `POST /v1/threads`, list threads with
`GET /v1/threads`, and read one at `GET /v1/threads/:id`. Post a message as
`{ "content": "Hello" }` to `POST /v1/threads/:id/messages`, and read its
history with `GET /v1/threads/:id/messages`. Creation returns HTTP 201.

Thread creation and messages are persisted as native thread events, with their
read projections committed in the same transaction. Sending a message currently
stores it; provider execution from a thread is a later slice of epic #71.

Hosts using `createPlicoServer` can enable these routes by passing a
`threadStore` from `createSqliteThreadStore({ databasePath })`. If no thread
store is supplied, thread routes return a `threads.unavailable` error.
The host owns an injected thread store and must call its `close()` method when
it is no longer needed. `servePlico` owns its thread store and closes it when
the server shuts down.
