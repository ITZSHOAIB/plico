# Audit 0003: GitHub Issues and Product Plan

Date: 2026-10-31
Scope: the 21 open GitHub issues (#36-#56), Plan 0006, the PRD, ADRs 0001-0005, and the competitive assumptions behind them.
Status: decision applied on GitHub 2026-10-31. Epics #69-#82 and milestones M1-M3 replace #36-#56. The PRD has not been changed.

## Decision (2026-10-31)

The owner has decided to continue with the full ecosystem goal. Overlap with Eve or Mastra is acceptable and is not a reason to narrow, pivot, or stop. Plico aims to be the best possible ecosystem, not only a niche wedge.

This overrides the original recommendation in the verdict below and options B and C in section 1.5. The Eve comparison in section 1.1 stays as a benchmark for what good looks like, not as a kill test. The head-to-head is no longer a gate.

All Plan 0006 scope stays. The plan's order and the issue structure still need repair, so the 8 issues in section 2.3 become Milestone 1 and everything parked there moves to later milestones. Nothing is dropped except #46 and #55, whose criteria move into each feature.

## Verdict (original audit, superseded where the decision above differs)

1. **The engineering direction is sound. The product plan is out of date.** The file-first contract, canonical event log, and hidden provider adapter are good decisions. Plan 0006 was written against a competitive picture that no longer holds.
2. **The PRD's own kill test is now live.** It says Plico should be "killed or drastically narrowed if the first demo feels like Eve with a different logo or Mastra with fewer features" (PRD line 228). Most of what Plan 0006 still has to build already ships in Eve.
3. **The issues are too serial and too uniform, and they fund the wrong things.** The longest dependency chain is 15 issues and 16 of 21 sit on it or its #51 branch, only #36 is actually workable, and the areas where Plico could differ get the least investment.
4. **Recommendation: narrow.** Run a short head-to-head against Eve, then cut the plan to one releasable slice of about 8 issues built around the local workbench and artifact workspace.

## Part 1: Plan audit

### 1.1 What changed: Eve

The facts below come from `vercel/eve` directly (repo metadata, `packages/eve/package.json`, docs) on 2026-10-31.

- `eve` is `1.0.0-rc.1` on npm, Apache-2.0, about 5.7k stars, pushed today. The latest GitHub release is `eve@0.91.0` (2026-10-30).
- The layout is nearly Plico's: `instructions.md`, `tools/`, `skills/`, plus `channels/` and `schedules/`.

| Plan 0006 / PRD item | Eve today | Plico on `main` |
| --- | --- | --- |
| Real provider runs | Yes, AI Gateway or AI SDK provider packages | Fake provider only |
| Sessions and streaming | Yes | Runs only; events persisted at run end |
| Approvals, durable pause/resume | Yes, `eve/tools/approval`, Workflow SDK | Not on `main` |
| Cancel | Yes, `/cancel` | Not on `main` |
| MCP tools | Yes, `docs/connections/mcp.mdx` | Not on `main` |
| Memory | Yes, `eve/memory`, file and custom providers | Not on `main` |
| Evals | Yes, cases, judge, reporters, tool stubs | Scripted evals |
| Embeddable UI | Yes, `eve/react`, `eve/vue`, `eve/svelte`, four meta-framework integrations | Not on `main` |
| Self-hosted Node | Yes, `eve start`; Local or Postgres worlds, Docker sandbox | `plico serve` only |
| Auth for routes | Yes, documented policies | None |
| Local inspection | Terminal UI with `/traces`; OpenTelemetry or Vercel Agent Runs | **Local web Studio with run replay** |
| Artifact workspace | **None found** (repo tree search; absence is weak evidence) | Directory only; semantics not built |
| AG-UI | Not listed in `docs/protocols` (ACP and UCP are) | Planned |

Self-hosted Eve does not depend on Vercel for durability, so "it only works on Vercel" is not a safe argument. Its default model route is the AI Gateway, which leaves a smaller local-first and provider-neutral opening.

Mastra also occupies this space. Secondary sources describe a local Studio for chat, workflows, and traces, plus memory and evals, with v1.0 in January 2026 ([Geekflare](https://geekflare.com/open-source/mastra/), [Bitdoze](https://www.bitdoze.com/mastra-vs-eve-typescript-ai-agents/), [rywalker.com](https://rywalker.com/research/mastra)). `@mastra/core` is at 1.81.0 on npm.

### 1.2 What this does to the PRD's bet

The hard no-go condition rests on three things: local Studio, artifact workspace, and embeddable UI.

| Differentiator | Status | Assessment |
| --- | --- | --- |
| Embeddable UI | Lost as a differentiator | Eve ships hooks for three frameworks. Keep it as table stakes, do not lead with it. |
| Local Studio | Partly holds | Beats Eve's terminal inspection, but Mastra reportedly has a local Studio. Needs depth: event replay, approvals, artifact review. |
| Artifact workspace | Open, unbuilt | Strongest candidate, but no evidence of demand yet, and no issue exists for it. |

AG-UI is a useful interoperability wedge. @ag-ui/core is at 1.0.3, and CopilotKit reports full Mastra support through `@ag-ui/mastra` ([CopilotKit](https://www.copilotkit.ai/blog/mastra-agui-compatible)). Adoption claims come from vendor or press coverage ([GeekWire](https://www.geekwire.com/2026/seattles-copilotkit-raises-27m-as-some-of-the-biggest-names-in-tech-adopt-its-ai-agent-protocol/)) and download figures conflict, so treat them as unverified. Its practical value is that an AG-UI adapter may give Plico existing frontends without building `@plico/react`.

### 1.3 What is solid

- File-first project contract and `validateProject`.
- Native event log as the source of truth, with AG-UI as an adapter (ADR-level decisions).
- Provider SDKs hidden behind a port.
- Linear ReAct loop for v1.
- Package boundaries after the modularization in PR #68, and the TDD discipline.
- A concrete pilot use case: internal ops.

### 1.4 Gaps

**Strategic**

- No external user has validated the idea, and the PRD's success bar (a useful agent in under 20 minutes) cannot be attempted yet.
- After 66 commits there is still no real-model demo.
- Nothing has been released. All versions are 0.0.0, and Plan 0006 puts Postgres, MCP, memory, AG-UI, and React ahead of a first release.

**Release**

- There is no release or publishing issue.
- There is no LICENSE, though the PRD says fully open source. This is the owner's call.
- `plico`, `@plico/core`, and `create-plico` were unclaimed on npm when checked during this audit. Claim them soon.
- `@plico/cli` depends on the private `@plico/studio`, so it cannot be published as it stands.
- The Plan assumes a Node 24 baseline, `engines` says `>=22.13`, and `node:sqlite` still prints an experimental warning.

**Scope with no issue**

- Artifact diffs, versions, and export (stories 20-21, ADR 0002).
- Eval promotion of real runs (ADR 0005).
- Model streaming as an explicit deliverable.
- Provider choice in `create-plico` (story 7).

**Foundations the issues assume but `main` lacks**

- `ModelProvider` has only `complete()`: no streaming, no abort signal.
- `RunStatus` is `completed | failed | blocked`. There is no running, waiting, or cancelled state, which approvals and cancel both need.
- Events persist only at run end (audit 0001 F-08), so live SSE for an active run is not real yet.
- `PlicoEvent` requires `runId`, so `thread.created`, `message.created`, and memory events do not fit the run-scoped log. This is an unresolved design question, not an implementation detail.
- `payload` is `Record<string, unknown>` (F-22). A discriminated union should land before the event vocabulary grows.
- No project contract field for provider or model. `maxSteps: 10` is hardcoded in `run/strategies/provider.ts`.
- The code emits `approval.required`, while the Plan says `approval.requested`.

**Documentation drift**

- `AGENTS.md` still says phase one is scaffold-and-validate and forbids runtime, Studio, and server work, all of which exist. It also omits `plico eval` and `plico readiness`.
- `README.md` has the same "intentionally narrow in phase one" framing.
- Both will mislead agents picking up `ready-for-agent` issues.

### 1.5 Options considered (decided: continue the full scope, see Decision)

| Option | What it means | Assessment |
| --- | --- | --- |
| A. Continue Plan 0006 | Build all five phases | **Not recommended.** Long serial build to reach parity with a funded, fast-moving 1.0 rc. |
| B. Narrow | One release built around the workbench and artifact workspace | **Recommended**, conditional on the test below. |
| C. Stop or pivot | Contribute to Eve, or become an inspector or artifact layer on top of existing runtimes | Choose if the test shows no real advantage. |

**Run the kill test first; it is cheap.** Build the internal-ops demo on Eve, timeboxed to a day or two, and record what was painful: inspecting a run, reviewing generated artifacts, approving actions, working without a gateway. Then put it in front of 3-5 target developers. If nothing is meaningfully better in Plico's concept, take option C.

The inspector variant of option C deserves real consideration. If the value is a local workbench over an event log, the runtime may be the least valuable thing Plico owns.

## Part 2: Issue audit

### 2.1 Findings

- **Over-serialized.** The longest chain is 15 issues: 36, 37, 38, 39, 40, 41, 43, 44, 46, 47, 48, 49, 50, 55, 56. #51 is a parallel last step from #50 to #56, so 16 of 21 are on this path. Only #36 is unblocked, yet all 21 carry `ready-for-agent`.
- **Some blockers are not real.** #47 (AG-UI mapping fixtures) does not need #46 (inspection). #52 (Node handler) does not need #48 (AG-UI streams).
- **Template-shaped.** Every issue has exactly 10 acceptance criteria. Scope is being fitted to a format, which pads small issues and hides how big the large ones are.
- **Cross-cutting catch-alls.** #46 and #55 collect work that belongs in each feature's own definition of done, and they guarantee late integration pain.
- **Readiness and Studio criteria repeat everywhere.** Many issues require Studio tests, but Studio has no test harness, so those criteria cannot be met as written.
- **Oversized scope for the stage.** #38 requires migrating Plan 0004/0005 databases although nothing is published and there are no users. A schema version and a simple migrator are enough.
- **Hedged issues.** #49 is conditional ("only if") yet blocks #50. #54 is "add Postgres or document why not", which is two different issues.
- **Too granular in the core, not in the differentiators.** The provider and app-API path splits into many tightly coupled issues that should ship together, while artifacts have no issue at all.
- **Wrong investment.** #44, #45, #47-#51, and #54 build the areas where Eve and Mastra already lead. Studio appears only as tail criteria.
- **Tracker hygiene.** There are no milestones, and #59-#67 were closed while their issues stayed open, with no reason recorded on the issues.

### 2.2 Stale branches

PRs #59-#67 and their `issue-*` branches predate PR #68. `issue-44-mcp-tools` (top of the stack, 4,655 insertions across 34 files) is 10 commits ahead of and 15 behind `main`, with 12 merge conflicts. Do not rebase it. Reimplement on the new module layout and use the branches as design reference, especially #59 (provider adapter) and #65 (AbortSignal cancellation). Keep the branches until that work is done.

### 2.3 Disposition: Milestone 1 and later

**Milestone 1, first public release: 8 issues**

| # | Issue | Source | Notes |
| --- | --- | --- | --- |
| 1 | Run lifecycle and incremental event persistence | New; absorbs #38 | Status states, event-by-event writes, typed events, schema version, non-run event decision. Do first. |
| 2 | Real provider with streaming and model config | Merge #36, #37 | Add streaming and abort to the port. Mine PR #59. |
| 3 | Threads and thread-backed runs | Merge #39, #40 | Persisted conversation with a live stream. |
| 4 | Approvals, policy, and cancel | Merge #41, #42, #43 | Pause, resume, cancel, central policy. |
| 5 | Artifact workspace | New | Versions, diffs, export. ADR 0002, stories 20-21. |
| 6 | Studio workbench | New | Test harness first, then thread, approval, and artifact views. |
| 7 | Provider setup and 20-minute demo | Slim #56, story 7 | `create-plico` provider choice, one honest walkthrough. |
| 8 | First public release | New | LICENSE, npm names, publishable CLI and Studio, versions, Node baseline, docs drift. |

Items 2-4 can each ship independently once item 1 lands. Items 5 and 6 can run in parallel. Every item carries its own readiness checks.

**Later milestones: Milestone 2 is ecosystem (AG-UI, MCP, memory, React), Milestone 3 is production (Node, auth, storage)**

| Issue | Action | Reason |
| --- | --- | --- |
| #44 MCP | Milestone 2 | Table stakes, but not needed to test the bet. |
| #45 Memory | Milestone 2 | Needed for ecosystem parity; depends on the event decision in item 1. |
| #46 Inspection | Close, superseded | Split into each feature. |
| #47, #48 AG-UI | Milestone 2, first | Cheapest route to embedding. Remove the #46 blocker. |
| #49 Client transport | Milestone 2 | Conditional; decide after AG-UI. |
| #50, #51 React kit and example | Milestone 2 | Build on the AG-UI work; ship a first-class kit. |
| #52 Node handler | Milestone 3 | Remove the #48 blocker. Pull forward if a pilot needs embedding. |
| #53 Host auth context | Milestone 3 | Follows #52. |
| #54 Storage hardening | Milestone 3, split | Separate contract tests from the Postgres adapter. |
| #55 Production readiness | Close, superseded | Readiness moves into each slice. |

### 2.4 Alternative: repair without milestones (not chosen)

The minimum repair, keeping the current issue set:

- Merge #36 and #37, #39 and #40, and #41 and #42.
- Cut #38 to a schema version and simple migrator.
- Remove the #46 blocker from #47 and the #48 blocker from #52.
- Close #46 and #55, and move their criteria into each feature.
- Split #54 into contract tests and Postgres.
- Add issues for streaming, event persistence, artifacts, the Studio test harness, and release.
- Apply `ready-for-agent` only to unblocked issues, and add milestones per phase.

## Recommended next steps

1. Record the decision as an ADR and update the PRD: lines 227-228 (the no-go and kill conditions) no longer match the goal.
2. Apply the section 2.3 disposition on GitHub and re-sequence Plan 0006 into the three milestones.
3. Claim the npm names, settle the LICENSE, and fix `AGENTS.md` and `README.md`.
4. Start Milestone 1 with item 1, run lifecycle and incremental event persistence.

## Evidence limits

- Eve facts are primary-source but were read from docs and the repo tree; Eve was not run. Its gaps here are "not found", not proven absent.
- Mastra and AG-UI adoption facts are secondary or vendor sources, except npm version numbers.
- "No demand evidence" cuts both ways: no user research exists for the artifact wedge either.
