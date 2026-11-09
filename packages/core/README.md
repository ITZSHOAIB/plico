# @plico-ai/core

Core project-loading and validation helpers for Plico.

## API

- `loadProject(root)` loads `plico.config.ts` and returns the normalized project config
- `validateProject(root)` validates the project shape, required files and directories, and duplicate tool names

This package stays local-first and file-first. It does not know about runtime execution or provider-specific agent abstractions.

Docs: [plico.sohab.dev](https://plico.sohab.dev). For AI coding agents: [llms.txt](https://plico.sohab.dev/llms.txt).
