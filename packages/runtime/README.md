# @plico/runtime

The Plico runtime: linear agent runs, the durable SQLite event log, tool execution, scripted and provider-backed models, evals, artifacts, approvals and readiness checks.

Most projects use it through [`@plico/cli`](../cli). Import it directly to embed runs in your own process:

```ts
import { loadProject } from "@plico/core";
import { runProject } from "@plico/runtime";
```

Requires Node `>=22.13`. Wire types come from `@plico/contracts`.
