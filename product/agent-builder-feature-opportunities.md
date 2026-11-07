# Agent builder feature opportunities

Status: product discussion, not an accepted roadmap or implementation authorization. Priorities are initial judgments, not validated demand. Existing GitHub epics govern delivery and scope.

These proposals describe additional things users could build with Plico, rather than acceptance gaps in already planned features. Some overlap with longer-term PRD direction; their scope and timing remain decisions.

| Capability | User scenario | Initial priority |
| --- | --- | --- |
| Multiple named agents | A triage agent delegates research to a specialist and a reviewer checks the result; each has its own instructions, tools and model. | High |
| Workflows | Define classify → research → draft → approve → send, including branching and parallel steps when needed. | High |
| Events and schedules | Start work when a support ticket arrives, a webhook fires, or a daily report is due. | High |
| Structured inputs and outputs | Accept a typed request and return validated structured data for another application. | High |
| Model profiles | Define named models and select one per agent or task, such as a cheaper classifier and a stronger reviewer. | High |
| Knowledge sources and retrieval | Connect documents, databases or search; retrieve relevant information and provide source references. | Medium-high |
| Agent experiments | Compare prompts, models or agent versions on a shared dataset, including quality, latency and cost. | Medium-high |
| File and multimodal input | Supply a PDF, spreadsheet, image or audio file as input to an agent. | Medium |
| Human tasks and forms | Ask a person for missing information, corrections or a decision during a workflow. | Medium |
| External agent integration | Call an existing agent or framework from Plico, or expose a Plico agent for another system to call. | Medium |
| Reusable agent packages | Share a complete agent, including instructions, tools, evals and declared dependencies, across projects. | Medium-low |
| Sandboxed execution | Run code or process untrusted files in an isolated environment. | Use-case dependent |

## Relationship to existing direction

- The [PRD](prds/plico-agent-app-kit-prd.md) defers subagents, compaction and planning until after v1, and allows possible future framework adapters. It specifies a linear v1 runtime rather than a general graph runtime. Named agents and workflows would require deliberate product and contract decisions.
- The PRD already discusses provider portability, gateway routing, memory adapters, evals, MCP, APIs, approvals and artifact output. Model profiles, knowledge sources, experiments and human tasks here describe potential user-facing extensions, not claims that those adjacent capabilities are unplanned.
- Sandboxes are deferred until a real requirement exists. Agent Skills compatibility is already covered by [#99](https://github.com/ITZSHOAIB/plico/issues/99); reusable complete agent packages are a separate idea.
- File input is distinct from the planned artifact workspace for generated output.

## Candidate scenario to validate

A support ticket arrives and starts a workflow. A triage agent classifies it, a research agent gathers evidence, a person supplies missing information if needed, and the workflow returns a validated result. Use this to evaluate whether named agents, workflows, triggers, model selection and structured output work together and materially improve on existing alternatives.

Test the scenario with prospective users before committing to new primitives or an orchestration engine. Record where a host application or existing integration already solves the need, and revise priorities based on observed outcomes.
