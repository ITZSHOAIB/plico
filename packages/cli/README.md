# @plico-ai/cli

The `plico` command: validate a project, run it with a scripted or real model, inspect saved runs, run evals and readiness checks, and serve the HTTP API and Studio.

```sh
npm install --save-dev @plico-ai/cli
npx plico validate
```

## Commands

- `plico validate [path]`
- `plico run [--message <text>] [path]` runs the agent with its configured model
- `plico run --dry [--persist] [--script <file>] [path]` runs with a scripted model, no key needed
- `plico runs [path]` and `plico events <runId> [--after <sequence>] [path]`
- `plico cancel <runId> [path]`
- `plico eval [path]` and `plico readiness [path]`
- `plico serve [--studio] [--inspect] [path]`

Most commands take `--json` and `--db <path>`. `plico --version` prints the version. The full reference is at [plico.sohab.dev/docs/cli](https://plico.sohab.dev/docs/cli).

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

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
