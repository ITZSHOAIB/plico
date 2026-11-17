---
"@plico-ai/contracts": minor
"@plico-ai/core": minor
"@plico-ai/runtime": minor
"@plico-ai/server": minor
"@plico-ai/cli": minor
"create-plico": minor
---

`plico eval --live` now grades cases with a judge model. Each bullet in a case body is a criterion the judge answers yes or no, and `scorers` take a `rubric` (levels 0 to n, scored as the level picked over the top level, passing at 0.7) and a `factuality` check against an expected answer (passing at 0.6), each with an optional `threshold` and `judge`. The judge is the entry's `judge`, then the case's, then the new `evals.judge` in `plico.config.ts`, then the agent's model in `plico.config.ts`; `--model` changes only the agent, never the judge. Each check is one model call at temperature 0, retried like the agent's calls, and failed checks print the judge's reasons; a run that failed is not judged. Judge calls count toward `--max-tokens`, and `plico readiness` warns when judged cases have no judge, a judge lacks its key, or the judge is the agent's own model. `runEvals` returns each case's `scores` with what the judge was asked and answered; `POST /v1/eval` does not serve them yet. `EvalScorerRef` is now a union of code, rubric and factuality scorers, model requests take an optional `temperature`, and the finish chunk carries the `modelId` that answered. The scaffold's README mentions the judged checks. The judge prompts are adapted from autoevals (MIT), credited in NOTICE.
