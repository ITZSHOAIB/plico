# @plico-ai/cli

CLI entrypoints for validating Plico projects and running the deterministic dry runtime.

## Commands

- `plico validate [path]`
- `plico validate --json [path]`
- `plico run --dry [path]`
- `plico run --dry --json [path]`
- `plico run --dry --script <file> [path]`
- `plico cancel <runId> [--db <path>] [--json] [path]`

`plico validate` keeps its current behavior. `plico run` is dry-run only in this release and uses the local runtime package for deterministic instruction composition, tool discovery, scripted tool execution, and approval blocking.


## Durable runs

`plico run --dry --persist` resumes eligible interrupted runs in the selected database as it starts the requested run. It waits for each recovered execution to finish or reach a wait, reports recovery results on stderr, and uses the requested run's exit code. A waiting run needs a running host or a later persistent start to continue. `plico serve` adopts eligible runs at startup as well.

Set the optional host execution lease in `plico.config.ts`:

```ts
export default {
  schemaVersion: 1,
  name: "my-agent",
  execution: { leaseMs: 30_000 },
} as const;
```

The lease defaults to 30,000 ms and must be a positive integer. The host's setting applies to every run it recovers from its database. A short lease increases the chance that a stalled step runs again; side-effecting tools should use their idempotency key.

`plico cancel <runId> [path]` requests durable cancellation of a persisted run. The
run's worker records the terminal cancellation event; if no worker is active, the
next recovery pass finalizes it. `--db <path>` selects a non-default database and
`--json` prints the cancellation result.
