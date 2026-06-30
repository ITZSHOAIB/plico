# Plico Agent App Kit PRD

Triage label: ready-for-agent

## Problem Statement

Web developers want to build useful agents as product features, but the current agent ecosystem forces them to choose between low-level orchestration, broad code-first frameworks, hosted platform assumptions, or low-code automation tools.

For a new or small product team, creating an agent is not just "call a model with tools." A production-ready agent needs prompts, skills, tool schemas, streaming, chat persistence, run history, approvals, artifact output, local debugging, evals, provider setup, frontend components, and deployable API endpoints. Developers can assemble these pieces from LangGraph, Mastra, OpenAI Agents SDK, Vercel AI SDK, CopilotKit, AG-UI, database adapters, and custom server code, but that creates too much early product infrastructure.

The market already has strong alternatives:

- Eve validates the filesystem-first agent model, but is naturally tied to Vercel's broader platform story.
- Mastra is a mature TypeScript agent framework, but it is broader and more code-first than the desired "folder becomes agent app" experience.
- LangGraph is powerful for durable graph orchestration, but too low-level for new web developers starting with an agent product feature.
- OpenAI Agents SDK provides clean agent primitives, but not a complete product shell with local Studio, persistence, artifact workspace, SSE API, and React UI.
- CopilotKit is strong for app-integrated copilot UI, but does not own the file-based agent project lifecycle.
- Low-code tools such as n8n, Make, Zapier Agents, Dify, Flowise, Gumloop, Relevance AI, and Langflow serve different audiences and should not define this product's core direction.

The user needs a framework that lets a web developer turn a small folder of Markdown instructions, skills, TypeScript tools, and config into a debuggable, persisted, embeddable, production-ready agent app without designing agent infrastructure from scratch.

## Solution

Plico will be an open-source, local-first agent app kit for web developers.

The product promise is:

> Plico turns a folder of agent files into a runnable agent API, local Studio, persisted chat system, artifact workspace, and embeddable frontend UI.

Plico should not position itself as a generic agent SDK. It should position itself as a developer workbench and app kit for file-based agents.

The first product experience should be:

1. Create a Plico project from the CLI.
2. Choose a model provider.
3. Write agent behavior in Markdown.
4. Add TypeScript tools when needed.
5. Run the agent in the terminal.
6. Open local Studio to inspect messages, tools, traces, artifacts, evals, and readiness.
7. Expose HTTP APIs and AG-UI/native event streams.
8. Embed the agent in a React app with Plico components or protocol adapters.
9. Persist threads, runs, events, tool calls, approvals, and artifacts.
10. Deploy the app without being locked into a single hosting platform.

Plico's differentiation is not the existence of agents, tools, or workflows. Its differentiation is the complete developer lifecycle around a file-based agent project:

- File-first authoring
- Local-first Studio
- Artifact workspace
- Built-in persistence
- AG-UI default frontend protocol and native resumable event APIs
- React component kit
- Provider portability
- Project validation and production readiness checks
- Eval-first workflow

## User Stories

1. As a new web developer building an agent, I want to create a working project from one CLI command, so that I can start experimenting without wiring infrastructure.
2. As a TypeScript developer, I want my agent to be defined by a small file tree, so that I can understand the project without learning a large framework first.
3. As a product engineer, I want to write the agent's core instructions in Markdown, so that behavior is easy to edit, review, and version.
4. As a product engineer, I want to add reusable Markdown skills, so that I can keep focused task guidance separate from the main agent prompt.
5. As a TypeScript developer, I want to add tools as TypeScript modules, so that my agent can call product APIs with typed inputs and outputs.
6. As a TypeScript developer, I want tool schemas to be validated automatically, so that invalid tool calls fail clearly and safely.
7. As a new user, I want the CLI to help me choose a provider and model, so that I do not have to understand every provider integration before getting started.
8. As a local developer, I want to run the agent in my terminal, so that I can quickly test basic behavior.
9. As a local developer, I want to open a local Studio, so that I can inspect the agent visually while developing.
10. As a developer debugging an agent, I want to see the run timeline, so that I can understand what happened during a response.
11. As a developer debugging tools, I want to inspect tool inputs and outputs, so that I can diagnose bad schemas, bad arguments, and bad results.
12. As a developer debugging prompts, I want to inspect the composed instructions and loaded skills, so that I can understand what the model actually saw.
13. As a developer debugging streaming, I want to see each event in order, so that I can reproduce UI and persistence bugs.
14. As a developer building a product feature, I want persisted threads, messages, runs, and events, so that chat history survives reloads and restarts.
15. As a developer building a product feature, I want stream resume support, so that the UI can recover from page refreshes and network drops.
16. As a developer building an agent with side effects, I want approval gates, so that risky tool calls can require human confirmation.
17. As a developer building an internal agent, I want an audit trail of tool calls and approvals, so that agent actions are reviewable.
18. As a developer building with generated files, I want the agent to write artifacts into a workspace, so that outputs are not trapped inside chat messages.
19. As a developer building artifact workflows, I want to preview generated HTML, CSS, JavaScript, Markdown, JSON, and React-oriented outputs, so that I can inspect generated work immediately.
20. As a developer building artifact workflows, I want artifact diffs and versions, so that I can compare changes across runs.
21. As a developer building artifact workflows, I want to export artifacts, so that generated work can move into the rest of my project.
22. As an app developer, I want a production-ready HTTP API, so that I can call the agent from any frontend.
23. As an app developer, I want a read-only resumable event endpoint, so that I can stream agent progress to a browser.
24. As an app developer, I want stable event IDs and replay, so that the client can reconnect safely.
25. As an app developer, I want AG-UI to be the default public frontend protocol, so that Plico agents can work with agent UI ecosystems instead of a proprietary protocol only.
26. As an app developer, I want a Vercel AI SDK UI adapter where practical, so that Plico can interoperate with common web AI UI patterns.
27. As a React developer, I want a Plico React package, so that I can embed agent chat and artifacts quickly.
28. As a React developer, I want a chat component, so that I can add a basic agent UI without designing one from scratch.
29. As a React developer, I want an artifact viewer component, so that generated files can be shown inside my application.
30. As a React developer, I want an approval panel component, so that risky agent actions can be approved from the UI.
31. As a React developer, I want a tool timeline component, so that agent execution can be made transparent to end users or internal operators.
32. As a developer who prefers custom UI, I want headless hooks, so that I can build my own interface without losing Plico's runtime behavior.
33. As a developer comparing frameworks, I want Plico to be simpler than Mastra for common web-agent use cases, so that I do not need a broad framework to ship a focused feature.
34. As a developer comparing platforms, I want Plico to be more portable than Eve, so that I can run locally or deploy outside a single hosting provider.
35. As a developer comparing orchestration tools, I want Plico to hide graph orchestration by default, so that I can start with product behavior instead of graph design.
36. As a developer using advanced orchestration later, I want optional adapters to LangGraph or similar engines, so that I can grow into more complex workflows without changing the project shape.
37. As a developer using OpenAI models, I want strong OpenAI support, so that I can use current model and tool-calling capabilities.
38. As a developer using Anthropic, Google, Groq, OpenRouter, Ollama, or OpenAI-compatible gateways, I want provider support without rewriting tools and prompts, so that model choice remains flexible.
39. As a developer using LiteLLM, OpenRouter, or Vercel AI Gateway, I want OpenAI-compatible gateway support, so that provider routing can be externalized.
40. As a developer working locally, I want SQLite persistence by default, so that Plico works without provisioning infrastructure.
41. As a developer deploying production apps, I want a Postgres adapter, so that Plico can support durable multi-user deployments.
42. As a developer with large artifacts, I want pluggable artifact storage, so that files can be stored locally in development and in object storage in production.
43. As a developer integrating auth, I want auth hooks, so that Plico endpoints can be protected by my application's authentication system.
44. As a developer operating production agents, I want rate limits, timeouts, max steps, and cancellation controls, so that runaway runs can be managed.
45. As a developer operating production agents, I want usage and cost tracking, so that model behavior has operational visibility.
46. As a developer operating production agents, I want structured tracing and OpenTelemetry compatibility, so that agent runs can be observed in existing systems.
47. As a developer improving quality, I want an eval runner, so that prompt, skill, tool, and model changes can be regression-tested.
48. As a developer improving quality, I want eval results visible in Studio, so that failures are easy to inspect.
49. As a developer preparing to ship, I want a readiness check, so that missing env vars, broken tools, unsafe permissions, and persistence gaps are caught before deployment.
50. As a developer maintaining many agents, I want templates, so that support bots, research agents, data analysts, coding agents, and internal ops agents can start from proven structures.
51. As an agency developer, I want projects to be Git-native, so that client agents can be reviewed, copied, versioned, and maintained consistently.
52. As an internal tools engineer, I want safe tool permissions, so that agents can access company systems without uncontrolled side effects.
53. As an internal tools engineer, I want audit-friendly logs, so that I can explain what the agent did and why.
54. As an open-source contributor, I want a clear adapter model, so that I can add providers, storage backends, eval scorers, or deployment targets without changing the core runtime.
55. As a framework maintainer, I want the core project model to remain opinionated, so that plugins do not fragment the developer experience.
56. As a framework maintainer, I want transport adapters to be separate from the event model, so that native SSE, AG-UI, and other protocols can coexist.
57. As a framework maintainer, I want the runtime to own the canonical event log, so that chat, Studio, UI components, and adapters stay consistent.
58. As a developer evaluating Plico, I want the first demo to work in under 20 minutes, so that the framework clearly beats assembling the stack manually.
59. As a developer evaluating Plico, I want documentation to explain when not to use it, so that I can choose LangGraph, Mastra, Eve, CopilotKit, or low-code tools when they are better fits.
60. As a user of the generated local Studio, I want the UI to be fast, dense, and inspection-oriented, so that it feels like a developer workbench rather than a marketing demo.

## Implementation Decisions

- Plico will be TypeScript-first because the target user is a web developer, tools are expected to be TypeScript modules, and the frontend kit is React-oriented.
- Plico will be full open source for now. The initial product should not require a hosted control plane or hosted runtime.
- Plico will be positioned as an agent app kit and local workbench, not as a generic agent SDK.
- Plico's core authoring model will be file-first and versioned: main Markdown instructions, optional Markdown skills, TypeScript tools, config, evals, memory seed files, and artifact workspace conventions.
- Plico will own a lightweight default ReAct-style runtime rather than depending on LangGraph, Mastra, or OpenAI Agents SDK as the hidden core engine.
- The default runtime will manage message composition, tool calling, max steps, approvals, event emission, persistence, artifacts, errors, cancellation, and terminal run states.
- LangGraph, Mastra, and OpenAI Agents SDK may be supported later through adapters, but their concepts should not define Plico's public mental model.
- Plico will expose a small Plico-owned model port so users configure providers through Plico rather than coupling app code directly to a third-party SDK.
- Vercel AI SDK provider architecture is the preferred default provider adapter implementation because it is TypeScript-first, broad, and aligned with streaming and web UI needs.
- LangChain providers will not be the default provider layer. LangChain may be supported later through optional adapters.
- Provider support will be tiered: first-class common providers, AI SDK-compatible passthrough, and OpenAI-compatible gateway mode.
- LiteLLM, OpenRouter, Vercel AI Gateway, Ollama, and other OpenAI-compatible endpoints should be supported through gateway-style configuration rather than a separate core abstraction.
- Plico will expose a stable, versioned native event model. Native streams, AG-UI, AI SDK UI compatibility, local Studio, and React components should adapt from this event model.
- AG-UI will be the default public frontend protocol. Plico's native event stream remains the full-fidelity contract for Studio, persistence, replay, artifacts, audit, and diagnostics.
- Plico will implement event IDs, persistent event logs, reconnect replay, cursor-based resume, heartbeats, terminal events, and cancellation support.
- Native browser EventSource can be supported for simple cases, while a robust fetch-based client should be provided for custom headers, auth, request control, and retry behavior.
- Chat persistence will be first-class and will not be limited to storing final messages.
- The canonical persistence model will include threads, messages, runs, events, tool calls, tool results, approvals, artifacts, errors, and usage/cost metadata.
- The event log will be treated as the source of truth for replay and stream resume. User-facing messages will be a derived transcript view.
- SQLite will be the default local storage adapter.
- Postgres will be the recommended production storage adapter.
- Redis may be used for active stream coordination or fanout, but it will not be the canonical chat store.
- Artifact storage will be local by default and pluggable for production object storage.
- Long-term memory will be separate from chat persistence. Chat persistence stores conversation and run history; memory stores selected durable facts, preferences, and knowledge.
- Plico will own a memory adapter port. The default v1 implementation will be lightweight explicit local memory, with Mem0 as the first optional advanced adapter.
- Artifact workspace will be a first-class product surface, not a later add-on.
- The artifact workspace will support a virtual filesystem, persisted snapshots, preview, diffs, version history, export, and streaming file updates.
- Artifacts will be modeled as a versioned virtual filesystem rather than plain chat attachments or direct local file writes.
- Plico Studio will be first-class. It should include chat testing, run timeline, tool inspection, prompt and skill inspector, event replay, artifact viewer, eval runner, memory/session inspection, and readiness reports.
- The React kit will be narrow and Plico-specific. It will not attempt to replace CopilotKit broadly.
- Plico React will focus on chat, run state, tool timeline, approval UI, artifact viewer, and headless hooks for Plico agents.
- Plico should interoperate with CopilotKit through AG-UI or compatible protocol adapters rather than competing with CopilotKit's full app-copilot frontend surface.
- The framework will use adapters rather than an unconstrained plugin API in v1.
- The core project model, runtime lifecycle, event model, tool call protocol, persistence semantics, approval model, artifact workspace behavior, and Studio behavior should remain framework-owned.
- Pluggable edges will include providers, storage, memory stores, vector databases, tool registries, MCP servers, auth, artifact storage, sandbox backends, tracing, eval scorers, transport adapters, UI protocol adapters, and deployment adapters.
- MCP servers will be supported as tool sources that are normalized into the same tool, approval, event, and audit model as TypeScript tools.
- The CLI will provide project creation, local terminal run, local Studio, server mode, evals, validation, and readiness checks.
- The CLI should provide templates for support agents, research agents, coding/task agents, data/reporting agents, customer ops agents, and internal tool agents.
- The production API surface should include endpoints for health, threads, messages, runs, run events, cancellation, approval, agent input, and AG-UI-compatible frontend interaction.
- The API should be generic enough to support any frontend while remaining simple enough to use directly from web apps.
- Plico should not build a low-code visual workflow canvas in v1.
- Plico Studio may visualize traces and runs, but authoring should remain file-first and Git-native.
- Plico should interoperate with low-code tools through webhooks, HTTP endpoints, MCP, or protocol adapters where practical.
- The first prototype must prove the core promise: a folder of Markdown instructions, skills, and TypeScript tools can become a debuggable local agent app with artifacts, persistence, AG-UI/native event streaming, and React UI.
- The first release should optimize for one excellent vertical path rather than broad feature coverage.
- The first release should be considered successful only if a new web developer can create, inspect, embed, and persist a useful agent in under 20 minutes.

## Architecture Decisions

- Plico project layout is a public compatibility contract. The v1 layout is anchored by `plico.config.ts` and includes `agent.md`, `skills/`, `tools/`, `evals/`, `artifacts/`, and `memory/`.
- The v1 runtime will be a Plico-owned linear ReAct loop. User-defined workflow graphs, Mastra, LangGraph, and OpenAI Agents SDK may be supported later through adapters but will not define the public v1 mental model.
- The canonical event log is the source of truth for replay, persistence, stream resume, Studio, React, AG-UI mapping, audit, and eval replay. User-facing transcripts and timelines are derived read models.
- TypeScript tools will export declared tool objects with name, description, input schema, capabilities, approval policy, and handler. Function inference and central-only registries are not the v1 contract.
- Approval requirements will be decided by a runtime policy engine using tool metadata, project config, and request auth context. Tools should not hide approval prompts inside handlers.
- TypeScript tools will run in the host process in v1 with explicit capabilities, timeouts, cancellation, approval gates, and audit events. Worker or container sandboxes are adapter opportunities, not v1 defaults.
- Plico will expose an auth context hook for host applications to supply actor, tenant, roles, and permissions. Plico will persist and audit this context but will not implement users, sessions, SSO, or RBAC in v1.
- The flagship v1 template and demo path will be an internal ops agent because it exercises tools, approvals, audit logs, artifacts, persistence, Studio, React embedding, AG-UI, eval replay, and readiness without requiring a code sandbox.
- Plico will be packaged as a small layered TypeScript monorepo: core/runtime, CLI, server/adapters, Studio, React, and optional adapter packages.
- Public contracts will be explicitly versioned, including project schema, native event schema, storage migrations, and protocol adapters. Minor changes should be additive and migrations should be provided for breaking storage/project changes.

## Testing Decisions

- Tests should focus on external behavior and product seams rather than implementation internals.
- The primary test seam should be the project-to-agent-app flow: create or load a sample Plico agent project, run it through the CLI/runtime, observe persisted events, stream over AG-UI/native event surfaces, render in Studio/React surfaces, and verify artifacts and messages.
- The preferred highest-level acceptance test should validate that a sample project can be loaded, checked, run, inspected, and served without requiring manual wiring.
- Runtime tests should verify message composition, skill loading, tool discovery, schema validation, tool execution, approvals, max-step limits, cancellation, error handling, and terminal run states.
- Provider adapter tests should verify that Plico's provider registry can call a model adapter without leaking provider-specific message shapes into user-facing APIs.
- Persistence tests should verify that threads, messages, runs, events, approvals, tool calls, artifacts, errors, and usage data survive process restart when using SQLite.
- Stream tests should verify event ordering, event IDs, heartbeat behavior, reconnect replay, cursor resume, final terminal events, and cancellation.
- API tests should verify the production HTTP contract for run creation, event streaming, input, approval, cancellation, and thread/message retrieval.
- Studio tests should verify user-visible behavior: run timeline rendering, tool call inspection, prompt/skill inspection, artifact preview, eval display, and readiness report output.
- React kit tests should verify that components and hooks can consume Plico events, render chat state, show artifacts, handle approvals, and recover from stream reconnects.
- Artifact workspace tests should verify virtual file writes, previewable file types, diffs, versions, persistence, export behavior, and streaming artifact updates.
- Eval tests should verify deterministic event-log replay, promotion of real runs into behavioral eval cases, mocked or recorded tool outputs, and understandable pass/fail output.
- Readiness check tests should verify missing env vars, invalid tool schemas, unsafe tool permissions, missing persistence configuration, unsupported provider settings, and deployment warnings.
- CLI tests should verify scaffold creation, provider setup prompts through noninteractive fixtures, local run, Studio launch behavior, server mode, eval execution, and validation output.
- Security-oriented tests should verify that dangerous tools can require approval and that rejected approvals prevent side effects.
- Compatibility tests should verify native Plico event streams, AG-UI default output, and AI SDK UI-compatible output where supported.
- Performance smoke tests should verify that local Studio and event streaming remain responsive for multi-step runs with tool calls and artifacts.
- Good tests should assert observable behavior: files loaded, events emitted, API responses, persisted records, UI-visible states, and command output.
- Tests should avoid asserting private function boundaries, internal class names, or implementation-specific event bus internals unless those internals become public API.

## Out of Scope

- Building a broad low-code or no-code visual workflow builder is out of scope for v1.
- Competing with n8n, Make, Zapier Agents, Dify, Flowise, Gumloop, Relevance AI, or Langflow on visual app integrations is out of scope.
- Building a hosted cloud platform, hosted control plane, billing system, marketplace, or managed multi-tenant service is out of scope for the first version.
- Replacing CopilotKit as a full app-copilot frontend framework is out of scope.
- Replacing LangGraph for advanced graph orchestration is out of scope.
- Replacing Mastra as a broad TypeScript AI framework is out of scope.
- Replacing OpenAI Agents SDK as a provider-native agent SDK is out of scope.
- Supporting every model provider directly in core is out of scope; broad provider support should come through adapters and compatible provider layers.
- Building Slack, Discord, Teams, email, or other channel integrations as first-class v1 surfaces is out of scope.
- Building durable distributed workflow execution comparable to a full workflow engine is out of scope for the initial prototype.
- Building a complex plugin marketplace is out of scope for v1.
- Building enterprise governance, RBAC, SSO, admin consoles, compliance reporting, and organization management is out of scope for v1.
- Building browser automation, computer use, or sandboxed code execution as a complete product area is out of scope unless needed for a narrow prototype.
- Guaranteeing legal, trademark, or package-name availability for Plico is out of scope for this PRD.

## Further Notes

- Plico is the selected working name. The current tagline direction is "Plico: agents from files" or "Plico: build agents from Markdown and TypeScript."
- The name was chosen because it is short, memorable, developer-tool-friendly, and can carry the metaphor of folding project files into a runnable agent.
- Package naming should likely follow a scoped namespace such as core, CLI, React, and Studio packages.
- The strongest reason to build Plico is not the agent runtime alone. The strongest reason is the complete lifecycle from file-based authoring to local inspection, artifacts, persistence, API, frontend integration, evals, and deployment readiness.
- The hard no-go condition is lack of differentiation. If Plico does not make local Studio, artifact workspace, and embeddable UI first-class, it should not be built.
- Plico should be killed or drastically narrowed if the first demo feels like Eve with a different logo or Mastra with fewer features.
- Plico should continue if the first demo makes a new web developer meaningfully faster than assembling Mastra, LangGraph, OpenAI Agents SDK, Vercel AI SDK, CopilotKit, AG-UI, storage, streaming, and eval tooling manually.
- The market does not need another generic agent framework. The market may need a Vite-like developer experience for turning a folder of agent files into a debuggable, persisted, embeddable agent app.
- The issue tracker publishing step is not completed by this document because no issue tracker configuration or project triage integration was available in the workspace. The intended triage label is recorded above as ready-for-agent.
