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

## Mount the API in your backend

`plico.fetch(options)` returns a web-standard `(request) => Promise<Response>` handler for Hono, Next.js route handlers, Bun and Deno. `plico.node(options)` returns a Node `(req, res)` handler for Express, Fastify and plain `http`; it reads a body the host already parsed into `req.body`, such as with `express.json()`. Both serve the `/v1` API. Run your own authentication first, then let `scope` keep each request to its own data:

```ts
const plico = await createPlico({ projectRoot, databasePath });

app.use("/plico", requireLogin, plico.node({
  scope: (req) => ({ userId: req.headers.get("x-user-id") ?? "" }),
  context: (req) => ({ actor: req.headers.get("x-user-id") ?? "" }),
}));
```

- `scope` is a JSON object the host computes per request. Plico stamps it on new threads and runs as their `metadata` and refuses every read and action on anything it does not match, with a `404`, including events, artifacts, cancel and approvals. A client cannot widen it or set its own `metadata`. A `scope` function that throws or returns anything but an object fails the request with a `500`.
- A scoped mount does not serve the project-level routes `/v1/project`, `/v1/instructions`, `/v1/eval`, `/v1/readiness` and `/v1/runs/dry`.
- `context` is host data for the runs a request starts. Tools read it as `ctx.context`, `run.started` records it, and an approval sent through the mounted API is recorded with it as `approval.decided.context`; a client cannot supply its own.
- `basePath` removes a mount path such as `/plico` before routing, for hosts that do not strip it. `publicOrigin` and `allowScript` work as on `servePlico`.
- A mounted API checks `Content-Type` and refuses cross-origin requests, but not the loopback `Host`. The host owns authentication and permissions.

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
