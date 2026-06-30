# Version the file-based project model and own the v1 runtime

Status: accepted

Plico will treat the on-disk project layout as a public compatibility contract, anchored by `plico.config.ts`. The v1 runtime will be a Plico-owned linear ReAct loop that loads the same versioned project model used by the CLI, Studio, server adapters, validators, and tests.

## Considered Options

- Versioned project layout plus Plico-owned linear runtime.
- User-defined workflow DSL in v1.
- External runtime as the hidden core engine.

## Consequences

Plico can promise that a folder of Markdown, TypeScript tools, config, evals, memory seed files, and artifacts becomes the same agent app across local CLI, Studio, API, and deployment. Advanced graph runtimes can be adapters later, but LangGraph, Mastra, and OpenAI Agents SDK concepts do not define the v1 public mental model.
