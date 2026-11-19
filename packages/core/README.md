# @plico-ai/core

Core project-loading and validation helpers for Plico.

## API

- `loadProject(root)` loads `plico.config.ts` and returns the normalized project config
- `validateProject(root)` validates the project shape, required files and directories, and duplicate tool names

MCP source configuration (`mcpServers`) supports stdio and Streamable HTTP shapes,
explicit tool allowlists and environment variable references. Validation is offline;
MCP discovery and execution are not implemented yet.

This package stays local-first and file-first. It does not know about runtime execution or provider-specific agent abstractions.

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
