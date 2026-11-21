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
failure. This metadata-only API never calls a tool.

```ts
import { loadProject } from "@plico-ai/core";
import { discoverMcpTools } from "@plico-ai/runtime";

const tools = await discoverMcpTools(await loadProject("."));
```

Each result retains `serverId`, the original `toolName`, a `mcp:<server>/<tool>`
source, and Plico's `name`, `description`, `inputSchema`, `capabilities` and
`approval` fields. Names use `mcp_<server>__<tool>`; the tool portion is lowercased
and characters outside `[a-z0-9_]` become underscores. Ambiguous names are errors.
Normalized names longer than 64 characters are rejected; use a shorter server ID.
Capabilities are empty and approval metadata defaults to required; server hints
cannot waive it. Runs enforce approval by default; only an explicit per-tool
`approvals.tools` override of `"none"` waives the MCP default.
Server tool descriptions and input schemas are untrusted content, just like tool
results. Discovery preserves them as metadata; they do not grant permissions.

Discovery uses the project root as the stdio working directory. The official
client inherits its standard process environment plus the variables listed in
`env`; other host secrets are not passed. HTTP headers resolve `headersEnv` when
connecting. Call `loadProjectEnv(root)` first if your host wants to load `.env`.
Missing variables fail discovery and credential values are never returned in
metadata or error messages. HTTP redirects are rejected.
Errors retain safe spawn codes, HTTP statuses or MCP error codes when available,
without including response bodies or credential values.

The default discovery deadline is 30 seconds per source. `timeoutMs` changes it;
sources are tried one after another, so it is not a deadline for the whole call.
`signal` cancels discovery. Stdio shutdown and kill escalation can take a few
extra seconds beyond the source deadline; HTTP session termination has its own
deadline of at most one second. A connection, listing, missing allowlisted tool, or
name conflict fails the call instead of returning a partial tool list. Projects
without MCP sources return an empty list. `loadProject`, `validateProject`,
and `discoverTools` remain offline. Ordinary dry runs and mocked scripts also
remain offline.

## Execute MCP tools

Provider-backed `runProject` calls discover the configured allowlists and combine
them with TypeScript tools. Live scripted calls discover the sources they use.
The `mcp_` prefix is allowed for TypeScript tools; actual name collisions fail
with both sources identified. Arguments are validated against the server schema
before requesting approval or making a remote tool call.

```ts
// In plico.config.ts, waive approval only for this specific allowlisted tool:
approvals: { tools: { mcp_tickets__get_ticket: "none" } }
```

Connections close before a run waits for approval. An approved call reconnects,
checks that its description and input schema still match, and calls the original
server tool name. Each call's connect/list/call sequence shares a 30-second
deadline, followed by bounded cleanup. Cancelling a run aborts pending requests
and closes the session; it cannot undo a remote side effect already performed.

MCP results enter the normal `tool.result` event and provider conversation as
`{ content, structuredContent?, isError? }`. These values remain untrusted.
Protocol failures retain only safe codes, never response bodies or credential
values. A failed call is not automatically retried. The provider may choose to
request a new call, which goes through approval again.

Recovery reuses journaled results without reconnecting. If a process crashes
after the server performs a side effect but before Plico journals the result,
the pending call runs again: MCP execution is **at least once**. Use server-side
deduplication or idempotent operations for side effects. A changed MCP source
configuration or approval policy fails recovery before another remote call.

Scripts with `mockTools: true` use their supplied results without connecting or
resolving credentials, unless a step has `live: true`. Offline MCP mocks check
the allowlist and approval policy, but cannot validate arguments against a remote
schema. Readiness connectivity checks and dedicated Studio inspection follow in
the next slice of [#77](https://github.com/ITZSHOAIB/plico/issues/77).

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
