# Release readiness and roadmap review

**Date:** 2026-11-07
**Question:** Are the open epics enough for Plico's first public release and for what Plico aims to be? What should be cut, added or reordered?
**Status:** Accepted 2026-11-07. All nine decisions are approved, with the upgrade policy (A5) as option (ii). Epics updated: #75, #76, #77, #78, #79, #80, #81, #82, #99, #141. New M2 epics: [#143](https://github.com/ITZSHOAIB/plico/issues/143) context compaction (N1), [#144](https://github.com/ITZSHOAIB/plico/issues/144) typed run input and output (N2), [#145](https://github.com/ITZSHOAIB/plico/issues/145) eval scorers (N3). "Needs a decision" labels below record the original proposal.

## Summary

- **The M1 plan is close but not sufficient.** The PRD's M1 outcome is "under 20 minutes from the published npm packages, using only the docs". Four gaps block it:
  - The docs site has one page.
  - Setup needs exported environment variables and an OpenAI-compatible endpoint.
  - Long threads have no defined failure.
  - Until #142 lands, a live agent cannot write an artifact.
- **A direct competitor is near 1.0.** Vercel's eve is a file-first agent framework at `v1.0.0-rc.6` (2026-11-05, Apache-2.0) with Plico's mental model: agent folder, `tools/`, Markdown skills, durable sessions, approvals, evals. It sets the table stakes a release is compared against. It is not a reason to narrow scope (PRD, "competitors are a quality benchmark, not a gate").
- **M2 needs three new epics and a new order.** The new epics are context compaction, typed run input/output, and eval scorers. MCP and frontend streams come first, with AI SDK UI ahead of AG-UI. Multi-agent (#141) and the #140 remainder move later.
- **Little should be cut.** One M1 Studio slice is dropped. Run-to-eval promotion stays in M1 because it is cheap and is Plico's improvement loop. M1 also needs an upgrade-policy decision (A5). Several items stay explicitly out of scope: sandboxes, chat channels, schedules, visual builders.

## Rule for M1

An item belongs in M1 only if it meets one of these:

- **(a)** The PRD's M1 outcome or #75's walkthrough needs it.
- **(b)** It is expensive to change after the first publish: project layout, wire contract, on-disk store.
- **(c)** It is a cheap fix for a first-run failure.

Everything else waits. The PRD's own test applies: "If it does not [beat assembling the alternatives], fix the demo and the lifecycle before adding scope."

## Current state (verified)

| Area | State |
|---|---|
| Closed M1 epics | #69 run lifecycle, #70 real provider, #71 threads, #72 approvals, #73 artifact workspace, #74 Studio, #95 durable engine, #96 CLI/server hardening, #98 TypeScript tools |
| Open M1 epics | #75 quickstart (0/4 slices), #76 public release (0/5), #97 evals (0/5), #99 skills (0/5), #142 live artifact writes (0/5) |
| Providers | `openai` and `openai-compatible` only (`packages/runtime/src/providers/configured.ts:8`), configured via `OPENAI_API_KEY` / `OPENAI_BASE_URL`. ADR 0004 chose AI SDK-backed providers and rejected "OpenAI-compatible endpoints only", so the code is behind the ADR. |
| Secrets | No `.env` loading; keys must be exported in the shell. |
| Context | The full thread history is sent every turn. There is no token budget, no truncation, and no classified context-overflow error. |
| Tracing | OpenTelemetry spans are emitted (`packages/runtime/src/run/tracing.ts`), but undocumented. |
| Docs site | One page (`packages/website/src/content/docs/welcome.mdx`). |
| Store upgrades | The SQLite schema has a versioned migrator (`storage/sqlite/schema.ts`); not a blocker. In-flight runs fail loudly on a project change (`ProjectChangedError`). ADR 0008's line "#95 owns a versioning rule before the first publish" is stale, since #95 is closed. |
| Artifacts | Only scripted runs write them; fixed by #142. |

## Benchmark: eve and the TypeScript field

**What eve 1.0 rc ships** (from its official docs):

- **Folder layout:** `agent/instructions.md`, `tools/`, `skills/`, `connections/` for MCP and OpenAPI, `subagents/`, `schedules/`, `channels/`, and `evals/*.eval.ts`.
- **Durable sessions** on the Workflow SDK, with tool approval policies.
- **Sandbox tools** with `read_file`, `write_file` and `edit_file`, matching #142's names.
- **Automatic compaction** at 90% of the context window.
- **Models:** the AI Gateway by default, plus direct Anthropic/OpenAI and any AI SDK provider.
- **Self-hosting** on a Nitro Node server.
- **Interfaces:** a TUI with a trace viewer, a client SDK and `useEveAgent` hooks, and Slack/Discord/Teams channels.
- **Evals** with `t.judge` and a mock model.

Known caveat: sessions can be stranded after a version upgrade on worlds other than Vercel Workflow.

**What Plico has that a comparison should lead with**, verified in this repo:

- A web Studio with run replay, approvals and artifact version review.
- One canonical event log that drives Studio, replay, evals and streams.
- A versioned artifact workspace with diffs and export.
- Local SQLite with no account or gateway key.
- Open frontend protocols (AG-UI, AI SDK UI) planned in #79.

This audit does not claim eve lacks these. Its instrumentation, memory and subagent pages were not read.

**Weekly npm downloads**, measured 2026-11-07 via `api.npmjs.org`:

| Package | Weekly downloads |
|---|---|
| `ai` | 44.9M |
| `@ai-sdk/react` | 13.5M |
| `@ag-ui/core` | 4.9M (largely pulled in by other frameworks) |
| `@mastra/core` | 3.1M |
| `@assistant-ui/react` | 3.0M |
| `@openai/agents` | 2.5M |
| `@ag-ui/client` | 2.1M |
| `eve` | 2.3M (latest `1.0.0-rc.6` is Vercel's eve; the name once belonged to an older package, so part of this may be legacy) |
| `@copilotkit/react-core` | 0.7M |

Six months after its preview, eve's downloads are close to `@openai/agents` and `@mastra/core`. Plico enters a busy field.

## M1: add

| # | Item | Rule | Evidence | Target |
|---|---|---|---|---|
| A1 | **Reference docs**: project files, `plico.config.ts`, tools, skills, CLI, HTTP API and events, Studio, approvals, artifacts, tracing with OpenTelemetry export, upgrading (fail-loudly rule and how to cancel stranded runs), and an honest "how Plico compares" page | (a) | #75: "using only the docs". The site has one page. | New slice in #76, next to "Docs match what shipped" |
| A2 | Load `.env` (`process.loadEnvFile`, Node ≥ 22) for CLI and serve | (c) | No env loading anywhere | New slice in #75 |
| A3 | **Native providers**: `anthropic`, `google` and `openai` through AI SDK provider packages. Document OpenRouter, LiteLLM and Ollama through `openai-compatible`. | (a) | PRD story 7 (provider choice). ADR 0004 already decided it. eve offers direct providers and a gateway. Anthropic and Gemini now work only through an OpenAI-compatible base URL, which is setup friction. | Extend #75's "provider choice" slice to runtime support |
| A4 | **Long threads fail clearly**: classify the provider's context-length error, explain it in CLI and Studio, show tokens per run and per thread | (c) | Threads ship in M1 and send the full history. Plico's scenario review, gap 6, asked for "a near-term failure experience and user-visible context usage". | New slice in #75 |
| A5 | **Decide the published upgrade policy** for runs in flight. *Needs a decision.* | (b) | See below | ADR 0008 amendment, plus a slice in #75 |

**A5 in detail.** Today any change to the project fails a resumed run (`ProjectChangedError`). From reading the code, `model.request` records the composed instructions and replay compares payloads. So **editing `agent.md` or a skill while a run waits on approval probably fails that run when it resumes**, which is exactly what a developer does during the M1 demo. Confirm with a test first. Then choose one:

- **(i)** Keep fail-loudly. Make the failure explain itself in CLI and Studio ("the project changed while this run waited; start a new run"), and document it.
- **(ii)** Pin a run to the instructions it started with, so edits apply only to new runs. Tool code changes would still fail loudly.

(ii) gives a better demo and matches how threads behave, but changes what is recorded. Either way, ADR 0008's stale line ("#95 owns a versioning rule") is replaced by the decision.

## M1: cut (move to M2)

| Item | Why | Destination |
|---|---|---|
| #99 slice "Show which skills a run loaded in Studio" | A skill load is already an event, provided the run timeline renders the new skill-load event type | Drop the dedicated view; the timeline covers it |

**Considered and kept: #97's run-to-eval promotion.** The M1 rule alone would cut it. But the run-to-eval loop scored 9/10 in Plico's demand research, and the PRD names the lifecycle as the reason to build Plico. It is also cheap. Eval scripts (`evals/*.script.json`) are lists of `assistant.output`, `tool.call` and `artifact.write` steps, so promoting a run is a mechanical mapping from its events. It also reuses the recorded tool results that #97's mocking slice needs. Keep it in M1 as the visible differentiator. #97 needs no change.

Keep the `SKILL.md` folder decision in M1 under rule (b), and keep #75's timed walkthrough: it is the quality gate.

**Release label.** *Needs a decision.* Publish M1 as `0.x` (a developer preview), not `1.0`. MCP, frontend streams and compaction are table stakes in the field and arrive in M2. A `1.0` label promises contract stability Plico has not yet tested with users.

## M2: order and new epics

1. **#77 Tools and MCP.** Table stakes: eve's `connections/`, Mastra and OpenAI Agents all have it.
2. **#79 Client streams.** *Needs a decision:* ship the AI SDK UI adapter before AG-UI. `@ai-sdk/react` has about 6× `@ag-ui/client`'s weekly downloads, and `useChat` frontends would work immediately. ADR 0004 already plans both adapters, so only the word "default" changes, through an ADR 0004 amendment.
3. **#80 React kit.** Narrow it to what is specific to Plico: approvals, artifacts, run state and timeline. Run it over a transport usable with `useChat`, and run a PoC that tests the build-our-own option against reuse (`@ai-sdk/react`, `@assistant-ui/react`) before building chat hooks.
4. **N1 Context compaction (new).** It moves up from the PRD's "after v1". Threads are M1, and eve compacts by default. Summarise older turns past a threshold, record compaction as an event, and make the summary inspectable in Studio. Manus's lesson is to compress reversibly: keep paths and IDs so the agent can recover content from artifacts.
5. **N2 Typed run input/output (new).** An optional `input`/`output` schema on an agent, validated at the run boundary and exposed in the API. API consumers need it, and #141's `agent(..., { output })` builds on it, so it comes before #141. Plico's feature research rates "structured inputs and outputs" High.
6. **N3 Eval scorers (new).** LLM-judged scorers behind a Plico scorer interface (`autoevals`, as ADR 0009 proposes), plus comparing a promoted case across instruction or model changes. eve ships `t.judge`; the run-to-eval loop scored 9/10 in Plico's demand research.
7. **#78 Memory.** *Needs a decision:* reuse the #142/#140 file tools over a `memory/` mount instead of a separate memory API. This follows deepagents' composite backend and Anthropic's memory tool. The epic gets smaller, and `memory/` stays Markdown that people can edit.
8. **#141 Multi-agent**, then **#140 remainder.** Demand is 6/10. Both depend on N2 and #142.

**Considered and not added:**

- **Chat channels** (Slack, Teams): out of scope in the PRD; hosts can call the HTTP API.
- **Sandboxes and bash:** out of scope in the PRD; #142's virtual file tools cover file work without one.
- **Schedules and webhooks:** the host owns them, through the API. Document the pattern in M3 deployment docs (#81).
- **Visual builder and marketplace:** out of scope in the PRD.

## High-priority scenario gaps

Each high-priority gap in the [scenario gap review](../agent-builder-scenario-gap-review.md), with a home:

| Gap | Placement |
|---|---|
| 1. Upgrade while a run waits | M1: A5, plus upgrade docs in A1 |
| 2. Data deletion, retention, export | M3, as a new slice in #82. It needs production storage, and the local SQLite file can be deleted outright. |
| 3. Tenant isolation | M3, #81. Host auth context must reach every run, thread, approval and artifact route; add cross-tenant negative tests to its done-when. |
| 4. Uncertain side-effect outcome after a crash | M1 docs (A1): idempotency keys and at-least-once behaviour. A manual "resolve" action for operators is deferred until a host asks for it. |
| 5. Budgets (tokens, time, spend) | M2: per-run token and time limits fit N1, which already counts context. Spend limits are deferred, since provider cost data is unreliable. |
| 11. Ship a prompt change safely | M1 #97 (promotion, CI-safe evals), then M2 N3 (scorers, comparison) |
| 13. Untrusted content and prompt injection | M2, #77 MCP. MCP output is the first untrusted-content source; add the threat boundary, least-privilege examples and an adversarial eval case to its done-when. |

## M3

M3 is unchanged: #81 host mount and auth, #82 Postgres and DBOS. Add a deployment guide covering triggers and schedules to #81's docs slice.

## PRD and ADR fixes (docs PR)

The PRD now contradicts decided epics:

- "Users do not write workflows" (Out of Scope) conflicts with #141.
- "After v1 … subagents as child durable runs" conflicts with #141 in M2.
- "After v1 … compaction" conflicts with N1, if accepted.
- The M2 bullet does not list #140, #141, or the new epics.
- The M1 outcome should say that a live agent writes artifacts (#142).
- ADR 0008: the stale versioning line (A5).

## Decisions for the maintainer

1. Accept the M1 rule and the A1–A4 additions to #75 and #76?
2. Drop #99's dedicated Studio skills view, and keep #97's run-to-eval promotion in M1?
3. Publish M1 as `0.x` developer preview?
4. Upgrade policy (A5): keep fail-loudly and explain it (i), or pin runs to their starting instructions (ii)?
5. AI SDK UI before AG-UI in #79, with an ADR 0004 amendment?
6. Create epics N1 (compaction), N2 (typed run I/O) and N3 (eval scorers) in M2, and reorder M2 as listed?
7. Rescope #78 Memory to the file-tool mount?
8. Place the scenario gaps as in the table: slices added to #77, #81 and #82?
9. Apply the PRD/ADR fixes in one docs PR, together with audits 0009–0013?

## Implementor prompt

```text
You are working on Plico (D:\projects\plico). Read AGENTS.md and product/audits/0013-release-readiness-and-roadmap-review.md.
Only act on decisions the maintainer has accepted in that audit; ask if unsure.

For accepted M1 items, implement slice by slice (one PR each, "Part of #<epic>", RED -> GREEN -> REFACTOR):
- A2 (#75): load .env for `plico run`/`plico serve` via process.loadEnvFile when a project .env exists; never log values;
  readiness says which file was loaded. Document it.
- A3 (#75): add `anthropic`, `google`, `openai` providers through AI SDK provider packages behind the existing model port
  (packages/runtime/src/providers), keeping provider retries off (ADR 0004/0008); update supportsModelProvider, the
  recovery/account key hashing, readiness checks, create-plico provider choice, and docs. Add dependencies per ADR 0009.
- A4 (#75): classify provider context-length errors as their own error kind with an actionable message in CLI and Studio,
  and show input/output tokens per run and per thread in Studio.
- A1 (#76): build the reference docs pages in packages/website listed in A1, checked against the shipped behavior.
Run `pnpm check` before each PR.
```

## Sources

- eve docs: [introduction](https://eve.dev/docs/introduction), [changelog](https://eve.dev/changelog.md), [GitHub](https://github.com/vercel/eve)
- npm downloads API: `https://api.npmjs.org/downloads/point/last-week/<package>`, queried 2026-11-07
- LangChain, [State of Agent Engineering](https://langchain.com/state-of-agent-engineering): quality is the top production barrier; observability is widely used
- Manus, [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): reversible compression
- LangChain, [Deep Agents backends](https://docs.langchain.com/oss/javascript/deepagents/backends): composite file backends
- Plico: [PRD](../prds/plico-agent-app-kit-prd.md), [demand research](../agent-builder-demand-research.md), [scenario gap review](../agent-builder-scenario-gap-review.md), ADRs 0004, 0008, 0009
