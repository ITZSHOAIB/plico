# Tools

Add TypeScript tool modules here when the project needs executable helpers.

Keep the public contract file-first until tools are explicitly required. This example includes `create_ticket.tool.ts` for the offline dry-run smoke path and provider runs. It creates a ticket ID from the call's idempotency key and stages a Markdown summary with `ctx.artifacts.write`.

A tool handler receives `(input, { signal, idempotencyKey, artifacts })`. A run that is interrupted can repeat the tool call that was in flight, so pass `idempotencyKey` to any API that takes one. The key is stable for a call (`runId:index` in a scripted run, `runId:turn:callIndex` with a provider), and `signal` aborts when the run is cancelled. `artifacts.write` stages the summary with the durable tool step.
