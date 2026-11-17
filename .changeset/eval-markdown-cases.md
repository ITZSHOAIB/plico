---
"@plico-ai/contracts": minor
"@plico-ai/sdk": minor
"@plico-ai/core": minor
"@plico-ai/runtime": minor
"@plico-ai/server": minor
"@plico-ai/cli": minor
"create-plico": minor
---

Eval cases can be Markdown: `evals/<name>.md` with `expect` checks in frontmatter (`status`, `contains`, `tool`, `notTool`, `artifact`, `output` fields of `structuredOutput`, and `maxTokens` and `maxLatencyMs` for live runs) and judge criteria as bullets, replayed from a `<name>.script.json` fixture beside it. Custom scorers live in `evals/scorers/` and use `defineScorer` from `@plico-ai/sdk`. `plico validate` points at the line of a mistake, and `plico eval` lists cases it skipped. `plico eval --from-run` now writes `<name>.md` plus the fixture, and `evalCaseFromRun` records `contains` or `output` instead of `outputContains`. Fixture-only `*.script.json` cases keep working. `plico validate` also checks a case's `input` against the agent's input schema.

Breaking: a `.md` file in `evals/` that starts with a `---` frontmatter block is now read as an eval case. If it is not one, `plico validate` reports its unknown keys as errors and `plico eval` stops on it; move such notes out of `evals/` or drop their frontmatter. `runEvals` now also returns `skipped`.
