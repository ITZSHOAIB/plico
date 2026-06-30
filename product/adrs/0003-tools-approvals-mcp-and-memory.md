# Normalize tools, approvals, MCP, and memory behind Plico-owned contracts

Status: accepted

TypeScript tools will export declared tool objects with name, description, input schema, capabilities, approval policy, and handler. Approval requirements will be decided by a runtime policy engine, MCP servers will be normalized as tool sources, and memory will use a Plico-owned port with lightweight explicit local memory by default and Mem0 as the first optional advanced adapter.

## Considered Options

- Declared tool objects plus runtime approval policy.
- Function-inferred tools.
- Tool-internal approval prompts.
- MCP-first tools.
- Mem0 as required default memory.

## Consequences

Studio, APIs, React UI, readiness checks, and audit logs can reason about tools before side effects happen. MCP expands the tool ecosystem without replacing Plico's TypeScript file-first tool story, and memory stays separate from chat persistence instead of becoming hidden long-term state.
