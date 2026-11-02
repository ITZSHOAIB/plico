# Normalize tools, approvals, MCP, and memory behind Plico-owned contracts

Status: accepted

TypeScript tools will export declared tool objects with name, description, input schema, capabilities, approval policy, and handler. Approval requirements will be decided by a runtime policy engine, MCP servers will be normalized as tool sources, and memory will use a Plico-owned port with explicit Markdown files by default. SQLite full-text retrieval is the first optional addition and Mem0 the second. Every tool handler receives an idempotency key derived as `runId:turn:callIndex`, because a step can run again after a crash (ADR 0008). MCP tools are at-least-once for the same reason, and their approval comes from Plico config, never from server annotations.

## Considered Options

- Declared tool objects plus runtime approval policy.
- Function-inferred tools.
- Tool-internal approval prompts.
- MCP-first tools.
- Mem0 as required default memory, or as the first optional adapter. Superseded by the audit: explicit Markdown wins on inspectability and portability.

## Consequences

Studio, APIs, React UI, readiness checks, and audit logs can reason about tools before side effects happen. MCP expands the tool ecosystem without replacing Plico's TypeScript file-first tool story, and memory stays separate from chat persistence instead of becoming hidden long-term state.
