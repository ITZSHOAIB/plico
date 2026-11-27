# Multiple agents, delegation and workflows

Status: accepted (2026-11-27), delivered by epic #141. Research: `product/audits/0010-multi-agent-workflow-design-research.md` and `product/audits/0011-multi-agent-need-and-workflow-shape.md`.

One Plico project holds several named agents. Root `agent.md` is still the only required one. An agent becomes a supervisor by listing specialists, and a workflow file fixes the order of agent calls when that matters. Every delegation and workflow agent call is a child run that executes inside its root run's engine run.

## Decision

**Files.**

- Root `agent.md` is the agent `main`. `agents/<id>.md` adds the agent `<id>`, and `agents/main.md` is a validation error. An agent ID is lowercase letters, digits, `-` and `_`, starting with a letter.
- Every agent file, root `agent.md` included, accepts the same frontmatter: `description`, `model`, `tools`, `skills`, `agents`, `artifacts`, `maxDelegations`, `input` and `output`.
- `workflows/<id>.ts` default-exports `{ description?, input?, output?, maxAgentCalls?, run({ input, agent, step }) }`.
- Agents and workflows share one ID namespace, so `entry` in `plico.config.ts` names either without ambiguity. Without `entry`, a run starts with `main`.

**Defaults when a frontmatter field is left out.**

| Field | Default |
| --- | --- |
| `model` | The project model. A partial override inherits its unset fields, including `provider`. |
| `tools` | Every project tool. |
| `skills` | Every skill. |
| `agents` | None, so the agent is not a supervisor. |
| `artifacts` | The project's `artifacts.access`. An agent can only narrow it. |
| `description` | Required only when another agent delegates to this one. |
| `maxDelegations` | 8 delegations per supervisor run. |

**Delegation.** Each specialist a supervisor lists becomes a synthetic tool `delegate_<id>` with input `{ task: string }` and the specialist's `description`. Calling it runs the specialist's full loop and returns its output, or its structured output when it declares one. A specialist that fails returns the failure to the supervisor as a tool error, so the supervisor can recover. Validation rejects cycles in the `agents:` graph and `delegate_<id>` names that collide with project tools, so delegation cannot recurse and needs no runtime depth limit.

**Workflows.** Sequence, branching and bounded loops are plain `await`, `if` and `for`. `agent(id, { task, output? })` runs an agent as a child run and returns its text, or its validated structured result when `output` (JSON Schema or Zod) is given. `step(name, fn)` records a side effect once. A run is limited by `maxAgentCalls` (default 20). Workflows start as standalone runs; a thread binds to an agent.

**Child runs are inline.**

- A child has its own run ID and event stream. Its `run.started` records `agentId`, `parentRunId` and `rootRunId`, and the root's `metadata` and `context`. It never records `threadId`, so its output does not become a thread message.
- Its ID is derived from the parent: `<parentRunId>.d<turn>-<call>` for a delegation, `<parentRunId>.a<n>-<agentId>` for a workflow call, `n` counting from 0. Its engine step and wait names carry the same segment as a prefix, such as `d3-0/model:0`. Replay therefore reuses the same child and never reroutes.
- The child runs through a context that prefixes step and wait names on the root's engine run. The engine needs no spawn operation, so ADR 0008 is unchanged.
- A child's approval is mirrored into every ancestor stream as `approval.requested` and `run.waiting` with the child's `runId`, at the same point on every execution. A decision addressed to the root or to the child reaches the root engine run under the child's prefixed wait name.
- Cancelling the root cancels every child. Cancelling a child directly is rejected with a message naming its root.
- The parent stream records `agent.called` before a child starts and `agent.returned` when it ends, with the child's usage summed over its own descendants. A workflow `step()` records `workflow.step`.

**Context and artifacts.** A child sees its own instructions, its skills and the task, never the parent's messages. It shares the artifact workspace of its thread, otherwise of its root run, and the root's workspace view includes every descendant's writes.

**Pinning and code changes.** A run pins the instructions of every agent it uses as it first uses them, like `agent.md` today. Workflow code is not pinned: a run that resumes after its workflow changed in a way that changes the sequence of `agent()` and `step()` calls fails loudly, as ADR 0008 requires. Workflow code must therefore be deterministic between those calls; anything that reads the clock, randomness or the network belongs inside `step()`.

**Wire additions (ADR 0006, all additive).**

- `run.started` and `RunSummary` gain optional `agentId`, `workflowId`, `parentRunId` and `rootRunId`. Root runs set `agentId` or `workflowId`; runs recorded before this change have neither.
- `Thread` gains optional `agentId`.
- New events: `agent.called`, `agent.returned` and `workflow.step`. `approval.requested` and `run.waiting` gain optional `runId`.
- `POST /v1/runs` and thread creation accept `agent` or `workflow`. `GET /v1/runs` lists root runs; `?parentRunId=<id>` lists one run's children.

## Considered Options

- Supervisor as a property of an agent, chosen: a user who only writes agents gets multi-agent behaviour, as in Claude Code subagents, Mastra supervisor agents and OpenAI agents-as-tools. The alternative, a supervisor mode inside a workflow, makes workflows a prerequisite.
- Inline child runs, chosen, over engine-level child workflows. The trade-off is that one child cannot be cancelled or retried on its own or run on another worker. Moving to engine-level children needs its own ADR, most likely with parallel fan-out.
- One run stream with nested invocation IDs. Cheaper to store but harder to query, and it gives children no run record of their own.
- A graph DSL or builder API for workflows. Rejected: plain TypeScript covers sequence, branching and bounded loops.

## Consequences

Handoff, parallel fan-out, forked parent context and starting workflows from a thread message stay out of scope. Child runs appear in the run tree, not in `GET /v1/runs` by default, so existing run lists do not change shape.
