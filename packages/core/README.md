# @plico-ai/core

Core project-loading and validation helpers for Plico.

## API

- `loadProject(root)` loads `plico.config.ts` and returns the normalized project config
- `validateProject(root)` validates the project shape, required files and directories, and duplicate tool names

MCP source configuration (`mcpServers`) supports stdio and Streamable HTTP shapes,
explicit tool allowlists and environment variable references. Validation is offline;
Runtime MCP discovery is available through `discoverMcpTools` in
`@plico-ai/runtime`; it is explicitly separate from loading and validation.
MCP execution runs allowlisted tools through the runtime's approval policy and durable event log.

This package stays local-first and file-first. It does not know about runtime execution or provider-specific agent abstractions.

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
