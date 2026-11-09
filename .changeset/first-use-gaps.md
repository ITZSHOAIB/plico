---
"@plico-ai/cli": patch
"create-plico": patch
---

First-use fixes from a cold walkthrough: `plico <command> --help` prints that command's usage, `plico serve` explains a port that is already in use and suggests `--port`, and a waiting dry run prints its run id (or says to add `--persist`). The `create-plico` scaffold now includes a scripted eval case so `npm run eval` passes on a new project, and pins the provider adapter to `^4.0.0` instead of `latest`.
