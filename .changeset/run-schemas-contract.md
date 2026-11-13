---
"@plico-ai/contracts": patch
"@plico-ai/core": patch
"@plico-ai/runtime": patch
---

`agent.md` frontmatter is now parsed as YAML, so nested values work, and invalid YAML is a `plico validate` error. `agent.md` and `plico.config.ts` accept optional `input` and `output` JSON Schemas, and `plico validate` rejects a schema that is not valid. Runs do not enforce them yet.
