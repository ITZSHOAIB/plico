# @plico-ai/runtime

The Plico runtime: linear agent runs, the durable SQLite event log, tool execution, scripted and provider-backed models, evals, artifacts, approvals and readiness checks.

Most projects use it through [`@plico-ai/cli`](../cli). Import it directly to embed runs in your own process:

```ts
import { loadProject } from "@plico-ai/core";
import { runProject } from "@plico-ai/runtime";
```

Requires Node `>=22.18`. Wire types come from `@plico-ai/contracts`.
