# Plan 0006: Provider Runtime, App API, AG-UI, React, MCP/Memory, and Node Deployment

## Summary

Plan 0006 is the first multi-phase Plico plan. Each phase should be treated as roughly one previous plan's capacity: independently testable, demoable, and shippable before the next phase starts.

Plans 0001 through 0005 proved the local-first project lifecycle:

- 0001 and 0002 established the file-first project contract around `plico.config.ts`.
- 0003 introduced the provider-free runtime spine, declared TypeScript tools, approval blocking, and native events.
- 0004 added durable native event persistence and a thin native HTTP API.
- 0005 added the bundled Studio workbench, native SSE, artifact workspaces, scripted trace evals, and readiness.

0006 should turn that local inspection loop into the first real embeddable agent app path. The product outcome after all phases is that a developer can configure a model provider, run a real Plico agent through the same file-based project, persist threads/runs/messages/tools/approvals/artifacts, inspect everything in Studio, stream through native and AG-UI surfaces, embed the agent in React, and run the same app through a Node-first deployment surface.

This plan is deliberately broader than earlier plans, but each phase must preserve the v1 public mental model:

- file-first and local-first
- `plico.config.ts` remains the project anchor
- Plico-owned runtime, project, event, tool, memory, approval, and artifact contracts remain the public contract
- native Plico events remain the full-fidelity source of truth
- AG-UI, React, Studio, evals, and server APIs derive from native contracts
- provider SDKs, AG-UI shapes, database drivers, auth systems, MCP server details, and deployment framework details do not leak into the core project contract

## PRD and ADR Analysis

The PRD and accepted ADRs point to five unresolved product gaps after Plan 0005:

1. Real model execution is still missing. The current runtime can be inspected and tested, but Plico has not yet proved that a file-based project can call a provider through a Plico-owned model port.
2. The app API is not yet a chat product API. Runs and events are persisted, but threads, messages, approval resume, cancellation, and user-facing conversation state are not first-class.
3. Tools, approvals, MCP, and memory need one Plico-owned model. ADR 0003 requires TypeScript tools, MCP tools, approval policy, and memory to normalize behind Plico contracts instead of becoming separate side channels.
4. Embedding is not yet proven. ADR 0004 makes AG-UI the default public frontend protocol while keeping native Plico events canonical, and the PRD calls for a focused React kit.
5. Deployment is not yet credible. ADR 0005 calls for Node-first deployment, readiness, and host-supplied auth context before hosted-platform or edge-specific assumptions.

The dependency order for 0006 is therefore:

1. provider-backed runtime
2. durable conversation and app API
3. tools, approval policy, MCP, and explicit memory
4. AG-UI and React embedding
5. Node deployment, storage adapter hardening, and production readiness

## Key Decisions

- Add a Plico-owned model provider port before adding any real provider package.
- Use Vercel AI SDK as the preferred implementation route for the first default provider adapter, but never expose AI SDK message or stream types as Plico's public model contract.
- Keep the provider-free scripted runtime as the deterministic eval and test surface.
- Keep the v1 runtime linear. Do not add user-defined workflow graphs, LangGraph, Mastra, or OpenAI Agents SDK as hidden core engines.
- Add active run states before building approval resume, cancellation, AG-UI, or React surfaces.
- Treat threads and messages as durable read models derived from native events and storage projections, not as a separate source of truth.
- Normalize TypeScript tools and MCP tools into the same `DeclaredTool` shape before the model sees them.
- Add explicit local memory before automatic memory extraction, vector search, or hosted memory services.
- Add `@plico/react` only when the app API and stream contract are stable enough to consume.
- Add a non-React client layer only if React implementation proves that transport/state code would otherwise be duplicated.
- Keep the first deployment target framework-neutral and Node-first. Do not make Next.js, Vercel, Cloudflare Workers, or any hosted platform the v1 deployment contract.

## Phase 1: Provider-Backed Runtime and Model Port

### Product Outcome

A developer can run the internal-ops Plico project against a real configured model provider, observe native Plico events for model turns and tool calls, persist the result, and inspect the run in Studio. Scripted dry runs remain available for deterministic tests and evals.

### Scope

Add a model provider contract owned by `@plico/runtime`:

- Define provider-neutral request, response, stream, tool-call, tool-result, and usage types.
- Pass composed instructions, conversation messages, normalized tools, max steps, and cancellation signals into the provider port.
- Return model output and tool-call requests in Plico-native shapes.
- Represent usage metadata in a provider-neutral form without committing to a full cost model yet.

Add a default provider adapter path:

- Add a small AI SDK-backed adapter package or module only after the Plico model port exists.
- Keep provider SDK dependencies out of `@plico/core`.
- Keep AI SDK-specific types out of persisted native events, project files, Studio responses, and React surfaces.
- Support OpenAI-compatible gateway-style configuration through the same adapter path where practical.

Extend runtime execution:

- Preserve `runProject(..., { script })` for dry runs.
- Add a provider-backed run path that executes a linear ReAct loop:
  - compose instructions
  - discover tools
  - send model input
  - emit model and assistant events
  - execute safe tool calls
  - block or pause when approval is required
  - stop on completion, max steps, cancellation, or failure
- Add active run statuses such as `running`, `waiting_for_approval`, and `cancelled` while preserving existing terminal statuses.
- Add additive native event types for user input, model request/response, assistant deltas or messages, usage, cancellation, and active state changes.
- Keep event schema changes additive unless a schema version bump is unavoidable.

Extend CLI behavior:

- Keep `plico run --dry` unchanged for deterministic local execution.
- Add provider-backed `plico run` with noninteractive input through `--message <text>` and/or stdin.
- Preserve `--json`, `--db`, and script-friendly output behavior.
- Fail clearly when provider configuration or required environment variables are missing.

Extend Studio and readiness:

- Show provider-backed runs in the same timeline as dry runs.
- Display model metadata and normalized usage if available.
- Add readiness diagnostics for provider configuration and missing environment variables.

### Suggested Issues

1. Plico model port with fake-provider runtime tests.
2. Provider-backed linear runtime loop with normalized tool calls.
3. AI SDK-backed adapter behind the Plico model port.
4. CLI provider run path and Studio visibility.

### Phase Gate

Phase 1 is complete when the internal-ops example can run through a fake provider in tests, run through a real configured provider manually, persist native events, and remain inspectable in Studio without changing the project mental model.

## Phase 2: Threads, Messages, Approvals, Cancellation, and App API

### Product Outcome

A developer can use Plico as a local app API: create a thread, send a user message, stream the resulting run, approve or reject a risky tool call, cancel an active run, replay the run later, and inspect the derived conversation in Studio.

### Scope

Extend durable storage and projections:

- Add versioned storage migrations for active run states, threads, messages, approvals, cancellation, and actor context.
- Keep the native event log canonical.
- Treat thread and message tables as indexed projections for listing and rendering.
- Preserve migration compatibility with existing SQLite databases from Plans 0004 and 0005.

Add conversation event types:

- `thread.created`
- `message.created`
- `message.updated` if streaming or projection needs it
- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `run.cancel_requested`
- `run.cancelled`

Extend runtime and approval behavior:

- Convert approval-required behavior from terminal-only blocking into resumable waiting state when an approval channel is available.
- Persist approval requests and decisions with enough audit context to explain actor, tool, arguments, policy reason, and final decision.
- Ensure rejected approvals prevent the side effect and produce a clear terminal result.
- Support max steps, timeout, and cancellation checks in the provider-backed loop.
- Keep dry-run approval blocking available for deterministic eval fixtures.

Extend native HTTP API:

- `POST /v1/threads`
- `GET /v1/threads`
- `GET /v1/threads/:threadId`
- `GET /v1/threads/:threadId/messages`
- `POST /v1/threads/:threadId/messages`
- `POST /v1/runs`
- `GET /v1/runs/:runId`
- `GET /v1/runs/:runId/events`
- `GET /v1/runs/:runId/events/stream`
- `POST /v1/runs/:runId/approvals`
- `POST /v1/runs/:runId/cancel`

Keep the server thin:

- Parse requests, normalize errors, and call runtime/storage contracts.
- Do not add a broad web framework unless the native server is demonstrably blocking the phase.
- Keep auth implementation out of scope, but accept host-supplied auth context in the request handling layer.

Extend CLI and Studio:

- Add CLI commands only where they preserve noninteractive scriptability, such as listing threads or approving a run from a token/ID.
- Add Studio views for threads, messages, active runs, approval requests, approval decisions, cancellation, and active run status.

### Suggested Issues

1. Storage migrations and thread/message projections from native events.
2. Active run states, cancellation, max-step, and timeout behavior.
3. Resumable approval request/decision lifecycle.
4. Native app API endpoints for threads, messages, approvals, and cancellation.
5. Studio thread and active-run inspection.

### Phase Gate

Phase 2 is complete when the server can drive a complete local conversation with persisted messages, stream events, pause for approval, resume or reject safely, cancel active work, and replay the same data through CLI and Studio.

## Phase 3: Tool Ecosystem, MCP, and Explicit Local Memory

### Product Outcome

A developer can mix local TypeScript tools, configured MCP tools, approval policy, and explicit local memory in one Plico runtime model. Studio, readiness, audit logs, and provider execution see the same normalized contracts.

### Scope

Harden the tool contract:

- Keep one declared default export per `tools/*.tool.ts` file as the TypeScript tool contract.
- Extend tool metadata only where it supports real runtime behavior: capabilities, approval policy, timeout, side-effect category, and readiness diagnostics.
- Keep tool handlers trusted local code in v1.
- Record tool call inputs, outputs, errors, approval decisions, and actor context in native events.

Add approval policy:

- Centralize approval decisions in a runtime policy engine.
- Combine tool metadata, project config, request auth context, and runtime mode.
- Keep tools from implementing hidden approval prompts inside handlers.
- Make policy decisions visible in events, Studio, readiness, and API responses.

Add MCP tool sources:

- Add project config for local MCP servers or tool sources without making MCP the primary Plico tool story.
- Normalize MCP tools into the same `DeclaredTool` and approval policy path as TypeScript tools.
- Support local development use cases first, such as stdio-based MCP servers.
- Keep remote MCP auth, hosted MCP registries, and advanced server lifecycle management out of this phase.

Add explicit local memory:

- Keep memory separate from chat persistence.
- Load seed memory from the existing `memory/` project directory.
- Add a local memory store with entries, scopes, timestamps, and source metadata.
- Add native memory events for explicit create/update/delete operations.
- Allow memory to be composed into instructions through a clear Plico-owned memory port.
- Do not add automatic memory extraction, vector search, semantic recall, or Mem0 integration yet.

Extend surfaces:

- Readiness reports invalid tool metadata, unsafe approval settings, MCP configuration problems, and memory store problems.
- Studio shows TypeScript tools, MCP tools, approval policy, memory entries, and memory events.
- Evals can assert tool/approval/memory events through deterministic fixtures.

### Suggested Issues

1. Tool metadata hardening and approval policy engine.
2. MCP tool discovery normalized into `DeclaredTool`.
3. Explicit local memory store and memory events.
4. Studio/readiness/eval visibility for tools, MCP, approvals, and memory.

### Phase Gate

Phase 3 is complete when TypeScript tools, MCP tools, approval policy, and local memory are all visible through the same runtime, event, readiness, Studio, and eval surfaces.

## Phase 4: AG-UI Protocol and React Kit

### Product Outcome

A developer can embed a Plico agent in a React app using Plico's app API and AG-UI-compatible streams, while Studio continues to use native events for full-fidelity inspection.

### Scope

Add AG-UI mapping:

- Map native Plico events into AG-UI-compatible frontend events.
- Preserve native event IDs or stable cursor metadata for reconnect and replay.
- Keep native Plico streams as the full-fidelity debugging and audit contract.
- Expose AG-UI endpoints or adapters from `@plico/server` without replacing native endpoints.
- Add compatibility fixtures that prove the mapping is deterministic.

Add a fetch-based client layer if needed:

- Support stream resume, custom headers, cancellation, approval decisions, and JSON errors.
- Keep the client transport small and framework-neutral if React would otherwise duplicate the logic.
- Do not make the client a second runtime or state source.

Add `@plico/react`:

- Headless hooks for thread state, run state, event streaming, approvals, and artifacts.
- Focused components for chat, artifact viewer, approval panel, and tool timeline.
- Components should be product-app components, not Studio clones and not a broad CopilotKit replacement.
- React surfaces should render from server/API/client state derived from native events.

Add an embedding example:

- Add a small React example or package-level demo using the internal-ops agent.
- It should prove chat, stream updates, tool transparency, approval UI, and artifact preview.
- Keep generated Plico projects clean; do not generate React apps into every project.

### Suggested Issues

1. AG-UI mapping from native Plico events with fixture tests.
2. AG-UI server endpoint or adapter with replay/resume behavior.
3. Plico client transport for threads, runs, streams, approvals, and artifacts if needed.
4. `@plico/react` headless hooks and focused components.
5. Internal-ops React embedding example.

### Phase Gate

Phase 4 is complete when a React app can start a thread, send a message, stream progress, display tool and artifact state, submit approvals, recover from stream reconnects, and stay consistent with Studio's native event replay.

## Phase 5: Node Deployment, Storage Adapters, and Production Readiness

### Product Outcome

A developer can take the same Plico project used locally and mount it in a framework-neutral Node web runtime with host-supplied auth context, durable storage, readiness checks, and deployment documentation.

### Scope

Harden server embedding:

- Export a reusable Node request handler in addition to the local `servePlico` dev server.
- Keep `plico serve` as the local development command over the same handler.
- Provide framework-neutral examples for mounting the handler without taking a dependency on Express, Next.js, Fastify, or Hono.
- Keep edge runtimes and hosted platform adapters out of this phase unless the Node handler design naturally supports them.

Add host auth context hooks:

- Let host applications supply actor, tenant, roles, request ID, and permission metadata.
- Persist auth context in relevant run, tool, approval, and audit events.
- Do not implement users, sessions, SSO, RBAC, or tenant administration inside Plico.

Harden storage adapters:

- Keep SQLite as the default local adapter.
- Make the storage adapter contract explicit enough for production adapters.
- Add a Postgres adapter if the storage contract and migrations are stable enough in this phase.
- If Postgres is not completed in this phase, readiness must explicitly report SQLite as local-development storage and document what remains before production deployment.
- Keep object storage for large artifacts deferred unless artifact APIs need a small storage port cleanup.

Extend readiness:

- Check provider environment, model config, tool safety, approval policy, MCP connectivity, memory store writability, storage adapter, artifact workspace, server config, AG-UI endpoint, and React/client compatibility fixtures.
- Return machine-readable diagnostics that can fail CI.
- Keep readiness actionable rather than exhaustive compliance reporting.

Improve docs and templates:

- Update the internal-ops template as the flagship demo path.
- Document provider setup, app API, AG-UI, React embedding, approval flow, memory, MCP, and Node deployment.
- Preserve the goal that a new web developer can create, inspect, embed, and persist a useful Plico agent in under 20 minutes.

### Suggested Issues

1. Framework-neutral Node request handler and local serve reuse.
2. Host auth context hook and persisted audit context.
3. Storage adapter contract hardening and Postgres pilot if feasible.
4. Production readiness diagnostics across provider, storage, tools, MCP, memory, artifacts, AG-UI, and React.
5. Internal-ops demo, docs, and create-plico polish.

### Phase Gate

Phase 5 is complete when the local demo path and the Node embedding path use the same runtime, storage, event, readiness, and API contracts, and readiness clearly distinguishes local-only configuration from deployment-ready configuration.

## Cross-Phase Test Strategy

Every phase must follow the repository TDD rule:

1. RED: add one failing behavior test through a public surface.
2. GREEN: implement only enough code to pass.
3. REFACTOR: clean up while the tests are green.

Use fake providers, fake MCP servers, and deterministic fixtures for normal tests. Live provider tests must be opt-in and skipped unless required environment variables are present.

Runtime tests should cover:

- fake provider request/response normalization
- streamed model output translated to native events
- provider tool calls normalized through `DeclaredTool`
- max steps, cancellation, timeouts, errors, and terminal states
- approval wait, approval resume, rejection, and audit events
- memory composition and explicit memory event behavior
- MCP tools normalized beside TypeScript tools

Storage tests should cover:

- migrations from existing SQLite schemas
- event ordering and cursor replay
- thread/message/run projections from the canonical event log
- approval and cancellation persistence
- memory persistence
- adapter contract behavior shared by SQLite and any Postgres adapter

Server tests should cover:

- app API endpoints for threads, messages, runs, approvals, cancellation, artifacts, evals, readiness, and Studio data
- native SSE replay/resume for active and completed runs
- AG-UI endpoint mapping and replay behavior
- JSON error consistency for malformed input, invalid cursors, unknown IDs, provider errors, and approval conflicts
- host auth context propagation where supplied

CLI tests should cover:

- `plico run --dry` remains deterministic
- provider-backed `plico run` accepts noninteractive input and JSON output
- missing provider config and env vars fail clearly
- thread/run/event/approval commands, if added, remain script-friendly
- `plico readiness --json` stays machine-readable

Studio and React tests should cover:

- real provider-backed runs render in Studio timelines
- thread/message projections are visible and consistent with raw events
- tool calls, MCP tools, approvals, memory entries, artifacts, evals, and readiness render from server data
- React hooks/components can consume stream state, recover from reconnects, submit approvals, show artifacts, and display tool timelines
- AG-UI fixture output remains deterministic when native event fixtures change additively

## Verification

Run the narrowest checks first inside each phase:

- `pnpm exec vitest run <focused test files>`
- `pnpm --filter @plico/runtime build`
- `pnpm --filter @plico/server build`
- `pnpm --filter @plico/cli build`
- `pnpm --filter @plico/studio build`
- `pnpm --filter @plico/react build` once the package exists
- adapter package builds once provider, MCP, or storage adapter packages exist

Run broader checks when shared contracts change:

- `pnpm test`
- `pnpm build`
- `pnpm check` before raising a PR or cutting a release candidate

Manual smoke tests should include:

- create or use the internal-ops project
- run dry evals
- run one fake-provider or configured-provider conversation
- open Studio
- stream native events
- stream AG-UI events once Phase 4 exists
- exercise approval approve/reject
- inspect artifact and memory state
- run readiness in human and JSON modes
- mount the Node handler in the deployment example once Phase 5 exists

## Assumptions

- Node 24 remains the local baseline.
- The default local persistence path remains `<project>/.plico/plico.sqlite`.
- Provider-backed tests use fake providers by default.
- Live provider checks are opt-in and must not be required for CI.
- Studio remains bundled and served by Plico.
- The internal-ops example remains the flagship v1 demo.
- AG-UI is a public frontend protocol adapter, not the canonical internal event model.
- React components are a focused Plico embedding kit, not a replacement for CopilotKit.
- Host applications own authentication and authorization systems; Plico records supplied context and enforces configured approval policy.

## Explicit Deferrals

- User-defined workflow graphs.
- LangGraph, Mastra, or OpenAI Agents SDK as hidden runtime engines.
- Provider SDK message shapes as public Plico contracts.
- A low-code visual workflow canvas.
- Hosted cloud control plane, billing, marketplace, or managed multi-tenant service.
- Built-in users, sessions, SSO, RBAC, or tenant administration.
- Edge-first deployment and platform-specific deployment adapters.
- Remote MCP auth, hosted MCP registries, and advanced MCP server lifecycle management.
- Automatic memory extraction, vector search, semantic recall, and Mem0 integration.
- LLM-judge evals as the default eval path.
- Full OpenTelemetry integration, detailed cost accounting, and production observability suites.
- Object storage, binary artifact storage, sandboxed artifact execution, and full artifact export pipelines.
- Broad template families beyond the internal-ops flagship path.
