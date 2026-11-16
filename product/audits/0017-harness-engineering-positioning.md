# Harness engineering and Plico's positioning

**Date:** 2026-11-09
**Question:** Is "harness engineering" a fair and useful way to market Plico? What would it claim, what can Plico back today, and what are the risks?
**Status:** Proposed. Nothing here is decided and no site copy has changed. Every option under "Positioning options" is marked proposed.
**Update 2026-11-13:** the headline recommendation is superseded. The tagline is now "Bring prompts and tools. Plico handles the harness.", because "agents from files" read as building agents from uploaded documents. The rest of the analysis stands.

## Summary

- **The term has two meanings, and Plico fits one.** Hashimoto, Böckeler and OpenAI use "harness engineering" for a practice: a developer hardens the setup around a *coding* agent so a mistake never repeats. LangChain, Osmani and Deep Agents use "harness" for a layer: everything in an agent that is not the model. Plico is a product for the second meaning. It can borrow the first meaning's loop as a feature story.
- **"Harness" is already on the homepage.** The hero ("Plico supplies the harness"), the kit section ("The harness, *included*") and the meta description all use it. The docs index, README and PRD do not. The real question is whether to lead with the word and use it everywhere, not whether to add it.
- **Plico can back "harness" for the run-and-inspect half, not yet the long-task half.** Shipped: instructions, tools, file tools, approvals, durable runs, the event log, Studio, artifacts, readiness. Planned (M2): compaction, subagents, MCP, scorers. Out of scope: sandboxes.
- **Recommendation (proposed):** use "harness" as the *category word* in one sentence, and keep "agents from files" as the headline. Tell the Hashimoto loop (see a failure, promote the run to an eval, fix a file, rerun) only after #97 ships it. Do not lead with "harness engineering" as an identity: the word is about nine months old, it connotes coding agents, and leading with it invites feature comparisons with Claude Code and Deep Agents that Plico loses today.

## What harness engineering means

| Source | Meaning | Date |
|---|---|---|
| [Mitchell Hashimoto](https://mitchellh.com/writing/my-ai-adoption-journey), "Step 5: Engineer the Harness" | "anytime you find an agent makes a mistake, you take the time to engineer a solution such that the agent never makes that mistake again." Two forms: `AGENTS.md` lines and programmed tools. He says he has "grown to calling this 'harness engineering.'" | 2026-02-05 |
| [LangChain, The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness) (Vivek Trivedy) | "Agent = Model + Harness." A harness is "every piece of code, configuration, and execution logic that isn't the model itself." | 2026-03-10 |
| [Birgitta Böckeler, Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html) | Takes LangChain's definition, then bounds it to coding agents. Her model is *guides* (feedforward controls) and *sensors* (feedback controls). | 2026-04-02 |
| [Addy Osmani](https://addyosmani.com/blog/agent-harness-engineering/) | Repeats the LangChain definition and list; adds observability. "A decent model with a great harness beats a great model with a bad harness." | 2026-04-19 |
| [arXiv 2605.13357](https://arxiv.org/pdf/2605.13357) | A runtime substrate around a foundation-model agent: context, tools, project memory, task state, observability, failure attribution, verification, permissions, maintenance state. | 2026 |
| [OpenAI, Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) | Not read: the page returned HTTP 403. Search summaries say a harness constrains, informs, verifies and corrects the agent, and contrasts it with context engineering. **Secondhand; do not quote.** | 2026-02-11 |
| Anthropic, effective harnesses for long-running agents | Not read; only secondary coverage was found (initializer agent, progress file, feature list). **Secondhand; do not quote.** | 2025-11 |

**Reading.** Three layers are in use at once: a *definition* (Model + Harness), a *practice* (turn each failure into a permanent fix) and a *product category* (Claude Code, Codex and Deep Agents are called harnesses). The term is unstable and vendor blogs dominate the results, so treat the boundaries as unsettled.

## How competitors use the word

| Product | Uses "harness"? | Evidence |
|---|---|---|
| Deep Agents (LangChain) | Yes, as identity | "Deep Agents is the agent harness for complex, multi-step work." |
| AI SDK harness packages (Vercel) | Yes, as a category of *coding-agent runtimes* | "A harness is a complete agent runtime, such as Claude Code, Codex, or Pi." Packages are marked experimental. Audit 0005 layer 18 covers `@ai-sdk/harness` as a fallback. |
| eve (Vercel) | No | README opens "a filesystem-first framework for durable AI agents". The word appears only as a GitHub topic tag. |
| Claude Code, Codex CLI | Yes, as the thing being compared | Comparison blogs sort them as "harnesses you adopt" against "frameworks you build on". |

**Implication.** eve, Plico's closest competitor, does not use the word, so it is open ground against eve. Deep Agents owns it as identity, and Vercel uses it for coding runtimes, so "harness" alone does not distinguish Plico from either. What can distinguish Plico is *which* harness: a file-first one with a Studio and an event log.

## Plico against the harness component list

Components are LangChain's five plus Osmani's observability. State is verified from the repo and `gh` on 2026-11-09.

| Harness component | Plico today | Epic | State |
|---|---|---|---|
| System prompt and instructions | `agent.md`, skills as Markdown | #99 Skills | Shipped (flat files); `SKILL.md` folders and progressive loading are open (0/5) |
| Tools | Typed `defineTool`, schemas, idempotency keys | #98 | Shipped |
| Skills and MCP | Skills load as files; no MCP | #77 | MCP is M2, open |
| Bundled infrastructure: filesystem | Versioned artifact workspace; `list_files`, `read_file`, `write_file`, `edit_file` | #73, #142 | Shipped (#142 closed) |
| Bundled infrastructure: sandbox, browser | None | n/a | Out of scope (PRD; audit 0005 layer 18) |
| Orchestration: subagents, handoffs | None | #141 | M2, open |
| Orchestration: model routing | One configured provider | #75 | Open (native providers A3) |
| Hooks and middleware: compaction | Full thread history every turn, no budget | #143 | M2, open |
| Hooks and middleware: continuation, durability | SQLite durable engine, steps replayed after a crash, waiting runs | #95 | Shipped |
| Permissions | Approvals in Studio and API; approval policy readiness checks | #72 | Shipped |
| Observability | Canonical event log, run replay in Studio, OpenTelemetry spans | #74 | Shipped; OTel undocumented (no docs page mentions it) |
| Verification (evals, sensors) | Scripted evals, `plico eval`, readiness | #97, #145 | Scripted shipped; trust fixes and run-to-eval promotion open (0/5); judged scorers M2 |
| Memory | `memory/` directory exists; no memory behavior | #78 | M2, open |

**Reading.** Plico covers the *inspect and control* half of a harness (what the run did, who approved it, what it wrote). It does not yet cover the *long task* half (compaction, subagents, MCP, sandbox) that people mean when they compare Deep Agents or Claude Code. A visitor who reads "harness" and looks for those will find a gap.

## The story Plico can tell honestly

Hashimoto's loop, "every mistake becomes a permanent fix", maps onto Plico's own lifecycle:

1. See the failure in Studio run replay (shipped).
2. Promote the stored run into an eval case (#97 slice 5, **not shipped**).
3. Fix `agent.md`, a skill or a tool; each is a file in git (shipped).
4. Rerun `plico eval` without an API key (shipped) and compare across changes (#145, M2).

This is the strongest harness-engineering claim Plico has, because it is about the *practice*, and the files-in-git design is what makes it work. It is true as a promise only once step 2 ships, so the copy must wait or say "in development".

## Risks

- **Term volatility.** The word dates from February 2026 and was coined or popularised within the year. Headlines built on it may age badly. Keep it out of the package name, the tagline and the npm description.
- **Coding-agent connotation.** Hashimoto, Böckeler and OpenAI write about coding agents; the AI SDK page lists Claude Code and Codex as examples. Plico's flagship is an internal-ops agent with no sandbox (audit 0005). A coding-agent reader may expect sandboxes and bash.
- **Feature comparison.** Leading with "harness" invites a checklist against Deep Agents (planning, subagents, compaction, virtual filesystem). Plico ships the filesystem and not the other three.
- **Name clash.** Vercel's `@ai-sdk/harness` packages and its experimental harness abstraction share the word. Search results for "AI SDK harness" will not be Plico's.
- **Consistency.** The homepage uses "harness" while the docs index, README and PRD do not. A visitor who clicks through sees two vocabularies. The PRD also says Plico "should not position itself as a generic agent SDK", so changing the lead is a PRD-level change.
- **Overclaiming.** "Production-grade harness" or "reliable long-running agents" is not backed by compaction or subagents today.

## Positioning options (all proposed)

| # | Option | Where "harness" appears | Backed by | Main risk |
|---|---|---|---|---|
| P1 | **Keep as is.** Headline "Build AI agents from files"; "harness" as a descriptor in the lede and kit section. | Lede, kit section, meta description | Table above: the inspect-and-control half | Docs and README stay silent on the word |
| P2 | **Descriptor, used everywhere.** Same headline; add one defined sentence to the docs index, README and PRD: "Plico is a file-first agent harness: the runs, event log, approvals, artifacts and evals around your model." Add a "What is an agent harness?" docs page that defines it with the LangChain formula and maps Plico's files to it. | Docs index, README, one docs page, homepage | Table above; page can say what is planned | Small; needs the page kept current with the table |
| P3 | **Practice story.** Add to P2 a "Harness engineering with Plico" page and a homepage section that tells the four-step loop. Publish after #97 slice 5 ships. | As P2, plus the loop | The loop above, once step 2 ships | Hype if shipped early; ties the page to #97 |
| P4 | **Lead with the word.** Headline "The file-first agent harness". | Headline, title, npm description | Only half of the table | Highest risk: volatility, coding connotation and the comparison with Deep Agents |

**Recommendation (proposed): P2 now, P3 when #97 ships, not P4.** P2 is cheap, closes the inconsistency and uses the strongest accurate claim. It also keeps the headline and the PRD tagline stable if the term fades.

## Decisions for the maintainer

1. Pick a positioning option (P1 to P4), or say none.
2. If P2 or P3: is the docs page "What is an agent harness?" worth adding to the docs nav, and should the PRD's positioning paragraph name "harness"?
3. Should the page include a "what Plico does not do" list (sandbox, subagents, compaction until their epics ship)? The recommendation is yes, matching audit 0013's honesty about eve.
4. Should the homepage copy change at all before `0.x` is published? The hero already says "In development. Not on npm yet."
5. Document OpenTelemetry tracing? Observability is the component Plico can claim most strongly, and no docs page mentions it (audit 0013 A1 already lists it).

## Implementor prompt

```text
You are working on Plico (D:\projects\plico). Read AGENTS.md, product/audits/0017-harness-engineering-positioning.md and GLOSSARY.md.
Act only on the positioning option the maintainer has accepted in that audit; if none is recorded, stop and ask.

If P2 was accepted (one PR, docs only, no behavior change):
- Add one defined sentence about the harness to packages/docs/content/docs/index.mdx and README.md, matching the homepage wording.
- Add packages/docs/content/docs/agent-harness.mdx and list it in meta.json: define "Agent = Model + Harness" with a link to LangChain's post, map Plico's files and features to the component table in the audit, and include a "what Plico does not do yet" list that matches the epics' current state (re-check with `gh issue view`).
- Do not quote the OpenAI or Anthropic posts. Do not rename packages or change the headline.
- Keep the homepage copy consistent with the docs wording (hero.tsx, kit-section.tsx, app/(home)/page.tsx).
Run `pnpm --filter @plico/docs build` and `pnpm check` before the PR.

If P3 was accepted, do the same only after #97's "Promote a stored run into an eval case" slice has merged, and add a page that walks the four-step loop with real commands.
```

## Sources

- Hashimoto, [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey), 2026-02-05
- LangChain, [The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness), 2026-03-10
- Böckeler, [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html), 2026-04-02
- Osmani, [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering/), 2026-04-19
- [arXiv 2605.13357](https://arxiv.org/pdf/2605.13357), runtime substrate definition
- LangChain, [Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- Vercel, [AI SDK harnesses](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview); [eve](https://github.com/vercel/eve)
- Not read (HTTP 403 or secondary only): [OpenAI, Harness engineering](https://openai.com/index/harness-engineering/); Anthropic's long-running agent harness post
- Plico: PRD, audits 0005 (layer 18), 0013, `packages/docs/components/home/*`; epics checked with `gh` on 2026-11-09
