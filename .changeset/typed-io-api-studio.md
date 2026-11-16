---
"@plico-ai/contracts": patch
"@plico-ai/core": patch
"@plico-ai/runtime": patch
"@plico-ai/server": patch
"@plico-ai/cli": patch
---

Expose typed run schemas and results: `GET /v1/schemas` returns the agent's `input` and `output` schemas as JSON Schema (also on scoped mounts), run summaries from `GET /v1/runs` and `GET /v1/runs/<run-id>` include `structuredOutput`, and Studio shows the declared schemas under Instructions and the validated result in the run inspector.
