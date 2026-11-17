# Eval scorers and the shape of Plico evals

**Date:** 2026-11-16  
**Status:** Decisions accepted 2026-11-17 and recorded in epic #145. PoC run 2026-11-17 (results below). The owner accepted the own judge as the default on 2026-11-17; ADR 0009's scorer row records it.  
**Baseline:** Plico `fbe4d95` (v0.1.5). Package data from the npm registry on this date; first-party docs for eve, the AI SDK, Arize Phoenix, Braintrust and Anthropic. No judge model was called.

## Recommendation

**Own the scorer interface and the judge, built on the AI SDK that Plico already uses. Drop `autoevals` as the default; keep it as one PoC arm, not a dependency.**

Plico's value in evals is the runner, the event log as the transcript, promotion of real runs, readiness and Studio. The judge is a prompt plus a structured model call. With AI SDK 7 that call is a few lines, works with every provider Plico supports, and flows through Plico's model port, tracing and provider config. `autoevals` does not: it talks to models through the `openai` client, so Anthropic or Google judges need an OpenAI-compatible proxy.

This reverses the *proposed* pick in ADR 0009. The owner accepted it on 2026-11-17, subject to a PoC with the same scenarios for every arm (below).

## Why `autoevals` was picked

Audit 0005, layer 14, shortlisted it from package data only: scorer-only, no platform, 0.8M weekly downloads, MIT. Its own concerns were 0.x, 8 dependencies and little activity. Layer 14 had no PoC, and ADR 0009 marks the pick proposed. eve, the benchmark, also used it at the time (`t.judge.autoevals.*` in eve 0.12).

## What changed since

- **eve dropped it.** eve 0.65 replaced `t.judge.autoevals.*` with `t.judge(criteria)`, built on the AI SDK's decision API, and removed the autoevals graders. Its judge model resolves per call, per eval, then project config.
- **The AI SDK gained a judge primitive.** `experimental_decide` answers `choice`, `score` and `boolean` questions about a state, with probabilities. Native on OpenAI, Google, TypeSafe AI and Perplexity; Anthropic through an adapter; not on `openai-compatible`. It is experimental ("may change in patch releases") and returns no explanation, which the epic needs for "a score can be explained".
- **`autoevals` stayed thin.** 0.4.1, 2 stable releases since 1 August, an `openai` client and `zod-to-json-schema` 3 as dependencies.

## Candidates

| Option | Version, licence | Weekly downloads | Stable releases since 1 Aug | Fit for Plico |
| --- | --- | --- | --- | --- |
| **Own judge on AI SDK `generateText` with `Output.object`** | none | n/a | n/a | Every Plico provider, reasons included, prompts are ours to test |
| AI SDK `experimental_decide` | in `ai` 7 | n/a | n/a | Calibrated probabilities, but experimental, no reasons, no `openai-compatible` |
| `autoevals` | 0.4.1, MIT | 0.68M | 2 | Tested prompt templates; OpenAI client only, bypasses the model port |
| `@arizeai/phoenix-evals` | 2.7.1, Apache-2.0 | 0.01M | 7 | On AI SDK 7, but pins `ai` exactly and needs `@opentelemetry/api` ^1.10 (Plico pins 1.9) |
| `vitest-evals` | 0.18.1, Apache-2.0 | 0.23M | 5 | Peers on `ai` <7 and Vitest 5; a test-runner style, not a scorer library |
| `openevals` | 0.2.3, MIT | 0.21M | 3 | Pulls in LangChain and LangSmith |
| Evalite | 0.19.0 (1.0 in beta.16) | 0.48M | 0 stable | A whole runner and UI on Vitest, overlaps Plico's own |
| Promptfoo | 0.125.1, MIT | n/a | many | 76 dependencies, a full eval product, owned by OpenAI |
| `@mastra/evals` | 1.10.11, Apache-2.0 | 0.46M | 15 | Peers on `@mastra/core` |

Prompt templates are the reusable part of the libraries. `autoevals` (MIT) and Phoenix (Apache-2.0) templates can be adapted with attribution, which keeps the tested wording without the runtime dependency.

## How Plico evals should work end to end

The design follows Anthropic's agent-eval guidance (tasks, trials, graders, transcripts, outcomes) and what eve ships, adapted to Plico's file-first model.

1. **Cases are Markdown files.** `evals/<name>.md` holds `input` (checked against the agent's input schema from #144), an `expect` shorthand for code scorers, `trials` and `tags` in frontmatter, and judge criteria as body bullets. See "How people write evals". Existing `*.script.json` fixtures keep working.
2. **Three run modes.** *Scripted* (today, offline, the CI default), *live* (`plico eval --live`, sends `input` to the configured model) and *re-score* (`plico eval rescore <report>` scores stored runs again without calling the agent, for tuning scorers cheaply). In live mode, tools with a `mocks` entry in the case return that result, `--mock-tools` takes every tool result from the `.script.json` fixture, and other tools run for real; the docs warn about side effects.
3. **Scorers see the whole run.** A scorer receives the input, text output, `structuredOutput`, expected values, and the run's events: tool calls, artifacts, usage and timing. Plico's event log is the transcript, which most libraries have to reconstruct.
4. **One interface, two kinds.** `defineScorer` in `@plico-ai/sdk` returns `{ score: 0..1, reason?, metadata? }`. Code scorers are deterministic. Judge scorers get a `judge` helper bound to the configured judge model; their prompt, model and raw answer are recorded with the score.
5. **Built-ins.** Deterministic: status, contains, equals, regex, schema-field match on `structuredOutput`, tool called or not called, artifact written, token, cost and latency budgets. Judged: criteria (yes or no), rubric (scored levels), choice, and factuality against an expected answer.
6. **Trials and consistency.** `trials: n` reruns a live case in a clean run. Reports give the mean score, pass@k and pass^k, because a customer-facing agent needs every trial to pass.
7. **Reports, baselines, comparison.** Every eval run writes a versioned report (`EvalReport` schema version 2) under `.plico/evals/reports/`, with scores and judge metadata. `--save-baseline` writes `evals/baseline.json`, which is committed; later runs compare against it, and a regression beyond `--tolerance` exits non-zero. `plico eval compare <a> <b>` compares any two reports. `--model <provider:model>` overrides the agent's model for one run, so comparing two models is two commands. Studio reads reports through `GET /v1/evals/reports` and `GET /v1/evals/reports/:id`.
8. **Capability and regression suites.** Tags split suites that are expected to climb from suites that must stay near 100%. CI gates on regression; capability runs are tracked.
9. **CI and cost control.** Scripted suites need no key. Live suites are opt-in, with concurrency, timeout and a token cap (`--max-tokens`). There is no dollar cap, because that needs a price table Plico would have to maintain. JUnit output serves CI systems.
10. **Production loop.** Promote a real run (#97) to a case, run it live, compare. Later: human labels in Studio measure how often the judge agrees with a person, which is how judges are calibrated.
11. **Readiness and Studio.** Readiness reports judged scorers without a provider, a judge that is the same model as the agent, and stale reports. Studio shows each case's transcript, scores with reasons, and the comparison of two reports.

## How deep: kinds of evals Plico supports

Go deep on what only Plico can do (the whole run is recorded, real runs become cases, reports compare) and keep the scorer set small. Every judge prompt needs checking against human labels, so one tested judge beats many untested metrics.

G-Eval and decision models are ways to run a judge, not kinds of eval:

- **G-Eval** (Liu et al., 2023): the model writes evaluation steps from the criteria, scores against them, and weights the score by its probability for each value. Plico adopts the steps with a twist: they are generated once and saved in the case file, so the judge stays the same between runs and changes show in review. Probability weighting needs token probabilities (OpenAI has them, Anthropic does not), so it is an option; elsewhere a few samples are averaged.
- **Decision models** (TypeSafe AI `jev`, AI SDK `experimental_decide`): specialised judges with calibrated probabilities, cheap and fast, but experimental, without reasons and native on few providers. They fit as an optional judge backend behind the same interface.

| Tier | What | When |
| --- | --- | --- |
| Core | Code scorers over the whole run: status, `structuredOutput` fields, tool called or not, artifact written, token, cost and latency budgets, contains, equals, regex | #145 slice 1 |
| Core | One judge with three question types (criteria, rubric, choice), always with a reason. Factuality against an expected answer is a preset | #145 slice 2 |
| Core | Custom TypeScript scorers through `defineScorer` | #145 slice 1 |
| Core | Report comparison, and trials with pass^k | #145 slices 3 and 4 |
| Option | G-Eval rubric mode: saved steps, probability weighting where the provider allows | #145 slice 2 or just after |
| Option | Decision-model judge backend | After the PoC shows agreement at least as good |
| Later | Human labels in Studio and judge agreement rate | Studio follow-up |
| Later | Retrieval metrics (faithfulness, context recall) | With the memory or retrieval epic |
| Skip | Exact step-sequence matching (brittle; grade the outcome), embedding similarity (needs an embedding model), scoring production traffic (out of scope) | Not planned |

## Reports and visualisation

Reports yes, dashboards no. The epic already rules out hosted dashboards.

- **JSON report, always.** `EvalReport` already exists with `fixturesDigest`. A new schema version adds per-scorer scores, reasons, judge metadata, trials, mode, model and instructions digest. Reports are files under `.plico/evals/`, so they diff, archive and compare.
- **CLI table.** Per case: pass or fail, score, and the delta against the baseline when one is given. This is the main view.
- **Markdown summary.** `--format markdown` writes a short table for a pull request comment or the GitHub job summary. It is cheap, and it puts results where prompt changes are reviewed.
- **JUnit XML.** `--format junit` for CI systems that read it.
- **Studio, three small views, not charts for their own sake.** An eval run lists cases with scores. A case shows the transcript next to each scorer's score and reason. A comparison shows two reports side by side with deltas. A per-case score trend over recent reports is the one chart worth adding, as a sparkline.
- **No** standalone HTML report generator, score distribution charts or a dashboard builder.

## How people write evals

Most cases should come from real runs, not a blank file. Plico has one hand-written case format: Markdown with YAML frontmatter, the same shape as `agent.md` and skills. Machine-written files stay JSON (`*.script.json` fixtures, reports). No hand-written case format has shipped yet, so there is nothing to migrate.

1. **Promote a run.** `plico eval promote <run-id>` (#97) writes `evals/<name>.md` from a recorded run: its `input`, an `expect` block from its status and structured fields, and a `<name>.script.json` fixture from its events. The author edits from there.
2. **Save from Studio.** A "Save as eval" action on a run does the same, plus a field to type criteria. This is a later Studio slice.
3. **Write the Markdown.** Cases are short, readable by people who do not write code, and easy for coding agents to write from the docs:

```md
---
input:
  ticket: VPN is down for the whole sales team
expect:
  tool: create_ticket
  output:
    priority: high
trials: 3
tags: [regression]
---
- Explains why the priority is high
- Does not promise a fix time
```

- **`expect` is shorthand for code scorers.** `status` and `contains` check the run and its text, `tool` checks a tool was called, and fields of `structuredOutput` sit under `output:`, so they never clash with check names. No `scorers` list is needed for common cases.
- **`mocks`** gives fixed results for named tools in live mode, so a case can call the model for real without creating real tickets.
- **Passing.** Criteria are yes or no with a reason. Rubrics pass at a threshold, 0.7 by default. With `trials: n`, a case passes only if every trial passes (pass^k); the report also shows pass@k.
- **Each body bullet is a judge criterion** in plain language, scored by the judge model with a reason.
- **Full control stays available.** A `scorers:` list in frontmatter sets thresholds, rubrics, G-Eval steps or custom scorers.
- **Offline and live from one file.** A `<name>.script.json` fixture next to the case lets it run offline; `--live` ignores the fixture and calls the model. In scripted mode, judge criteria are reported as skipped, because they would only grade the fixture.

4. **Datasets for many cases (later slice).** A CSV next to a case file, `evals/triage.csv` beside `evals/triage.md`, runs every row through the same `expect` and criteria. Columns map to `input` and `expect` fields, with dotted names for nesting (`input.customer.tier`). Fifty cases are fifty rows, often exported from a spreadsheet or a support queue.
5. **Custom scorers** are TypeScript files in `evals/scorers/`, referenced by name with `use: no-pii`:

```ts
import { defineScorer } from "@plico-ai/sdk";

export default defineScorer({
  name: "no-pii",
  score: ({ output }) => ({ score: /\b\d{3}-\d{2}-\d{4}\b/.test(output) ? 0 : 1 }),
});
```

Not supported: separate YAML case files (frontmatter already is YAML), JSONL datasets (CSV covers non-developers; developers can use frontmatter), and eve-style `*.eval.ts` files (code stays limited to scorers). `plico validate` checks frontmatter, `expect` keys, CSV columns and scorer names, and points at the line, so a typo fails fast and offline.

## Who judges

Code scorers need no model. Criteria, rubrics and factuality are judged by a second model call, separate from the agent under test: an LLM by default, or a decision model where the PoC shows it agrees with labels at least as well.

The judge is configurable at three levels, the most specific winning: `evals.judge` in `plico.config.ts`, `judge:` in a case's frontmatter, and per check in `scorers:`. Without any, the agent's model judges. Any provider Plico supports works, with the same `provider:model` strings and keys. Temperature defaults to 0; samples and thresholds are options.

Readiness warns when the judge is the agent's own model, because a model grading itself is biased. Every judged score records the judge model, prompt and raw answer, and `compare` flags two reports judged by different models. Judge prompts are Plico's own, adapting tested wording from `autoevals` (MIT) and Phoenix (Apache-2.0) with credit in NOTICE.

## Smallest useful experiment

One PoC, arms on the same scenarios, run against OpenAI and Anthropic:

- **Arms:** (A) own judge on `generateText` with `Output.object` (`generateObject` is deprecated in `ai` 7), (B) `experimental_decide`, (C) `autoevals` through its OpenAI client.
- **Scenarios:** factuality against an expected answer; a three-level rubric; a yes-or-no criterion over a run's tool calls; one custom TypeScript scorer.
- **Measure:** works through Plico's model port for both providers; a reason is returned; judge metadata is reproducible; dependency count; agreement with 20 hand-labelled outputs.

Pass bar for the default: both providers through the model port, reasons, and agreement no worse than the best other arm.

## PoC results

Run 2026-11-17 in `D:\projects\plico-eval-judge-poc` (outside the repo; `results/REPORT.md` has every number). No package changed.

**What ran.** Six arms with the same prompt wording: (A) own judge on `generateText` with `Output.object`, directly and (A-port) through the real `ModelProvider` from `createConfiguredModelProvider`; (B) `experimental_decide`; (C) `autoevals`; (D) `@arizeai/phoenix-evals`; (E) `openevals`, added as a further open-source option. No OpenAI or Anthropic credit was available, so the targets were each configured as a `plico.config.ts` model block:

| Target | Stands in for | Adapter | Model | Used for |
| --- | --- | --- | --- | --- |
| groq | OpenAI | `@ai-sdk/openai` `.chat`, OpenAI client | `openai/gpt-oss-120b` | agreement |
| ollama-anthropic | Anthropic | `@ai-sdk/anthropic` on Ollama's `/v1/messages` | `llama3.2` 3B | coverage only, too weak to rank judges |
| gemini | a native non-OpenAI provider | `@ai-sdk/google` | `gemini-3.5-flash` | smoke only: the free tier allows 20 requests a day per model |

Twenty labelled outputs (7 factuality, 7 rubric, 6 tool-call criteria, 8 borderline), two trials each, plus a custom TypeScript scorer behind the same interface.

**Structural results.** These do not depend on the labels.

| Arm | Through the port | Reason | Judge metadata | Packages added | Notes |
| --- | --- | --- | --- | --- | --- |
| A own judge | yes, all three targets, no new provider code | yes | model id, response id, usage, prompt, raw answer | 0 | port lacks temperature and the served model id |
| B decide | no: needs a second factory, `decisionModel` | no | model id, usage, probabilities | 0 | fails on Groq (OpenAI adapter posts to `/decisions`, served only by OpenAI); Google adapter is built on `generateContent`, so it cannot reach `gemini-decision-1`; "exactly one value" errors on Ollama |
| C autoevals | no: OpenAI client only | yes | the requested model and the choice | 28 | the Anthropic target had to switch to Ollama's OpenAI endpoint |
| D phoenix | no: takes an AI SDK model | yes | label and explanation | 12 | pins `ai` 7.0.152 (a second copy), needs `@opentelemetry/api` 1.10 against Plico's 1.9 pin, uses the deprecated `generateObject` |
| E openevals | no: a LangChain model per provider | yes | score and comment | 33 | brings LangChain, LangGraph and LangSmith |

The custom scorer and a judge scorer returned the same result shape, and the custom scorer matched all six tool-call labels.

**Agreement (groq, first trial).** A 16/20, A-port 17/20, C 18/20, D 19/20, E 18/20; B returned nothing. The arms agree with each other on 17 to 20 of the 20 cases without any label involved, and every disagreement with a label is on four rubric cases:

- R7 (label 0, "try resetting your password again"): all five arms said 1.
- R5 (label 1, apology and refund, no timing): A, C and E said 2.
- R2 (label 1) and R4 (label 0): both A variants were one level more lenient.

At n=20, agreement does not discriminate between the arms, and its ranking turns on these four labels, which the owner has not yet ruled on. D's lead over A is the prompt wording (A asks for step-by-step reasoning, Phoenix for a short explanation), not the mechanism: both make one structured call. The pass bar's agreement clause is therefore open, not met or failed.

On Ollama, direct A succeeded 8 of 40 calls and A-port 33 of 40 on the same adapter: the 3B model often broke the schema. Noted, not investigated.

**Corrections to this audit.** `generateObject` is deprecated in `ai` 7: the own judge uses `generateText` with `Output.object`, as the runtime already does for typed results. `experimental_decide` reaches fewer providers than "native on OpenAI, Google" suggests: through Plico's adapters it worked only on the Anthropic adapter here.

**Owner's rulings (2026-11-17).**

1. Labels: R7 and R4 stay 0, R2 stays 1. R5 stays 1: rubric level 2 requires saying when the fix lands, and R5 gives no timing, the same gap as R2. The rubric's level 0 now says that staying on topic, apologising, "looking into it" or repeating a step that already failed is still Poor.
2. The port is not extended in slice 2. The judge records the configured model and accepts the provider's default temperature; a `temperature` field and the served model id are a small port change in slice 3, following ADR 0006.
3. The structural results are decisive: the own judge is the default. No further models were run.

**Rubric re-run with the tightened level 0** (groq, 7 rubric cases, two trials each, `results/rubric-v2/groq.json`; `REPORT.md` covers the first run only). R7 and R4 now agree with their labels on every arm and trial except one trial each of C and D on R7. R2 and R5 are still judged one level too lenient (A on R2 both trials and R5 one trial, A-port on R5 both trials, C and E on R2, C on R5): the judges overlook the missing timing. That is a judge-prompt finding for slice 3, which should make each rubric level's required parts explicit, not a labelling problem.

**Slice 3 rulings (2026-11-17).**

1. Slice 3 ships as two PRs: 3a is live mode (`--live`, `mocks`, `--mock-tools`, `--model`, trials, `--max-tokens`, `--concurrency`), with criteria still reported as skipped; 3b is the judge (criteria, rubric, factuality, judge configuration and metadata, the port's `temperature` and served model id, judge readiness checks).
2. Rubric and factuality are built-in entries in `scorers:` beside custom scorers, such as `{ rubric: { 0: ..., 1: ..., 2: ... }, threshold }` and `{ factuality: <expected answer>, judge }`. A rubric scores the chosen level over the top level, and its prompt says a level counts only when every part it names is present.
3. Each criterion is its own judge call, with its own answer, reason and recorded prompt.
4. Until reports v2, `runEvals` returns each case's scores with judge metadata and the CLI prints the reasons; `POST /v1/eval` strips them, so the wire is unchanged.
5. `--max-tokens` caps agent and judge tokens over the whole live suite. Once reached, no case or trial starts; the rest are listed as skipped and `plico eval` exits 1. `--concurrency` defaults to 4 for live runs; scripted runs stay sequential.
6. A live case needs `input`, sent the way `plico run --input` sends it. Without it, and for a fixture on its own, the case is skipped. Live mode is CLI-only in this slice; approval policy applies as in a run.

**Slice 3b rulings (2026-11-17).** Factuality passes at 0.6 by default, so a consistent superset passes and a subset fails; `threshold` overrides it. Without `evals.judge`, a case or check judge, the judge is the model in `plico.config.ts`, also under `--model`, so compared models share a judge. Criteria and rubrics see the case input, the final or structured output, each tool call with its arguments and result (long results shortened, with a note) and the files written; factuality sees the input, the expected answer and the final output. Live results stay unstored until reports v2 records the mode.

Carried into 3b: the token cap counts only agent tokens until the judge exists, and must add judge tokens then (`LiveEvalOptions.maxTokens` says "agent tokens" today). Live results are not stored as the project's eval report until reports v2 records the mode.

## Decisions

Accepted by the owner on 2026-11-17:

1. An own judge on the AI SDK replaces `autoevals` as the default, confirmed by the PoC as the first slice.
2. Cases are Markdown with frontmatter (`expect` with nested `output`, `mocks`, criteria as bullets); CSV datasets come later; TypeScript only for custom scorers.
3. Scripted, live and re-score modes, with scripted the CI default. In live mode tools use `mocks`, `--mock-tools` or run for real.
4. Reports and `compare` are how instructions or models are compared, with a committed baseline, `--tolerance` and `--model`.
5. Trials pass on pass^k, and live runs are capped in tokens. Human-label calibration is later.
6. The tiers above: the core set in #145, G-Eval as an option, decision models only after the PoC.
7. Reports as JSON, CLI table, Markdown and JUnit; three Studio views; `EvalReport` version 2 over HTTP; no dashboards.
8. Authoring through promote first, then Markdown by hand; "Save as eval" in Studio later.
9. The later items stay listed in #145 and become one follow-up epic after it ships, if still needed.

## Sources

- [eve 0.65 judge docs](https://app.unpkg.com/eve@0.65.0/files/docs/evals/judge.mdx), [eve 0.65 eval overview](https://app.unpkg.com/eve@0.65.0/files/docs/evals/overview.mdx), [eve 0.12.3 judge docs](https://app.unpkg.com/eve@0.12.3/files/docs/evals/judge.mdx)
- [AI SDK decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions), [`experimental_decide` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/decide)
- [autoevals TypeScript API](https://www.braintrust.dev/docs/reference/autoevals/typescript-api)
- [Phoenix LLM evaluators](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-evals/llm-evaluators)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- npm registry data for each package, 2026-11-16
- Audit 0005 layer 14, ADR 0009, audit 0013 N3

## Implementor prompt

```text
Build slice 2 of epic #145 from product/audits/0019-eval-scorers-and-eval-design.md, "How people
write evals": Markdown eval cases with frontmatter (input, expect, mocks, trials, tags, judge,
scorers) and criteria as body bullets, the expect checks, the scorer interface and defineScorer in
@plico-ai/sdk, custom scorers in evals/scorers/, `plico eval promote` writing .md plus its
.script.json fixture, and `plico validate` for all of it with line numbers. Scripted mode only:
criteria are reported as skipped, and mocks are parsed and validated but used from slice 3. Keep
EvalCaseResult and EvalReport unchanged until slice 4. Legacy *.script.json cases keep working.
TDD through `plico validate` and `plico eval`. Do not add autoevals, Phoenix or openevals.
```
