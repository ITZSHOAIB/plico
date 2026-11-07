# Multi-agent workflows: need, patterns and authoring shape

**Date:** 2026-11-07
**Question:** Does Plico need epic [#141](https://github.com/ITZSHOAIB/plico/issues/141)? Who needs it, which workflow patterns, how much flexibility, and what should authoring look like if the goal is that users focus on agents?
**Builds on:** [0010](0010-multi-agent-workflow-design-research.md) covers the ecosystem survey (LangGraph, Mastra workflows, ADK, OpenAI Agents SDK, Temporal, Restate). It is not repeated here. This audit adds demand evidence and checks against the current code, then makes recommendations. Where it differs from 0010 or the epic, it says so.
**Status:** Proposal. The epic stays authoritative until its first slice records ADRs.

## Answers in short

1. **Do we need it?** Yes, with a small surface. Plico's demand research scored "multiple agents and workflows" 6/10 ([demand research](../agent-builder-demand-research.md)). It is a real need, but not the main reason anyone picks a kit. Builders ask for specialists with their own model and tools. They also ask for a reviewer that judges work with a clean context, and for read-only research fan-out. Graph engines and agent swarms have little production use.
2. **Which pattern first?** The **supervisor**: an agent that calls named specialist agents as tools. Every major TypeScript and agent framework has settled on it. It also needs no new concepts, since a delegation is just a tool call in the loop Plico already runs.
3. **How should workflows be written?** As agent Markdown files first, and a TypeScript workflow file only when the order must be fixed. A workflow is a plain `async run()` function that calls `agent()`. Sequence, branching and review loops are ordinary `await`, `if` and `for`. Plico gets no graph DSL, builder API or visual editor.
4. **How much flexibility?** Three tiers, each optional: agent files only, then a workflow file, then custom TypeScript with a durable `step()`. Users never need a framework concept to move up a tier.

## Where the demand is

| Need | Evidence | Plico response |
|---|---|---|
| Specialists with a different model, tools or instructions | Anthropic's research system pairs an Opus lead with Sonnet subagents and scores 90.2% above single-agent Opus on its internal eval. Plico's feature list asks for "a cheaper classifier and a stronger reviewer". | Per-agent `model`, `tools` and `skills` |
| A reviewer with a clean context | Cognition (Apr 2026): Devin Review finds about 2 bugs per PR. It works best "when the coding and review agents do not share any context beforehand." | The evaluator-optimizer loop goes in the scaffold |
| Read-only research or search subagents | Cognition: most working setups are "'readonly' subagents". Anthropic: multi-agent fits "breadth-first queries". | Supervisor now; parallel fan-out later |
| A predictable pipeline (classify → research → draft) | Anthropic's "prompt chaining" and "routing" workflows. Plico's candidate support-ticket scenario. | Workflow file with ordinary `await` and `if` |
| Parallel writers and open-ended swarms | Cognition: "most of the sexy ideas in that space still don't see meaningful adoption". MAST (NeurIPS 2025) derives 14 multi-agent failure modes from 150 traces, grouped as specification, inter-agent misalignment and verification. It then annotates 1,642 traces with them. | Not built |

Costs must be visible. Anthropic reports multi-agent runs use about 15 times the tokens of a chat, and advises multi-agent only for tasks valuable enough to pay for that. Its guidance remains "find the simplest solution possible". Plico's docs should therefore lead with one agent and present delegation as an upgrade, not as the default.

**Ecosystem convergence.** Several frameworks now run multi-agent work as agents calling agents through tools:

- Claude Code: subagents are Markdown files with frontmatter in `.claude/agents/`.
- Mastra: deprecated `.network()` in favour of supervisor agents with a `subagents/` directory. Its docs do not give a reason; comparing the APIs suggests it was the standard streaming and the explicit `maxSteps`.
- LangChain deepagents: a `task` tool.
- Vercel AI SDK: subagents as tools.
- OpenAI Agents SDK: agents-as-tools.

Google ADK 2.0 moved the other way, to a graph `Workflow` runtime for deterministic routing. Secondary sources disagree on whether its `SequentialAgent` is deprecated or wrapped. Plico gets that determinism from plain TypeScript instead of a graph.

### Benchmark: Vercel eve (checked 2026-11-07, `1.0.0-rc.6`)

eve is the closest competitor (see [0013](0013-release-readiness-and-roadmap-review.md)), and its multi-agent design largely matches this proposal:

| Topic | eve | Plico #141 |
|---|---|---|
| Several agents in one project | A **workspace** with `agents/<name>/agent/`, each separately addressable (`eve dev --agent support`). Peers call each other through `defineWorkspaceAgent` (experimental); other deployments through `defineRemoteAgent` (URL). | One project, flat `agents/<id>.md`; `entry` selects the default agent |
| Subagents | `agent/subagents/<name>/` holds `agent.ts` (`defineAgent({ description, model })`), with optional `instructions.md`, `tools/`, `sandbox/` and nested `subagents/`. "A declared subagent inherits nothing from the root agent." | Listed by ID in a supervisor's `agents:`. A flat folder lets one specialist serve several supervisors. Tools and skills default to the project's. |
| Context | "It never sees the parent's conversation"; it receives `{ message, taskId? }` | The same: own instructions plus the `task` |
| Execution | **Asynchronous tasks.** "The parent keeps working"; the turn cannot end while tasks run; up to 32 tasks per session; `eve__task_wait` | **Synchronous** delegation as a tool call; parallel work deferred |
| Depth | "To any depth", bounded only by the task cap | Static cycle rejection plus per-run budgets |
| Approvals | Child approvals "appear on the parent session"; "delegation isn't an approval boundary" | Routed to the root run, the same idea |
| Workflows | `defineWorkflowTool` with `"use workflow"`/`"use step"`; plain `await`/`if`; `ctx.agent("reviewer").send(..., { outputSchema })` | A workflow file with `agent(id, { task, output })`, nearly the same shape |
| Routing and handoff | `agentRouter()` picks a specialist; no handoff page found | A supervisor routes; handoff later |
| A2A | No: eve "is not … an A2A server"; it lists ACP and UCP instead | Not planned |
| Visibility | TUI subagent drawer (`--show-subagents`), `task.started` / `child.opened` stream events, parent links in OpenTelemetry (`agent.parent_run.id`) | Child runs with `parentRunId`/`rootRunId` in Studio |

**What this means for Plico:**

- **Validation.** Two independent designs converged on isolated-context specialists, approvals surfacing on the parent, and workflows written as plain TypeScript that call agents with an output schema. That supports #141's decisions.
- **Where Plico differs.** Synchronous delegation keeps v1 simpler to replay and inspect. eve's asynchronous tasks are the reference design for Plico's later parallel fan-out, including the per-session task cap and an explicit wait tool. A flat `agents/` lets specialists be reused.
- **Gap to consider later.** eve can serve several agents as separate endpoints in one workspace. In Plico, `entry` plus API agent selection covers this within one server.

Not verified: per-member route paths, counts or limits on declared subagents beyond the task cap, and eve's full workflows page, which was only partly read.

Sources: [subagents](https://eve.dev/docs/subagents.md), [project structure](https://eve.dev/docs/concepts/project-structure.md), [tasks](https://eve.dev/docs/tools/tasks.md), [workflows](https://eve.dev/docs/tools/workflows.md), [remote agents](https://eve.dev/docs/guides/remote-agents.md), [dev TUI](https://eve.dev/docs/guides/dev-tui.md), [instrumentation](https://eve.dev/docs/observability/instrumentation.md).

## Pattern matrix

| Pattern | Decision | How the user expresses it |
|---|---|---|
| Single agent | Default, unchanged | root `agent.md` |
| Supervisor / orchestrator-workers | **First slice after loading** | `agents: [researcher, reviewer]` in an agent's frontmatter |
| Sequence (prompt chaining) | v1 | Workflow file, consecutive `await agent(...)` |
| Routing / branching | v1 | `if` on a structured result, or let a supervisor pick |
| Evaluator-optimizer (draft → review → revise) | v1, **in the scaffold** | Bounded `for` loop in a workflow file |
| Parallel fan-out / join | Later | Needs a durable join, per-branch limits and cancellation (0010, risk 10). Allow read-only specialists first. |
| Handoff (specialist takes over the conversation) | Later, not never | LangChain's benchmark (gpt-4o, June 2025) found swarm/handoff slightly ahead of supervisor because it avoids the supervisor "playing telephone". It also changes who owns a thread, which Plico doesn't need yet. |
| Graph DSL, visual authoring, dynamic agent creation, peer swarms | No | Out of scope in the epic. The evidence above supports keeping them out. |

## Authoring shape

### Agents: one Markdown file each

```text
agent.md                 # still works: the default agent, id "main"
agents/
  classifier.md
  researcher.md
  writer.md
  reviewer.md
workflows/
  support-reply.ts       # optional
```

```md
---
description: Finds facts for a support ticket. Read-only.
tools: [search_docs]
skills: [triage]
model:
  name: small-model
---
You research support tickets. Return the facts and the source of each.
```

Root `agent.md` as a supervisor. Any agent that lists `agents` becomes one:

```md
---
agents: [researcher, reviewer]
---
You answer internal ops tickets. Delegate fact-finding to researcher and
ask reviewer to check your draft before you reply.
```

The defaults keep the files short:

| Field | Default when omitted | Why |
|---|---|---|
| id | File name | Same as Claude Code and Mastra |
| `description` | Required only if another agent delegates to this one | The supervisor uses it to decide when to delegate |
| `model` | Project `model` from `plico.config.ts`. A partial override such as `name` alone inherits the other fields, including `provider`. | Model inheritance |
| `tools` | All project tools; readiness warns when a delegated specialist inherits a tool that needs approval | Simple first, least privilege flagged |
| `skills` | All skills (today's behaviour) | Compatibility |
| `agents` | None, so the agent is not a supervisor | Delegation is opt-in |

Root `agent.md` stays as it is and stays required: a project without frontmatter or `agents/` is valid with no migration. It is always the agent with id `main`, so `agents/main.md` is a validation error. The project's default entry point is `main` unless `plico.config.ts` sets `entry: "<agent-or-workflow-id>"`. That optional field is how a project "declares a default agent". A flat `agents/` folder, not Mastra's nested `subagents/`, lets one specialist serve several supervisors and workflows.

**Diverges from 0010 and the epic.** Both make the supervisor a workflow mode, configured in a workflow. This audit puts it on the agent. A user who only writes agents gets multi-agent behaviour without learning workflows. A workflow can still call a supervisor agent like any other agent.

### Workflows: a plain TypeScript function

The file is a default-exported object, like `tools/*.tool.ts` today, so it needs no import:

```ts
// workflows/support-reply.ts
const Triage = {
  type: "object",
  properties: { category: { type: "string" }, needsResearch: { type: "boolean" } },
  required: ["category", "needsResearch"],
} as const;

const Review = {
  type: "object",
  properties: { approved: { type: "boolean" }, notes: { type: "string" } },
  required: ["approved", "notes"],
} as const;

export default {
  description: "Triage a ticket, research if needed, draft and review a reply.",
  maxAgentCalls: 8,
  async run({ input, agent }) {
    const triage = await agent("classifier", { task: input.ticket, output: Triage });
    const facts = triage.needsResearch
      ? await agent("researcher", { task: input.ticket })
      : "";

    let draft = await agent("writer", { task: `Ticket: ${input.ticket}\nFacts: ${facts}` });
    for (let round = 0; round < 2; round++) {
      const review = await agent("reviewer", { task: draft, output: Review });
      if (review.approved) break;
      draft = await agent("writer", { task: `Revise.\nNotes: ${review.notes}\nDraft: ${draft}` });
    }
    return draft;
  },
};
```

- `agent(id, { task, output? })` runs that agent's full ReAct loop, with its model, tools, approvals and artifacts. It returns text, or a validated object when `output` is set.
- Schemas accept JSON Schema or Zod, through the Ajv and zod-to-json-schema path that `packages/runtime/src/tools/schema.ts` already uses. No new dependency.
- The id is the file name, as for agents. Optional `input` and `output` schemas validate the run boundary.
- `step(name, fn)` is the escape hatch for durable non-agent side effects, such as an HTTP call to a ticket system. Plain code that only computes needs no `step()`.

Optional sugar (`sequence`, `parallel`) should wait until users ask for it, and should compile to these same calls (0010).

## Execution model (checked against the code)

**Durability.** Epic #95 is closed, so the engine exists. `RunContext.step()` and `wait()` live in `packages/runtime/src/engine/types.ts`. The provider loop uses `model:<turn>` and `tool:<turn>:<callIndex>` steps (`packages/runtime/src/run/strategies/provider.ts:64`, `:176`).

**Delegation is a tool call.** Each specialist an agent lists becomes a synthetic tool named `delegate_<id>`. Its input is `{ task: string }` and its description comes from the agent's `description`. It runs through the same loop slot as a project tool, at `tool:<turn>:<callIndex>`. Validation must reject name collisions with project tools, using the duplicate-name check that recently landed.

**Inline child runs are recommended.** A delegation or workflow `agent()` call gets its own `runId` and run stream (ADR 0007), with `parentRunId` and `agentId` on `run.started`. It *executes inside the parent's engine run*, through a `RunContext` that prefixes step and wait names:

- delegation: `tool:3:0/model:0`
- workflow call: `agent:2:reviewer/tool:1:0`

What this gives:

- The engine needs no spawn operation. ADR 0008 has none, so no engine change is needed now.
- Replay reuses recorded child steps, so a supervisor does not reroute after a crash. This is Restate's point in 0010.
- Approval `requestId`s stay unique, because they are built from the child's `ctx.runId`.
- Cancelling the parent aborts every child.

Two rules make this safe:

- **Child IDs are derived, not generated.** The approval `requestId`, its wait name and the tool idempotency key are all built from `ctx.runId` (`provider.ts`). A child ID must therefore be the same on every replay, for example `${parentRunId}/tool:3:0`. A random ID would create a duplicate child stream after recovery, and a pending approval would wait under a name that no longer exists.
- **The API routes child requests to the root run.** `POST /v1/runs/:id/signal` and `/cancel` pass the URL's ID straight to `engine.signal` and `engine.cancel` (`packages/server/src/routes/runs.ts:134`, `:163`). The engine only knows the root run, so `run.started` records `rootRunId`. Signals for a child are delivered to its root, and cancelling a child is rejected with a clear error telling the caller to cancel the root run.
- Studio and the API get real child run records with stable IDs, as the epic requires.

The costs:

- One child cannot be cancelled or retried on its own.
- A child cannot run on another worker.

Both matter mostly for parallel fan-out, which is deferred. Mapping onto DBOS child workflows later is possible, but needs the spawn ADR the epic already anticipates.

The alternative is **nested invocations inside one run stream**: no new run records, but an `invocationId` and `parentInvocationId` on every event, and a Studio tree built from them. It is cheaper to store and harder to query, and the epic's "run records identify the selected agent" fits it poorly.

**Bounds.**

- Validation rejects cycles in the `agents:` graph, so recursion cannot happen. Delegation depth is the graph's depth and needs no runtime limit.
- A per-run budget still applies: each supervisor's `maxDelegations` (default 8), and each workflow's `maxAgentCalls` (default 20).
- Each child keeps its own `maxSteps`.

**Context.** A child sees its own instructions, its skills and the `task` string, and not the parent's history. This follows Anthropic's advice that a subagent task needs "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries". It also follows Cognition's finding that a reviewer does best with no shared context. The tension: Cognition also says to "share as much context as possible" for manager/child agents. The answer is a later opt-in (`context: fork`), not a different default. Large work passes through the run's artifact workspace (#140): children of one root run share it, and the task string carries the paths.

**Threads.** A thread binds to one entry agent when it is created. Its agent can delegate, so conversational multi-agent work is covered. Workflows are task-shaped (input → output) and start as standalone runs through the CLI and API in v1. Starting a workflow from a thread message is a later decision.

## Proposed changes to epic #141

Do not apply these without the maintainer's decision.

1. **Supervisor on the agent.** Replace "a bounded supervisor agent" as a workflow mode with: "an agent becomes a supervisor by listing specialist agents; workflows may call it like any agent."
2. **Reorder the slices.** Contracts/ADRs → load and validate agents → **delegation** → sequential workflow file → CLI/API/Studio → scaffold/docs/evals. Delegation needs no workflow file and reuses the existing loop, tool and approval path, so users get value one slice earlier.
3. **Static cycle rejection.** Add it to the done-when items. It replaces runtime depth limits as the main recursion guard.
4. **Inline child runs.** Record the execution model above in the first slice's ADR, including the trade-off against engine-level child workflows.
5. **Scaffold content.** The scaffold demonstrates a supervisor with a researcher, plus a workflow with the draft → review loop.
6. **Out of scope.** Add "handoff (a specialist takes over the conversation)" to out-of-scope, with the LangChain benchmark as the reason to revisit it.
7. **Default agent.** Change "A project declares a default agent" to: "Root `agent.md` is the default agent `main`; an optional `entry` in `plico.config.ts` selects another agent or a workflow."
8. **Child requests route to the root run.** Add to done-when: child run IDs are derived from the parent ID and step path, and approvals and cancels addressed to a child reach its root engine run.
9. **Dependency.** Agent frontmatter needs a YAML frontmatter parser. Nothing in `packages/` parses frontmatter today, and #99 Skills (Agent Skills format) needs one too. Add it once, in whichever epic lands first, under ADR 0009's dependency rule.

## Still open for the first slice

- How `output` schemas are enforced: provider structured output where the provider supports it, otherwise a `submit_result` tool validated by Ajv with one repair turn.
- How workflow code changes affect waiting runs. ADR 0008 fails loudly today; derived step names (`agent:<n>:<id>`) keep that rule, as long as workflow code is deterministic between `agent()` calls.
- Usage and cost totals rolled up from child runs to the parent, for Studio and readiness.

## Sources

- Anthropic, [Building effective agents](https://www.anthropic.com/research/building-effective-agents), workflow patterns and "start simple".
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), 90.2% gain, 15× tokens, subagent task design and fit.
- Cognition, [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents) and [Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working), single-threaded writes, read-only subagents and clean-context review.
- Cemri et al., [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657), MAST taxonomy.
- LangChain, [Benchmarking multi-agent architectures](https://blog.langchain.com/benchmarking-multi-agent-architectures), supervisor vs swarm.
- Mastra, [Supervisor agents](https://mastra.ai/docs/agents/supervisor-agents), [network → supervisor migration](https://mastra.ai/guides/migrations/network-to-supervisor.md) and [file-based agents](https://mastra.ai/docs/agents/file-based-agents).
- Claude Code, [Subagents](https://code.claude.com/docs/en/sub-agents), Markdown and frontmatter agent files.
- LangChain, [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview), `task` tool and context isolation.
- Upstash, [Subagents in AI SDK v6](https://upstash.com/blog/subagents-in-ai-sdk-v6), a secondary source.
- Google ADK 2.0 deprecation reports ([adk-python #5872](https://github.com/google/adk-python/issues/5872)), disputed.

## Implementor prompt

```text
You are implementing slice 1 of epic #141 (Multi-agent projects and workflows) in D:\projects\plico.
Read AGENTS.md, product/audits/0010-multi-agent-workflow-design-research.md,
product/audits/0011-multi-agent-need-and-workflow-shape.md, and ADRs 0002, 0006, 0007, 0008, 0009.

Goal of this slice: record decisions only. Write ADR 0010 "Multiple agents, delegation and workflows" covering:
- File layout: root agent.md stays required and is the agent "main" (agents/main.md is an error); optional
  entry in plico.config.ts selects another agent or workflow; agents/<id>.md with YAML frontmatter
  (description, model, tools, skills, agents); workflows/<id>.ts default-exporting { description?, input?, output?,
  maxAgentCalls?, run({ input, agent, step }) }.
- Defaults for each frontmatter field, as in audit 0011's table.
- Delegation as synthetic delegate_<id> tools; collisions with project tools are validation errors.
- Static rejection of cycles in the agents: graph; per-run budgets maxDelegations (8) / maxAgentCalls (20).
- Inline child runs: own runId + run stream with parentRunId/agentId on run.started, executed inside the
  parent engine run through a RunContext that prefixes step/wait names. Child IDs are derived from the parent
  ID and step path (stable across replay); run.started records rootRunId; signal/cancel routes in
  packages/server/src/routes/runs.ts map a child to its root (cancel on a child is rejected). State the trade-off
  vs engine child workflows.
- Child context = own instructions + skills + task string; artifacts shared per root run (coordinate with #140).
- Threads bind to one entry agent; workflows run standalone via CLI/API in v1.
- Which wire contract additions this implies (follow ADR 0006), without implementing them.
Also add any new terms (agent id, supervisor, specialist, delegation, workflow, child run) to GLOSSARY.md.
If the maintainer has not yet accepted audit 0011's proposed epic changes, stop and ask before writing the ADR.
Do not write runtime code in this slice. Open one PR with "Part of #141".
```
