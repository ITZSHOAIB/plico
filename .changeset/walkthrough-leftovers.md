---
"@plico-ai/core": patch
"@plico-ai/cli": patch
"create-plico": patch
---

`plico validate` warns about files in `evals/` that `plico eval` would skip, such as a case saved as `name.json`. The scaffolded `tools/readme.md` now describes the full handler context. Docs note that a dry run without `--script` calls no tools.
