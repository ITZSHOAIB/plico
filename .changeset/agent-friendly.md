---
"@plico-ai/runtime": patch
"@plico-ai/cli": patch
"create-plico": patch
---

Scripts can decide approvals: an `approval.decide` step (`approved: true` or `false`) right after a gated `tool.call` records the decision instead of waiting, so evals can cover the approved and denied paths. `--script` also accepts an eval case object, and script errors list the valid shapes. The `create-plico` scaffold now writes an `AGENTS.md` and `CLAUDE.md` for coding agents and prints the docs link.
