# Agent builder demand research

Research snapshot: 2026-11-05. These are directional product judgments, not proof of willingness to pay or a change to the current epics. Intended audience: developers and small teams building agent applications.

## Scoring

Priority is a subjective score out of 10, combining evidence of demand, relevance to Plico's intended users, differentiation potential, and likely implementation cost. It is not a survey result. Confidence describes the evidence for the underlying need, not confidence in the exact score. “Build” means prioritize discovery and a narrow usable slice, not authorization to implement it outside the current epic.

| Capability | Priority | Confidence | Recommendation |
| --- | --- | --- | --- |
| Run visibility and dependable execution | 9/10 | High for visibility; medium for durability | Build incrementally |
| Run-to-eval improvement loop | 9/10 | Medium | Build and validate |
| Multiple model configuration | 8/10 | Medium | Build basic selection; integrate gateways for routing |
| Local-to-production path | 8/10 | High for need; medium for Plico's solution | Build a narrow deployment path |
| Understandable file-first project | 7/10 | Low to medium | Keep and validate with users |
| Multiple agents and workflows | 6/10 | Medium for workflows; low for mandatory multi-agent | Prototype against real cases; defer a general engine |

## Evidence and reasoning

### Run visibility and dependable execution — 9/10

LangChain's public survey of over 1,300 professionals reports 89% use some agent observability and 62% detailed tracing. Among respondents with agents in production, 94% report some observability. This is evidence of a widespread need and also suggests strong competition and an established baseline, not a unique Plico feature. The survey is vendor-run and self-selected. [LangChain survey](https://www.langchain.com/state-of-agent-engineering)

The research study [Measuring Agents in Production](https://arxiv.org/abs/2512.04123) reports substantial human involvement in deployed agents. This supports inspecting and controlling runs, but does not measure demand for Plico's SQLite recovery design. Start with clear traces, approval state, and documented recovery guarantees; validate long-running recovery with users before promising production durability. Plico already has a provider loop, event log, and local SQLite recovery code. Crashed in-flight work may execute again.

### Run-to-eval improvement loop — 9/10

LangChain reports quality as a leading production barrier (32%) and offline evaluation use at 52.4% among respondents. [LangChain survey](https://www.langchain.com/state-of-agent-engineering) Inngest's vendor survey reports 31% citing difficulty writing evals and 20% results in a separate system among cited eval limitations. These figures come from different samples and should not be combined. [Inngest report](https://www.inngest.com/blog/ai-in-production-report-2026)

This supports testing a specific Plico experience: select a failed run, redact or choose data, save a reproducible case, change an instruction, and compare outcomes. Survey results do not establish that this exact workflow is wanted or that developers would switch tools for it. Interview users and measure successful regression detection and time to diagnose before expanding it.

### Multiple model configuration — 8/10

LangChain reports over three-quarters of surveyed organizations use multiple models in development or production. That is organization-level use, not proof that every agent needs dynamic model switching. [LangChain survey](https://www.langchain.com/state-of-agent-engineering) A separate exploratory survey of 19 organizations found 11 used a single provider, illustrating sample and population differences. [Enterprise survey](https://neschenbaum.github.io/applied-work/foundation-models-switching-costs/)

Prioritize named models and explicit selection for agents or tasks, with visible model identity and retry behavior. Validate per-run switching and fallback with users. Defer a Plico-owned load balancer: [LiteLLM's router](https://docs.litellm.ai/docs/routing) already documents load balancing, retries, and fallbacks. Plico currently exposes a single model setting and an OpenAI-compatible endpoint.

### Local-to-production path — 8/10

LangChain reports 57.3% of its respondents have agents in production, while quality remains a leading barrier. This indicates that deployment and operations matter to that surveyed population, not that they want a new deployment platform. [LangChain survey](https://www.langchain.com/state-of-agent-engineering) The [Stack Overflow developer survey](https://survey.stackoverflow.co/2025/ai) reports agent developers use existing monitoring tools, including Grafana and Sentry; integration may be more valuable than replacing them.

Validate one deployable example with documented storage, secrets, access, tracing, and recovery boundaries. Defer a broad managed platform until users identify a concrete deployment gap and an operator willing to own it.

### Understandable file-first project — 7/10

The [Agent Skills specification](https://github.com/Open-Dot-Agents/SKILL.md) documents a portable folder format, and [Hugging Face's skills documentation](https://github.com/huggingface/hub-docs/blob/main/docs/hub/agents-skills.md) describes use across coding agents. These show an ecosystem using files for reusable agent instructions; they do not establish demand for Plico's whole project layout or prove it is easier to maintain than code-first alternatives.

Keep file-first as a product hypothesis and investigate compatibility with relevant standards. Ask users and coding agents to locate a tool, change a model, and add an eval in both a small and a realistic project. Measure task completion, errors, and review time. Avoid expanding the format before these tests.

### Multiple agents and workflows — 6/10

The [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) supports agents as tools and handoffs, showing a well-supported alternative and an existing category of use. This is supply-side evidence, not evidence of Plico-specific demand. [Measuring Agents in Production](https://arxiv.org/abs/2512.04123) reports many production agents use relatively short, controlled execution; it does not prove multiple agents are unnecessary.

Prototype one concrete specialist handoff and one deterministic workflow with prospective users. Record when separate agents improve results enough to justify extra latency, cost, and debugging. Defer a general graph engine and elaborate multi-agent configuration until real applications demonstrate their need. Consider an integration with an existing framework before owning a workflow runtime.

## What would change the ranking

Interview 5–10 intended users and observe them building or maintaining a real agent. Ask for recent incidents and artifacts rather than feature preferences alone. Compare a Plico prototype against their existing stack on diagnosis time, successful eval creation, deployment effort, and maintenance burden. This small convenience sample can refine hypotheses but cannot establish market size. Move a bet up when repeated observed pain and a successful Plico workflow coincide; drop or integrate a feature when an existing tool solves the problem adequately.
