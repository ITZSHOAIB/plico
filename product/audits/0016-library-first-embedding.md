# Library-first embedding: Plico inside a host backend

**Date:** 2026-11-08
**Question:** A real product, such as a chat app, already has a backend with auth, users and a database. How does a Plico agent run inside it without Plico taking over that backend, and without weakening the file-first project model? Which parts belong in the first public release?
**Status:** Accepted 2026-11-08. Applied to [#161](https://github.com/ITZSHOAIB/plico/issues/161) (new, M1), [#81](https://github.com/ITZSHOAIB/plico/issues/81) (rescoped, M3), #99, #76, #79 and #141. The maintainer chose: core embedding in M1; framework-neutral handlers first; a new M1 epic split from #81; and in M1 also the `agent.md` frontmatter rule and reserved names for #141. Follow-up answers the same day: the whole of #161 (mounted handlers included) ships in M1; host data is a JSON metadata map; `agent.md` frontmatter is parsed and stripped; Studio and import-path defaults confirmed; approvals record the decider's context; #81 is blocked by #82.

## Answers in short

1. **Plico is a library you import, not a backend you adopt.** `plico serve` stays the local and sidecar path. The main production path is `createPlico({ projectRoot })` inside the host's process.
2. **Files define the agent; code only runs it.** The programmatic API accepts a project folder and per-call data (input, thread, opaque context, metadata). It never accepts instructions, tools, skills or models. The test: `plico validate`, `plico eval` and Studio see the whole agent without starting the host app.
3. **Plico owns agent state; the host owns app state.** Plico stores runs, events, threads, approvals and artifacts. The host owns users, login, permissions, routes and UI. Plico tags records with opaque host data and filters by it. Deciding who may act stays with the host.
4. **Ship it in M1.** The `@plico/server` export shape and the `threads` table are expensive to change after the first publish (audit 0013, rule b). Without this path, M1 is only a local demo.

## The line between Plico and the host

| Plico owns (agent state) | Host owns (app state) |
|---|---|
| Project files, runtime, tools, skills | Users, login, sessions, permissions |
| Runs, events, threads, approvals, artifacts | Routes, API shape, response formats |
| Durability, replay, recovery | Its database and business data |
| Studio, evals, readiness | UI and chat components |
| A library API over all of the above | Deciding who may call what |

### What the programmatic API may accept

| Allowed: per-call data | Not allowed: agent definition |
|---|---|
| `projectRoot`, `databasePath` | `createPlico({ agents, tools, instructions })` |
| User input, `threadId` | `plico.addTool()`, `plico.setInstructions()` |
| Opaque `context` and `metadata` | Per-call `model` or system-prompt overrides |
| Approve, cancel, read and follow events | Registering skills at runtime |

Behaviour that varies by user or plan belongs in files: instructions or a tool read `context`. Tools that need host services import host modules directly (`import { db } from "../../src/db"`), since tools are TypeScript files in the host repo. If code-defined agents are ever requested, they must produce the same structure `loadProject` returns, so validation, evals and Studio keep working.

## How others do it (checked 2026-11-08)

| Topic | Mastra | eve (Vercel) | Inngest |
|---|---|---|---|
| Where the agent runs | **In the host's process.** `new MastraServer({ app, mastra }); await server.init()` | **A separate service.** "The agent runs as its own service, never inside the Next.js server." `withEve` proxies `/eve/v1/*` on the same origin | In the host's process |
| Framework integration | Eight packages: `@mastra/express`, `hono`, `fastify`, `koa`, `nestjs`, `next`, `elysia`, `tanstack-start` | `eve/next` and `eve/vercel` only | `serve()` per framework (`inngest/express`, `inngest/next`, `inngest/hono`); "change your web framework without changing function code" |
| Call from your own route | `mastra.getAgent('x').generate(msg, { requestContext })` | Over HTTP through `eve/client`: `client.sessions.create({ message })` | n/a |
| Per-user threads | `resource` + `thread`; "Each thread has an owner (`resourceId`) that can't be changed after creation." The server returns 403 for non-owners once identity is wired in | "Route auth doesn't check who may use a session, and eve adds no per-session access list." "Your application decides who may use a session." | n/a |
| Identity in tools | `requestContext.get(...)`, optionally typed with `requestContextSchema` | `ctx.session.auth.current` / `.initiator` | n/a |
| Body parsing | `express.json()` must come first | n/a | `express.json()` must come first |
| Studio when embedded | Separate: `mastra studio` "to only launch the Studio UI" | TUI and a separate service | n/a |
| Build step | Adapters: "no Mastra bundling step… run TypeScript directly (for example with `tsx`)". `mastra build` only for the generated server | `eve build` compiles the agent folder for deployment | n/a |
| Lifecycle | `mastra.startWorkers()` after listen, `mastra.shutdown()` on SIGTERM | Managed by the platform | n/a |

**What Plico takes from this:**

- **Both deployment shapes are valid, and Plico can offer both.** `plico serve` is the eve-style sidecar today. `createPlico` adds the Mastra-style in-process option, which is what a host needs to pass identity to tools without a network hop.
- **One framework-neutral core with thin adapters.** Inngest and Mastra both keep function code unchanged across frameworks. Plico starts with `fetch` and `node` handlers and recipes, and adds a package only when users ask (ADR 0009 already picks Hono, which gives the `fetch` handler).
- **On access control, Plico follows eve's split.** The host decides; Plico stores and filters. Mastra's enforced, immutable owner is a stronger default, but it brings a user model into the framework, which the maintainer rejected.
- **Accept a body the host has already parsed.** Mastra and Inngest both expect `express.json()` before them. Plico's Node handler must use `req.body` when present, instead of requiring that it be mounted before any body parser.
- **Studio runs separately.** Neither competitor mounts its Studio inside the host app.
- **No build step for M1.** Mastra's adapters run TypeScript directly, as Plico does through tsx. Serverless bundling is an M3 problem (see F7).

## Findings in the current code

Read on `feat/75-chat-titles` at `988e0dc`.

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | **The public server API exposes internals.** `createPlicoServer` takes `eventStore`, `threadStore`, `engine`, `provider`, `providerRecoveryKey` and `providerAccountKey`. | `packages/server/src/types.ts` | Publishing this makes stores and keys public contract. The Hono move in #81 would then break callers. |
| F2 | **The real setup lives only in `servePlico`.** It validates the project, opens the SQLite stores and engine, builds the provider and keys, recovers runs, resumes queued runs and closes stores on shutdown, in about 75 lines before `listen`. | `packages/server/src/server.ts:93-169` | An embedder must copy it. `createPlico` should own it, with `servePlico` = `createPlico` + `listen`. |
| F3 | **Thread orchestration lives in the HTTP route.** The busy check, history, run start, start handshake and failure settling are inside `POST /v1/threads/:id/messages`. | `packages/server/src/routes/threads.ts:89-172` | It cannot be called without HTTP. It must move to a layer that the routes and the SDK share, or the two will drift. |
| F4 | **Following a run's events is a polling loop inside the HTTP layer.** It sleeps for a heartbeat interval between `getEvents` calls. | `packages/server/src/stream.ts:34-96` | The SDK needs `plico.runs.events(runId, { after })` as an async iterator; SSE becomes a thin writer over it. |
| F5 | **Threads have no owner or metadata.** The table is `threads (thread_id, created_at)` plus `title`, and `ThreadStore.listThreads()` takes no filter. | `packages/runtime/src/storage/sqlite/schema.ts:63`, `storage/sqlite/threads.ts:9-37` | A host cannot list "this user's conversations" without keeping its own copy. This is a store and wire change, so it belongs before publish. |
| F6 | **Tools get no host context.** `ToolHandlerContext` has `signal`, `idempotencyKey` and `artifacts` only. | `packages/contracts/src/tools.ts:46-55` | Add `context`. Runs resume after a crash and queued thread runs resume in a new process, so context must be recorded with the run. It must therefore be JSON and must not carry secrets or tokens. The docs must say so. |
| F7 | **Tools load from disk at runtime through tsx.** | `packages/runtime/src/tools/load.ts:6-42` | Works in a long-running Node host. Bundlers on serverless platforms (Next.js on Vercel, Lambda) trace files statically and will miss them; Vercel's guide points to `outputFileTracingIncludes` for files read at runtime. A `plico build` step is M3 (#81). |
| F8 | **The origin guard assumes loopback.** Without `allowRemote` it refuses any non-loopback `Host`. | `packages/server/src/origin-guard.ts`, `types.ts` | An embedded handler sits behind the host's auth and domain. Embedded mode must not apply the loopback rule by default, but must keep the cross-origin and JSON content-type checks from #76. |
| F9 | **A second process on the same database can act on runs.** Each process takes its own owner lock; `servePlico` resumes queued thread runs at startup. | `packages/runtime/src/storage/sqlite/owner-lock.ts`, `server/src/server.ts:113-122` | Running Studio next to an embedded host on one SQLite file could resume the host's queued runs. Studio-beside-a-host needs an inspection mode that never recovers or starts runs. |

## Decisions

Chosen by the maintainer:

1. **Core embedding ships in M1** as a new epic, split from #81. #81 keeps production hardening in M3.
2. **Framework-neutral `fetch` and `node` handlers first,** with docs recipes for Express, Next.js and Hono. A per-framework package only when users ask.
3. **In M1, also:** decide how `agent.md` frontmatter is handled (#99, where the parser arrives), and reserve `agents/`, `workflows/` and the `entry` config key in the reference docs (#76), so #141 can use them later without changing existing projects.

Also settled: 5 and 7 confirmed explicitly; 4 follows the maintainer's pushback against owning the product backend; 6 follows from not choosing `plico build` for M1; 8 is unchanged from audit 0013's accepted order.

4. **The host enforces access; Plico filters.** Plico stores host-supplied metadata and filters by it. It has no user model.
5. **Studio runs separately** (`plico serve --studio --db <host db>` or a dedicated command), never mounted inside the host app in M1.
6. **No `plico build` in M1.** It goes to #81 in M3.
7. **The import path is `@plico/server`.** The `plico` package cannot host the SDK, because it may depend only on contracts.
8. **Multi-agent (#141) stays in M2.**

Follow-up answers, 2026-11-08:

9. **Metadata is a JSON map,** set at creation, immutable (as Mastra's thread owner is), with exact-match filters on top-level keys.
10. **`approval.decided` records the deciding host's context,** keeping #53's audit requirement.
11. **`agent.md` frontmatter is parsed and stripped,** unknown keys warn in `plico validate`, and it never reaches the model (#99).
12. **`createPlicoServer` is removed before the first publish,** with no alias.
13. **Studio is a local development tool,** not deployed against production data. Production runs reach it through export (#82); OpenTelemetry is the production observability path. A hosted Studio is out of scope until users ask, and then only read-only behind host auth.
14. **Studio beside a host is inspection-only** (option A). From reading `engine.ts:188-202`, untested: a signal written by another process does not wake a run the host owns. Cross-process signals are considered with #82.
15. **All of #161 ships in M1,** including the Hono move and the mounted `node`/`fetch` handlers with `scope`.

## Design for the M1 epic

```ts
import { createPlico } from "@plico/server";

const plico = await createPlico({ projectRoot: "./agent", databasePath: ".plico/db.sqlite" });

// Programmatic: the host owns the route, auth and stream format
app.post("/chat/:threadId", requireLogin, async (req, res) => {
  const thread = await plico.threads.get(req.params.threadId);
  if (thread?.metadata.userId !== req.user.id) return res.sendStatus(404); // host decides
  const { runId } = await plico.threads.send(thread.id, req.body.text, {
    context: { userId: req.user.id },          // JSON, recorded with the run, passed to tools
  });
  for await (const event of plico.runs.events(runId)) { /* write SSE however the host likes */ }
});

// Mounted: Plico's /v1 API inside the host app
app.use("/agent", requireLogin, plico.node({
  scope: (req) => ({ userId: req.user.id }),   // stamped on new threads and runs, required on every read
  context: (req) => ({ userId: req.user.id }),
}));
export const { GET, POST } = plico.fetch({ scope: ..., context: ... }); // Hono, Next.js, Bun

process.on("SIGTERM", () => plico.close());
```

- **One shared layer.** Thread send, run start, approvals, cancel and event following move out of the routes (F3, F4). The `/v1` routes and the SDK both call it, so the HTTP API cannot drift from the library.
- **`scope` makes the mounted API safe without a user model.** The host computes it per request. Plico stamps it on new threads and runs and adds it as a filter to every read and action. A client cannot widen it through the body or query. This is filtering by what the host supplies, not a Plico permission system.
- **`metadata`** is a free-form JSON map on threads and runs, set at creation and filterable by exact match on top-level keys. The programmatic API takes it directly; the mounted API takes it only from `scope`.
- **`context`** reaches tools as `ctx.context`, is recorded on `run.started` (F6), and on `approval.decided` for whoever decided.
- **Lifecycle.** `createPlico` recovers interrupted runs and resumes queued ones. `close()` stops work and closes stores. Readiness reports embedded configuration.
- **Request handling.** The Node handler accepts a pre-parsed `req.body`, keeps the JSON content-type and cross-origin checks, and drops the loopback-`Host` rule in embedded mode (F8). Mount paths work with and without prefix stripping.
- **`servePlico` and `plico serve`** become `createPlico` plus `listen`. The wire contract stays unchanged except the documented additions (ADR 0006).

No open questions remain; all were answered on 2026-11-08 (Decisions 9-15).

## Milestones after this audit

| Milestone | Change |
|---|---|
| **M1** | New epic [#161](https://github.com/ITZSHOAIB/plico/issues/161): **Use Plico from your backend** (library API, scoped threads and runs, tool context, neutral handlers, docs). #99 gains the frontmatter rule. #76's reference-docs slice reserves `agents/`, `workflows/` and `entry`, and #76 is blocked by the new epic. |
| M2 | Unchanged. #79's client transport is the browser/HTTP client. The new epic's SDK is the server-side library, and #79 builds on its event iterator. #141 notes that the frontmatter rule and reserved names were settled in M1. |
| **M3** | #81 is rescoped to **Production deployment and multi-tenant hardening**: `plico build` for serverless (F7), deployment guides for sidecar and in-process hosting, readiness for deployed hosts, cross-tenant negative tests over `scope`, starting runs from triggers and schedules, and per-framework packages if requested. The Hono move and the neutral handler leave #81 for the M1 epic. |

## Sources

- Mastra, [Server adapters](https://mastra.ai/docs/server/server-adapters.md), [announcement](https://mastra.ai/blog/mastra-server-adapters), [Memory](https://mastra.ai/docs/memory/overview), [Request context](https://mastra.ai/docs/server/request-context).
- eve, [Next.js](https://eve.dev/docs/guides/frontend/nextjs.md), [Project structure](https://eve.dev/docs/concepts/project-structure.md), [Channels](https://eve.dev/docs/channels.md), [Auth and route protection](https://eve.dev/docs/guides/auth-and-route-protection.md), [Client](https://eve.dev/docs/guides/client.md), [Vercel docs](https://vercel.com/docs/eve). eve's self-hosting page returned HTTP 500 and was not read.
- Inngest, [Express quick start](https://www.inngest.com/docs/getting-started/express-quick-start.md).
- Vercel, [How can I use files in serverless functions](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).

## Implementor prompt

```text
You are implementing slice 1 of the M1 epic #161 "Use Plico from your backend" in D:\projects\plico.
Read AGENTS.md, product/audits/0016-library-first-embedding.md, ADRs 0005, 0006, 0008 and 0009, and
packages/server/src/{server.ts,types.ts,routes/threads.ts,routes/runs.ts,stream.ts}.

Goal of this slice: record decisions only, before any runtime change.
Write ADR 0011 "Library-first embedding" covering:
- Files define the agent, code only runs it: the allowed and forbidden inputs table from audit 0016.
- Agent state vs app state; the host enforces access, Plico filters by host-supplied scope and metadata.
- The createPlico({ projectRoot, databasePath }) surface: threads, runs, events (async iterator),
  approvals, cancel, close; node() and fetch() handlers with scope and context options.
- context: JSON only, recorded on run.started, passed to tools as ctx.context, never secrets.
- metadata: JSON map on threads and runs, set at creation, immutable, exact-match filter on top-level keys.
- approval.decided records the deciding host's context.
- Studio is local only; Studio beside a host is inspection-only (no recover, start, cancel or approve).
- Wire and store additions per ADR 0006, without implementing them.
Add new terms (host, scope, context, metadata, embedded mode) to GLOSSARY.md.
Do not write runtime code in this slice. Open one PR with "Part of #161".

Then run: pnpm exec vitest run packages/server/src/contract.test.ts, then pnpm check.
```
