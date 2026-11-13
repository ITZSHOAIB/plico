---
"@plico-ai/core": patch
"@plico-ai/server": patch
"@plico-ai/cli": patch
---

An agent with an `input` schema now takes typed input. `POST /v1/threads/:id/messages` and `plico.threads.send` accept `input`, and `plico run` accepts `--input` or `--input-file`. A missing or invalid value is rejected before any run starts: HTTP 400 `input.invalid` with each problem listed, or exit code 1 on the CLI.
