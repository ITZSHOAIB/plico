# @plico-ai/server

The thin native HTTP API over the Plico runtime and event store: runs, threads, signals, approvals, cancel, artifacts, events and readiness.

Embed it in your own Node backend with `createPlico({ projectRoot, databasePath })`, which returns `threads`, `runs` (including `runs.events()`, an async iterator over a run's events), `approvals` and `close()`. Files define the agent; the library only runs it. `plico.fetch()` and `plico.node()` mount the `/v1` API in Express, Hono, Next.js and similar hosts, with a per-request `scope` and `context`. `servePlico` is `createPlico` plus an HTTP listener.

Threads and runs take a host `metadata` JSON object at creation (immutable; lists filter by exact match on top-level keys). A run takes a `context` that tools read as `ctx.context`; it is recorded on `run.started`, so it must not carry secrets. See `docs/threads.md`.

Start the HTTP server with `plico serve [path]` from [`@plico-ai/cli`](../cli). It binds to loopback by default and rejects cross-origin and DNS-rebinding requests unless `--allow-remote` is set. Run requests that carry a `script` are refused with 403 `run.script_disabled` unless `--allow-script` (`allowScript: true`) is set.

Requires Node `>=22.18`. Wire types come from `@plico-ai/contracts`.

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
