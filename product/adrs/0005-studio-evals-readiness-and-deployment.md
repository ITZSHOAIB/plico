# Ship a bundled workbench, trace-first evals, and Node-first deployment

Status: accepted

Plico Studio will be a bundled local workbench served by Plico, not generated into every app. Evals will be trace-first with deterministic event-log replay and promotion of real runs into behavioral eval cases, readiness will use one validator surfaced in CLI, Studio, and JSON mode, and v1 deployment will target framework-neutral Node web runtimes first.

## Considered Options

- Bundled Studio workbench.
- Generated per-project Studio.
- React components only.
- Dataset-only evals.
- LLM-judge-first evals.
- Next/Vercel-first or edge-first deployment.

## Consequences

The first product path can demonstrate inspection, artifacts, persistence, AG-UI, React embedding, eval replay, and production readiness as one local-first workflow. Plico remains portable outside a single hosting platform, while auth is supplied by host applications through request context instead of becoming a built-in user/session system.
