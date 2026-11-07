# @plico/server

The thin native HTTP API over the Plico runtime and event store: runs, threads, signals, approvals, cancel, artifacts, events and readiness.

Start it with `plico serve [path]` from [`@plico/cli`](../cli). It binds to loopback by default and rejects cross-origin and DNS-rebinding requests unless `--allow-remote` is set.

Requires Node `>=22.13`. Wire types come from `@plico/contracts`.
