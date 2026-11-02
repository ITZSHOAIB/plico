# Reuse or build, layer by layer

Date: 2026-11-02

Goal: create a very good way to build AI agents that is as easy and scalable as possible, reusing good open source where it earns its place. What exists today does not constrain these choices.

Evidence came from repo data, npm and docs, plus some source reading. All twelve planned PoCs have now run, covering layers 1 through 10, 12, 13 and 18, plus a thirteenth that closed the DBOS gaps and ran the picks together. At the owner's request, memory ran first, followed by the tracing, artifact and validation PoCs as one batch. Layers with no planned PoC still need the combined decision review. Maintenance numbers cover 1 August to early November 2026. Stable release counts include small patches.

All PoCs are complete. On 2026-11-02 the owner asked for the documents to be revamped from these results, which settles the layers: ADR 0009 records each decision, ADR 0008 records layer 1, and the PRD, ADRs and epics were updated to match. Layers with no PoC (11 to 17) stay proposed in ADR 0009 until their epic proves them. The "working pick" labels below are now decisions where ADR 0009 says accepted. Every PoC includes a build-our-own option, tested with the same scenarios as the reuse candidates.

## How each layer is judged

For every layer, the question is: should we reuse this or build our own? Reuse is never automatic.

1. **Does it matter to the user?** If this layer makes Plico easy, owning it counts for more.
2. **How hard is it to do well?** A hundred lines, or years of edge cases?
3. **How good is the option?** Quality, licence, and whether a single vendor controls it.
4. **Does it fit?** Local-first, scalable, and no forced concepts in the folder contract.
5. **What does it cost later?** Who keeps up if we build, and how hard is it to leave if we reuse?
6. **Is it well maintained?** Release cadence, active maintainers and issue handling, not just stars. We must not get stuck on outdated code or carry workarounds.

## Shortlists

| Layer | Primary | Fallback 1 | Fallback 2 |
| --- | --- | --- | --- |
| 1. Durable execution | **Working decision:** Plico engine interface, own SQLite engine locally, DBOS in production | Workflow SDK on Postgres World, as a later adapter | Temporal, as a later adapter |
| 2. Model calls | **Working pick:** AI SDK behind a Plico interface | Own adapters | `pi-ai` |
| 3. Agent loop | Own thin loop on the AI SDK | `pi-agent-core` | None |
| 4. Event storage | Own append-only table | Derive from the engine's event log | None |
| 5. MCP client | **Working pick:** Official MCP client v2 | Own client | `@ai-sdk/mcp` |
| 6. Validation | **Working pick:** Zod internally; JSON Schema and schema-library adapters at the boundary | TypeBox | Valibot |
| 7. Database queries | **Working pick:** Plain SQL behind a store interface | Kysely | Drizzle |
| 8. HTTP server | **Working pick:** Hono, globals left alone | Own `node:http` server | Fastify |
| 9. Tracing | **Working pick:** OpenTelemetry API with GenAI conventions; host chooses SDK/exporter | OpenInference profile on the same tracing substrate | Plico events with an exporter |
| 10. Frontend protocol | **Working proposal:** native Plico events plus AG-UI and AI SDK adapters; AG-UI default | AI SDK as the default if reach is prioritised | Native SSE alone |
| 11a. TypeScript loading | `tsx` | `jiti` | Node type stripping |
| 11b. CLI parsing | Commander | `cac` | `node:util` `parseArgs` |
| 11c. Studio data and routing | TanStack Query and Router | TanStack Query and React Router | Hand-written |
| 12. Memory | **Working pick:** Own explicit Markdown memory | Optional SQLite FTS5 retrieval | Optional Mem0 semantic retrieval |
| 13. Artifact versioning | **Working pick:** Own content-addressed store and version receipts, reuse `diff` | `isomorphic-git` | `simple-git` |
| 14. LLM eval scorers | `autoevals` | Own scorers on the AI SDK | `vitest-evals` |
| 15. Skills format | Agent Skills standard | Support both layouts | Keep flat `skills/*.md` |
| 16. Host auth | Host-supplied context | `jose` token helper | Documented `better-auth` example |
| 17. Sandboxes | Deferred | Deferred | Deferred |
| 18. Harness capabilities | **Working pick:** Own capabilities on the loop | `deepagents` | `@ai-sdk/harness` |

Plico owns the event contract in every case.

The detailed layer sections below preserve the initial shortlists. Later PoC results supersede their provisional rankings; the summary above shows the current working recommendations.

The layer 1 decision removed `WorkflowAgent` and Workflow SDK durable streams from layers 3 and 4, because a loop tied to one engine cannot run on both. It also removes the Workflow SDK's pull on layers 7, 8 and 11a. If a Workflow SDK adapter is added later, it brings back the Nitro and bundled-loader findings from PoC 1.

## Overall risks

- **Single vendor:** after the layer 1 decision, the main Vercel dependency is the AI SDK in layer 2, kept behind `ModelProvider`. DBOS has one company behind it, so the engine interface and shared crash tests must stay real.
- **One-person projects:** Zod, TypeBox, `tsx`, Kysely and Hono each have one dominant committer. That is common and not a reason to reject them, but keep the fallbacks real.
- **Churn, not staleness:** these projects move fast, so upgrades are a recurring cost. Pin exact versions and upgrade deliberately.
- **Engine concepts leaking:** the folder contract must stay free of engine concepts, or Plico becomes a thin wrapper that cannot change engines.
- **Differentiation:** Eve shares this foundation, so Plico's edge must come from what it owns: the folder contract, CLI, Studio, evals and readiness.

## Layer 1: Durable execution

Lets a run survive crashes and wait for days without a live process. Steps save their results, and after a crash the workflow replays from the top, reusing saved results.

| Project | Version, licence | Weekly downloads | Stable releases | Storage | Own server? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Workflow SDK** | 5.2.3, Apache-2.0 | 2.45M | 22 | JSON files (dev and test), Postgres, Vercel | No, needs a compile step | **Primary** |
| **DBOS** | 5.4.0, MIT | 817K | 7 | Postgres in its README | No | **Fallback 1** |
| **OpenWorkflow** | 0.11.0, Apache-2.0 | 10K | 3 | SQLite, Postgres | No | **Fallback 2** |
| Absurd | 0.5.1, Apache-2.0 | 27K | 2 | Postgres | No | Fails maintenance, one main author |
| TanStack Workflow | MIT, 226 stars | Not found on npm | N/A | Postgres, Cloudflare D1 | No | Too new |
| Temporal | SDK 1.25.0, MIT | Not checked | Not checked | Cluster | Yes | Breaks easy local use |
| Restate | Server licence unclear | Not checked | Not checked | Own runtime | Yes | Same |
| Inngest | Licence signals conflict | Not checked | Not checked | Own server | Yes | Same, licence needs clearing |
| Hatchet, Trigger.dev | MIT, Apache-2.0 | Not checked | Not checked | Own platform | Yes, not verified | Same |

Why not build our own: leases, crash recovery, replay and versioning across two databases are very hard, and users never see them.

Workflow SDK has the strongest maintenance: 6 active authors, with 472 non-bot PRs merged and 51 of 131 new issues closed since August. Its drawback is a build transform and VM sandbox. If Plico's loop is the only workflow, Plico may be able to compile it at publish time and run user tools through one generic step. That is unproven.

OpenWorkflow is the best fit on storage but fails the maintenance check: `jamescmartinez` wrote 99 recent commits, and no other author wrote more than 2. It stays as a last fallback because it is the only easy SQLite option.

DBOS is healthy, but needs Postgres on a laptop unless an embedded option works. Its README was the only source checked for storage.

Questions the PoC must answer:

1. It runs inside `plico serve` with no framework and no external service.
2. Users never see a compile step or directives.
3. A run pauses for approval, survives a restart and resumes.
4. A crash during a tool does not silently run it twice.
5. The same project runs unchanged on Postgres.
6. Studio can show a full timeline.

If 1 or 2 fails, repeat the PoC with DBOS.

## Layer 2: Model calls

| Library | Version, licence | Weekly downloads | Stable releases | Verdict |
| --- | --- | --- | --- | --- |
| **AI SDK** | 7.0.159, Apache-2.0 | 41.9M | 237 | **Working pick** |
| **`pi-ai`** | 1.4.0, MIT | 10.4M | 23 | **Fallback 2** |
| **Own adapters** | No dependency | N/A | N/A | **Fallback 1** |
| TanStack AI | 1.0.1, MIT | 1.4M | 38 | Passed PoC 3, no advantage shown |
| Direct OpenAI, Anthropic SDKs | Apache-2.0 | 55M, 63M | 44, 27 | One provider each |
| OpenRouter SDK | Apache-2.0 | 1.4M | 241 | One route, better as a gateway option |
| LangChain core | MIT | 8.3M | 18 | Framework, overlaps what we own |
| Genkit | Apache-2.0 | 255K | 3 | Framework |
| Effect AI | MIT | 89K | 1 | 0.x, needs the Effect style |
| LlamaIndex.TS | MIT | 173K | 0 | Fails: last push March |
| Portkey gateway | MIT | 705 | 0 | Fails: last push May |
| LiteLLM | Licence unclear | N/A | N/A | A proxy. Possible gateway option |

Cost of building our own: every provider's streaming, tool and error format keeps changing, and users never see this work. PoC 3 showed the first version is small, so the cost is keeping up, not starting.

`pi-ai` downloads probably include its own coding agent, so they overstate outside adoption. TanStack AI depends on `@ag-ui/core`, which matters because AG-UI is our frontend protocol.

Vercel's reputation is mixed. The Next.js complaints are about hosting lock-in and falling satisfaction, and we found no clear decline in use. The AI SDK's concrete risk is stability:

- A major version roughly every 6 months: v5 in July 2025, v6 in December 2025, v7 in June 2026.
- v6 was described as its biggest breaking release since 3.0.
- A community report says patch `5.0.93` broke older clients.
- 1,539 open issues and PRs.

Conditions for adopting it:

1. Pin exact versions and upgrade deliberately.
2. Keep all AI SDK types inside one adapter behind `ModelProvider`.
3. Use provider packages with users' own keys, never the gateway by default. `ai` depends on `@ai-sdk/gateway`, and string model IDs appear to route through it.
4. Build a second small adapter on `pi-ai`. If that is painful, the interface has leaked.

Questions the PoC must answer:

1. One model turn with tools streams through our interface, with no SDK types leaking.
2. A stream can be aborted midway.
3. It runs on OpenAI, Anthropic and local Ollama with users' own keys and no gateway.
4. Provider features such as prompt caching pass through.

`ModelProvider` currently has only `complete()`, so it needs streaming and abort.

## Layer 3: Agent loop

| Option | Version, licence | Weekly downloads | Stable releases | Verdict |
| --- | --- | --- | --- | --- |
| **`WorkflowAgent`** (`@ai-sdk/workflow`) | 2.0.91, Apache-2.0 | 271K | 107 | **Primary** |
| **Own thin loop** | Ours | N/A | N/A | **Fallback 1** |
| **`pi-agent-core`** | 1.4.0, MIT | 7.7M | 23 | **Fallback 2** |
| `ToolLoopAgent` (in `ai`) | Apache-2.0 | Part of 41.9M | Part of `ai` | No durability of its own found |
| OpenAI Agents SDK | 0.21.0, MIT | 2.4M | 12 | Pre-1.0, brings its own agent model |
| Claude Agent SDK | 0.3.316, licence in its README | 17.1M | 83 | No SPDX open licence, built around Claude |
| Mastra | 1.81.0, Apache-2.0 plus `ee/` licence | 3.0M | 28 | Full framework, overlaps Plico |
| LangGraph | 1.6.0, MIT | 5.0M | 19 | Graph model, too much for a linear loop |
| Cloudflare Agents | 0.32.0, MIT | 3.4M (unreliable) | 14 | Pre-1.0, platform-oriented |

Frameworks would define the user's mental model, which is the part Plico owns.

`WorkflowAgent` reuses the most: loop, approvals, abort, `stopWhen`, `prepareStep` and telemetry. It is tested against Workflow SDK, with dedicated tests for approvals, concurrency and stream errors. Its risks are its youth (first published April 2026), a 3,775-line main file and many `experimental_` options.

The own loop is a real fallback because this is the one layer where building is cheap: the engine does the hard part. It also works if layer 1 ends on DBOS or OpenWorkflow. If it proves nearly as good, prefer it, since that reduces the single-vendor bet at little cost.

`pi-agent-core` is built around in-process state, so it may clash with replay.

Questions the PoC must answer:

1. `WorkflowAgent` runs the `internal-ops-agent` example with plain user tools.
2. An approval pauses, survives a restart and resumes.
3. Its callbacks expose everything Studio's timeline needs, with no `experimental_` options.
4. The same agent behaviour works with the own loop on the same engine.

## Layer 4: Event history

Split this layer in two. Build the event contract, because Studio, replay and evals are built on it. Reuse the storage if it holds up.

| Option | Version, licence | Weekly downloads | Stable releases | Verdict |
| --- | --- | --- | --- | --- |
| **Workflow SDK streams** | Part of `workflow` 5.2.3, Apache-2.0 | 2.45M | 22 | **Primary** |
| **Own append-only table** | Ours | N/A | N/A | **Fallback 1** |
| **Workflow SDK event log** | Same as streams | Same | Same | **Fallback 2** |
| AG-UI | 1.0.3, MIT | 4.3M | 6 | Keep as our output protocol |
| OpenTelemetry | 2.12.0, Apache-2.0 | 50M | 2 | Tracing, its own layer |
| Langfuse | SDK 3.39.2, MIT, repo licence unclear | 2.5M | 1 | Tracing tool, not a product timeline |
| Phoenix | 7.17.0, Apache-2.0, repo licence unclear | 77K | 21 | Same |
| Durable Streams | 0.2.7, Apache-2.0 | 502K | 1 | Fails: 1 author, last push September |
| Emmett | 0.42.4, licence not detected | 39K | 1 | Fails: pre-1.0, mostly one author |
| Cratis Chronicle | MIT | Not checked | Not checked | Separate event database, too heavy |

No maintained TypeScript library built for resumable agent timelines was found.

Primary design: Plico writes its own events through `getWritable()` inside steps, and Studio reads them by position with `getReadable({ startIndex })`. This could replace both our event store and our two-second SSE polling.

The own table works with any engine, and it is what we need if streams cannot answer queries. The engine's event log comes last because its shapes are engine concepts, such as steps and hooks, and stream data bypasses it.

Effect on ADR 0002: engine history would decide how a run executes, and Plico events would be the record for Studio, evals and audit. Studio replay becomes a view, not re-execution.

Concerns:

- How long stream data is kept in each store is unconfirmed, and audit depends on it.
- Streams are read by run and position, so cross-run queries may need a table.
- Retried steps can write events twice, so events need stable IDs.
- Streams can only be used inside steps, so events about workflow decisions need their own step.
- An event write and a step result may not commit together.

Questions the PoC must answer:

1. Plico events written to a stream rebuild Studio's full timeline after a restart.
2. A live reader resumes from a position.
3. A forced step retry shows no duplicates to readers.
4. Events survive a process restart on local storage and Postgres.
5. Runs can be listed and filtered by status without a separate table. If not, fallback 1 wins.

## Layer 5: Tools and MCP

Split this layer in two. Plico owns the `*.tool.ts` file format, because it is part of the folder contract. MCP connections are protocol work, so reuse them. Inside the runtime, both become one tool shape, so approvals, events and tracing treat them the same.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Official client v2** (`@modelcontextprotocol/client`) | 2.4.0, Apache-2.0 | 14.4M | 5 | **Working pick** |
| **`@ai-sdk/mcp`** | 2.0.88, Apache-2.0 | 8.0M | 112 | **Fallback 2** |
| Own client | About 215 lines, no packages | n/a | n/a | **Fallback 1** |
| `mcp-use` | 2.12.2, MIT | 44K | 43 | Out. Now a server framework; its client is `@mcp-use/client`, which wraps the official client and sends telemetry by default |
| Official SDK v1 (`@modelcontextprotocol/sdk`) | 1.32.2, MIT | 87.0M | 5 | Maintenance mode: fixes for at least six months from 2026-07-27 |
| `@mastra/mcp` | 2.7.0, Apache-2.0 | 1.0M | 18 | Part of a framework, overlaps Plico |
| `@langchain/mcp-adapters` | 2.0.1, MIT | 412K | 3 | Tied to LangChain |
| `fastmcp` | 4.23.8, MIT | 753K | 83 | For building servers, not verified as a client |

Why not build our own: the 2026-07-28 spec is reported as its largest revision, with a rewritten transport model, so the protocol keeps moving. Users never see this work.

The official client tracks the spec directly and adds no Vercel dependency. `@ai-sdk/mcp` is the easiest fit with the AI SDK, but older docs describe a lightweight client with no server notifications, and that needs rechecking on v2. Its 2.0.88 build does mention the 2026-07-28 spec version, which suggests support but does not prove it.

Concerns:

- v2 is only about three months old, and it replaced v1's package names.
- MCP servers can change their tool lists, so discovery should be a saved durable step.
- A stdio server process dies with a restart and needs reconnecting.
- Whether `WorkflowAgent` approvals cover MCP tools is unconfirmed.

Questions the PoC must answer:

1. A local tool and an MCP tool run through the same path, with the same events.
2. An MCP tool pauses for approval, survives a restart and resumes.
3. HTTP and stdio servers both reconnect after a restart.
4. An OAuth-protected server works.
5. No SDK types appear in the folder contract or events.

## Layer 6: Validation

Reuse. Validation is solved, and users already know these libraries. Inside Plico and on the wire, tool schemas stay JSON Schema, because that is what models and MCP servers use. Tool files should accept any library that implements Standard JSON Schema, so Plico does not force a choice on users.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Zod** | 4.6.7, MIT | 443.0M | 13 | **Primary** |
| **TypeBox** | 1.4.3, MIT | 16.6M | 32 | **Fallback 1**: its schemas already are JSON Schema |
| **Valibot** | 1.5.0, MIT | 32.0M | 1 | **Fallback 2**: smaller, but JSON Schema needs an extra package |
| ArkType | 2.2.9, MIT | 3.4M | 5 | Good, far smaller user base |
| Ajv | 8.20.0, MIT | 515.1M | 0 | Validates JSON Schema only, no type inference |
| Effect Schema | 4.1.1, MIT | 66.8M | 13 | Brings a whole programming model |

Zod is already required by the official MCP client (`^4.2.0`), the AI SDK and `@workflow/core`, so choosing it adds no new dependency.

Concerns:

- `@ag-ui/client` depends on `zod ^3.25.76`, so it could pull in a second Zod. PoC 8 later confirmed that even the core/encoder server closure includes Zod 3; omitting the client does not avoid it.
- Zod's JSON Schema output can be lossy for transforms and custom checks.
- `colinhacks` made 97 of the latest 100 commits. Activity is high, but it depends on one person.

Questions the PoC must answer:

1. A Zod tool, a Valibot tool and a plain JSON Schema tool all load and run.
2. One Zod version installs across the MCP client, the AI SDK and Plico.
3. Invalid model tool input produces a structured failure the model can correct.

## Layer 7: Database layer

There are two choices here: the database engine and the query layer. The engine is settled by the goal: SQLite locally for no setup, Postgres at scale. The query layer is the choice to test.

Layer 1 sets the size of this layer. If the engine and durable streams hold runs and events, Plico keeps only a small run index, so a query library has little to do. Plain SQL means two sets of queries, but only for a few tables.

Neither query library supports `node:sqlite` on a stable release. Kysely 0.29.8 ships no such dialect, only community ones. Drizzle 0.45.4 ships none either, and its `node-sqlite` tags are on 1.0 builds. Using one today would mean a workaround or a native module, and the maintenance rule says to avoid workarounds.

`@workflow/world-postgres` already depends on `drizzle-orm` 0.45.2 and `pg` 8.20.0, so Postgres deployments would get Drizzle anyway. `@workflow/world-local` stores files and has no SQLite dependency, so SQLite would hold only Plico's own data.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Plain SQL behind a store interface** | None | N/A | N/A | **Primary**: no dependency or workaround while tables stay few |
| **Drizzle** | 0.45.4, Apache-2.0 | 42.8M | 2 | **Fallback 2**: wait for 1.0 |
| **Kysely** | 0.29.8, MIT | 27.5M | 6 | **Fallback 1**: small, built-in migrations |
| Prisma | 8.0.0-rc.29, Apache-2.0 | 25.6M | 2 | Heavy for a few tables, and its `latest` tag is a release candidate |
| TypeORM | 1.1.2, MIT | 7.2M | 2 | Heavy for a few tables |
| MikroORM | 7.2.6, MIT | 1.4M | 14 | Heavy for a few tables |

Drivers: keep `node:sqlite`, and use `pg` for Postgres (8.23.1, MIT, 90.5M). `node:sqlite` adds no install step, which suits `npm create`. `better-sqlite3` (13.0.3, MIT, 15.4M) is the fallback, but it is a native module. `node:sqlite` is marked release candidate in Node 26 docs, and experimental warnings remain a concern on older versions.

PGlite (0.5.14, Apache-2.0, 36.2M) is worth one experiment: it would give one SQL dialect everywhere. It is limited to a single underlying connection, so it could only be the local option. Kysely and Drizzle both ship PGlite support.

Concerns:

- Plain SQL needs its own small migration runner and has to be tested on both databases.
- Kysely has one dominant maintainer: `igalklebanov` made 88 of the latest 100 commits.
- Drizzle's 1.0 work may be off the default branch, so its commit count is not a fair measure of activity.
- PlanetScale reportedly hired the Drizzle team in March 2026. That funds the project but ties it to a vendor.

Questions the PoC must answer:

1. The same store tests pass on SQLite and Postgres.
2. Migrations run on both, from a published package.
3. Once layers 1 and 4 are settled, how many tables does Plico still own? Above about five, move to Drizzle 1.0 if it has shipped.

## Layer 8: HTTP server

The server is about 1,900 lines of TypeScript, tests included, and already has hand-written body parsing, errors, static files and SSE. Findings 4 and 20 are both streaming gaps in that code. This is not product work, so reuse a framework but keep the `/v1` contract and `@plico/contracts` types.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Hono** with `@hono/node-server` | 4.13.16, MIT | 100.9M | 18 | **Primary**: no dependencies, web-standard, built-in SSE helper |
| **Own `node:http`** | None | N/A | N/A | **Fallback 1 after PoC 5**: works, and is the exit |
| **Fastify** | 5.12.7, MIT | 21.4M | 11 | **Fallback 2 after PoC 5**: fastest, but 48 added packages and no `fetch` handler |
| h3 | 2.0.8, MIT | 35.2M | 8 | Good, smaller ecosystem for server APIs |
| Express | 5.3.0, MIT | 196.6M | 2 | 28 dependencies, older design |
| Elysia | 1.4.30, MIT | 1.9M | 1 | Bun first |
| tRPC, oRPC | 11.22.1, 1.16.1, MIT | 7.9M, 2.9M | 2, 12 | RPC style conflicts with the versioned `/v1` REST contract |

Hono's web-standard handler also lets Plico run on serverless platforms later, with the same code.

The Workflow SDK lists guides for Hono, Fastify and Express, so it does not settle this choice. Its Hono guide uses Nitro, but PoC 1 ran the standalone build on plain `node:http` without it, with no build in the user's project. Mounting the flow route in Hono is untested.

Concerns:

- Hono has one dominant maintainer: `yusukebe` made 60 of the latest 100 commits.
- Long-lived SSE on the Node adapter needs testing under load. I found no solid benchmark.

Questions the PoC must answer:

1. The contract test in `packages/server/src/contract.test.ts` passes without changing its snapshot.
2. `plico serve` works on a user's project with no build config in that project.
3. SSE supports `Last-Event-ID` and sends no duplicates or gaps across a reconnect.
4. A client disconnect cancels the stream cleanly.

## Layer 9: Tracing

Build the mapping, reuse the standard. Plico's events drive Studio. Traces send the same run to outside tools. Plico should not build a tracing backend.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **`@opentelemetry/api` with GenAI conventions** | 1.10.0, Apache-2.0 | 133.2M | 1 | **Primary**: vendor neutral, does nothing unless the user adds an SDK |
| **OpenInference conventions** | 2.15.0, Apache-2.0 | 0.6M | 10 | **Fallback 1**: more agent detail, tied to the Arize ecosystem |
| **Plico events with an exporter** | None | N/A | N/A | **Fallback 2**: full control, more to maintain |
| `@langfuse/otel` | 6.1.0, MIT | 4.0M | 13 | Not a competitor: an exporter to document on top of the primary |
| OpenLLMetry (`@traceloop/node-server-sdk`) | 0.27.0, Apache-2.0 | 0.3M | 0 | No release since June, 35 dependencies |
| `mlflow-tracing` | 0.1.3, Apache-2.0 | 15K | 0 | Too early |

The Workflow SDK packages also take `@opentelemetry/api` as a peer dependency, which supports this choice. Plico should depend on the API package only. `@opentelemetry/sdk-node` has 23 dependencies, and the choice of exporter belongs to the user.

Concerns:

- GenAI conventions are still in Development, and they moved to a dedicated repository. Keep all attribute names in one mapping file.
- The initial audit did not find v7 telemetry docs. PoC 9 below found and tested the current `@ai-sdk/otel` integration; initial assumptions about the API and SDK package names are superseded by that result.
- Span parents must survive a durable resume, which may happen in a different process.

Questions the PoC must answer:

1. One run gives a single connected trace across a restart.
2. Model calls from the AI SDK appear under Plico's run and step spans, with no duplicates.
3. With no SDK installed, tracing costs nothing and needs no setup.
4. Prompt and output recording is off by default.

## Layer 10: Frontend protocol

Plico owns the run event contract. AG-UI is a mapping on top of it, as ADR 0004 says, so the frontend protocol can change without changing stored events.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **AG-UI** (`@ag-ui/core`) | 1.0.3, MIT | 4.3M | 6 | **Primary**: neutral protocol, works with several frontends |
| **AI SDK UI message stream** (`@ai-sdk/react`) | 4.0.163, Apache-2.0 | 12.9M | 240 | **Fallback 1**: easiest with the AI SDK, more Vercel dependence |
| **Native SSE only** | None | N/A | N/A | **Fallback 2**: `@plico/react` on Plico's own events |
| CopilotKit | 1.83.0, MIT | 0.7M | 43 | A UI product, 31 dependencies. A consumer of AG-UI |
| assistant-ui | 0.15.32, MIT | 2.8M | 31 | UI kit, not a protocol. Candidate for `@plico/react` later |
| A2A (`@a2a-js/sdk`) | 1.3.0, Apache-2.0 | 5.7M | 4 | For agent-to-agent, a different job |

Initial preference: AG-UI first for an event-oriented integration. PoC 8 below supersedes a single-protocol choice: both adapters can read the same Plico log, independently of the model provider.

Wider field for PoC 8, added on 2026-11-02. The goal is the most flexibility for users, and popularity now counts, so the question is which protocols can run as swappable adapters over Plico's events. These are npm downloads for the last month, and they include installs pulled in by other packages, so they show reach and not direct choice.

| Option | Version, licence | Monthly downloads | Role | PoC 8 |
| --- | --- | --- | --- | --- |
| AI SDK (`ai`, `@ai-sdk/react`) | 7.0.159, 4.0.163, Apache-2.0 | 121.2M, 38.3M | Stream and React client | Adapter arm |
| AG-UI (`@ag-ui/core`, `@ag-ui/client`) | 1.0.3, MIT | 11.2M, 5.9M | Neutral event protocol | Adapter arm |
| Own events over SSE | None | N/A | Build-our-own, and the base for the adapters | Arm |
| TanStack AI (`@tanstack/ai`, `@tanstack/ai-react`) | 1.0.1, MIT | 3.3M, 2.1M | Client whose docs describe AG-UI based chunks | Client on the AG-UI adapter |
| assistant-ui (`@assistant-ui/react`) | 0.15.32, MIT | 8.0M | UI kit with AI SDK and AG-UI runtimes | Client on both adapters |
| CopilotKit (`@copilotkit/react-core`) | 1.83.0, MIT | 1.9M | UI product on AG-UI | Client on the AG-UI adapter |
| Durable Streams (`@durable-streams/client`) | 0.2.7, Apache-2.0 | 1.6M | Resumable HTTP delivery, not an event format | Compare with own offset resume |
| `resumable-stream` | 2.2.13, ISC | 2.0M | Resume helper | Read only, compare with own offset resume |
| A2UI (`@a2ui/react`) | 0.15.0, Apache-2.0 | 0.6M | UI content the agent sends, pre-1.0 | Carry one payload through |
| MCP Apps (`@modelcontextprotocol/ext-apps`) | 2.0.4, MIT | 21.2M | UI supplied by MCP servers | Carry one payload through |
| `@langchain/langgraph-sdk` | 1.12.9, MIT | 16.2M | Tied to the LangGraph server API | Out, it would bring that model in |
| OpenAI ChatKit (`@openai/chatkit`) | 1.9.0, MIT | 0.4M | Tied to one vendor | Out for now |

PoC 8 scenarios, the same for every arm: text streaming, tool calls, an approval, a subagent, compaction shown, a dropped connection resumed from an offset, and two clients on one run. Measures: what each adapter loses from Plico's events, adapter lines, packages added, and the work to add one more adapter.

Concerns:

- AG-UI interrupt support is partly marked draft in its events docs and may change. Plico's approvals depend on it.
- Use `@ag-ui/core` and `@ag-ui/encoder` only. `@ag-ui/client` brings RxJS and pins Zod 3.
- AG-UI's main backer is CopilotKit, so check that the project stays neutral.
- This depends on what `WorkflowAgent` streams. If it only produces the AI SDK format, Plico must convert.

Questions the PoC must answer:

1. Every Plico event maps to AG-UI, or is deliberately dropped, with a test.
2. An approval pauses a run and resumes it through AG-UI.
3. An unmodified AG-UI client, such as assistant-ui's adapter, renders a Plico run.
4. A reconnect replays from Plico's event history without loss.

## Layer 11: Folder contract, CLI and Studio

Build the folder contract, CLI commands, Studio, evals and readiness. This is the product, and nothing outside would fit it. Reuse the plumbing underneath, where the code has the most gaps.

TypeScript loading. Plico ships `typescript` as a runtime dependency, transpiles one file and imports it through a `data:` URL, which is the cause of finding 9.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **`tsx`** | 4.23.15, MIT | 132.3M | 14 | **Primary**: active, loads through esbuild, which adds a native binary |
| **`jiti`** | 2.7.0, MIT | 241.1M | 0 | **Fallback 1**: no dependencies, but no commits on `main` since May |
| **Node type stripping** | Built in | N/A | N/A | **Fallback 2**: no dependency, but no `enum` or path aliases |

`jiti` was the natural fit, but it fails the maintenance check for now, the same check that rejected OpenLLMetry. `tsx` has one dominant committer: `privatenumber` made 39 of 47 commits since 1 August.

PoC 1 found that whichever loader is used must stay outside the workflow bundle, and that `tsx` wraps the default export, so tool loading has to unwrap it.

CLI parsing. `args.ts` is hand-written, which is the cause of finding 22.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Commander** | 15.0.0, MIT | 726.9M | 0 | **Primary**: mature, no dependencies, handles unknown flags and help. 27 commits on `develop` since 1 August |
| **`cac`** | 7.1.0, MIT | 67.1M | 2 | **Fallback 1**: small and active |
| **`node:util` `parseArgs`** | Built in | N/A | N/A | **Fallback 2**: no dependency, with less help |
| `citty` | 0.2.2, MIT | 47.7M | 0 | Still 0.x |
| `yargs` | 18.2.0, MIT | 370.1M | 1 | 6 dependencies, more than needed |
| oclif | 5.1.11, MIT | 16.1M | 18 | 18 dependencies, a framework |

Commander passes the maintenance check despite no release since May: its work happens on `develop`, the latest commit there was 31 October, and only 15 issues and PRs are open.

Keep `@clack/prompts` (1.8.1, MIT, 41.4M) for `create-plico`.

Studio. Keep React and Vite. Use TanStack Query (5.105.1, MIT, 79.4M) for findings 26, 28 and 29, and TanStack Router (1.170.46, MIT, 21.7M) for finding 27. React Router (8.5.1, MIT, 74.1M) is the router fallback. Hand-written code stays the final fallback. Add Tailwind (4.3.3, MIT, 167.7M) and Base UI (1.9.0, MIT, 26.2M) only when the UI work needs them. Skip React Flow while the runtime is linear.

These choices do not need a PoC with the runtime. Test each one when its code is next changed, except loading, which the layer 1 PoC must cover: the Workflow SDK's build transform also affects how tool files load.

Questions to check when adopted:

1. A tool file can import a sibling file and an npm package.
2. `plico validate --jsn` fails with a clear error.
3. `/runs/abc` opens that run, and fast clicks never show another run's events.

## Layer 12: Memory

Build the default. Epic #78 asks for explicit, inspectable local memory, and leaves semantic recall out of scope. Memory libraries mostly solve fact extraction, deduplication and retrieval, which that scope does not need. The `memory/` folder is part of the project contract, so its format is product work.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Own Markdown memory** | None | N/A | N/A | **Primary**: readable, diffable, works in Git |
| **Mem0** (`mem0ai`) | 3.3.1, Apache-2.0 | 0.24M | 9 | **Fallback 1**: the optional adapter ADR 0003 names |
| **Own search on SQLite FTS5** | None | N/A | N/A | **Fallback 2**: the next step when search is needed |
| `@mastra/memory` | 1.40.0, Apache-2.0 | 1.59M | 24 | Tied to Mastra |
| Letta client | 1.12.1, Apache-2.0 | 0.11M | 0 | Needs a server, no client release since June |
| Zep, Supermemory | 4.0.1, 5.1.0 | 0.21M, 0.18M | 7, 6 | SDKs for hosted services, which does not fit local-first |
| `sqlite-vec` | 0.1.9, MIT or Apache-2.0 | 1.53M | 0 | No commits since 1 August, no release since March |

Concerns:

- Published memory benchmarks are mostly vendor-reported and disputed, so they should not drive this choice.
- Files do not work on a host with no writable disk. Keep a small store interface, with a Postgres version for production.
- Two runs can write at once, so writes need a safe merge rule.
- Saved memory goes back into prompts, so a bad write can become prompt injection. Writes must go through tool policy and appear in events.

Questions the PoC must answer:

1. A resumed run does not write the same memory twice.
2. A person can read and edit memory files and see the effect on the next run.
3. A second adapter fits the store interface with no change to the project contract.

## Layer 13: Artifacts

Build the versioning, reuse the pieces. Epic #73 needs each write versioned, linked to a run, diffable and exportable. Object storage and large binaries are out of scope.

A content-addressed store is a small amount of code: save each file under its SHA-256 hash, and record the version in an event. The hash deduplicates content bytes. Deduplicating retried write versions additionally requires a stable operation receipt; PoC 10 below tests that distinction.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Own content-addressed store** | None | N/A | N/A | **Primary**: small, and works on Postgres or object storage later |
| **`isomorphic-git`** | 1.44.9, MIT | 3.31M | 39 | **Fallback 1**: real Git history, 11 dependencies, volunteer maintained |
| **`simple-git`** | 4.0.2, MIT | 15.29M | 3 | **Fallback 2**: needs Git installed on the host |
| AgentFS (`agentfs-sdk`) | 0.6.4, MIT | 0.03M | 0 | Alpha or beta, no commits since 1 August |
| `just-bash` | 3.6.0, Apache-2.0 | 2.98M | 5 | A shell for agents, not version storage |

Reuse for the pieces:

- **Diffs:** `diff` (9.0.0, BSD-3-Clause, 186.90M, 16 commits since 1 August).
- **Studio diff view:** `@pierre/diffs` (1.6.2, Apache-2.0, 4.89M, 16 releases). Check when #74 needs it.
- **Export:** copy to a folder first, which needs no dependency. If zip is needed, `fflate` (0.8.3, MIT, 141.62M) has had no commits since 1 August, so check it then.
- **Object storage:** wait until it enters an epic. `unstorage`'s `latest` tag is a 2.0 beta, and `flydrive` is small.

Git is tempting because users could run `git log` on artifacts, but a nested repository inside a project is awkward and would not work on Postgres. An export to a Git folder gives most of that value.

Questions the PoC must answer:

1. A retried durable step creates one version, not two.
2. Two runs writing one path both keep their versions.
3. Binary files are versioned, and diffs say so clearly instead of failing.

## Layer 14: Eval scorers

Plico's runner, replay and readiness gate stay built, because they are the main value of the product. Scripted checks stay built too. The open question is LLM-judged scoring, which needs tested prompts and is a real reuse candidate.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **`autoevals`** | 0.4.1, MIT | 0.80M | 2 | **Primary**: scorers only, no platform required |
| **Own scorers on the AI SDK** | None | N/A | N/A | **Fallback 1**: small, but the prompts need evaluating too |
| **`vitest-evals`** | 0.17.0, Apache-2.0 | 0.23M | 3 | **Fallback 2**: from Sentry, tied to Vitest |
| Promptfoo | 0.125.1, MIT | 1.11M | 9 | 76 dependencies, a whole eval product. OpenAI acquired it in March 2026 |
| Evalite | 0.19.0, MIT per GitHub | 0.61M | 0 | No release since November 2025, no commits since 1 August |
| `@mastra/evals` | 1.10.10, Apache-2.0 | 0.41M | 14 | Tied to Mastra |
| Braintrust SDK | 3.42.0, MIT | 2.35M | 19 | Client for a commercial platform |

Concerns: `autoevals` is still 0.x, has 8 dependencies, and had only 9 commits since 1 August. Keep it behind a Plico scorer interface. LLM scorers need a model key, so they must stay optional. This does not need to be in the first PoC.

## Layer 15: Skills format

Reuse the standard, build the loader. Plico uses flat files such as `skills/triage.md`. The Agent Skills standard uses a folder with a `SKILL.md` file, name and description metadata, and optional scripts and references.

| Option | Verdict |
| --- | --- |
| **Agent Skills standard** | **Primary**: skills work across tools, needs no dependency, and suits the folder model |
| **Support both layouts** | **Fallback 1**: only if flat files must stay |
| **Keep flat `skills/*.md`** | **Fallback 2**: simplest, but Plico would keep its own format for no benefit |

Adopt its loading model too. Today `packages/runtime/src/instructions.ts` joins every skill's full text into the instructions for every run. Instead, only each skill's name and description should go in the instructions, and the agent should load the full `SKILL.md`, then any references, when it needs them. This needs real tool calling, so it belongs with #70. A skill load must be a tool call with an event, must stay inside `skills/`, and must replay the same content after a restart. `plico validate` should reject a skill with no description, since the model cannot choose it otherwise.

This changes the public project contract, which is cheap only before the first publish. Adoption figures come from secondary sources, and those sources also report malicious skills on community hubs, so Plico should not install skills from hubs automatically. Skill scripts need a policy decision before Plico runs them.

## Layer 16: Host auth

Keep this out of Plico. ADR 0005 and #81 already say the host app supplies identity through request context, and Plico does not manage users. That still holds, and nothing here needs a PoC.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Host-supplied context** | None | N/A | N/A | **Primary**: small and framework neutral |
| **`jose` token helper** | 6.2.14, MIT | 216.45M | 8 | **Fallback 1**: if `plico serve` needs its own protection |
| **`better-auth` example** | 1.7.15, MIT | 17.13M | 25 | **Fallback 2**: a documented example, not a dependency |
| `@auth/core` | 0.41.3, ISC | 6.43M | 0 | Not needed |
| Lucia | 3.2.2, MIT | 0.59M | 0 | No release since 2024 |

The official MCP client already depends on `jose`, so that helper would add nothing new.

## Layer 17: Sandboxes

Defer. The PRD lists sandbox backends as a pluggable edge, but the flagship demo needs no code sandbox and no epic covers it. Picking now would be a choice with no requirement behind it.

When that changes, the candidates are `just-bash` (3.6.0, 2.98M) for local use, E2B (2.62.0, 2.88M), `@vercel/sandbox` (3.9.1, 7.61M), `@cloudflare/sandbox` (1.0.3, 1.13M), Daytona (0.227.0, 0.99M) and `isolated-vm` (7.0.2, 1.41M).

Tool handlers are the user's own code and run with Plico's access. The docs must say so plainly: skill scripts or agent-generated code are not safe to run that way.

## Layer 18: Harness capabilities

Layer 3 chose the loop, not what sits around it. A harness or "deep agent" is still a ReAct loop. What it adds is context handling for long tasks: compaction, planning, a workspace, subagents and progressive skills. A plain loop falls over on long tasks without these.

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Verdict |
| --- | --- | --- | --- | --- |
| **Own capabilities on the loop** | None | N/A | N/A | **Working pick**: small durable pieces with Plico events and approvals |
| **`deepagents`** | 1.16.2, MIT | 0.60M | 17 | **Fallback 1**: the best design to learn from, but needs LangChain and LangGraph |
| **`@ai-sdk/harness`** | 1.0.170, Apache-2.0 | 0.47M | 109 | **Fallback 2**: a later adapter for coding agents, experimental; ran on Gemini through Pi in PoC 7, no subagents there |
| Claude Agent SDK | 0.3.316, licence in its README | 17.10M | 83 | Built around Claude, no SPDX open licence |
| `pi-coding-agent` | 1.4.0, MIT | 5.98M | 23 | A full coding agent, 22 dependencies |
| OpenCode SDK | 1.19.5, MIT | 37.69M | 31 | Client for a coding agent |

Why not adopt one as the core:

- `deepagents` has eight LangChain peer dependencies, including LangGraph and its checkpoints. That would be a second durable state model beside layer 1, and its concepts would reach users.
- Harnesses run their own loop and tools, usually in a sandbox. Plico's events, approvals and evals see only what they expose, and those are the parts that give Plico its value.
- Coding harnesses suit coding work. The flagship is an internal ops agent with no sandbox.

`WorkflowAgent` exposes `prepareStep`, but its type definitions mention no compaction or subagents. Plico would need these whichever loop wins.

Build order, using `deepagents` as a reference:

1. Progressive skills, from layer 15.
2. Compaction, because long runs fail without it. Large tool results move to the workspace.
3. Workspace, which is the layer 13 artifact store.
4. A planning tool, which is small: a saved task list shown in Studio.
5. Subagents, as child durable runs with their own events. This comes last and needs a folder contract decision.

Proposed shape: each capability is a first-party option in `plico.config.ts`. Compaction is on by default, and the others are opt-in. A capability bundles its tools, instructions, loop hooks, events, Studio view and readiness checks. Each run saves its capability settings, so a resume behaves the same way. Third-party capabilities wait until the internal interface has proved stable, as a later versioned contract.

Questions the PoC must answer:

1. A long run compacts and continues, with the same result after a restart.
2. A subagent survives a restart and its approval reaches the parent run.
3. Studio shows what compaction removed.

## PoC 1 results: durable execution

Date: 2026-11-02. Windows 11, Node 22.23.3, `workflow` 5.2.3 with its local file storage, and DBOS 5.4.0 on embedded Postgres. The code is throwaway, in `D:\projects\plico-poc`. It uses a scripted model, so no real provider was involved.

Setup: a user folder with `agent.md` and two plain `*.tool.ts` files, one importing a sibling file. It has no `package.json`, no build config and no engine imports. Each engine ran it from a plain `node:http` server.

| Test | Workflow SDK | DBOS |
| --- | --- | --- |
| Runs without Nitro or a user build | Pass, with a standalone build done ahead of time | Pass, no compile step |
| Same tool files, unchanged | Pass | Pass |
| Hard kill while waiting for approval, then approve | Pass, no repeated side effects | Pass, no repeated side effects |
| Crash inside a tool, then restart | Recovers, but repeats the side effect | Recovers, but repeats the side effect |
| Local database needed | None, files only | Postgres |
| Build output | 8.3 MB bundle | None |
| Installed packages | 393 entries, 226 MB | 27 entries, 121 MB, of which 107 MB is the embedded Postgres binary |
| Rough startup, three runs | About 1.4 s | About 0.6 to 0.8 s, with Postgres already running |

The table above is the first round. It led to "Workflow SDK stays primary", which the second round below replaces.

### Second round: build-our-own arm and a kill while busy

Every PoC now includes a build-our-own arm. This one is a 91-line engine on `node:sqlite` with a step journal, replay, durable approval waits, retries, and leases so another worker can take over. It adds no dependency beyond the TypeScript loader.

Scenario C is new: a hard kill while a tool is running, with an earlier step already saved. It ran on all three engines.

| Test | Own engine | Workflow SDK, Local World | DBOS |
| --- | --- | --- | --- |
| Kill while waiting for approval | Pass | Pass | Pass |
| Crash inside a tool | Recovers, repeats the side effect | Recovers, repeats the side effect | Recovers, repeats the side effect |
| Kill while a tool is running | Pass, finished within the 6 s test wait | **Stalled for the rest of the 860 s lease** | Pass, 2 s |
| Second worker takes over | Pass | Not tested | Not tested |
| Added install size | 1.8 MB, the loader only | 226 MB | 121 MB |

The Workflow SDK stall has a confirmed cause. A step's start record names the queue message that owns it, and a replay from any other message waits for an 860-second lease, in case the owner is still alive. The restart's recovery message is not the owner. The run finished 6 seconds after the lease ended, with each side effect once. With `WORKFLOW_INLINE_OWNERSHIP_LEASE_SECONDS=5` it finished in 2 seconds, also with each side effect once. Lowering the lease risks a second execution of a step that outlives it, which was not tested.

Scenario B escaped this only by timing. The crash came within milliseconds, before the step's start was stored, so the restart treated the step as new. Most of a real agent's time goes to model and tool calls, so a kill during one will usually stall. Whether the Postgres World behaves the same way is untested. From source comments, not tested: the lease is sized for Vercel's function limits, and those comments say self-hosted backends get no proof the owner has died.

Findings on the own engine: 91 lines passed everything, but they cover the easy part. It has no answer yet for changing agent code with runs in flight, for a stale worker that acts after losing its lease, or for Postgres under load. Those problems mostly disappear for a single process on SQLite, and they are the real work in production.

Temporal was not run. The table above rejects it for needing a cluster, and it remains the strongest engine at scale. It should go through these scenarios before being ruled out for good.

Working decision, 2026-11-02: a Plico engine interface with the own engine on SQLite for local use and DBOS on Postgres for production. This keeps `npm create` free of Postgres and leaves the hard production problems to a maintained engine. The main risk is the two engines behaving differently, so both must pass one shared crash test suite. The interface is still unproven, so the next PoC runs one loop on both engines. If it fails, this decision comes back for review. The Postgres World and Temporal are not required now. Each must pass the same scenarios before it can become an adapter.

Long-term open source check, 2026-11-02. The licences do not separate the options: DBOS and Temporal's SDK are MIT, and the Workflow SDK is Apache-2.0. All three are controlled by one company, and each sells a managed service. So the test is whether Plico survives if a vendor changes course. The own engine, the Plico engine interface and the shared crash suite are what make leaving possible. DBOS's MIT code can be forked, and a Postgres backend for the own engine is the last resort.

The first-round notes below still apply, except that the Workflow SDK is no longer assumed to be primary.

What this showed:

- **Nitro is not needed on `node:http`.** Plico should be able to compile its own workflow when it publishes, though that was not tried. User tools load at run time inside steps, so user projects never build.
- **Portability holds at the tool level.** The tool files were unchanged, but the loop was written twice. A Plico engine interface still has to prove it can hide that.
- **Crash retries are real on every engine tested.** A step that dies after its side effect runs again. Tools with side effects need an idempotency key that stays the same on a retry, and Plico's docs must say this. The Workflow SDK documents `getStepMetadata().stepId` as stable across retries, but that is engine-specific. The proposed shape, not yet verified, is `runId` plus the tool-call id from the checkpointed model output, passed in the tool context, which should hold on either engine.
- **The TypeScript loader must stay outside the bundle.** Bundled, `tsx` hung and `jiti` failed. Marked external, both passed. `tsx` also wraps the default export. Node type stripping loaded the tool outside the bundle, but was not run inside a step.

Build work the Workflow SDK needed, checked against its bundled docs:

- `externalPackages` needed the programmatic `StandaloneBuilder`, because the `wf build` CLI config does not set it. The docs say production integrations should extend `BaseBuilder`, so the real integration needs a small builder of Plico's own.
- The server forwards the flow route by hand and calls `world.start()` after listening. Both are documented, so they are the normal custom-host path and not workarounds.
- The Local World is documented as designed for development, not production. Self-hosted production means the Postgres World.
- The Local World's docs say it deleted a data directory in the old layout when it started after an upgrade. Keeping a run history across SDK upgrades in local storage needs care.

Not tested: a real model, streaming, a Plico engine interface, Postgres on the Workflow SDK, Temporal, mounting the flow route in Hono, in-flight runs across a Plico upgrade, a stable idempotency key across a retry, tools importing npm packages, publishing as a real package, and the speed test against hand assembly.

## PoC 2 results: engine interface, agent loop and event storage

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc2`. Same machine as PoC 1, with `tsx` loading the tools outside any bundle.

The interface is small. A loop sees `ctx.step(name, fn)` and `ctx.wait(name)`. A host sees `start`, `run`, `signal`, `status` and `steps`. The DBOS adapter is 39 lines. The own engine is 97.

Every combination ran the same seven-scenario suite with a scripted model.

| Scenario | Own engine, own loop | DBOS, own loop | Own engine, `pi-agent-core` | DBOS, `pi-agent-core` |
| --- | --- | --- | --- | --- |
| A. Kill while paused | Pass | Pass | Pass | Pass |
| B. Crash in a tool after its side effect | Pass | Pass | Pass | Pass |
| C. Kill while a tool is running | Pass, 3.0 s | Pass, 1.8 s | Pass, 3.0 s | Pass, 2.1 s |
| D. Crash after an event, before its checkpoint | Pass | Pass | Pass | Pass |
| E. Event reader resumes from a position | Pass | Pass | Pass | Pass |
| F. New version while paused | Pass | Pass, with adoption | Pass | Pass, with adoption |
| G. Code changed while paused | Fails the run safely | Fails the run safely | Fails the run safely | Fails the run safely |

All four arms produced an identical 14-event timeline, gapless and in order.

A real Gemini run (`gemini-3.5-flash-lite`, own loop) was killed while paused, then approved after restart, on both engines. Both completed three model turns with the same 14 events, and each side effect ran once. `pi-agent-core` was only run with the scripted model.

Results by layer:

- **Layer 1, the interface holds.** One loop ran unchanged on both engines. This was the condition on the working decision.
- **Layer 3, own loop stays primary.** `pi-agent-core` works, because replay can wrap its model and tool seams in steps. But the loop came to 66 lines against 46 for our own, and adds pi's packages, about 6 MB, whose `pi-ai` dependency pulls in several provider SDKs. It also turns tool errors into results for the model, so an engine error raised inside a tool step may be hidden. That was not tested.
- **Layer 4, own event table stays primary.** Position comes from the loop, so a retried write cannot duplicate, and scenario D confirmed that. Deriving events from the engine does not work well: DBOS's step log includes its internals, such as `DBOS.recv` and `DBOS.sleep`, so each engine would need its own mapping, and neither log has Plico's event data.

Findings to carry forward:

- **Idempotency key:** `runId:turn:callIndex` stayed the same across a retry on both engines, and the external ledger applied the effect once. This replaces the tool-call id proposal, because Gemini may not return ids.
- **The own engine needed a replay check.** Without one it would hand a run the wrong saved result after a code change. It now compares step names, as DBOS does.
- **Upgrades need a policy.** DBOS will not recover a paused run on a new version. The adapter adopts it with cancel and rewind, which worked here but is not a documented upgrade path that I found. A run whose steps changed fails safely, so it is lost, not corrupted. Plico should warn before an upgrade that would strand runs.
- **A failed run needs an event.** In scenario G the engine reported `failed`, but the event log just stops, so Studio would show nothing.
- **Provider outages need their own retries.** A real Gemini 503 used up DBOS's three step retries and failed a run after its side effects had happened. Model calls need longer backoff than tools, and quota errors should pause or fail clearly.
- **A timed-out wait looks like a denial.** `DBOS.recv` returns null on timeout, and this loop treats that as denied. The adapter uses 30 days, but the interface needs an explicit timeout result.
- **The own engine was slower here.** Start to pause took a median of about 640 ms against 157 ms for DBOS over 20 runs. It was not tuned, and this matters little for local use.

Not tested here: streaming, parallel tool calls, several DBOS workers (PoC 13 covers this), load (PoC 13 covers this), a real upgrade with changed code that still replays, and `pi-agent-core` with a real model.

## PoC 3 results: model calls

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc3`. Real calls used `gemini-3.5-flash-lite`, the only provider key available.

The interface is one method, `provider.stream(request)`, which yields text deltas, tool calls and a finish event, and throws one error type with a kind and a retryable flag. The suite and interface import no library. Every arm ran the same scenarios. Failure scenarios used a local server replaying recorded real Gemini streams, so they did not depend on quota.

| Scenario | Own | AI SDK | `pi-ai` | TanStack AI |
| --- | --- | --- | --- | --- |
| A. Streamed tool call, then follow-up after JSON round trip | Pass | Pass | Pass | Pass |
| B. Two tool calls in one reply | Pass | Pass | Pass | Pass |
| C. Abort a real stream | Pass, 1 ms | Pass, 6 ms | Pass, 1 ms | Pass, 1 ms |
| C2. Abort closes the connection | Pass, 3 of 200 chunks | Pass, 3 of 200 | Pass, 3 of 200 | Pass, 3 of 200 |
| D. Only the provider's host contacted | Pass | Pass | Pass | Pass |
| E. Thinking option reaches the request | Pass | Pass | Pass | Pass |
| E2. Cached tokens reach usage | Pass, 2,034 | Pass, 2,034 | Pass, 2,034 | Pass, 2,034 |
| F. 429, 503, 401: one request, right kind | Pass | Pass | Pass | Pass |
| F2. `Retry-After` reaches the interface | Pass | Pass | Not found | Not found |
| G. Cut or closed stream is an error | Pass | Pass, adapter must check | Pass | Pass |
| H. Patient retries inside one engine step | Pass | Pass | Pass | Pass |
| I. Mid-stream failure retries with a reset | Pass | Pass | Pass | Pass |
| J. Abort is not retried or saved | Pass | Pass | Pass | Pass |

| Measure | Own | AI SDK | `pi-ai` | TanStack AI |
| --- | --- | --- | --- | --- |
| Adapter lines for Gemini | 79, with SSE parser | 59 | 51 | 58 |
| Installed size | 0 | 27 MB, 33 MB with OpenAI and Anthropic | 87 MB | 41 MB |
| Packages | 0 | 17 | 87 | 55 |
| Import time | 6 ms | 159 ms | 447 ms | 363 ms |

Results:

- **The interface holds.** All four sit behind it in 51 to 79 lines, so changing library later means replacing one file.
- **The tests tie.** Every arm passed. Our own adapters needed no workarounds for scenario G, while the AI SDK adapter needed two, and our own arm installs nothing. Gemini and the OpenAI format took 139 lines, and both worked on a real server after a 3-line fix for the signature. That is less than this audit assumed when it ruled out building.
- **Upkeep decides it, so the working pick stays the AI SDK behind the Plico interface.** About 10 of the 40 most recent commits to `@ai-sdk/google` since 1 August fix the chat path: streamed tool arguments, in-stream errors, interrupted streams, metadata lost on replay, and undercounted usage. `@ai-sdk/anthropic` had 64 source commits in the same period, and its adapter handles `cache_control`, thinking blocks and beta headers. The built `google` and `anthropic` packages are about 300 KB each, against our 65-line Gemini adapter. Our adapters match on what was tested, not on those cases: for example, ours does not read in-stream errors.
- **Own adapters are the fallback and the exit.** The AI SDK is a single-vendor dependency with a major version about every 6 months. A small own adapter limits that risk, and may be worth shipping for the OpenAI format alone, which covers local servers.
- **`pi-ai` and TanStack AI both work,** but neither showed an advantage here. `pi-ai` installs provider SDKs a Gemini-only setup does not use. TanStack's AG-UI dependency goes to PoC 8, layer 10.

Findings to carry forward:

- **Messages need an opaque provider slot.** Gemini returned 400 when the `thoughtSignature` was stripped from a tool call. The slot survived JSON in every arm, so it works with engine steps. History therefore belongs to one adapter, and moving a run between providers mid-way is unproven.
- **There must be one retry layer.** With library retries set to 0, a wrapper inside the step made all retries, and the engine's step retries were turned off for model calls. This needs `ctx.step(name, fn, { retries })`, which DBOS must also map to.
- **Deltas need a reset event.** A retry after a mid-stream failure streams text again, so a reader must be told to discard what it showed.
- **Adapters must normalise, not pass through.** The AI SDK reports a closed stream as finish reason `interrupted`, and a cut stream as an error with status 200. `pi-ai` counts `input` without cached tokens: 3,439 against 5,472. These are the bugs a shared adapter test suite should catch.
- **A user abort ends the run as `failed`.** In scenario J that was the only outcome available, so Studio could not tell a stop from a crash. The interface needs a cancelled outcome.
- **Live streams are not replayed.** Deltas exist only during a step. On recovery a saved model step returns its result with no deltas, so Studio must rebuild from events.

Not tested:

- **Real OpenAI, Anthropic or Ollama.** No keys or local model were available, and LM Studio's install is broken. The audit's third question is only partly answered: our own adapter and the AI SDK's OpenAI-compatible package ran against Gemini's OpenAI-compatible endpoint, a real server but not OpenAI. Anthropic's `cache_control` was not tested, so question 4 is only answered for Gemini's implicit cache.
- Provider switching mid-run, and text with signatures, which did not occur.
- DBOS with the per-step retry option. Scenarios H to J ran on the own engine only.
- Load, long streams, and `pi-ai` on a real engine run.

## PoC 4 results: database layer

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc4`. SQLite and Postgres were real, with the embedded Postgres from PoC 2. Every arm implemented the same store: a runs index, an event log, and an atomic status change with its event.

| Scenario | Plain SQL | Kysely | Drizzle | PGlite locally |
| --- | --- | --- | --- | --- |
| Runs: create, filter, page, numeric timestamps | Pass, both | Pass, both | Pass, both | Pass |
| Events: idempotent, JSON, resume | Pass, both | Pass, both | Pass, both | Pass |
| Foreign key enforced | Pass, both | Pass, both | Pass, both | Pass |
| Transaction rolls back | Pass, both | Pass, both | Pass, both | Pass |
| 20 concurrent transactions on one store | Pass, both | Pass, both | Pass, both | Pass |
| Two writers | Pass, both | Pass, both | Pass, both | **Fails: lost rows** |
| Migrating twice does nothing | Pass, both | Pass, both | Pass, both | Pass |
| Upgrade keeps data | Pass, both | Pass, both | Pass, both | Pass |
| Three processes migrate at once | Pass, both | **SQLite flaky** (PoC 13 corrections) | **Postgres fails** | Not applicable |
| Failed migration leaves no partial change | Pass, both | **SQLite fails** | Pass, both | Pass, column not inspected |
| Migrates from a packed, installed package | Pass, both | Pass, both | Pass, both | Not run |

"Both" means SQLite and Postgres.

| Measure | Plain SQL | Kysely | Drizzle | PGlite |
| --- | --- | --- | --- | --- |
| Code for this store | 123 lines, including migration runner and drivers | 81 lines | 86 lines, plus generated migrations per database | Plain SQL plus 8 lines |
| Installed size with `pg` | 1 MB | 4 MB | 43 MB, native module | 27 MB |
| Import and open | 17 ms | 283 ms | 513 ms | Not measured |
| SQL and schema | One set | One set | Two schemas, two migration folders | One set |

Results:

- **Plain SQL stays primary.** It was the only arm to pass everything on both databases, with no dependency beyond `pg`. One set of queries worked because `ON CONFLICT DO NOTHING` and the rest of this SQL are common to both. It costs about 40 lines more than Kysely here and gives no query types.
- **Table count stays near the limit, not over it.** Plico has four tables today: `plico_meta`, `runs`, `events` and `eval_reports`. Threads, approvals and artifact metadata could take that to five to seven, depending on later PoCs. The own engine's tables stay private to it. Revisit this once those layers are done.
- **Kysely is now the first fallback, though its SQLite migration later proved flaky (PoC 13 corrections).** The community `node:sqlite` dialects were last published in 2025, which fails the maintenance rule, so this arm adapted `node:sqlite` with a 20-line shim. Its SQLite adapter reports no transactional DDL, so a failed multi-step migration leaves earlier steps applied. SQLite migrations would need one change each or a wrapper.
- **Drizzle drops to second fallback.** On the stable release it needs `better-sqlite3`, two schemas and two migration folders. Its Postgres migrator takes no lock, so two of three processes starting together crashed. Deployments with several workers would have to run migrations as a separate step. Drizzle 1.0 betas were not tested.
- **PGlite is out as the local store.** A second process opened the same folder with no error. With forced overlap, each of two processes reported 6,000 successful inserts, and only 11,774 of 12,000 rows existed after reopening. `plico serve` running alongside `plico runs` is exactly that setup. An earlier run without confirmed overlap lost nothing, so this is a race, not a constant.

Findings to carry forward:

- **Set `busy_timeout` before WAL.** The other order failed with `database is locked` when processes started together. Plico's current store has the right order. PoC 1's own engine does not, so the real engine must use the right order.
- **`synchronous=NORMAL` is the main SQLite speed setting.** 2,000 inserts took 2,730 ms at `FULL` and 191 ms at `NORMAL`, on `better-sqlite3`, whose default is `NORMAL` in WAL mode. `node:sqlite` showed the same gap: 3,884 ms and 181 ms. In WAL mode `NORMAL` can lose the latest commits on power loss, but not corrupt the file, and an application crash loses nothing. That loss matters less where a run can replay, so decide it per table. It may also explain part of the own engine's slower start in PoC 2. That was not measured.
- **A single SQLite connection needs a queue.** Async transactions on one connection interleave without one. All three SQLite arms handled it, but plain SQL and Drizzle needed about 3 lines of our own code.
- **Postgres needs UTF-8 stated.** The embedded Postgres on Windows defaulted to WIN1252 and rejected Hindi text. Plico should check server encoding at startup.
- **`node:sqlite` still prints an experimental warning on Node 22.** Check the supported Node range before relying on it.

Not tested: Drizzle 1.0 betas, load beyond 2,000 sequential writes, networked file systems, managed Postgres, and connection limits.

## PoC 5 results: HTTP server

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc5`, on a clone of this repo at `2600cb6`. Each arm is a full port of `packages/server` on its own branch, with the test files unchanged. Plico's own event generator was shared by all three, so the stream logic is the same and only the transport differs. That generator reads run status before events, which fixes finding 4, and takes `Last-Event-ID` over `?after=`, which fixes finding 20.

| Scenario | Own `node:http` | Hono | Fastify |
| --- | --- | --- | --- |
| 34 server tests, contract snapshot unchanged | Pass | Pass | Pass |
| Scaffold, then `plico serve --studio` with no build: API, dry run, stream, resume, Studio | Pass | Pass | Pass |
| Reconnect with `Last-Event-ID`: no duplicate or gap | Pass | Pass | Pass |
| Header wins over query, bad header is 400 | Pass | Pass | Pass |
| Final events survive the status race, 50 streams | Pass | Pass | Pass |
| Disconnect stops polling | Pass | Pass | Pass |
| Paused client stops serialization, cut stops it for good | Pass, 8 of 4,000 | Pass, 12 of 4,000, after a generator fix | Pass, 8 of 4,000 |
| 5,000 streams for 8 s, then all end | Pass | Pass | Pass |
| 10,000 cut streams: no leak seen, heap rise includes 10,000 added test runs | Pass, +3.0 MB | Pass, +2.2 MB | Pass, +3.1 MB |
| Call with no HTTP server, through `fetch(Request)` | Not available | Pass, stream and cancel included | Not available |

A control with the old read order and no drain wait failed the race on 50 of 50 streams and serialized all 4,000 events into a paused client, so those two scenarios can fail. Hono's `fetch` scenario ran on Node only.

The Hono column above ran with the adapter's default, which replaces the globals. The picked setup, with `overrideGlobalObjects: false` set in source, was then run through the same checks: 34 of 34 tests, all stream scenarios except the 5,000-stream run repeated at 1,000, `plico serve`, `fetch(Request)`, and 50 probed requests with output identical to the default. Its 5,000-stream and throughput numbers are in the last column below, measured from an edited build of the same change.

| Measure | Own | Hono | Fastify | Hono, globals left alone |
| --- | --- | --- | --- | --- |
| Source lines, no tests | 739 | 503 | 536 | 503 |
| Packages added | 0 | 2 | 48 | 2 |
| Requests per second, `/health` | 20,685 | 19,389 | 25,312 | 12,043 |
| Requests per second, `/v1/runs/:id` | 19,443 | 16,621 | 22,853 | 10,857 |
| Server heap, 5,000 streams | +49 MB | +122 MB | +42 MB | +124 MB |
| Server RSS, 5,000 streams | +104 MB | +253 MB | +98 MB | +257 MB |
| Event loop p99, 5,000 streams | 20 ms | 21 ms | 20 ms | 20 ms |
| Import | 78 ms | 104 ms | 221 ms | 108 ms |
| `plico serve` ready | 204 ms | 234 ms | 495 ms | Not measured |

Results:

- **Every arm answered all four audit questions.** The tests do not pick a winner, and neither does load. Each arm held 5,000 streams at the same event loop delay.
- **Working pick: Hono, on what the tests cannot settle.** It is the only arm with a `fetch` handler, and calling Plico through `fetch(Request)` on Node worked with streaming and cancel, so a host app could mount it in a route. It also removes about 240 lines. It costs 2.4 times the stream memory of the others, about 50 KB of RSS per stream against about 20 KB.
- **Own `node:http` moves to first fallback.** It works, adds nothing to install, and its 739 lines are the exit if Hono goes wrong. Moving means losing the `fetch` handler and writing CORS or auth by hand.
- **Fastify moves to second fallback.** It was the fastest, by about 20 percent, and has the broadest maintainer base. But it adds 48 packages, has no `fetch` handler, and its SSE here was the same hand-written code as the own arm, through `reply.hijack()`. Speed does not decide this layer: all arms are far above what model calls and database writes allow.
- **Upkeep:** since 2 August, `yusukebe` made 84 Hono commits with `usualoma` next on 20, and 9 of the `@hono/node-server` commits with `usualoma` next on 4. Fastify's top three made 24, 15 and 10. Hono's dominant maintainer stays the main risk, and the Node adapter is the smaller of its two packages, at 684 stars. Both projects have a new major coming: Hono 5.0.0-rc.1 and Fastify 6 alpha. Neither was tested.

Findings to carry forward:

- **Hono's Node adapter replaces `global.Request` and `global.Response` by default.** Plico runs user tools in that process, so a library should not do that. `overrideGlobalObjects: false` stops it and costs about 40 percent of requests per second, still over 10,000. `instanceof Response` kept working with the override on, so no break was seen. The working pick uses `false`.
- **Hono writes do not fail after a disconnect.** In the first run, a cut client left the server serializing all 4,000 events, because each write simply succeeded. The generator must check the abort signal inside a batch, not only between polls. That check is now in all three arms.
- **Hono changes edge behaviour.** It drops `; charset=utf-8` from JSON and answers `HEAD` with 200 where today's server gives 405. The 34 tests catch neither. Of 50 probed requests, the rest matched on status and error code. Fastify differed on five: `GET /v1/runs/` is `run.not_found`, `GET /v1/runs/dry` is 405, `DELETE /v1/runs/dry` lists only `POST`, repeated `after` is 400, and a bad percent escape under Studio is 400. Decide these before the port, and add them to the contract tests.
- **A too-large body does not always get its 413.** Every arm rejected the body, but the client often saw `ECONNRESET` instead: Hono at every size with the Node client, own and Fastify from 5 MB. One 50 MB try on the own arm took 6 s to reset. No over-limit body was accepted. Hono's reset at 1 MB is the one difference inside normal use, and only when a client sends too much.
- **Own has no hidden safety.** It had findings 4 and 20, and the drain wait was missing until this PoC. The same mistakes are possible in Plico's generator on any arm, so keep these stream scenarios as permanent tests.
- **The first Fastify and Hono failures were this machine, not the arms.** Running load tests back to back left 21,067 sockets in `TIME_WAIT`, and the suite then failed on `EADDRINUSE`. The own arm failed the same way when forced to. Clean runs passed 8 of 8 on all three.

Not tested: streams held longer than about 8 s, real clients over a network, Linux, TLS, proxies, HTTP/2, Bun or a real serverless platform, Hono 5, mounting the Workflow SDK route, and CORS or auth middleware. Client and server shared one machine, so throughput is for comparison only.

## PoC 6 results: tools and MCP

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc6`. Four arms sit behind one small `connect` shape: the official client v2, `@ai-sdk/mcp`, `@mcp-use/client` (the client that `mcp-use` moved to) and a hand-written client. Own speaks both protocol eras over stdio and HTTP. The integration run reuses the PoC 2 own engine and loop design, with one local tool and the MCP tools in one registry.

| Scenario | Official | `@ai-sdk/mcp` | `@mcp-use/client` | Own |
| --- | --- | --- | --- | --- |
| List and call: stdio, 2026-07-28 HTTP, 2025 session HTTP | Pass | Pass | Pass | Pass |
| `isError` kept as a result, unknown tool throws | Pass | Pass | Pass | Pass |
| Pagination, 5 MB result, timeout, close ends the process | Pass | Pass | Pass | Pass |
| Tool list change notice, stdio and 2025 HTTP | Pass | **Fail** | Pass | Pass, after adding it |
| Abort reaches the server | Pass | **Fail** | Pass | Pass |
| HTTP restart on 2026-07-28: same client keeps working | Pass | Pass | Pass | Pass |
| HTTP restart on a 2025 session | Stays failed | Stays failed | Stays failed | Stays failed |
| Stdio process killed: fails in about 1 ms, fresh connect works | Pass | Pass | Pass | Pass |
| Server dies mid-call: error, one charge, no silent repeat | Pass | Pass | Pass | Pass |
| OAuth client credentials | Pass | **Not run**, no hook found in its source | Pass | Pass |
| OAuth code with PKCE, and refresh after expiry | Pass | Pass | Pass, with its own hook | Pass |
| No third-party traffic | Pass | Pass | **Fail**, 48 PostHog calls in one run | Pass |
| 20 concurrent calls, split multibyte reply | Pass | Pass | Pass | Pass |
| Junk lines on stdout | Pass | Pass | Pass | **Crashed the host**, then fixed |
| Server asks a question mid-call | Answered | Answered | Answered | **Ignored**, then fixed |
| 2026 `input_required` result | Throws | Throws | Throws | **False success**, then fixed |
| Published servers: filesystem, memory, everything | Pass | Pass | Pass | Pass |
| Python SDK 2.3.0 server, stdio | Pass, modern | **Fail** with discovery on | Pass, 2025 era | Pass, modern |
| Host killed during approval, resumed, HTTP server restarted too | Pass | Pass | Pass | Pass |
| Discovery ran once, local and MCP events match, no wire shapes in events | Pass | Pass | Pass | Pass |

On the final files, all 22 scripted scenarios passed for official and own, 18 for `@ai-sdk/mcp`, and 21 for `@mcp-use/client`, or 22 with `MCP_USE_ANONYMIZED_TELEMETRY=false`. The hostile scenarios ran separately, and own's three bugs came from them. Controls: removing cancel from own failed the abort scenario, and adding a retry failed the mid-call scenario with two charges, so both can fail. A real Gemini run on `gemini-3.5-flash-lite` used discovered schemas through the official and own arms, called both MCP tools, went through the approval step and finished. Approval was already signalled in that run, so it did not sit waiting; the kill test covers the wait.

| Measure | Official | `@ai-sdk/mcp` | `@mcp-use/client` | Own |
| --- | --- | --- | --- | --- |
| Packages installed | 18 | 15 | 21 | 0 |
| Install size | 18 MB | 6.7 MB | 22 MB | 0 |
| Import, median of 5 | 172 ms | 141 ms | 240 ms | 9 ms |
| Lines in this PoC | 47 adapter | 41 adapter | 27 adapter | 216 client |
| Licence | Apache-2.0 | Apache-2.0 | MIT | Plico's |

Audit questions:

1. **Same path, same events: yes on all arms.** `note` and `demo_add` produced the same `tool.call`, `tool.result` pair, and `isError` carried through.
2. **Approval, restart, resume: yes on all arms.** The host was killed while waiting, restarted, and the tool ran once. The tools came from the saved discovery step.
3. **Reconnect: only partly a client job.** Every arm can reconnect by opening a fresh client. No arm recovers a 2025 session or a dead stdio process by itself, so Plico must own that in a thin wrapper. Modern HTTP has no session to lose.
4. **OAuth: works against a small test server of mine only.** No real provider was used.
5. **No SDK shapes: yes.** Events held only Plico fields, because the host maps every result. The adapter has to keep doing that.

Results:

- **Working pick: official client v2, with `versionNegotiation: { mode: "auto" }`.** It was the only arm to pass everything with no fix and no workaround. The default mode is legacy, so `auto` must be set or the client never uses the 2026-07-28 era.
- **Own client moves to first fallback, and it was closer than the audit assumed.** The audit said not to build this. In fact 216 lines passed all 22 scenarios, talked modern to a Python server, add nothing to install and import about 19 times faster. The case against it is not size. It had three silent or fatal bugs that only hostile scenarios found. Its 216 lines are a floor, because it has no modern HTTP `subscriptions/listen`, no handling of server questions and no Client ID Metadata Documents. OAuth is also security code, on a spec that deprecated dynamic registration in its latest revision. Plico would carry all that for as long as MCP keeps moving.
- **`@ai-sdk/mcp` drops to second fallback.** It is the smallest package, but it has no change notices, no cancel to the server, and no client credentials hook in its source, so that scenario could not be run. With `protocolVersionDiscovery: true` it failed on the Python server, which rejected its `initialize` as serving 2026-07-28. With the flag off it worked on the 2025 era. No cancel matters most, because an aborted stdio tool kept running on the server. HTTP was not checked.
- **`mcp-use` is out.** Its client wraps the official one, pinned at 2.3.1, needs Node 22.22.2 or later, and sends analytics to PostHog unless switched off. The harness intercepted all 48 `fetch` calls. Other channels were not checked, and the integration and interop runs relied on the opt-out alone. Telemetry on by default is wrong for a library inside Plico, and it adds nothing Plico needs over the client it wraps. It also stayed on the 2025 era on stdio, even with `auto` passed through its `clientOptions`.
- **Upkeep:** the official repo had 84 commits since 2 August and a release on 23 October, under the protocol's own organisation. Its npm history starts on 2026-04-01 with 15 versions, so it is young, and the repo has 637 open issues and pull requests. `vercel/ai` and `mcp-use` each hit the 100 commit cap of that query.

Findings to carry forward:

- **A tool can run twice, and no arm can prevent it.** When the host died after the server ran the tool but before the result was saved, the resumed run called it again: 2 charges with the same key, on all arms. MCP has no standard idempotency key in what was tested, so the guarantee for an MCP tool is at least once. Plico should say so plainly, and pass a key where the server can use one.
- **Engine retries must be off for MCP tool steps.** The integration used `retries: 0`. The default of 2 would resend a call after a failure, which is the repeat the clients avoid.
- **Tool names need mapping.** 12 of 13 tools on the `everything` server fail Plico's name pattern, so `/^[a-z][a-z0-9_]*$/` cannot apply to MCP names directly. The host needs a mapping, kept with the saved tools.
- **Schemas fit.** All 37 tools across the four non-test servers fit `isJsonSchemaSubset`. Those runs stripped `$schema`, but a direct check shows the key does not fail the test, so the strip is not needed for it. That is a small sample.
- **Approval must come from Plico config, not server annotations.** Annotations are hints from the server, so they should never lower a requirement. The integration did this, but no malicious server was tested.
- **`input_required` needs a decision.** A 2026 tool can stop and ask for input. Every library throws without a handler, so a Plico run would fail rather than pause. Mapping it onto Plico's approval wait is the obvious path and was not tried.
- **Pass `expectedIssuer`.** The official client warns that without it the MCP server chooses who receives the client credentials. These runs left it out.
- **A resumed run gets a new stdio process.** Any state in the old server is gone, and the saved tool list can be out of date against the new one.

Not tested: a real OAuth provider, Client ID Metadata Documents, list change notices over modern HTTP, elicitation or sampling flows, SSE resume, real remote servers over a network, proxies, Linux, the Python server over HTTP, a malicious server, and `WorkflowAgent` approvals, which the working picks do not use. Each published server got one call.

## PoC 7 results: harness capabilities

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc7`. Both arms ran one shared task with one scripted model: a plan, a skill, 12 tickets with a 200 KB result in the middle, a code in ticket 1 that must survive compaction, then a subagent that fetches a ticket and asks approval for a refund. A ledger counted every side effect. Own adds capabilities to the PoC 2 loop on the own engine, with the subagent as a child durable run. `deepagents` ran with its SQLite checkpointer, filesystem backend, built-in summarizer and subagent tool. The compaction trigger was about 5,000 tokens on both.

| Scenario | Own | `deepagents` |
| --- | --- | --- |
| Whole task, code kept across compaction | Pass | Pass |
| Killed inside compaction, resumed | Pass, no repeats | Pass, no repeats |
| Killed after compaction, resumed | Pass, no repeats | Pass, no repeats |
| Stopped at the child's approval, a new process approves | Pass, refund once | Pass, refund once |
| Earlier child work not repeated after approval | Pass | Pass |
| Two approvals in one run, each needs its own decision | Failed first, pass after the fix | Pass |
| Killed after the refund ran, before it was saved | Refund twice | Refund twice |
| Large result moved out of context | Pass | Pass, built in |
| Plan kept | Pass, an event, shown to the model each turn | Pass, in state, once `todoListMiddleware` was added |
| Skill shown by name, body loaded on request | Pass | Pass, built in |
| Config raised on resume | Saved setting held, 4,649 tokens | New model profile used, 17,890 tokens |
| Real Gemini, 8 tickets, subagent, approval | Pass, code kept | Pass, code kept, with `grep` removed |

`deepagents` moves every threshold when the profile changes: the summary trigger, the messages kept and the eviction limit. So 17,890 against 4,649 shows that its settings are not pinned, and it is not a like-for-like size comparison.

Controls: with compaction off the largest request grew from 4,662 to 16,745 tokens on own, so the trigger does real work, though the scripted task still finished. With a summary that drops the code, both arms answered `unknown`, so the check can fail. My first matrix run was invalid: a harness bug meant own was never killed, and a broken scripted summarizer made `deepagents` look as if it restarted the task. Both were fixed. A later review found the matrix had run before the hosts last changed, so both matrices and both Gemini runs were repeated on the final files, and the table is from those. The first Gemini repeat of `deepagents` was invalid too: a leftover test `archive` tool was visible, and the model called it instead of delegating. The tool now exists only in the two approval test.

`@ai-sdk/harness` also ran, as a smaller third arm: `@ai-sdk/harness-pi` 1.0.173 on real `gemini-3.5-flash-lite` inside the official `@ai-sdk/sandbox-just-bash`. My first draft said it could not run here, and that was wrong. The Pi adapter has no subagents, so the task used a direct refund with an approval.

| Scenario | `@ai-sdk/harness-pi` |
| --- | --- |
| 8 tickets, skill, stop at the refund approval | Pass, 27 seconds, 162,811 input tokens in total |
| A new process approves, using saved state | Pass, refund once, answered `ZEBRA-7` |
| Killed during the run | Exit 137, no state to resume |
| Compaction | Never fired, so not tested |
| Subagent, repeated side effect | Not tested |

State is exported only by `detach` or `stop`, so a killed process left nothing. `sessionStorage` exists for that and was not tried. The just-bash sandbox is in memory, so its files do not survive a restart either. The host had to send back the tool call with the approval response, because the framework does not recover it from saved state. In a repeat run the model fetched only 3 of the 8 tickets before asking for the refund. One tool call failed in each run, and I did not look into why.

| Measure | Own | `deepagents` | `@ai-sdk/harness-pi` |
| --- | --- | --- | --- |
| Packages | 0 added | 58, with LangChain, LangGraph and two provider peers | 206 |
| Install size | 0 | 131 MB | 248 MB |
| Import, median of 5 | No added imports | 1,102 ms | 2,122 ms |
| Lines in this PoC | 141 host, 47 Gemini | 97 adapter with the scripted model | 60 host |
| State stores | One, the engine | A second one, the checkpointer | Host saves exported state; Pi session storage is optional |
| Licence | Plico's | MIT | Apache-2.0, Pi MIT |

Audit questions:

1. **Compacts and continues, same result after a restart: yes on both.** Kills inside and after compaction gave the same answer with no repeated side effects.
2. **Subagent survives a restart, approval reaches the parent: yes on both, after a fix on own.** A new process approved through the parent run, the refund ran once, and the child's earlier fetch did not repeat. Own's first version keyed every wait as `approval`, so one decision released every later request in that run. In the test, approving the parent's `archive` also ran the child's refund with no second decision. Keying each wait to its own request fixed it, and the test then passed. `deepagents` passed unchanged.
3. **Studio shows what compaction removed: the data is there on both, and no Studio view was built.** Own writes a `context.compacted` event per compaction, with counts, the summary and a reference. The first one restored all 8 removed messages from the workspace. `deepagents` appends removed messages to a history file, and state holds only the latest compaction. Its update stream showed no compaction entry of its own, so Plico would have to infer the event. After a kill around compaction its history file held 3 records where the straight run held 2, so a view built on that file would show a compaction twice. Own had 58 events in every crash scenario.

Results:

- **Working pick stays: own capabilities on the loop.** This did not win on function. `deepagents` passed everything, with more built in and less code. It loses on what Plico is for. Its checkpointer would be a second durable state beside the engine, against the layer 1 decision. Its events would be mapped from outside, and it adds 58 packages, 131 MB and over a second of import. It also uses changed settings on resume, so Plico would have to pin them itself.
- **Own's lines flatter it.** 141 lines cover one workload. There is no config surface, Studio view, summary bound or capability interface yet, and only one subagent shape was tried. The real version is still a sizeable build, as the audit's build order says.
- **`deepagents` stays first fallback, and the design to copy.** Its history file, tool result budget and result moved to files are all ideas worth taking.
- **`@ai-sdk/harness` stays second fallback**, for coding agents. Its approval across processes worked on a real model. It stays behind because it is experimental, has no subagents through Pi, and is the largest of the three at 206 packages, 248 MB and over 2 seconds of import. Compaction and subagents also sit inside the coding agent, out of Plico's hands.
- **Upkeep:** `deepagentsjs` hit the 100 commit cap since 2 August, with `christian-bromann` and `Palashio` as the main people after bots. It has 1,629 stars and 121 open issues and pull requests. It tracks LangChain closely, so upgrades would be frequent.

Findings to carry forward:

- **An approval must answer one named request.** A shared wait name turned one decision into approval for every later action in the run, with nothing in the output to show it. This was the only safety failure in this PoC, and it was in own. Plico needs a test with two approvals in one run, covering parent and child.
- **Compaction needs a bound.** In the first real run, own's summaries grew until a compaction went from 6,373 tokens to 6,202, still over the trigger. It then compacted nearly every turn, and each pass is a paid model call. The scripted run showed the same habit, with 7 compactions. Plico needs a target below the trigger and a limit on summary size.
- **A summary can lose facts, and the run still looks fine.** The control finished with `unknown` and no error on both arms. Offloading keeps the original, but nothing tells the model it lost something. Plico should test this in evals. One real run proves little.
- **Cut at a call boundary.** A compaction cut must not leave a tool result without its call. Own handled that, and Gemini accepted it.
- **Pin capability settings per run.** Own pinned them with one saved step. It worked and costs almost nothing.
- **A tool can still run twice.** A kill after a side effect repeats it on both arms, as in PoCs 1 and 6. Subagents do not change that.
- **A planning tool is optional in `deepagents`.** With a custom model, `write_todos` was missing until the middleware was added. The Plico plan should be on or off explicitly.
- **Provider portability is a real risk there.** `@langchain/google-genai` 2.3.4 failed to convert the schema of the built-in `grep` tool for Gemini, so this is a fault in how the two fit together, not in `deepagents` alone. The workaround was removing the tool. Plico's own schema subset avoids that kind of failure only if built-in tools stay inside it.
- **`deepagents` sends nothing unless asked.** A scripted run made 0 offsite calls with no `LANGSMITH_` or `LANGCHAIN_` variables set, so unlike `mcp-use` it is not out on telemetry. With `LANGSMITH_TRACING=true` it called `api.smith.langchain.com` 5 times, so Plico must leave that off.
- **`deepagents` needs a host to notice.** Nothing restarts a killed run. My driver called resume, whereas the own engine reclaims runs by lease. Plico would have to add that.

Not tested: runs of hundreds of turns, costs, nested or parallel subagents, a denied approval through the parent, more than two approvals in one run, long waits, a Studio view, DBOS under the subagent (only the own engine ran; PoC 13 covers this), Postgres, `@ai-sdk/harness` with Claude Code or Codex or on a network sandbox, Pi `sessionStorage`, and any other real model. The final Gemini runs of own and `deepagents` each happened once, with no kill during them. Only `fetch` and socket connections were watched for offsite calls.

## PoC 8 results: frontend protocol and ecosystem

Date: 2026-11-02. Throwaway code: `D:\projects\plico-poc\poc8`. Run `node D:/projects/plico-poc/poc8/run.mjs`. The final runner passed all eight scripts, including measurements, on Node 22.23.3. `results.json` records exit codes, JSON outputs, expected socket-error logs and SHA-256 hashes of the tested sources. `package-lock.json` preserves installed versions; root dependencies are now pinned exactly. No Plico runtime, public contract, ADR or epic changed.

Three protocol arms read one scripted Plico-shaped log: native events over SSE, AG-UI 1.0.3 through the official `HttpAgent`, and AI SDK 7.0.159 / React 4.0.163 through the official `Chat` and `DefaultChatTransport`. The task streams two messages, fetches a ticket, compacts context, asks approval for an archive, starts a child that asks a separate approval for a refund, writes an artifact reference and carries A2UI and MCP Apps payloads. A ledger counts effects. Fixture-only future event names are marked in `core.mjs`; this does not extend today's `@plico/contracts`.

| Scenario | Native Plico SSE | AG-UI | AI SDK UI stream |
| --- | --- | --- | --- |
| Ten selected view fields match the log at completion | Pass | Pass | Pass |
| Two named approvals; first does not release second | Pass | Pass | Pass, with a child step boundary |
| Repeated first decision | Server returns 409 | Client refuses while second is pending | Not separately exercised through Chat |
| Dropped socket during text, recover and complete | Pass, sequence cursor | Pass, custom connect plus reopened text/subagent state | Pass by full replay; offset recovery needs the transport adaptation below |
| Duplicate view deltas in cursor recovery | 0 | 0 | 0 with the adapted transport |
| Second reader reaches the final selected view | Pass, one follow connection | Pass, explicitly reconnect at each gate | Pass, explicit replay at gates, custom data deduplicated by sequence |
| Every canonical event, unchanged | Pass, exact log equality | Not claimed | Not claimed |

The ten fields are text, tool names/results, approval IDs, plan, compaction count, child name, artifact paths, A2UI payload, MCP Apps payload and terminal status. This is a projection check, not a claim of complete wire fidelity: it does not check every tool argument, event timestamp, artifact hash or child relationship. For example, the AG-UI fixture stringifies tool results. Plico must keep its native log for audit and inspection.

**Reconnect findings.** `HttpAgent` needs a host-defined connect path in this fixture. Its verifier checks lifecycle ordering per stream segment, so starting partway through a text message or suspended child requires reopening that state. Connect must observe only; it must not submit approval answers carried in client state. Readers explicitly attach again after each approval gate. A fresh client reconstructing an arbitrary completed run from a single AG-UI response was not tested.

The AI SDK's default full replay reconstructs text, but fires six repeated custom-data callbacks at this cut. A callback with a side effect therefore needs deduplication even when the visible message is correct. Sending only events after a cursor failed with Node's `TypeError: terminated`: the installed Chat recognises certain network error strings and did not retain its active text state for this one. A small fetch wrapper that reports a network disconnect, `resumeStreamIsReplay: false`, and a transient cursor after each canonical event made the same cut recover without duplicates and finish the task. These are adapter requirements, not built-in cursor recovery. A fresh process with no retained client state would need replay or hydration instead.

The child refund also exposed chat-step coupling: an unfinished parent `task` tool in the same step prevented the AI SDK's automatic approval response from sending. Giving the child's tool its own step fixed the fixture. AG-UI represents subagents directly; the AI SDK carries the child metadata through `data-plico`. Both use custom data for Plico-specific compaction, artifacts and UI payloads. Generic chat clients will not automatically display those fields.

**Consumer checks.** These are interoperability checks, not a UI-quality or accessibility review.

- TanStack AI `ChatClient` 1.0.1 completed both approvals and produced `ZEBRA-7` against the existing AG-UI endpoint, without another event mapper. This demonstrates adding another client, not another protocol. Disconnect/rejoin was not separately tested with TanStack.
- assistant-ui's actual React runtime hooks ran in JSDOM over both AG-UI and AI SDK, sent through the runtime, rendered runtime text containing `ZEBRA-7`, and completed two approvals. The AG-UI test used the runtime's deprecated imperative interrupt helpers; the AI SDK test answered through Chat. Custom compaction/artifact panels and production rendering were not built.
- CopilotKit core completed the task against the AG-UI endpoint with `agents__unsafe_dev_only`. Its installed config explicitly says production requires CopilotRuntime. This proves the development bridge only; it does not establish a drop-in production integration or justify adding CopilotRuntime to Plico.
- A2UI and MCP Apps objects survived as payloads. No renderer, schema conformance, sandbox or actual MCP App was tested. They remain content carried by a protocol, not substitutes for the protocol.

**Delivery alternatives.** Durable Streams client 0.2.7 and test server 0.3.9 preserved the same full native events, resumed from a consumed offset after an injected GET connection failure, and served a second full reader with no duplicates. This used finite snapshot reads and a fault on a new request; it did not cut an active SSE frame. It mirrors Plico events into another stream store and introduces another cursor. That can earn its cost for a remote fan-out service, but this test gives no reason to require it for local Plico. The installed `resumable-stream` Redis entry point expects publisher/subscriber clients and creates them from Redis configuration if omitted; its implementation was inspected, not run. No Redis service was provisioned.

**Reach and upkeep.** Fresh npm API responses cover 30 September to 29 October 2026, not the execution date itself. `popularity.json` saves the exact responses. Downloads include transitive installs and are not unique users. Do not add `ai` and its React client together as an audience estimate.

| Package | Downloads in returned month |
| --- | ---: |
| `ai` | 121,193,154 |
| `@ai-sdk/react` | 38,343,863 |
| `@ag-ui/core` | 11,202,546 |
| `@ag-ui/client` | 5,931,781 |
| `@assistant-ui/react` | 7,996,589 |
| `@tanstack/ai-react` | 2,083,318 |
| `@copilotkit/react-core` | 1,930,733 |
| `@durable-streams/client` | 1,570,642 |

The AI SDK has the strongest measured client reach, roughly 6.5 times the AG-UI client's downloads in this window. That is a strong reason to support its stream as a first-class optional integration. AG-UI also has meaningful reach, and the TanStack and assistant-ui tests show actual reuse beyond its original client. Sources: [AI SDK React download response](https://api.npmjs.org/downloads/point/last-month/@ai-sdk/react), [AG-UI client download response](https://api.npmjs.org/downloads/point/last-month/@ag-ui/client).

GitHub API metadata and a sample of up to 100 commits since 1 August are saved in `maintenance.json`. AG-UI, AI SDK, TanStack AI, assistant-ui and CopilotKit all hit the sample cap and had recent pushes in late October or November. AG-UI had 16,972 stars and 550 open issues/PRs; AI SDK 27,690 and 1,547; TanStack AI 3,323 and 70; assistant-ui 12,897 and 45; CopilotKit 38,461 and 376. These are activity signals, not issue resolution rates or independent adoption counts. Several active authors overlap between AG-UI and CopilotKit, so protocol neutrality still needs monitoring. Durable Streams had only two commits in the window, one from a bot, and a last push on 28 September. Its installed npm packages say Apache-2.0 while repository metadata says MIT; that mismatch needs resolving before reuse. Sources: [AG-UI repository](https://github.com/ag-ui-protocol/ag-ui), [AI SDK repository](https://github.com/vercel/ai), [Durable Streams repository](https://github.com/durable-streams/durable-streams).

**Cost of integration.** Installed dependency closures below include roots and required peers, exclude optional peers, and are not incremental package counts. They cannot be added across rows because packages overlap. `measure.mjs` and `measurements.json` record the method and exact versions. These are not bundle-size measurements.

| Integration roots | Packages in installed closure |
| --- | ---: |
| Native SSE | 0 |
| AG-UI core + encoder server | 6 |
| AG-UI client | 15 |
| AI SDK `ai` | 11 |
| AI SDK React | 25 |
| TanStack client | 11 |
| assistant-ui AG-UI adapter | 27 |
| assistant-ui AI SDK adapter | 35 |
| CopilotKit core | 57 |
| Durable Streams client + test server | 14 |

Core plus encoder still bring Zod 3 in this install: the earlier idea that omitting `@ag-ui/client` would avoid it was incorrect. The shared fixture is 96 lines, HTTP server 95, and both event mappers plus reopen logic together 58. Those figures omit production validation, routing, error handling, contract versioning, renderer work and robust reconnection. They are evidence that both mappings can be small, not estimates for shipping the feature.

**Working proposal, pending the owner's final decisions after all PoCs:** keep native Plico events and sequence cursors as the dependable foundation, and expose AG-UI and AI SDK streams as optional adapters over that same log. Keep AG-UI as the provisional default for its event-oriented model; document the AI SDK path equally seriously because of its much larger client reach. Choosing AI SDK as the default later would not require replacing the native log or model provider. Leave UI kits to consumers and make their custom-data responsibilities explicit. Add a new protocol by folding the log in a separate mapper and running this same behavior matrix; do not make the runtime emit a provider or frontend SDK's shapes.

Limits: one deterministic task and one socket-cut position; no active mid-frame/chunk split, adversarial cursors, slow readers, load/latency measurements, cross-origin browser requests, deployed proxies, server restart durability, denied approvals, simultaneous competing decisions or arbitrary completed-run AG-UI hydration. A canonical event can map to several wire chunks, so a cursor after the last chunk alone is not proof of atomic acknowledgement under every possible cut. The error-normalisation wrapper and checkpoint scheme need broader browser/Node tests before production. No new real-model call was needed for this protocol-only task.

During continuation, three fixture errors were corrected before the final matrix: a guessed AI SDK cursor skipped events; AG-UI connect could submit stored approval answers; and the hub exposed `approval.required` before installing its answer handler. The final tests assert actual outcomes and fail with nonzero exits rather than only printing comparisons. The intentionally unsupported offset-only AI case remains an asserted negative control; the invalid wire-chunk control is rejected by the official schema.

Official references checked for this continuation: [AG-UI events and draft interrupt lifecycle](https://docs.ag-ui.com/concepts/events), [AI SDK resume streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams), [TanStack transports](https://tanstack.com/ai/latest/docs/transports/overview), [assistant-ui runtime choices](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime). Installed source and the executed tests are authoritative for the versions above.

## PoC 11 results: explicit memory and optional retrieval

Date: 2026-11-02. Run ahead of PoCs 9 and 10 at the owner's request. Scratch project: `D:\projects\plico-poc\poc11`. This tests the memory layer; it does not implement epic #78 in Plico. Current application contracts, ADRs, PRD and epics remain unchanged. The epic's explicit local-memory scope and exclusion of semantic recall were read directly from [#78](https://github.com/ITZSHOAIB/plico/issues/78).

Run `node D:/projects/plico-poc/poc11/run.mjs` for the offline suite. It passed six check groups, including 28 behavior tests, on Windows / Node 22.23.3. `results.json` records exit codes, output and source/lockfile hashes. A separate `real.mjs` run used the available Gemini key and saved `real-results.json`; `pnpm test:real` intentionally repeats paid provider calls. Dependencies are pinned with pnpm, automatic peer installation is off, and the native build was explicitly enabled only for `better-sqlite3`.

**Working pick: own explicit Markdown by default, retrieval adapters when needed.** Mem0 adds useful semantic retrieval, but does not replace the file format or Plico's write policy and replay protection. FTS5 is a small optional local index. No final layer decision is made here; that still waits until all PoCs are complete.

### Arms and what they actually own

- **Markdown:** plain `memory/<key>.md` files are the authoritative content. Reads see human edits immediately. Writes use content-hash revisions, stable operation IDs, atomic file replacement, receipts and a small recovery journal under `.plico/memory`. A built-in SQLite transaction coordinates cooperating processes; content and receipts remain files. This is therefore a Markdown store with SQLite coordination, not an unsynchronised `writeFile` wrapper.
- **Markdown + FTS5:** the same read/write behavior, with a disposable SQLite full-text index. Search rebuilds from the current files in this fixture. No extension or npm dependency was needed: FTS5 was available through Node's bundled SQLite on the tested installation.
- **Markdown + Mem0:** the same explicit file/write behavior, with Mem0 3.3.1 as a derived retrieval index. It uses `infer: false`, stable key/revision metadata, per-project database paths, scoped queries, reconciliation after edits/deletion, and a lock for index updates. Read/write/list still work through the file store; queries need an embedder. The scripted suite uses a local deterministic HTTP embedding fixture, and the separate real run uses Gemini embeddings.
- **Raw Mem0 controls:** the actual OSS library was also exercised without the Plico file wrapper, including a fresh process reopening its SQLite database. These controls identify which guarantees belong to the library and which came from the shared host.

The fixture port is `read(key)`, `list()`, `write({key, text, operationId, expectedRevision})`, plus optional retrieval through `search(query, limit)`. `text: null` deletes a note. The factory switches adapters without changing any Markdown content or project files. This establishes swappable retrieval strategies; it does **not** establish a disk-free durable store implementation. The public Plico contract should be designed separately and versioned deliberately.

### Shared behavior results

| Scenario | Markdown | Markdown + FTS5 | Markdown + Mem0 |
| --- | --- | --- | --- |
| Plain readable files; next read sees a human edit | Pass | Pass | Pass |
| Replay an old write after a newer edit | Original receipt returned; newer content preserved | Same | Same |
| Reuse an operation ID with changed input | Refused | Refused | Refused |
| Stale expected revision | Conflict, no overwrite | Same | Same |
| Four processes write independent notes | All four preserved | Same | Same |
| Two processes create the same key at the same revision | One success, one conflict | Same | Same |
| Process exits after prepare, note replacement, or receipt | New process recovers; one receipt | Same | Same |
| Human edits a note after the process stops before receipt | Recovery conflict; human text preserved | Same | Same |
| Delete then replay the old create operation | Note stays deleted | Same | Same |
| Project isolation, including identical note/operation IDs | Pass | Pass | Pass |
| Search sees edited text and excludes a deleted note | Pass | Pass | Pass |
| Deterministic sorted prompt; read/write events visible | Pass, shared host | Same | Same |
| Write denied without capability or approval | Pass, shared host | Same | Same |
| Oversized memory composition | Explicit budget error | Same | Same |

The write/policy/recovery columns for the last two arms come from the **shared Markdown store and host**, not FTS5 or Mem0. The tests use separate child processes for concurrency and restart checks. Exits at the three chosen boundaries use immediate `process.exit(137)` after awaited writes. They do not simulate a power cut, a torn filesystem write or every possible instruction boundary.

A further test changed adapters Markdown -> FTS5 -> Mem0 -> Markdown against the same project files and retrieved the same fact. Deleting the FTS database did not lose the note; the next search rebuilt it. A directory occupying a note path reports an error instead of being mistaken for an absent note. Traversal keys were rejected. The filename grammar is deliberately narrow and does not establish a complete production memory format or symlink-safe filesystem boundary.

The host's prompt stores notes as JSON in a user/data message, with source keys and revisions, and refuses a payload larger than 8,192 bytes. Tests establish deterministic composition and that note text cannot change the host's configured write permission. They do not establish model resistance to every prompt injection. Events in this host fixture are in memory; atomic commitment of a memory effect and a durable Plico event was not tested.

### Raw Mem0 results

Mem0's `memory` vector provider in the installed TypeScript package is backed by `better-sqlite3`, and accepts an explicit `dbPath`. Despite the quickstart's in-memory wording, the tested store survived a process restart. Explicit project-local vector and history paths were configured, rather than using its defaults under the user's home directory. Sources: installed `mem0ai/dist/oss/index.mjs`, and the [official Node quickstart](https://docs.mem0.ai/open-source/node-quickstart).

| Raw library behavior | Result |
| --- | --- |
| Explicit add with `infer: false` | Exact text saved; embedding called; no extraction LLM call |
| Process stops after add; new process opens the same database | Saved note present |
| Replay the same add with the same `metadata.operationId` | Two memories, not one |
| Filter by user scope | Correct scope returned in the fixture |
| Update, get, and delete | Worked |
| Read history after deleting the memory | Previous text still present |

An operation ID in metadata is **not** a Mem0 idempotency guarantee. This test does not say inferred deduplication always fails: `infer: true` was not tested. It says an explicit Plico write cannot rely on inference or metadata alone for replay safety. Default automatic extraction would also change the meaning of a deliberate exact write, so it was kept out of the explicit arm.

Deletion removes a memory from active retrieval, but history retains old text. The file wrapper likewise only guarantees absence from its normal reads and reconciled search; it is not a secure-erasure implementation. Index history, runtime logs and backups need an explicit retention design if the product later promises forgetting.

**Telemetry control:** the default configuration attempted fetches to PostHog and a GitHub-hosted notice configuration. The probe intercepted and blocked all offsite requests; these are observed attempts, not proof that payloads were delivered. Setting `MEM0_TELEMETRY=false` before importing the package produced zero offsite fetch attempts in that probe. All main tests and real runs used that opt-out. This is a concrete integration requirement for a local-first default, not a claim that the optional cloud embedder is local.

The initial OSS import failed without `better-sqlite3`; disabling history does not remove the package's static native import. After adding the native peer, its prebuilt binary installed successfully on this machine. `compromise` was installed for the library's declared NLP peer. A declared `@cloudflare/workers-types` peer remained uninstalled; it was not needed by these local runtime paths. Other providers were not exercised. [Official provider configuration](https://docs.mem0.ai/open-source/configuration).

### Real Gemini checks

Four synthetic notes covered delivery city, package manager, spelling style and invoice currency. Mem0 used real `gemini-embedding-001` embeddings at 768 dimensions. The Markdown baseline used a literal substring search; FTS5 used tokenised OR queries and rank; Mem0 used its default retrieval over the configured local vector store. No extraction LLM or reranker was enabled.

| Paraphrased question | Intended note | Markdown substring top 1 | FTS5 top 1 | Mem0 top 1 |
| --- | --- | --- | --- | --- |
| What city should the courier send my parcel to? | Delivery | No hit | Delivery | Delivery |
| Which package manager should I use for a new dependency? | Build | No hit | Build | Build |
| Should spelling use color or colour? | Style | No hit | Build | Style |
| What currency do I use on a bill? | Billing | No hit | Build | Billing |

Mem0 found the intended note in 4/4 queries, FTS5 in 2/4. This is a very small functional demonstration, not a retrieval benchmark or an adoption threshold. The basic substring search isn't meant to answer paraphrased questions. FTS5's broad OR query and unstemmed tokenizer are deliberately simple; different tokenizers, stop-word handling or a query planner could improve it. No no-answer cases, score calibration, multilingual corpus or ranking robustness were tested.

For explicit prompt composition, every arm supplied **all four notes**. A real `gemini-3.5-flash-lite` call then answered with `pnpm` and `Pune`. After a person-style file edit changed the city to Mumbai, a new call on each arm answered with `pnpm` and `Mumbai`. All six calls passed, each reporting 360 input tokens and 21 output tokens. This demonstrates that inspectable explicit memory can work without semantic retrieval when the selected memory fits in the prompt; it does not show Mem0 caused those six answers. The records are in `real-results.json`.

### Cost, reach and upkeep

| Integration | Installed dependency closure | Own package bytes | Median fresh-process import, 5 samples |
| --- | ---: | ---: | ---: |
| Markdown with built-in SQLite coordination | 0 npm packages | 0 added | 9.4 ms |
| Markdown + built-in SQLite FTS5 | 0 npm packages | 0 added | 10.7 ms |
| Mem0 + native SQLite + NLP peer | 87 packages | 33.0 MiB | 368.8 ms for the Mem0 adapter |
| Same + tested Google SDK | 120 packages | 60.5 MiB | Not measured separately |

`measurements.json` records actual installed dependency closures of the named roots, including the explicitly used peers. Counts overlap and are not incremental or browser bundle sizes. Import timing excludes Node startup and construction. `@google/genai` was pinned to 1.40.0 for this test; `mem0ai` to 3.3.1; `better-sqlite3` to 12.6.2; `compromise` to 14.19.0. These are tested versions, not a claim that every dependency is the latest.

The own store is 70 lines plus 30 shared file/coordination lines; FTS5 adds 25; the Mem0 retrieval wrapper adds 35 plus 11 configuration lines. Shared host policy/composition is 18 lines, factory 7 and the deterministic HTTP provider fixture 25. These small counts omit production contract design, readiness, Studio, reconciliation UI, migrations, retention and general filesystem hardening. They should not be used as implementation estimates.

A single local workload seeded 100 short notes, about 33.9 KB in the serialised record list. Median warm search over five queries was 6.3 ms for substring search, 22.2 ms for FTS5 and 11.8 ms for Mem0. Cold search was 35.8 ms, 63.0 ms and 1,567.1 ms respectively. Mem0 used **fake local embeddings** for these timings, made 106 embedding requests over initial indexing plus six searches, and made no extraction LLM calls. These numbers compare the fixtures, not real embedding-service performance. FTS5 rebuilds every query here; its slower result is not evidence against an incremental production index. All three refused full composition under the 8 KB prompt budget, so even explicit memory needs a deliberate selection/budget policy as it grows. `benchmark-results.json` preserves the results.

Fresh npm API responses returned the 30 September to 29 October window. Monthly downloads: `mem0ai` 684,946; `@mastra/memory` 4,535,647; `@letta-ai/letta-client` 400,099; `supermemory` 497,320; `@getzep/zep-js` 400,999; `sqlite-vec` 4,740,212. These include transitive installs and do not compare unique users. GitHub metadata for Mem0 showed 68,263 stars, 898 open issues/PRs and a last push on 30 October. Its 100-commit sample since 1 August hit the cap, with multiple human authors; one author accounted for 43 sampled commits. This establishes active maintenance, not issue-resolution quality. Exact responses are saved in `popularity.json` and `maintenance.json`. Sources: [Mem0 npm downloads](https://api.npmjs.org/downloads/point/last-month/mem0ai), [Mem0 repository](https://github.com/mem0ai/mem0).

Popularity gives Mem0 a credible optional ecosystem; it does not establish a reason to make it mandatory for explicit local files. Mastra's larger package reach is also not a reason to import its agent/thread model into Plico's public memory contract: its memory package requires `@mastra/core`, and its documented memory includes chat-history and observational-memory concerns beyond this epic. It was inspected, not executed. Hosted clients remain candidates for optional integrations, not tested local defaults. No hosted account was created and no vector extension was installed. [Mastra memory documentation](https://mastra.ai/docs/memory/overview).

### Findings to carry forward

- **A file write needs more than atomic replacement.** The first version replayed an old write over a newer one. Receipts fixed that, but a process exit between replacing the note and saving its receipt then produced a conflict. A prepared-operation journal fixed the tested windows. For production, reuse the execution engine's stable operation identity and design the memory-side commit/recovery protocol explicitly; do not assume the engine makes an arbitrary file effect exactly once.
- **Use revisions rather than automatic text merging.** Concurrent writes against the same revision produced one conflict. A retry must reread and deliberately reconcile; appending or merging an instruction silently could change its meaning. Human edits racing between a revision read and replacement were not protected by these cooperating-process locks.
- **Recovery needs an inspection path.** If a human changes a half-committed note after a crash, recovery preserves it and refuses to proceed. The single pending journal blocks this fixture's store until reconciliation, and no recovery UI/tool was built. That behavior is safe against the tested overwrite, but not yet a finished user experience.
- **Files remain portable; receipts belong to run metadata.** The notes can move between the three strategies unchanged, but copying only `memory/` does not transfer `.plico/` replay receipts. Fact portability and execution-resume portability are separate guarantees.
- **Keep indexes derived from files.** Refresh after edits, remove deleted sources, validate returned revisions, and make index rebuilds explicit. FTS5 was rebuilt successfully. The Mem0 wrapper reconciles at each search, rather than claiming to observe arbitrary external edits continuously. It has a fixture limit of 1,000 indexed rows, not a scalable synchronisation implementation.
- **Keep explicit writes separate from inferred memories.** If automatic extraction is introduced later, give it an explicit policy and source/provenance model. It should not quietly rewrite a user's durable Markdown or replace exact write receipts.
- **Budget and trust are host concerns.** Prompt data boundaries do not by themselves prevent injection, and an oversized list must not silently displace higher-priority instructions. The fixture fails visibly at its budget. Selecting notes, rendering their provenance, and testing no-answer retrieval remain product work.

Not tested: Plico's real runtime/event transaction boundary, readiness or Studio, Postgres or a host without writable disk, multiple machines, filesystem watchers, network filesystems, human edits during the actual rename window, forced OS/power loss, malicious symlink swaps, all-directory permission errors, receipt retention/migration, inferred Mem0 extraction, unknown-query abstention, rerankers, vector-store migrations, embedding-model changes, real remote vector stores, or large/long-lived corpora. The 28 tests and small Gemini check justify the working pick, not production readiness.

## PoCs 9, 10 and 12: remaining-layer batch

Date: 2026-11-02. The owner requested all three remaining PoCs together after memory. `node D:/projects/plico-poc/run-remaining.mjs` runs tracing, artifacts and validation; each also has its own `run.mjs`. The batch passed 44 behavior tests (10 tracing, 16 artifacts, 18 validation), a TypeScript inference check, and measurement workloads on Windows / Node 22.23.3. Five additional one-turn real Gemini schema calls passed separately. Results, exit codes and source/lockfile hashes are saved per PoC; `remaining-results.json` collects them. Repeating the default batch makes no paid provider calls.

All code stays in `D:\projects\plico-poc\poc9`, `poc10` and `poc12`. The application, accepted ADRs, PRD and GitHub epics were not changed. These complete the planned experiments; they are not production implementations or final architecture approval.

| Layer | Working recommendation after the batch | What changed in our understanding |
| --- | --- | --- |
| Tracing | OpenTelemetry API, GenAI conventions, optional host SDK/exporter | Persist context explicitly across resume; current AI SDK uses a separate OTel integration; traces remain lossy telemetry |
| Artifacts | Own immutable content-addressed bytes and version receipts; reuse `diff` | A hash deduplicates bytes, not write operations; Git still needs the same host coordination |
| Validation | Zod internally, library-neutral JSON Schema at the boundary, explicit adapters | The tested libraries work; arbitrary runtime checks are not fully represented by JSON Schema |

All choices remain provisional until the owner reviews the layers together. The six areas with no separate PoC planned (CLI parsing, Studio data/routing, eval scorers, skills format, host auth and deferred sandboxes) still need that decision review. Completing experiments does not silently decide them or authorise a broad implementation rewrite.

## PoC 9 results: tracing

**Arms:** a zero-package own event/span mapper with manual context propagation; OpenTelemetry with GenAI attributes; and OpenTelemetry with an OpenInference attribute profile. OpenInference is a convention profile on the same tracing substrate, not a competing durable execution engine. All arms ran the same scripted AI SDK model workload in two separate processes. The first segment saved a carrier; the resumed segment restored it and ran a child/tool span. A local completion receipt suppressed replayed model work.

| Scenario | Own mapper | OTel / GenAI | OTel / OpenInference |
| --- | --- | --- | --- |
| One connected trace across two process segments | Pass | Pass | Pass |
| Every recorded parent refers to an exported span | Pass | Pass | Pass |
| Child and tool nested under resumed work | Pass | Pass | Pass |
| One provider call per executed segment; cached replay adds none | Pass, host fixture | Pass, host fixture | Pass, host fixture |
| Prompt and output absent from captured spans | Pass | Pass, explicit recording opt-out | Pass, same opt-out |
| Deliver OTLP JSON to two selectable local endpoints | Pass, handwritten mapping | Pass, official HTTP exporter | Pass, same exporter |
| Removing saved carrier splits the trace | Negative control passes | Same | Same |

The two run segments are separate spans in one connected trace, rather than an in-memory span held open across a process restart. That models the approval-wait shape without pretending an SDK span object survives a restart. Plico still has to decide what context metadata it saves at an actual engine checkpoint. The fixture's completion receipt is not a test of the real runtime's replay boundary.

The SDK arms receive automatic AI SDK operation, step and model-call spans under Plico's active step. The tests assert two `chat` spans for two provider calls, not one model span plus a duplicate Plico wrapper for the same call. Nested spans for distinct lifecycle levels are intentional. The OpenInference arm adds its span-kind attributes through the integration's enrichment hook. Neither Phoenix nor Langfuse was run; delivering parsed OTLP JSON to two local URLs establishes configurable delivery, not certification against two SaaS products. The own mapper is deliberately incomplete compared with a production OTLP implementation.

**Current integration findings:** `@opentelemetry/api` 1.10.0, `@opentelemetry/sdk-trace` 3.0.0, context/core packages 3.0.0, HTTP exporter 0.300.0, OpenInference conventions 2.15.0, `ai` 7.0.159 and `@ai-sdk/otel` 1.0.159 were tested. The earlier `sdk-trace-node`/`sdk-trace-base` 2.12 packages were deprecated or had peer ranges excluding API 1.10, so the final fixture uses the current SDK entry point instead. Its tested engine requirement is Node >=22.15. The AI integration itself installs API 1.9.1 alongside the host's 1.10.0; the connected-parent tests passed with that combination, without overrides. Pin and test this combination on upgrades rather than forcing versions together blindly.

A separate temporary installation contained only the API package and no SDK. Ten thousand start/end calls remained non-recording, attempted no fetches and took a few milliseconds. Thus no user SDK/exporter setup is required to execute an instrumented path, but "costs nothing" should mean no-op behavior, not literally zero CPU or package bytes. The SDK is host setup in this fixture; it is not proposed as a mandatory Plico runtime dependency.

AI SDK 7 requires registration or per-call use of its separate `@ai-sdk/otel` integration for these automatic spans. The fixture supplies it per call and sets `recordInputs: false` and `recordOutputs: false`. Enabling recording made the synthetic `PRIVATE_PROMPT` and `PRIVATE_OUTPUT` visible, demonstrating that the privacy check can detect them. It does not prove that arbitrary user-supplied attributes, headers, exception messages or every future provider field are safe. Those need a separate allowlist/redaction policy.

A batch-export control ended a span then immediately exited the process. The unflushed queue exported nothing; explicitly flushing before the same exit exported the span. Trace delivery cannot replace Plico's canonical event log or determine whether a side effect happened. Persisting trace context connects segments; it does not make telemetry delivery exactly once.

Installed closure measurements: API alone 1 package / 0.59 MiB; host SDK/context/core/HTTP roots 10 / 11.83 MiB; AI integration plus its explicit Zod peer 13 / 20.30 MiB; OpenInference constants alone 1 / 0.54 MiB. Groups overlap, and API peers are counted only where a named root or dependency includes them. Fresh-process median imports were about 40 ms for the API, 125 ms for the trace SDK and 205 ms for the AI integration. These are five local samples, excluding Node startup, not steady-state request latency or bundle sizes. The own mapper is 22 compressed fixture lines; OTel setup/profile mapping 23, model host 10 and process host 15. They are demonstrations, not maintenance estimates.

Fresh monthly npm responses, ending 29 October: OTel API 377.2M downloads; trace SDK 177.3M; OpenInference conventions 1.87M; AI SDK OTel integration 7.24M. Downloads include transitive installs. Both OTel and OpenInference repositories reached the 100-commit sample cap since 1 August and had pushes in early November, with multiple authors. The data supports a maintained, broadly reused substrate; it does not make all GenAI attributes stable. Keep convention names in one mapping module. Exact snapshots and methodology are in `popularity.json`, `maintenance.json` and `measurements.json`.

**Working pick stays OTel API plus GenAI conventions.** It connects the SDK model spans, gives users their choice of exporter, and avoids maintaining context propagation, sampling and export protocols ourselves. Offer an OpenInference profile if a consumer needs it. The own event mapper remains useful for exporting historical Plico events, but should not become the only live tracing integration.

Not tested: the real engine checkpoint transaction, abrupt failure during carrier save, remote/network collector behavior, SDK sampling combinations, baggage propagation, exporter outage/backpressure, a hosted observability backend, every content-bearing attribute, or real provider network spans. All model calls in this PoC were scripted. Sources: [OTel instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/), [context propagation](https://opentelemetry.io/docs/concepts/context-propagation/), [AI SDK v7 telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry), [OpenInference conventions](https://arize-ai.github.io/openinference/spec/semantic_conventions.html).

## PoC 10 results: artifact versioning

The scope was read from [epic #73](https://github.com/ITZSHOAIB/plico/issues/73): link writes to runs, retain versions, compare and export them. The three backends are own SHA-256-addressed content, isomorphic-git 1.44.9 and simple-git 4.0.2. All share a small host owning version metadata, operation identity, run links, process coordination, diff dispatch and export. The own backend writes immutable bytes before recording a version. Git backends commit content first, then record the host version; on replay they recover the matching commit by operation fingerprint. Git metadata is private to the adapter, not the project contract.

| Scenario | Own store | isomorphic-git | simple-git |
| --- | --- | --- | --- |
| Retry same operation | One version | One version | One version |
| Distinct deliberate write of unchanged bytes | New version | New commit/version | New commit/version, with allow-empty |
| Two processes write one path | Both run versions preserved | Same | Same |
| Old version readable after newer writes | Pass | Pass | Pass |
| Stop after content/commit, before metadata commit; resume in new process | One version | One version and one Git commit | One version and one Git commit |
| Text diff identifies removed/added lines | Pass via `diff` | Same host diff | Same host diff |
| Small binary version, diff and exact byte export | Pass | Pass | Pass with binary CLI read |
| Changed input under an already recorded operation ID | Refused | Refused | Refused |
| Traversal paths / overwriting an export | Refused | Refused | Refused |

The 16 tests cover these behaviors plus corruption detection in the own store. They show local process-restart recovery at the selected boundary, not power-loss recovery or integration with the actual durable runtime. The run-linked event output is projected from the host's durable version records. It is not a test that a separate Plico event append and version record commit atomically.

**A content hash is not a version ID.** The same bytes written by a new deliberate operation still need a new version/run association. Conversely, replaying the same operation must return its earlier receipt. Content deduplication and operation deduplication solve different problems. This distinction was required in every arm.

The common SQLite coordinator serialises Git index/worktree commits as well as own metadata writes, so the concurrency passes must not be attributed to Git alone. Likewise, the commit marker/fingerprint lookup is host adapter code, not an automatic Git idempotency feature. Ordinary binary stdout decoded as text would corrupt the simple-git read path; that adapter uses `execFile` with buffer output for exact bytes. It requires the system Git executable; the tested version was 2.42.0.windows.2. isomorphic-git performs storage operations in JavaScript, though the test suite also used installed Git to independently inspect commit counts after replay.

One local workload wrote 20 versions of a roughly 5 KB text file, then read every version. The own store took about 0.3 seconds to write all versions; isomorphic-git about 0.7 seconds; simple-git about 6 to 7 seconds. The Git process overhead matters here, but this is one small serial workload, not a general Git/storage benchmark. `benchmark-results.json` records exact final timings. No large binary or object storage workload was introduced.

Installed package closures, including the reused `diff` package: own store 1 / 0.59 MiB, isomorphic-git 56 / 7.66 MiB, simple-git 8 / 1.61 MiB. The object store itself has zero npm dependencies; SQLite and hashing are built in on the tested Node. The shared host is 61 compressed fixture lines, own content backend 15, Git adapter 43, and reused file/coordination helpers 30. That omits readiness, Studio, garbage collection, migrations, hardened filesystem handling and a production transaction design. `diff` 9.0.0 is BSD-3-Clause; the two Git libraries are MIT.

Monthly downloads ending 29 October: isomorphic-git 8.98M, simple-git 46.9M and `diff` 569.4M. The isomorphic-git repository had 51 commits since 1 August, with `luantaraschi` and `jcubic` contributing 16 and 13; simple-git had 13, 10 by `steveukx` and 3 by a bot, and a last push on 26 September. Neither lacked users, but simple-git's upkeep is concentrated. Counts include transitive installs and are not independent user counts. Snapshots are saved with this PoC.

**Working pick stays own content-addressed storage plus version receipts, reusing `diff`.** Git passed the tested functional scenarios and can be an optional export or integration. It did not remove the core host work, and it introduces repository/index/history concerns into a layer that eventually needs other storage implementations. This test does not prove a Postgres or object-store implementation; it only keeps those concerns out of the port.

Limits: one local machine, two concurrent writers, one selected crash boundary, small files, no rename/delete history, no restore into an active working tree, no garbage collection, no corruption matrix for Git objects, no mixed Git clients editing the repository, no signing/hooks/remotes, no real runtime event transaction and no hosted storage. Path checks are lexical fixture checks, not a symlink/case-folding security boundary. A changed request replayed after a crash before its version receipt was recorded was not tested. Sources: [isomorphic-git commit API](https://isomorphic-git.org/docs/en/commit), [simple-git repository](https://github.com/steveukx/git-js), [jsdiff](https://github.com/kpdecker/jsdiff).

## PoC 12 results: validation

The five arms are an own validator for a deliberately limited JSON Schema subset, Zod 4.6.7, TypeBox 1.4.3 with its compiler, Valibot 1.5.0 with `@valibot/to-json-schema` 1.8.0, and plain JSON Schema validated by Ajv 8.20.0. All describe the same strict nested ticket-tool input: positive integer ticket ID, enumerated action, boolean dry-run and bounded string tags. The comparison keeps coercion off and reports structured issue paths through a common fixture boundary.

| Scenario | Own subset | Zod | TypeBox | Valibot | JSON Schema / Ajv |
| --- | --- | --- | --- | --- | --- |
| Valid nested input accepted | Pass | Pass | Pass | Pass | Pass |
| Wrong types, missing fields, enum/bounds, extras rejected | Pass | Pass | Pass | Pass | Pass |
| Nested error retains `options.tags.0` path | Pass | Pass | Pass | Pass | Pass |
| Runtime and exported JSON Schema agree on the shared corpus | Pass | Pass | Pass | Pass | Pass |
| AI SDK model receives input error, then corrected call executes once | Pass | Pass | Pass | Pass | Pass |
| Real Gemini accepts the tool schema and returns valid input | Pass | Pass | Pass | Pass | Pass |
| Native authoring preserves TypeScript action narrowing | Not offered | Pass | Pass | Pass | Not offered |

There are 18 behavior tests, plus an actual TypeScript 7.0.2 compilation with `@ts-expect-error` guards against invalid action values for all three typed authoring libraries. The AI SDK 7.0.159 correction-loop tests use its official scripted mock model: call one submits an invalid ticket ID, the handler does not run, the returned tool error is visible in the second prompt, and call two succeeds. They prove that the integration carries a correctable failure, not that an arbitrary real model always corrects itself.

The five separate real `gemini-3.5-flash-lite` calls used Google SDK 2.32.0 and synthetic input. Each accepted its schema and produced an `archive` call with ticket ID 7 and a true dry-run flag, which the corresponding runtime validator accepted. No external archive side effect ran. The `$schema` annotation was removed before the provider handoff, preserving the workload constraints. These one-turn checks do not establish provider portability for every JSON Schema keyword. `real-results.json` preserves arguments and token counts; paid calls are separate from the offline batch.

**Conversion is not an equivalence guarantee.** A negative control defines an even-number refinement in Zod: runtime validation rejects 3, while its exported JSON Schema accepts 3. Runtime validation must remain authoritative. A provider schema guides generation; it cannot express arbitrary JavaScript checks or transforms. Unsupported conversions and runtime-only constraints need an explicit product policy rather than a promise of lossless export.

The installed Zod schema exposes both Standard Schema validation and Standard JSON Schema conversion. Valibot exposes Standard Schema validation but uses a separate official converter for JSON Schema in this version. The TypeBox object in the test exposes neither `~standard` hook, because its representation is already JSON Schema and its compiler is a separate consumer. Supporting user choice therefore requires capability detection and explicit adapters; "implements a standard validator" does not imply "automatically exports JSON Schema". The tests use isolated schema factories and the actual AI SDK, not Plico's current `loadProject` implementation.

The isolated installation contains one Zod version, 4.6.7, shared with the tested AI SDK and official MCP client 2.4.0. Both imported successfully, with no override. This does not erase the earlier AG-UI Zod 3 finding or promise a single Zod major across every optional ecosystem adapter. The own subset fails closed on unsupported keywords, such as `pattern`; it is not a replacement for full JSON Schema validation.

| Validator roots | Installed packages | Installed own-file size | Median 10,000 validations |
| --- | ---: | ---: | ---: |
| Own workload subset | 0 | 0 added | About 10 ms |
| Zod | 1 | 5.86 MiB | About 23 ms |
| TypeBox | 1 | 1.50 MiB | About 85 ms |
| Valibot + JSON Schema converter | 2 | 1.94 MiB | About 9 ms |
| Ajv for plain JSON Schema | 5 | 1.25 MiB | About 3 ms |

Validation timings are medians of five local samples with half valid and half invalid inputs, including normalised error construction, after warm-up and excluding schema compilation/import. They are one workload, not a universal performance ranking. Fresh import medians were about 90 ms for Zod, 294 ms for TypeBox, 10 ms for Valibot and 82 ms for Ajv. A small own function is cheap here because it omits nearly everything the libraries support; it carries no static inference or standards-maintenance solution. Source size and installed closure details are saved in `measurements.json`.

Monthly npm downloads ending 29 October: Zod 1.336B, TypeBox 51.3M, Valibot 89.8M, Valibot converter 23.3M and Ajv 1.548B. Downloads include transitive installs and do not count unique authors choosing a library. In the recent-commit samples, Zod's main author had 97 of 100 commits; TypeBox's had 58 of 61; Valibot's leading author had 17 of 46. All had recent activity, but Zod and TypeBox remain concentrated maintenance bets. GitHub's TypeBox licence metadata returned `NOASSERTION`; the installed 1.4.3 package's licence file was inspected and is MIT. Saved API responses distinguish these signals rather than interpreting repository detection failure as a package licence change.

**Working pick stays Zod for Plico's internal validation, with library-neutral tool/wire boundaries.** It fits the already-used SDK/MCP dependency set, has broad reach and provides typed diagnostics and native conversion. TypeBox and Valibot both passed and should remain supported authoring options through small adapters. Plain JSON Schema needs a real validator such as Ajv at execution time; accepting a schema object alone is not input validation. Do not build the own subset into the product as a general validator to save a dependency.

Not tested: Plico config/loading end to end, the full JSON Schema conformance suite, async refinements, arbitrary transforms, recursive/reference-heavy tools, defaults and coercion policies, malicious schemas, browser bundle/CSP behavior, every provider's supported schema subset or future version compatibility. These limits should shape the eventual tool-schema contract, not become implicit promises. Sources: [Zod JSON Schema](https://zod.dev/json-schema), [Valibot JSON Schema](https://valibot.dev/guides/json-schema/), [TypeBox](https://github.com/sinclairzx81/typebox), [Standard Schema](https://standardschema.dev/), [Ajv](https://ajv.js.org/).

## PoC 13 results: DBOS gaps and the combined run

Date: 2026-11-02. Throwaway code in `D:\projects\plico-poc\poc13`, on Windows with Node 22.23.3, `@dbos-inc/dbos-sdk` 5.4.0, `ai` 7.0.159, `@modelcontextprotocol/client` 2.4.0 and `hono` 4.13.16. The DBOS findings may change with its version. This closes the gaps a review of PoCs 1 to 12 found: DBOS could not express per-step retries, several DBOS behaviours were untested, and no run had combined the picks. The build-our-own arm is the own SQLite engine, on the same scenarios through the same interface. This changes no decision; the owner still decides all layers together.

**DBOS holds up as the production engine, with one real condition: nothing takes over a dead worker's runs by default.** Everything else tested passed on both engines, and the picks work together in one process with a real model.

### Shared scenarios

Both engines passed 14 of 14: own in one final full run, DBOS in two. Workflows use only the engine interface.

| Scenario | Own | DBOS |
| --- | --- | --- |
| `retries: 0`: one attempt, the failure is an event | Pass | Pass |
| `retries: 2`: three attempts inside one step | Pass | Pass |
| Crash inside a `retries: 0` step runs it again on recovery | Pass, 2 attempts | Pass, 2 attempts |
| Wait timeout is distinct from a denial | Pass | Pass |
| Kill during a 6 s wait keeps the deadline | Pass, 6,036 ms | Pass, 6,020 ms |
| Late decision changes nothing | Pass | Pass |
| Two named approvals need two decisions | Pass | Pass |
| Decision sent before the wait is held | Pass | Pass |
| First of two conflicting decisions wins | Pass | Pass |
| Cancel while paused stays cancelled after a restart | Pass | Pass |
| Cancel aborts a running step; the next step never runs | Pass | Pass |
| Subagent: kill at its approval, a new process approves through the parent | Pass, each effect once | Pass, each effect once |
| Subagent: a denial reaches the child | Pass | Pass |
| Subagent: cancelling the parent cancels the child | Pass | Pass |

- **Per-step retries needed no workaround.** `DBOS.runStep` takes `retriesAllowed` and `maxAttempts`.
- **Child cancel is built in.** `cancelWorkflow(id, { cancelChildren: true })` replaces the parent lookup the own engine needs.
- **DBOS refuses status reads inside a step.** The first adapter polled there, swallowed the error and never aborted, so the step finished after cancel. That was the one failure in the first DBOS run. The fix is one poller per process, outside any workflow context, which also reaches steps on other workers.

### Several workers

Cancel issued on another worker aborted the step on both engines. Takeover differs:

| Situation | Own | DBOS |
| --- | --- | --- |
| Worker dies, a live peer stays up, nobody acts | Peer takes over at lease expiry | **Run stays stuck** (10 s observed) |
| Same worker ID restarts | Not needed | Run recovers |
| Peer calls public `resumeWorkflow` | Not applicable | Run recovers |
| Peer calls internal `recoverPendingWorkflows` | Not applicable | Run recovers; needs a file-path import past the package's `exports` |
| Worker still alive when its run is recovered | Not applicable | **Side effect runs twice** |
| Second process starts with the same worker ID during a live run | Not applicable | **Side effect runs twice** |
| Worker stalls past its 3 s lease mid-step | **Side effect runs twice** | Not tested |

- **DBOS only recovers its own worker ID at launch.** `executorID` defaults to `DBOS__VMID` or `local`, so two processes on the default ID collide. Plico must set a unique, stable ID per worker.
- **A stuck run needs an owner.** The options are stable worker IDs with automatic restart, Conductor (not tested here), or a Plico heartbeat calling `resumeWorkflow`. A heartbeat that fires on a live worker causes the duplicate above.
- **Neither engine fences a stale worker.** Both are at-least-once for anything in flight. The own engine's result also limits its 3 s lease: a stall that long repeats the step. Tools with side effects need the `runId:turn:callIndex` key as an idempotency key on any engine.

### Load

One Windows machine, embedded Postgres on default settings apart from `max_connections`, one run per row. Each run is three 20 ms simulated model steps and five events. Every row finished all runs with no errors and the expected event count, and workflow executions across workers summed to exactly the run count, so nothing ran twice. Event counts alone could not show that, because event writes are idempotent.

| Arm | Runs | Runs/s | p50 | p95 | Resume all paused | RSS while paused, all workers |
| --- | --- | --- | --- | --- | --- | --- |
| Own, 1 process | 300 | 269 | 527 ms | 617 ms | 0.6 s | 95 MB |
| Own, 3 processes | 300 | 302 | 429 ms | 665 ms | 0.6 s | 250 MB |
| Own, 3 processes | 1,000 | 337 | 611 ms | 912 ms | 1.6 s | 279 MB |
| DBOS, 1 worker | 300 | 128 | 1,660 ms | 1,776 ms | 1.0 s | 132 MB |
| DBOS, 3 workers | 300 | 167 | 1,041 ms | 1,573 ms | 0.6 s | 338 MB |
| DBOS, 3 workers, queue | 300 | 135 | 1,708 ms | 1,818 ms | 0.8 s | 324 MB |
| DBOS, 3 workers | 1,000 | 213 | 2,770 ms | 3,079 ms | 1.9 s | 391 MB |

These show no loss and no duplicates at this size, not capacity. The own engine is faster on one disk but cannot span machines. The DBOS queue spread work unevenly in all three runs, with no registration errors: 173, 8 and 119, then 197, 103 and 0, then 200, 0 and 100. It was also slower than direct starts, and did not beat them for fairness. The queue was registered after launch, which this PoC did not vary.

### Combined run

A project folder with `agent.md`, `plico.config.ts` and a `.tool.ts` file was loaded through `tsx`, with Zod schemas and sibling and npm imports. One host ran the AI SDK adapter, the official MCP client, own Markdown memory, a content-addressed artifact write with `diff`, plain SQL events, Hono and the OTel API. The driver worked over HTTP and killed the host at both approvals (a TypeScript tool and an MCP tool), then approved from a new process.

Passed on own and DBOS, with both the scripted model and real `gemini-3.5-flash-lite`, one run each:

- The run completed through both kills, and each side effect happened once.
- The native stream resumed with `Last-Event-ID` with no gap or duplicate across 18 events.
- Memory and two artifact versions with a diff were written.
- AG-UI frames passed the official schemas in every segment; the AI SDK reader rebuilt the message across segments.
- One connected trace covered all restarts, with AI SDK spans under Plico's, and no prompt or output text in spans.
- The only hosts contacted were local and, on real runs, `generativelanguage.googleapis.com`.

Event timelines were identical across engines with each model. Startup was about 0.9 s on own and 1.3 s on DBOS. Everything installed with no resolver conflict: 101 packages and 194 MB, of which 107 MB is the test-only embedded Postgres. The only duplicates were zod 3.25.76 and 4.6.7 (from AG-UI) and `@opentelemetry/api` 1.9.1 and 1.10.0.

The combined run covers the reuse picks only. The own model adapter, own MCP client and `node:http` fallbacks were not run together.

Three deliberate breaks each failed the matching check: dropping the trace carrier split the trace, running a tool outside a step repeated the refund, and turning on input recording exposed content in spans.

### Corrections to earlier results

- **Kysely, PoC 4:** the three-process migration failed about half of 12 reruns on SQLite. The PoC 4 table now says so.
- **Drizzle, PoC 4:** one unidentified 9 of 10 on SQLite, then none in 11 reruns.
- **PoC 3:** the TanStack AG-UI question went to PoC 8, layer 10, not layer 13.

### Not tested

More than one machine, network partitions, Conductor, a DBOS worker stalling rather than dying, in-flight runs across an application version change, or sustained load. Tokens did not stream live in the combined run: text enters the log after the model step ends, so live deltas need their own path. Subagents, skills, compaction and evals were not part of the combined run; subagents ran only in the engine suite. The artifact step was a simple stand-in, not PoC 10's full store. MCP ran over HTTP without OAuth. AG-UI frames were checked by schema, not by a client this time. Reusing one wait name in a run: the first-decision scenario passes on both engines, but the own engine stores one signal per name while DBOS `recv` appears to consume queued messages, so results could differ. Wait names should be unique per run, as the combined host's per-call keys are.

## What this pauses

This audit led to ADR 0008 and a revision of the planning documents: a new epic #95 for the execution engine, and changes to ADRs 0002, 0003, 0004 and 0007, the PRD and epics #69, #70, #72, #73, #77, #78, #79 and #82. #69 keeps its state machine and migrator, because the event log stays authoritative for what happened. Only its killed-run slice changes.

## Sources

- [OpenWorkflow](https://github.com/openworkflowdev/openworkflow)
- [Workflow SDK](https://github.com/vercel/workflow)
- [Workflow SDK deploying](https://useworkflow.dev/docs/deploying)
- [Workflow SDK streaming](https://useworkflow.dev/docs/foundations/streaming)
- [How the directives work](https://useworkflow.dev/docs/how-it-works/code-transform)
- [Publishing libraries](https://useworkflow.dev/cookbook/advanced/publishing-libraries)
- [DBOS Transact TS](https://github.com/dbos-inc/dbos-transact-ts)
- [Absurd](https://github.com/earendil-works/absurd)
- [AI SDK](https://github.com/vercel/ai)
- [`@ai-sdk/workflow`](https://github.com/vercel/ai/tree/main/packages/workflow)
- [`pi` monorepo](https://github.com/earendil-works/pi)
- [TanStack AI](https://github.com/TanStack/ai)
- [AI SDK 5 to 6 migration guide](https://www.rabinarayanpatra.com/blogs/vercel-ai-sdk-5-to-6-migration-guide)
- [Vercel Community: backward compatibility thread](https://community.vercel.com/t/backward-compatibility-and-breaking-changes/27946)
- [AI Devtools Radar on `@ai-sdk/workflow` 2.0](https://buttondown.com/devtoolsradar/archive/ai-devtools-radar-6-vercel-ai-sdk-drops-workflow/)
- [AG-UI](https://github.com/ag-ui-protocol/ag-ui)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 2026-07-28 release](https://github.com/modelcontextprotocol/specification/releases/tag/2026-07-28)
- [MCP 2026-07-28 breaking changes](https://www.developersdigest.tech/blog/mcp-2026-07-28-breaking-changes)
- [AI SDK MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [`mcp-use`](https://github.com/mcp-use/mcp-use)
- [Standard JSON Schema](https://standardschema.dev/json-schema)
- [Node.js `node:sqlite` docs](https://nodejs.org/download/release/v26.4.0/docs/api/sqlite.html)
- [PGlite 0.4 announcement](https://electric.ax/blog/2026/03/25/announcing-pglite-v04)
- [Drizzle vs Prisma, Makerkit](https://makerkit.dev/blog/md/tutorials/drizzle-vs-prisma)
- [`kysely-sqlite` community dialect](https://github.com/nikeee/kysely-sqlite)
- [Hono guide, DeployHQ](https://deployhq.com/guides/hono)
- [AI SDK with Hono](https://ai-sdk.dev/resources/recipes/api-servers/hono)
- [OpenTelemetry GenAI conventions](https://github.com/open-telemetry/semantic-conventions-genai)
- [OpenTelemetry GenAI agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans)
- [AI SDK telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- [Workflow SDK with Hono](https://workflow-sdk.dev/docs/getting-started/hono)
- [AG-UI events](https://docs.ag-ui.com/concepts/events)
- [Deep Agents JS](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [AI SDK harnesses](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview)
- [Mem0 2026 report](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Best LLM agent memory tools](https://futureagi.com/blog/best-llm-agent-memory-tools-2026/)
- [Hybrid search with `node:sqlite`](https://dev.to/catidegla/hybrid-search-in-one-file-with-nodesqlite-fts5-and-zero-dependencies-j6j)
- [AgentFS docs](https://docs.turso.tech/agentfs/introduction)
- [OpenAI acquires Promptfoo](https://finance.yahoo.com/news/openai-acquires-promptfoo-secure-ai-174904138.html)
- [What are Agent Skills?](https://atlan.com/know/ai-agent/ai-agent-skills/what-are-agent-skills/)
- [Agent Skills guide](https://env.dev/ai/agent-skills)
- [assistant-ui runtimes](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime)
