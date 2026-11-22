# Normalize tools, approvals, MCP, and memory behind Plico-owned contracts

Status: accepted

TypeScript tools will export declared tool objects with name, description, input schema, capabilities, approval policy, and handler. Approval requirements will be decided by a runtime policy engine, MCP servers will be normalized as tool sources, and memory will use a Plico-owned port with explicit Markdown files by default. SQLite full-text retrieval is the first optional addition and Mem0 the second. Every tool handler receives an idempotency key derived as `runId:turn:callIndex`, because a step can run again after a crash (ADR 0008). MCP approval comes from Plico config, never from server annotations. The maintainer clarified crash policy on 2026-11-22: an MCP call whose intent is recorded but whose outcome is unknown fails on recovery by default. Only exact allowlisted tool names in a server's `replayOnCrash` config may repeat after a crash; those opted-in calls are at-least-once. Completed outcomes, including known failures, replay without making another remote call. This guard wraps MCP calls while the generic engine retains ADR 0008's at-least-once step semantics.

## Considered Options

- Declared tool objects plus runtime approval policy.
- Function-inferred tools.
- Tool-internal approval prompts.
- MCP-first tools.
- Mem0 as required default memory, or as the first optional adapter. Superseded by the audit: explicit Markdown wins on inspectability and portability.

## Consequences

Studio, APIs, React UI, readiness checks, and audit logs can reason about tools before side effects happen. MCP expands the tool ecosystem without replacing Plico's TypeScript file-first tool story, and memory stays separate from chat persistence instead of becoming hidden long-term state.
