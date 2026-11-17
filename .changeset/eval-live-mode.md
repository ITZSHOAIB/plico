---
"@plico-ai/runtime": minor
"@plico-ai/server": minor
"@plico-ai/cli": minor
---

`plico eval --live` runs eval cases against the configured model: each case's `input` is sent as `plico run --input` sends it, and the same `expect` checks and scorers run on the result, with `maxTokens` and `maxLatencyMs` now applied. A case's `mocks` give fixed tool results, and `--mock-tools` takes every tool result from the case's `.script.json` fixture so no handler runs. `trials: n` runs a case n times and passes only when every trial does. `--model <provider:model>` runs the suite on another model, `--max-tokens` caps the suite's tokens, starting no model call expected to pass the cap even under concurrency (exiting 1 when a case did not run), and `--concurrency` sets how many live runs go at once (4 by default). `runEvals` takes these as `live` and returns `tokenCapReached`; `runProject` takes `mockToolResult`. Live results are not stored as the project's eval report, and `POST /v1/eval` stays scripted.
