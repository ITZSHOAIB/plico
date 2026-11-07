# Agent builder scenario gap review

Reviewed 2026-11-05 against the PRD, ADRs and GitHub epics. This is a product thought exercise, not proof of customer demand or a delivery plan. The GitHub epics govern scope and ordering. “Gap” means the reviewed material does not specify the user outcome adequately; it does not prove no implementation or issue exists elsewhere.

## Planned baseline

The [PRD](prds/plico-agent-app-kit-prd.md) already describes provider choice, project files, tools, streaming, threads, approvals, artifacts, Studio, evals, native API, React integration, readiness, deployment and adapters. Important concrete commitments include provider onboarding ([#75](https://github.com/ITZSHOAIB/plico/issues/75)), safe evals and promotion of runs into cases ([#97](https://github.com/ITZSHOAIB/plico/issues/97)), approval recovery ([#72](https://github.com/ITZSHOAIB/plico/issues/72)), host auth ([#81](https://github.com/ITZSHOAIB/plico/issues/81)), and Postgres and a production execution adapter ([#82](https://github.com/ITZSHOAIB/plico/issues/82)). Skills compatibility is covered by [#99](https://github.com/ITZSHOAIB/plico/issues/99). Do not create duplicate requirements for these outcomes.

The PRD explicitly defers compaction, planning and subagents until after v1; complex workflow engines are not a v1 commitment. Production storage and host auth are M3, so an M1 release should not imply those guarantees already ship.

## Walkthrough: candidate gaps

Priority is a provisional judgment for the intended small product team, not a measured demand score. “Clarify” means an existing direction needs acceptance criteria; “Explore” means a new product bet requiring validation.

1. **A real app upgrades while a run waits for approval.** A developer deploys a changed tool or prompt while an old run is paused. What happens to the run, and how does the operator finish or safely abandon it? ADR 0008 says a changed step fails loudly; a versioning rule is already assigned to #95. **Gap: clarify** the user-facing upgrade, drain, recovery and rollback experience, including what versions and inputs an operator can inspect. **Priority: high**, particularly for production.

2. **A customer asks to delete their data.** Thread messages, prompts, events, artifacts, eval fixtures and backups can contain the same sensitive material. The canonical event log and run-to-eval promotion make a single delete action nontrivial. **Gap: clarify** retention, redaction, deletion propagation, export and backup limitations, including how an audit record survives deletion. **Priority: high.** This is a candidate requirement, not a claim of a particular legal obligation.

3. **One company user accesses another user's run.** Host identity and policy context are planned (#81); the user also needs an explicit responsibility boundary for authorizing every thread, event stream, approval and artifact. **Gap: clarify** tenant isolation, access checks, examples and cross-tenant negative cases. Plico-owned users or RBAC are explicitly out of scope; host integration can still define enforceable responsibilities. **Priority: high before multi-user deployment.**

4. **A tool sends a payment, then the process crashes.** The plan provides idempotency keys and at-least-once execution (#72, ADR 0008), but an external service may not honor the key. **Gap: clarify** how a builder detects an uncertain outcome, reconciles the external system, and exposes a safe retry or manual resolution to an operator. **Priority: high for side-effecting apps.**

5. **An agent consumes the whole model budget.** Max steps, timeouts, cancellation and usage are in the PRD; a complete budget policy is not specified in the reviewed plan. **Gap: explore** per-run and per-tenant token, time and spend limits, alerts, attribution and behavior when usage or cost is unavailable. Distinguish estimated cost from provider billing. **Priority: high to validate.**

6. **A conversation outgrows the model's context.** Threads and memory are planned, but the PRD explicitly puts context compaction after v1. **Gap: acknowledged and deferred:** define a near-term failure experience and user-visible context usage; later investigate compaction, retrieval, and what is retained. **Priority: high for long-lived chat; do not silently pull compaction into v1.**

7. **A user supplies a PDF, image or structured form and expects a structured answer.** Artifact output is planned; input attachments, multimodal handling and typed final output are not clearly specified in the reviewed core plan. **Gap: explore** input upload limits, storage, provider capability checks, output schemas and validation. Artifacts and attachments serve different jobs. **Priority: medium; validate against the flagship workflow.**

8. **An event arrives from another system overnight.** The API and interoperability are planned, but a product experience for schedules, webhooks, duplicate events and delayed or missed jobs is not defined in the reviewed baseline. **Gap: explore** host-owned triggers and idempotent run creation before considering a built-in scheduler. **Priority: medium**, dependent on actual users.

9. **A developer wants different agents for triage and research.** The current contract has one agent and model; the PRD defers subagents and permits future framework adapters. **Gap: acknowledged and deferred:** test named agents, task-specific models, delegation, context boundaries and workflow composition against an actual application. Avoid assuming that a graph engine is needed. **Priority: medium research, lower implementation priority until validated.**

10. **A provider changes behavior or becomes unavailable.** The PRD plans broad providers and gateway support; retries and usage are also covered. **Gap: clarify** multiple named model configurations, task selection, fallback policy, capability mismatches and visibility into the provider actually used. Delegate routing and load balancing to a gateway where appropriate. **Priority: medium-high.**

11. **A team changes a prompt and wants to ship safely.** Git versioning, evals and run promotion are planned (#97), but the reviewed plan does not specify comparing versions, CI thresholds, release provenance or a rollback workflow as one user journey. **Gap: clarify** how an eval dataset, tool fixtures, model configuration and project revision are associated with a result, and how a release gate handles nondeterminism. **Priority: high.** Replay of recorded events is not the same as rerunning a model and proving a change is better.

12. **A run fails at 2 a.m.** Studio inspection, tracing and readiness are planned. **Gap: explore** operational notifications, searchable failure categories, actionable recovery steps and export to an existing monitoring system. Define who acts when an approval expires or a worker dies; #82 assigns worker takeover to the host. **Priority: medium-high for production.**

13. **An agent reads malicious instructions inside a document or tool result.** Tool approvals and permissions are planned; the reviewed material does not provide a complete user experience for untrusted content, tool-scope boundaries and explaining what approval authorizes. **Gap: clarify** threat boundaries, least-privilege examples and eval scenarios for adversarial tool output. Approval alone cannot guarantee safe behavior. **Priority: high for agents using external data or side effects.**

14. **A team tries Plico for a month and decides to leave.** Git-native files and pluggable storage are planned, but portable export of threads, events, eval cases and artifacts, with enough context to interpret them, is not specified as a single user outcome in the reviewed plan. **Gap: explore** documented export formats and restore/import scope. **Priority: medium.**

## Recommended discovery order

1. Walk one internal-ops application through real credentials, approval, crash recovery, a version upgrade and a failed tool side effect. Define the minimum operator experience and host responsibilities.
2. Test run-to-eval promotion through a real change, including safe data selection, fixtures, CI results and revision provenance. #97 already owns the basic promotion outcome.
3. Interview builders about tenant authorization, data deletion and budget limits before adding broad abstractions. Run these scenarios against a candidate Node deployment.
4. Prototype multiple agents, non-chat triggers and attachments only with a real use case and compare against an existing integration.

For each scenario, record a user, trigger, expected result, failure behavior, responsible component and an observable acceptance example before proposing a new issue. Scores and ordering should change with user evidence.
