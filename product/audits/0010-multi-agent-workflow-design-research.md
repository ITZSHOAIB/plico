# Multi-agent workflow design research

**Date:** 2026-11-07  
**Question:** How can Plico make multi-agent workflows easy to author in project files while retaining room for complex collaboration, customization, and durable execution?  
**Use:** Design research for epic [#141](https://github.com/ITZSHOAIB/plico/issues/141). This is a synthesis of primary sources and Plico's current architecture, not an implementation decision or a dependency recommendation.

## Executive recommendation

Treat **workflow authoring** and **workflow execution** as separate concerns. Author workflows as readable TypeScript files in the project. Keep the public interface small: ordinary TypeScript control flow for conditions, transformations, and custom logic, plus Plico-owned durable operations for running agents and checkpointing external work. Offer short helpers for common sequences only as syntax sugar over that same execution model.

An agent call inside a workflow must be a named, durable operation that Plico can validate, resume, audit, and show in Studio. It should run the selected Plico ReAct agent with that agent's instructions, model, tools, approvals, and artifact access. Do not make users implement child-run persistence or call a provider SDK directly.

This supports several useful forms without imposing a graph DSL:

- A sequence is ordinary code that calls agents in order and passes typed results.
- A branch is an ordinary `if` over a prior result.
- A supervisor is a ReAct agent that can call a limited allowlist of specialist agents and return a combined result.
- Later, bounded parallel calls can use a Plico concurrency primitive, while arbitrary custom logic remains TypeScript.

For the common linear case, a tiny helper could shorten the workflow. Advanced users retain TypeScript as an escape hatch. A graph editor or graph-authored workflow format should be added only if users need a statically declared topology or visual authoring enough to justify its extra concepts.

## Plico's current starting point

- The public project contract currently centers on one root `agent.md`, one project-wide model, and shared project directories. The current multi-agent direction adds named agent definitions while preserving the single-agent project path.
- ADR 0008 already gives Plico a code-first durable workflow function: `Workflow(ctx, input)`, with named `ctx.step()` and `ctx.wait()` operations. A completed step's result is reused during replay; an in-flight step can run at least once if the process dies. The local engine and planned production engine sit behind Plico's engine interface.
- ADR 0008 explicitly has no child-run or spawn operation yet. Adding multi-agent collaboration therefore requires a clear parent/child run model, stable child identities, recovery behavior, cancellation, and event linkage.
- ADR 0002 makes the native event log the source of truth for what happened; the execution engine journal decides where work resumes. Agent and workflow traces should fit that split rather than introduce a second history.
- The PRD's prior position was to hide graph orchestration by default and keep the v1 runtime linear. The user's current direction changes the product scope: a Plico project should contain multiple agents and support workflows that let them work together.

Sources in Plico: [project contract](../../packages/contracts/src/project.ts), [engine interface](../../packages/runtime/src/engine/types.ts), [ADR 0002](../adrs/0002-events-persistence-and-artifacts.md), [ADR 0008](../adrs/0008-execution-engine-interface.md), [PRD](../prds/plico-agent-app-kit-prd.md).

## What the ecosystem shows

### 1. Functional TypeScript workflows: flexible authoring without a graph language

LangGraph's Functional API adds persistence, interrupts, and streaming to ordinary functions using two named concepts: an `entrypoint` for the workflow and `task` for a checkpointed unit. Standard TypeScript `if`, loops, and function calls determine flow. Its docs contrast this with its Graph API: functional workflows keep state in normal function values and do not have a static graph visualization; both APIs use the same runtime. [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api)

**Plico lesson:** TypeScript itself can be the flexible composition language. Put a small, Plico-owned durable operation at the seam where model work or side effects happen. The trade-off is that the full possible topology is not available statically; Studio should first show the actual executed trace.

### 2. Explicit graph and builder APIs: clear topology, more up-front concepts

LangGraph's Graph API requires state, nodes, edges, and compilation. Nodes return state updates; edges choose the next node. The explicit graph supports static topology inspection, parallel super-steps, and shared state reducers. The documentation notes that nodes are checkpoint units and that smaller nodes increase visibility and reduce repeated work after recovery. [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api) · [Node granularity](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api)

Mastra uses TypeScript builder calls such as `.then()`, `.branch()`, `.parallel()`, `.foreach()`, and `.commit()`. It emphasizes input/output schemas between steps, data mapping, persisted state, and suspend/resume. This is a strong option when a workflow's topology is known and needs explicit validation, but its author must learn builder, step, schema, branch, state, and commit concepts. [Mastra control flow](https://mastra.ai/docs/workflows/control-flow) · [Mastra workflow overview](https://mastra.ai/ai-workflows) · [Mastra storage](https://mastra.ai/docs/storage)

Google ADK offers simple `SequentialAgent`, `ParallelAgent`, and `LoopAgent` templates, with shared invocation state and output keys. Current ADK documentation also says these templated workflow agents are being superseded by graph and dynamic workflow structures in ADK 2.0, while the TypeScript migration notes say the old classes are deprecated but remain temporarily supported. This shows the appeal of templates and the risk of turning today's small helper into a permanent public contract too early. [ADK sequential workflow](https://github.com/google/adk-docs/blob/main/docs/agents/workflow-agents/sequential-agents.md) · [ADK 2.0 migration](https://github.com/google/adk-docs/blob/main/docs/2.0/index.md) · [ADK workflow patterns](https://github.com/google/adk-docs/blob/main/docs/workflows/patterns.md)

**Plico lesson:** Explicit sequence/parallel/branch helpers can be convenient; expose them as thin, optional syntax over a stable execution primitive. Delay a graph DSL until static graph visualization, graph reuse, or fan-out/join is a validated need.

### 3. Supervisor, specialist tool, and handoff patterns: collaboration semantics

The OpenAI Agents SDK separates agent definitions (name, instructions, tools, model) from multi-agent orchestration. Its two central patterns differ in who owns the response: with **agents as tools**, a manager calls specialists and remains responsible for the user-facing result; with a **handoff**, the selected specialist takes over the conversation. The SDK also describes code-defined sequences and parallel work as distinct from LLM-directed orchestration. [Agents](https://openai.github.io/openai-agents-js/guides/agents/) · [Orchestration](https://openai.github.io/openai-agents-js/guides/multi-agent/) · [Handoffs](https://openai.github.io/openai-agents-js/guides/handoffs/)

Restate's multi-agent examples show a router using tools to choose specialists, with the routing decision, specialist call, and result recorded as durable steps. The example makes a valuable distinction: if the process crashes after a routing decision but before the specialist finishes, recovery should resume the selected specialist rather than make a potentially different routing decision. Restate itself requires an external server/runtime, so this is a pattern reference rather than a recommended Plico dependency. [Restate multi-agent orchestration](https://docs.restate.dev/ai/patterns/multi-agent)

**Plico lesson:** Start with specialists returning bounded results to a supervisor; that is easier to trace and keeps one owner of the final output. Treat handoff as a separate behavior only when users need a specialist to become the active conversational agent. The supervisor should see an explicit allowlist and call budget, not every project agent by default.

### 4. Durable code has rules: checkpoint names, replay, and versioning matter

Temporal TypeScript workflows are ordinary code, but replay requires deterministic behavior. LLM calls, network requests, database access, and file I/O must happen through recorded Activities; code changes that alter the command sequence require versioning. Temporal provides durable child workflows, signals, retries, and a service-backed history. [Workflow definition and determinism](https://docs.temporal.io/workflow-definition) · [TypeScript event history](https://docs.temporal.io/encyclopedia/event-history/event-history-typescript) · [Child workflows](https://docs.temporal.io/child-workflows)

**Plico lesson:** “Write a normal TypeScript function” is not enough for durability. Define which Plico calls are checkpointed, give them stable names, serialize their inputs/outputs, and state what happens when a saved run resumes after workflow code changes. Plico's ADR 0008 currently fails loudly on changed in-flight workflow steps; multi-agent workflow files need to follow that rule or an explicit future versioning strategy.

## Design comparison

| Model | Easy first step | Flexible control flow | Durable/inspectable | Main cost |
|---|---|---|---|---|
| Plain function with Plico durable agent calls | High for TypeScript developers | High | High if calls are stable and journaled | Runtime topology is visible only as it executes; author must use durable calls correctly |
| Fixed sequence helper | Very high for linear flows | Low to medium | High | Branches and custom logic quickly need an escape hatch |
| Builder DSL / graph | Medium after learning concepts | High, explicit | High; graph topology can be validated/visualized | State, step schemas, reducers, builder methods, graph constraints |
| Supervisor-only delegation | High for open-ended tasks | Adaptive, model-selected | High if delegation decision and child result are durable | Less predictable latency/cost; needs depth/call limits and delegated context policy |
| Framework workflow dependency | Depends on framework | Often high | Depends on engine | Can leak framework contracts or conflict with Plico's local and production execution choices |

## Recommended Plico shape

### Project files

Keep workflows in the same file-first project, for example:

```text
agents/
  triage/agent.md
  researcher/agent.md
  writer/agent.md
workflows/
  support-ticket.ts
```

The existing root `agent.md` should remain an implicit default path for a simple one-agent project. A project should not need a workflow file until it needs collaboration.

### One functional entrypoint, Plico-managed calls

The authored workflow should be a normal TypeScript module with a stable workflow ID, a validated input/output contract, and a `run` function. Plico injects a small context with the initial input and one primary operation for durable agent calls. The exact names below are illustrative only:

```ts
export default defineWorkflow({
  id: "support-ticket",
  input: TicketInput,
  output: ReplyOutput,

  async run({ input, agent }) {
    const triage = await agent("triage").run("triage", input);

    if (triage.needsResearch) {
      const research = await agent("researcher").run("research", {
        ticket: input,
        category: triage.category,
      });

      return agent("writer").run("draft", { ticket: input, research });
    }

    return agent("writer").run("draft", { ticket: input, triage });
  },
});
```

The durable operation should validate the agent ID and payload, apply that agent's model/tool/capability policy, start or resume its ReAct execution, and return a serializable declared result. A stable operation name is needed for replay. This lets users write normal TypeScript while Plico owns child identity, event linkage, cancellation, approval behavior, and recovery.

### Supervisor as a bounded mode of the same agent call

A supervisor should remain a normal ReAct agent. Its workflow configuration grants access to named specialists and a maximum delegation budget. Each specialist invocation uses the same Plico agent-run mechanism as the functional workflow. This avoids a second orchestration engine and makes supervisor traces inspectable. Only explicit inputs/results should pass by default; large shared work should move through artifact references rather than silently copying all conversation history.

### Progressive disclosure

1. **Simple:** one workflow file, a few sequential `agent.run(...)` calls.
2. **Custom:** ordinary TypeScript `if` / helper functions around those calls.
3. **Adaptive:** run a supervisor agent that can call a declared set of specialists.
4. **Later if demanded:** Plico `sequence`/`parallel`/`branch` helpers, reusable workflow modules, static graph inspection, and larger fan-out workflows.

Helpers should compile to the same runtime execution path rather than create another workflow implementation.

## Design requirements and risks

1. **Typed handoffs:** Validate agent inputs and outputs; keep workflow data JSON-compatible. Use artifact references for large files.
2. **Stable durable step names:** A replayed agent invocation must not spawn a second child or reroute after a recorded decision.
3. **Code version changes:** Define compatibility for waiting workflows when a workflow file changes. ADR 0008 currently fails loudly on changed step sequences.
4. **At-least-once execution:** Model and tool operations can repeat if a process dies while they are running. Preserve idempotency keys and approval rules; make retry behavior visible.
5. **Bounded delegation:** Limit supervisor turns, child calls, nesting depth, duration, and cancellation propagation.
6. **Context policy:** Decide what conversation history each child sees. Prefer explicit task input over implicit full-history inheritance.
7. **Artifact policy:** Specify whether workflow steps share one run-scoped workspace, pass explicit artifact references, or can choose a restricted view. Coordinate with #140.
8. **Events and Studio:** Preserve one canonical event history with workflow/agent/parent-child identifiers; show the actual executed trace, inputs/results, approvals, failures, and recovery.
9. **Engine portability:** Keep the project contract independent of the engine. The same workflow should pass scenarios on Plico's local and planned production engines.
10. **Parallelism later:** Parallel fan-out needs a durable join, per-branch isolation, concurrency limits, cancellation behavior, result aggregation, and deterministic test scenarios. It is a distinct capability, not merely replacing sequential `await` with `Promise.all`.

## Questions for the epic's ADR/design slice

- Are workflows invoked directly, or is a workflow the project's default entrypoint while the single-agent case remains implicit?
- Are threads permanently associated with an agent/workflow, or can one thread start different workflows over time?
- Should each workflow agent call be a separate child run ID or a named step within the parent run? Either choice must preserve current event/recovery guarantees.
- What schema system defines workflow and per-agent input/output contracts without forcing a new runtime dependency or leaking framework shapes?
- Which side effects can workflow TypeScript call directly, and which must use durable Plico operations?
- What should Studio show for branch decisions and supervisor tool calls when no static graph exists?
- When is parallel execution sufficiently needed to join the first workflow milestone?

## Primary sources

| Source | What it informs |
|---|---|
| [LangGraph Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api) | Ordinary function control flow with named checkpointed tasks; functional vs graph trade-offs |
| [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api) and [persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) | Explicit graph, state/reducers, visualization, checkpointers |
| [Mastra control flow](https://mastra.ai/docs/workflows/control-flow), [overview](https://mastra.ai/ai-workflows), [storage](https://mastra.ai/docs/storage) | Typed step builder, sequence/branch/parallel/foreach, workflow state/suspend-resume |
| [OpenAI Agents JS](https://openai.github.io/openai-agents-js/guides/agents/), [orchestration](https://openai.github.io/openai-agents-js/guides/multi-agent/), [handoffs](https://openai.github.io/openai-agents-js/guides/handoffs/) | Agent definitions vs supervisor/agent-tool/handoff collaboration patterns |
| [Google ADK](https://github.com/google/adk-docs/blob/main/docs/agents/workflow-agents/sequential-agents.md), [workflow patterns](https://github.com/google/adk-docs/blob/main/docs/workflows/patterns.md), [2.0 migration](https://github.com/google/adk-docs/blob/main/docs/2.0/index.md) | Simple workflow-agent templates, shared state/output keys, migration/deprecation caution |
| [Temporal workflow definition](https://docs.temporal.io/workflow-definition), [event replay](https://docs.temporal.io/encyclopedia/event-history/event-history-typescript), [child workflows](https://docs.temporal.io/child-workflows) | Code-first durable execution, deterministic replay, side-effect boundaries, versioning |
| [Restate multi-agent orchestration](https://docs.restate.dev/ai/patterns/multi-agent) | Durably record routing decisions and specialist calls; external runtime caveat |
