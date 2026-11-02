# Reuse open source at the edges and own the product core

Status: accepted for layers with a PoC, proposed for the rest

Plico owns what makes it a product: the folder contract, the event contract, the loop, Studio, evals, readiness and the artifact and memory stores. It reuses maintained open source for plumbing, each behind a Plico interface so a pick can be replaced. The evidence, version numbers and maintenance checks are in `product/audits/0005-reuse-or-build-layers.md`. Every PoC there tested a build-our-own option on the same scenarios.

## Decisions

| Layer | Decision | Status |
| --- | --- | --- |
| Durable execution | Plico engine interface, own SQLite engine locally, DBOS in production (ADR 0008) | accepted |
| Model calls | Vercel AI SDK behind the Plico model port (ADR 0004) | accepted |
| Agent loop | Own linear loop (ADR 0001) | accepted |
| Event storage | Own append-only table, plain SQL behind a store interface; Kysely and Drizzle are fallbacks only | accepted |
| MCP client | Official MCP client, wrapped in Plico's tool shape (ADR 0003) | accepted |
| Validation | Zod inside Plico; JSON Schema and other schema libraries are accepted at the tool boundary | accepted |
| HTTP server | Hono with `overrideGlobalObjects: false`, behind the existing `/v1` routes (ADR 0006) | accepted |
| Tracing | OpenTelemetry API with GenAI conventions; the host picks the SDK and exporter; content off by default | accepted |
| Frontend protocol | Native events, with AG-UI as the default adapter and an AI SDK UI adapter (ADR 0004) | accepted |
| Memory | Own explicit Markdown memory; SQLite FTS5 then Mem0 as optional retrieval (ADR 0003) | accepted |
| Artifacts | Own content-addressed store with version receipts; the `diff` package for diffs | accepted |
| Harness capabilities | Own capabilities on the loop, in the build order of audit layer 18; subagents, compaction and plan tracking are after v1 | accepted |
| TypeScript tool loading | `tsx` | proposed, to be proven in its epic |
| CLI parsing | Commander | proposed |
| Studio data and routing | TanStack Query and Router | proposed |
| Eval scorers | `autoevals` behind a Plico scorer interface, optional | proposed |
| Skills format | Agent Skills layout and progressive loading, added next to flat files | proposed, see the skills epic |
| Host auth | Host-supplied context; no Plico users | accepted (ADR 0005) |
| Sandboxes | Deferred until a requirement exists | deferred |

Proposed picks were shortlisted from package data and not run against Plico. Each epic that adopts one writes the check that proves it, and falls back to the audit's next option if the check fails.

## Considered Options

- Reuse nothing and own every layer. Too much code to maintain, and no reason to own a model SDK, an MCP client or a Postgres journal.
- Adopt one framework as the core. A framework brings its concepts into the folder contract, and the PoCs showed Plico's events, approvals and evals see only what it exposes.
- Reuse at the edges behind Plico interfaces. Chosen.

## Consequences

Dependencies are pinned to exact versions and upgraded on purpose, because these projects move fast. No dependency type appears in the project contract, the events or the public API. The main vendor risks are the AI SDK, kept behind the model port, and DBOS, kept behind the engine interface; both need the shared tests to stay real. A pick that stops being maintained is replaced by changing one adapter, not the product.
