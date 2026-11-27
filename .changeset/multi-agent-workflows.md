---
"@plico-ai/contracts": patch
"@plico-ai/sdk": patch
"@plico-ai/core": patch
"@plico-ai/runtime": patch
"@plico-ai/server": patch
"@plico-ai/cli": patch
"create-plico": patch
---

Projects can add specialist agents in `agents/` that a supervisor calls through `delegate_<id>` tools, and TypeScript workflows in `workflows/` that call agents with `agent()` and `step()`. Each call is a child run with its own events: approvals route to the root run, cancelling the root cancels the tree, and token usage adds up in the parent. Select an agent or workflow with `plico run --agent/--workflow` or `POST /v1/runs`, bind a thread to an agent, and see child runs in Studio. `create-plico` scaffolds a researcher and a draft, review and revise workflow.
