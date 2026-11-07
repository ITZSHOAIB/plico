# Agent builder product direction

Status: discussion notes and hypotheses, not an accepted plan or a change to the current project contract. Delivery remains governed by the GitHub epics.

## Product proposition

Plico could be a local-first kit for building, inspecting, improving, and operating agent applications. A developer or coding agent should be able to understand an application from its project, run it locally, make a reviewable change, evaluate that change, and operate the application in production.

The agent loop alone is unlikely to distinguish Plico. Existing SDKs already provide agent loops, tools, delegation, and tracing. Plico's proposed advantage is a coherent experience across the application lifecycle. This needs validation with real users.

## What an agent builder would want

- **An understandable project.** Find agents, instructions, models, tools, workflows, evals, and deployment settings in a predictable project structure. Changes should be reviewable as diffs and understandable to coding agents and human reviewers.
- **Flexible model configuration.** Name multiple models; select them per agent or task; configure retry, fallback, and budgets; and inspect which model served a request. An OpenAI-compatible gateway may handle routing and load balancing initially.
- **Agents and workflows.** Start with one agent and add specialists when useful. Express sequences, branches, and parallel work in TypeScript, while allowing agents to delegate where appropriate. Keep simple applications simple.
- **Trustworthy execution.** Resume runs after a restart, wait for human decisions, and inspect model inputs, tool calls, outputs, and failures. Explain retry and side-effect guarantees. Local SQLite execution is a foundation; production durability needs to be established.
- **An improvement loop.** Turn a failed run into an eval, change instructions or models, rerun the case, and compare results in Studio. Connect project changes to evidence about behavior.
- **A path to production.** Run the same application locally and deploy it with suitable storage, credentials, observability, and access controls. Explain differences in guarantees between environments.

## Suggested validation

Build and evaluate one complete internal operations example: research a request, prepare an action, ask for approval, and record the outcome. Make the application possible to build, test, inspect, and deploy with Plico. Use a second real application to identify which multi-agent and workflow primitives are necessary.

Measure whether a team can take a failed run, understand it, change the agent, demonstrate the fix with an eval, and deploy with confidence faster than with its existing stack. Until tested, the proposed advantage is a hypothesis.

## Open decisions

- Which users and use cases have the strongest need for this experience?
- Which orchestration capabilities should Plico own, and where should it integrate with existing frameworks?
- What production durability and deployment guarantees can Plico support and maintain?
- What evidence would justify expanding the current single-agent project contract?
