# Plan 0003: Runtime Spine and Native Event Contract

## Summary

Build the first real execution foundation for Plico: a deterministic, provider-free runtime that loads a valid project, composes Markdown instructions, discovers declared TypeScript tools, executes scripted dry runs, and emits a versioned in-memory native event log.

This phase proves the PRD/ADR dependency chain without jumping ahead to Studio, server APIs, persistence, React, MCP, memory, artifacts, or real model providers.

## Issue 9 Implementation Slice

Issue 9 lands the runtime spine only:

- Add dependency-light `@plico/runtime`.
- Validate and load projects through `@plico/core` before execution.
- Expose `runProject(root)` for provider-free deterministic dry runs.
- Compose `agent.md` plus all `skills/*.md` files in sorted order.
- Return the final run result and complete in-memory event log.
- Version native events with run ID, stable ordered event IDs, timestamps, event type, and payload.
- Cover run start, instruction composition, assistant output, terminal completion, validation failure, and runtime failure.

Tool discovery, scripted dry runs, approvals, and `plico run` CLI behavior remain later plan-0003 slices.

## Key Changes

- Add `@plico/runtime`.
- Keep `@plico/core` focused on project loading and validation.
- Define the first public runtime APIs:
  - `runProject(root, input, options)`
  - `composeInstructions(project)`
  - `discoverTools(project)`
  - `PlicoEvent`, `RunResult`, `DeclaredTool`
- Compose `agent.md` plus all `skills/*.md` in sorted order.
- Discover executable tools from `tools/*.tool.ts` only.
- Require one default-exported declared tool per file.
- Use a JSON Schema subset for tool input schemas.
- Support tool metadata: `name`, `description`, `inputSchema`, `capabilities`, `approval`, and `handler`.
- Add a native event model with:
  - schema version
  - run ID
  - stable ordered event IDs
  - timestamps
  - event types for run start, instruction composition, tool discovery, assistant output, tool call, tool result, approval required, error, and terminal state
- Implement an in-memory event log only.
- Add `plico run --dry [path]`.
- Support `plico run --dry --script <file> [path]`.
- Default dry run behavior returns a simple deterministic assistant echo when no script is provided.
- Scripted dry runs can drive assistant messages and tool calls deterministically.

## CLI Behavior

- `plico validate [path]` remains unchanged.
- `plico run --dry [path]`:
  - validates and loads the project
  - composes instructions
  - discovers tools
  - emits human-readable run progress
  - exits nonzero on validation/runtime failure
- `plico run --dry --json [path]`:
  - prints structured run result and events only
- `plico run --dry --script <file> [path]`:
  - reads a deterministic JSON step script
  - executes declared tool calls when present
  - emits native events in order

## Test Plan

- Runtime tests:
  - valid project composes `agent.md` and sorted skills
  - missing/invalid project fails before runtime execution
  - `tools/*.tool.ts` modules are discovered
  - non-tool files in `tools/` are ignored
  - malformed tool declarations fail clearly
  - JSON Schema input validation rejects invalid tool arguments
  - scripted tool call emits tool call and tool result events
  - approval-required tool emits approval-required blocked terminal event without running handler
  - runtime errors emit error and terminal failed events
  - event IDs are stable, ordered, and unique within a run
- CLI tests:
  - `plico run --dry` exits `0` for valid scaffold
  - invalid project exits nonzero
  - `--json` emits parseable JSON without human diagnostics
  - `--script` proves tool execution through observable events
- Example coverage:
  - update internal-ops example with one safe `.tool.ts`
  - ensure generated `create-plico` scaffold remains valid
  - ensure generated scaffold can complete a dry run

## Assumptions

- No real provider calls in plan 0003.
- No SQLite persistence, replay, stream resume, Studio, server API, React kit, MCP, memory adapter, artifact semantics, or full approval resume flow.
- Tool modules are trusted local project code, same trust model as `plico.config.ts`.
- Approval support in this phase is metadata plus blocked event only.
- The native event model introduced here is the seed public contract and should be versioned from the start.
