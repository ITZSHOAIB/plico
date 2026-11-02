# Code walkthrough findings

Date: 2026-11-02

Found while reading the whole codebase, package by package. None of these are fixed or filed yet.

They come from reading the code, not running it. **(untested)** marks the ones that most need a test first. **#69** marks items to handle inside that epic.

## Fix first

These can break a user's install or lose data.

1. **Missing shebang (untested):** neither `plico` nor `create-plico` has `#!/usr/bin/env node`, so a published install may not run. Belongs in #76.
2. **Direct-run check under npm symlinks (untested):** at `packages/cli/src/cli.ts:52`, and the same in `create-plico`, the check may fail so the command silently does nothing. Belongs in #76.
3. **Blocked run loses its output:** `run-project.ts:89`. **#69**
4. **Stream can drop final events (untested):** events written between `packages/server/src/stream.ts:53` and `stream.ts:71` may never be sent. It's likely to matter once events save live. **#69**
5. **Script validators have drifted:** the server's `script.ts` accepts `artifact.write`, but the CLI's `script-file.ts` rejects it. Sharing one validator would fix this.

## Runtime

6. **Max steps reports success:** the provider loop ends as `completed` with `Maximum steps reached`.
7. **`maxSteps` is hard-coded.**
8. **Provider tool messages won't suit real models.**
9. **Tools can't import relative or bare modules:** they load through a `data:` URL.
10. **Unknown tool in a script:** it's a plain `Error`, not a structured failure.
11. **Read-only store skips the schema check.**
12. **Eval handlers really run:** tool side effects happen during evals.
35. **Skills are always injected:** `instructions.ts` adds every skill's full text to every run, with no progressive loading. Numbered 35 because it was added after the walkthrough. See layer 15 in audit 0005.

## Evals and readiness

13. **Hard-coded folder names:** `run-evals.ts:10`, `checks/evals.ts` and `checks/artifacts.ts` hard-code them.
14. **No evals counts as success:** `plico eval` exits `0`, so a CI gate passes with nothing tested.
15. **Duplicate tool names missed:** readiness `checkTools` doesn't detect them, but `discoverTools` does.
16. **`artifacts/` check guards an unused folder.**

## Core and `create-plico`

17. **Unfriendly message when the config can't be imported.**
18. **`create-plico ./x` naming:** it uses a fixed default name, unlike the prompt path.
19. **`ensureEmptyTarget` has a redundant branch.**

## Server

20. **`Last-Event-ID` is ignored:** a browser reconnect replays events the client already has.
21. **Terminal lists need updating:** `stream.ts:6-13` still has `run.blocked`, `blocked` and `run.error`. **#69**

## CLI

22. **Typos become paths in `validate`:** `plico validate --jsn` and `--help` are both treated as folders.
23. **Misleading database error:** a project with no saved runs gets `Missing database`.
24. **IPv6 URL is invalid:** `--host ::1` prints `http://::1:3000`.
25. **Timeline gaps:** `formatRunResult` skips artifact events and still uses blocked wording. **#69** for the wording.

## Studio

26. **No live updates:** nothing uses the SSE route, and run lists only refresh on Evals actions or a page reload.
27. **No URL routing:** `/runs/abc` always opens on Overview.
28. **Fast clicks can show another run's events:** `selectRun` has no guard against overlapping requests.
29. **Silent failures:** a failed `fetchRuns` looks like no runs, and `fetchInstructions` errors are swallowed.
30. **Failure reasons are hidden:** they stay inside the `run.error` payload.
31. **Snapshots can't be opened:** `api.ts` doesn't call that route.
32. **#69 display changes:** `eventSummary` needs `approval.requested`, and views print `endedAt` directly, so it will show `null` for a waiting run.

## Tests, CI and docs

33. **CI gaps:**
    - The contract test skips status codes, `/health` and the SSE stream.
    - Tests use `src`, so the built packages are never run.
    - `astro check` never runs.
    - Studio has no `test` script.
34. **Docs and repo cleanup:**
    - `README.md` omits `plico eval` and `plico readiness`.
    - `AGENTS.md` doesn't list `packages/website`.
    - Unused `wayfinder:*` labels remain on GitHub.
