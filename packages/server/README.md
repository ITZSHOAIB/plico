# @plico/server

The thin native HTTP API over the Plico runtime and event store: runs, threads, signals, approvals, cancel, artifacts, events and readiness.

Embed it in your own Node backend with `createPlico({ projectRoot, databasePath })`, which returns `threads`, `runs` (including `runs.events()`, an async iterator over a run's events), `approvals` and `close()`. Files define the agent; the library only runs it. `servePlico` is `createPlico` plus an HTTP listener.

Start the HTTP server with `plico serve [path]` from [`@plico/cli`](../cli). It binds to loopback by default and rejects cross-origin and DNS-rebinding requests unless `--allow-remote` is set. Run requests that carry a `script` are refused with 403 `run.script_disabled` unless `--allow-script` (`allowScript: true`) is set.

Requires Node `>=22.18`. Wire types come from `@plico/contracts`.
