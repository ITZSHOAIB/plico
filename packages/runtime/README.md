# @plico-ai/runtime

The Plico runtime: linear agent runs, the durable SQLite event log, tool execution, scripted and provider-backed models, evals, artifacts, approvals and readiness checks.

Most projects use it through [`@plico-ai/cli`](../cli). Import it directly to embed runs in your own process:

```ts
import { loadProject } from "@plico-ai/core";
import { runProject } from "@plico-ai/runtime";
```

Requires Node `>=22.18`. Wire types come from `@plico-ai/contracts`.

## Discover MCP tools

`discoverMcpTools(project, { timeoutMs?, signal? })` connects to configured stdio and
Streamable HTTP sources and returns Plico tool metadata for their exact allowlists.
It closes clients, child processes and HTTP sessions before returning, including on
failure. It does not enable MCP tool execution in runs.

```ts
import { loadProject } from "@plico-ai/core";
import { discoverMcpTools } from "@plico-ai/runtime";

const tools = await discoverMcpTools(await loadProject("."));
```

Each result retains `serverId`, the original `toolName`, a `mcp:<server>/<tool>`
source, and Plico's `name`, `description`, `inputSchema`, `capabilities` and
`approval` fields. Names use `mcp_<server>__<tool>`; the tool portion is lowercased
and characters outside `[a-z0-9_]` become underscores. Ambiguous names are errors.
Capabilities are empty and approval metadata defaults to required; server hints
cannot waive it. Enforcement and explicit approval overrides ship with execution.

Discovery uses the project root as the stdio working directory. The official
client inherits its standard process environment plus the variables listed in
`env`; other host secrets are not passed. HTTP headers resolve `headersEnv` when
connecting. Call `loadProjectEnv(root)` first if your host wants to load `.env`.
Missing variables fail discovery and credential values are never returned in
metadata or error messages. HTTP redirects are rejected.

The default discovery deadline is 30 seconds per server. `timeoutMs` changes it;
`signal` cancels discovery. A connection, listing, missing allowlisted tool, or
name conflict fails the call instead of returning a partial tool list. Projects
without MCP sources return an empty list. `loadProject`, `validateProject`,
`discoverTools`, and agent runs keep their existing offline discovery behavior.

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
