# Publish readiness audit

**Date:** 2026-11-07
**Question:** Can Plico be published to npm as a library and framework today?
**Verdict:** **No.** If the packages were published as they are, installs would fail, and the binaries would either fail or do nothing. The local HTTP server also lets any web page run project tools and approve pending approvals. Most blockers are already slices of #76, #75, #97 and #99. This audit confirms them by testing, and adds the findings no epic tracks yet.
**Status:** Accepted 2026-11-07. Applied to [#76](https://github.com/ITZSHOAIB/plico/issues/76) (N1, N2, N3, N5, N6, N7, N8, CI tarball smoke) and [#75](https://github.com/ITZSHOAIB/plico/issues/75) (N4, N9). N2: scripted HTTP runs use mocked or recorded tool output (option 1). N5: `defineTool` and `defineConfig`.

## Method

Every finding was reproduced on `main` at `a44a664`, using Node 22.23.3 on Windows 11.

- `pnpm check` passes: 64 test files, 479 tests passed and 3 skipped.
- `pnpm pack` was run for `contracts`, `core`, `runtime`, `server`, `cli` and `create-plico`. The tarballs were installed into a clean npm project, outside the workspace.
- `@plico/studio` is private, so it cannot be packed. A copy of its `dist/` with `private` removed stood in for it, so the install could go further.
- From that install, I ran the binaries, scaffolded a project, ran `validate`, `readiness`, `run` and `eval` against it, and served the internal-ops example.
- I sent forged requests to `plico serve` to test cross-origin access.

**Not tested:**

- A live provider run (no API key).
- The Studio UI in a browser.
- An end-to-end run on macOS or Linux. The POSIX shebang failure was reproduced through Git Bash.

## Blockers: confirmed, already tracked

| # | Finding | Evidence | Tracked in |
|---|---|---|---|
| B1 | **No LICENSE.** There is no file, no `license` field, and GitHub reports `license: null`. Without a license, nobody may legally use the code. | `ls LICENSE*`, `gh api repos/ITZSHOAIB/plico` | #76 slice 1 |
| B2 | **`@plico/cli` cannot be installed.** It depends on `@plico/studio`, which is `private`. | `npm install` of the tarballs fails with `404 '@plico/studio@0.0.0' is not in this registry` | #76 slice 3 |
| B3 | **The POSIX binaries have no shebang.** `dist/cli.js` runs as a shell script. | `node_modules/.bin/plico --version` gives `import: command not found` and exit 2 | #76 slice 2 |
| B4 | **The Windows binaries do nothing and exit 0.** The cause is the missing shebang (B3): npm writes a `.cmd` shim that runs `cli.js` directly, without `node`, when the file has no shebang, so Windows hands it to its default script host. Separately, the direct-run check (`import.meta.url === pathToFileURL(argv[1])`) fails when the bin is reached through a symlink, as pnpm and npm do on POSIX. `plico.cmd validate <dir>` prints nothing and exits 0. **A CI gate running `plico eval` would pass without running anything.** | PowerShell: `plico.cmd --version` and `plico.cmd validate demo` both print nothing and return `exit=0` | #76 slice 2. Add the silent exit 0 to its done-when. |
| B5 | **The npm names are unclaimed.** `plico`, `@plico/*` and `create-plico` all return 404. Ownership of the `@plico` scope is unverified, because the org endpoint returned `{}`. | `npm view`. The owner should check with `npm org ls plico` while logged in. | #76 slice 1 |
| B6 | **There is no versioning or release workflow.** All packages are `0.0.0`. There are no changesets, no changelog, no tags and no publish job. CI only validates. | `.github/workflows/ci.yml`, `git tag` | #76 slice 6 |
| B7 | **The docs site has one page,** `welcome.mdx`. The README's commands are all `pnpm --filter … exec` from the monorepo, with no `npm install` path. | `find packages/website/src/content` | #76 slice 5 (A1) |
| B8 | **Every command prints `ExperimentalWarning: SQLite`,** including `plico --version`, because `node:sqlite` is imported eagerly. | Smoke install | #76 slice 4 |
| B9 | **The scaffold cannot do a live run.** It has no model, no tools and no evals. `plico run` fails with "Model configuration is missing", and `.env` is not loaded. | `create-plico demo`, `plico readiness demo` (4 warnings) | #75 slices 1, 2 and 5 |
| B10 | **`plico eval` passes when a project has no evals.** It prints "No eval cases found." and exits 0. | Smoke install | #97 slice 1 |
| B11 | **Only `openai` and `openai-compatible` providers exist,** although the docs say "provider-agnostic". | `packages/runtime/src/providers/configured.ts` | #75 slice 2 |
| B12 | **The skill format is not final.** It must be settled before first publish (flat file or `SKILL.md` folder, progressive loading). | #99 is 0/4 | #99 |

## New findings: not in any epic

### N1. Any website can run project tools and approve pending approvals (critical)

`plico serve` has no authentication, and that is by design for loopback. It is still reachable from any page open in the developer's browser:

- `readJsonBody` (`packages/server/src/body.ts`) parses any body as JSON and never checks `Content-Type`. A `text/plain` POST is a CORS "simple request": the browser sends it without a preflight.
- Nothing checks `Origin` or `Host`, so DNS rebinding gives an attacker full read and write access.
- `POST /v1/runs` accepts a caller-supplied `script`, and its `tool.call` steps run the project's **real** tool handlers (see N2).

These reproduced against the internal-ops example:

1. **Drive-by tool execution.** A POST with `Origin: https://evil.example` and `Content-Type: text/plain` returned `202`. The events show `tool.call`, then `tool.result` with `ticketId`, then `artifact.file.written`, then `run.completed`.
2. **Approval bypass.** With `approval: { required: true }`, the run stopped at `approval.requested` and `run.waiting`, as it should. A forged request then sent `POST /v1/runs/:id/signal` with `{"name":"approval:<runId>:0","value":{"approved":true}}`. It had `Host: rebind.attacker.example`, `Origin: http://rebind.attacker.example` and `text/plain`, and it returned `{"result":"accepted"}`. The events continue `approval.decided`, then `tool.result`, then `run.completed`. **This bypasses human-in-the-loop, which Plico presents as a safety feature.**
3. **Data read.** `GET /v1/runs/:id/events` with a foreign `Host` returned the approval payload, including the tool arguments. Run IDs, instructions and artifacts can be read the same way.

Under audit 0013's rule (c), this belongs in M1. It is a cheap fix, and the vulnerable server ships in M1, so it should not wait for #81's host auth. The fix:

- Require `Content-Type: application/json` on every non-GET route.
- Reject requests whose `Host` is not the bound loopback host and port, unless `--allow-remote` is set.
- Reject requests whose `Origin` is present but not same-origin.
- Add negative tests for each of these.

The vulnerable class is well known: local dev servers have shipped CVEs for it.

### N2. The HTTP `script` field runs real tool handlers (high, design)

Even for same-origin callers, `POST /v1/runs` with `script` is a scripting interface. It drives project tools with arbitrary arguments, bypasses the model, and records the result as a normal run. #97 slice 2 plans to mock tool output, but only for evals.

Decide before publish, because the HTTP wire contract is expensive to change afterwards:

- **Option 1:** scripted runs over HTTP always use recorded or mocked tool output.
- **Option 2:** the `script` field is accepted only on `/v1/runs/dry`, or only with an explicit flag on `serve`.

### N3. `create-plico --help` scaffolds into a directory named `--help` (medium)

`main()` takes `argv[2]` as the target directory without parsing flags. Running `create-plico --help` printed `Created Plico scaffold in --help` and created `./--help/`.

`create-plico` has no `--help` and no `--version`, and nothing rejects unknown flags. The fix is to parse flags the way `@plico/cli`'s `parseArgs` does, and to reject a target directory that starts with `-`.

### N4. A scaffolded project cannot run `plico` (high, DX)

The generated `package.json` is `{ "private": true, "type": "module" }`. It has:

- no `@plico/cli` dev dependency;
- no `scripts`, such as `dev`, `validate` or `eval`;
- no `.env.example`;
- no `.gitignore` for `.plico/`.

After `npm create plico`, the next documented command therefore does not exist in the project. This should be part of #75 slice 5, or a new slice.

### N5. Tool and config authoring is untyped (decide before publish)

TypeScript-first is the headline claim, but neither `@plico/core` nor `@plico/contracts` exports a `defineTool` or `defineConfig` helper. The example and the scaffold use bare `export default { … } as const`, so `handler(input, { idempotencyKey, artifacts })` has implicit `any` parameters, and a typo in a config key is caught only at runtime.

Under rule (b), the shapes of the tool module and of `plico.config.ts` become a public contract at first publish. Ship typed helpers, or at least exported `PlicoConfig` and `ToolDefinition` types used with `satisfies`, before `0.1.0`.

### N6. Build output hygiene (medium)

- **Tests are compiled into `dist` and published.** `tsconfig.build.json` includes all of `src`. Examples: `@plico/server` ships `dist/contract.test.js` and `hardening.test.js`, and `create-plico` ships `dist/cli.test.js`. Exclude `**/*.test.ts` and `src/testing/**`.
- **There is no clean step.** `tsc` never deletes stale output, so a release built on a developer machine can ship modules that were deleted from `src`. Add `rm -rf dist` (or `tsc --build --clean`) to `prepack`, or build the release in CI only.
- **`declarationMap: true` points to `src/`, which is not published.** "Go to definition" then leads nowhere. Either ship `src` or turn the option off.
- **Manifests lack `license`, `repository`, `description`, `homepage`, `keywords` and `author`.** `description` is present only in contracts. npm provenance (`--provenance`) needs `repository`.
- **`@plico/runtime` and `@plico/server` have no README,** so their npm pages would be blank.
- **No `publishConfig.access: "public"`.** Scoped packages publish as restricted by default, so the first `npm publish` of `@plico/*` fails without it.

### N7. Dependency advisory: ajv 8.17.1 (low)

`npm audit` on a clean install reports 4 moderate findings, all from [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) (ReDoS with `$data`; fixed in `>=8.18.0`). The runtime creates `new Ajv({ allErrors: true, strict: false })` without `$data` (`packages/runtime/src/tools/schema.ts:7`), so Plico is not exploitable. Every user's first `npm install` still prints the warning. Bump to `8.20.0`.

### N8. Install footprint (low)

A clean install of the CLI is about 70 MB.

- `typescript` (24 MB) is a **runtime** dependency of `@plico/core`, used only by `tool-name-validation.ts` to parse tool files.
- `tsx` is a runtime dependency of the runtime.

Both are defensible: Plico loads `.tool.ts` files. Consider two options:

- Make `typescript` a peer dependency, since TS projects already have it.
- Use Node's type stripping (Node ≥ 22.18 unflagged) as part of the Node-baseline decision in #76 slice 4.

### N9. Provider coverage is narrower than "provider-agnostic" (high, extends #75 slice 2)

There is one adapter. `supportsModelProvider` accepts only `openai` and `openai-compatible`, and both resolve to `createOpenAICompatibleProvider` (`packages/runtime/src/providers/configured.ts`).

- The endpoint and key come only from `OPENAI_BASE_URL` and `OPENAI_API_KEY`. `plico.config.ts` cannot set a `baseURL` or a key variable, so one process can target only one compatible endpoint.
- `provider: "anthropic"` passes `plico validate`, which exits 0. Readiness only warns. The failure appears at `plico run`, as `Unsupported model provider: anthropic`.
- Through `openai-compatible`, OpenRouter, LiteLLM, Ollama, Groq, Together, DeepSeek and vLLM work today. Anthropic and Gemini work only through compatibility layers, which lose fidelity (tool calls, caching, usage).

Each native adapter costs tests and code for:

- tool-call mapping;
- error classification (context length, rate limit, auth);
- token usage;
- the recovery and account key hashing;
- readiness.

Covering "most providers" one adapter at a time is therefore the wrong goal. Get breadth from the AI SDK, which Plico already depends on through `ai`. The proposed preview bar:

1. **Native and tested:** `openai`, `anthropic` and `google`, through `@ai-sdk/*` packages. This is #75 slice 2 as written.
2. **Configurable compatible endpoints:** `model: { provider: "openai-compatible", baseURL, apiKeyEnv }` in config. Docs give recipes for OpenRouter, LiteLLM, Ollama and the Vercel AI Gateway; the Gateway alone reaches hundreds of models.
3. **Escape hatch for every other AI SDK provider** (Bedrock, Azure, Vertex, Mistral, xAI): a project module that returns an AI SDK model, for example `providers/<name>.ts`. Plico wraps it behind its own model port, so no AI SDK type enters the project contract (AGENTS.md). Optional provider packages become peer dependencies.
4. **`plico validate` fails on an unknown provider** instead of passing.

More native adapters come later, ordered by demand.

## What is in good shape

- **The gate is green.** Lint, build, typecheck and 479 tests pass. CI runs on Ubuntu and Windows.
- **The server is loopback-only by default.** Binding to a non-loopback host requires `--allow-remote`, with an explicit "no authentication" error. The request body cap is 1 MB, and artifact exports send `nosniff`.
- **The packages are ESM-only**, with `exports` maps, `types` and `engines`, and a clean dependency direction.
- **The wire contract has a snapshot** (`v1-contract.snap`) and a versioning ADR (0006). The SQLite schema has a migrator.
- **The architecture matches the docs.** Approvals and the artifact workspace work end to end, as shown by the event sequences above. Readiness output is clear and actionable.

## Recommended release path

1. **Before any publish:** B1, B5, and N6's `publishConfig` and manifest fields.
2. **`0.1.0-preview` (developer preview, as decided in 0013):**
   - Security and binaries: N1, B2, B3, B4, N3.
   - Contract decisions: N2, N5, B12.
   - DX and docs: N4, B8, B7 (quickstart page only), N6.
   - Then B6 with npm provenance from CI.
   - Smoke-test install from a tarball in CI (see the prompt below), so the install-time blockers cannot come back.
3. **M1 close (#75 timed walkthrough):** B9, B10, B11 and the full reference docs.

Publishing a preview before step 2 is not recommended. The first `npm create plico` experience would be a broken binary, and the security issue would ship in the version people try first.

## Decisions for the maintainer

1. Add N1 (Origin, Host and Content-Type checks) as a #76 slice that comes before publish?
2. N2: mock tool output for HTTP scripted runs (option 1), or restrict `script` to dry runs and a flag (option 2)?
3. Add N3 and N4 as #75 or #76 slices?
4. N5: ship `defineTool` and `defineConfig` before `0.1.0`, or exported types with `satisfies`?
5. Add N6 (build hygiene) and a CI smoke test that installs from tarballs to #76 slice 6?
6. N8: should `typescript` become a peer dependency, folded into the Node-baseline decision?
7. N9: is the provider bar for the preview three native adapters, plus config-level compatible endpoints, plus a project provider module as an escape hatch, plus `validate` failing on unknown providers?

## Implementor prompt

```text
You are working on Plico (D:\projects\plico). Read AGENTS.md and product/audits/0015-publish-readiness-audit.md.
Only act on items the maintainer has accepted; ask if unsure. One PR per slice, "Part of #76" (or the epic named),
RED -> GREEN -> REFACTOR through public surfaces, `pnpm check` before each PR, docs updated in the same PR.

1. N1 (server hardening, @plico/server): add failing tests that POST /v1/runs and /v1/runs/:id/signal
   with (a) Content-Type text/plain, (b) a foreign Host header, (c) a foreign Origin, and expect 415/421/403
   with stable error codes. Then enforce: JSON content type on non-GET routes; Host must match the bound
   loopback host:port unless --allow-remote; Origin, when present, must be same-origin. Keep Studio working
   (it sends application/json, same origin). Update the contract snapshot deliberately per ADR 0006.
2. B3/B4 (binaries): add `#!/usr/bin/env node` to packages/cli/src/cli.ts and packages/create-plico/src/cli.ts;
   replace the direct-run check with a realpath comparison (fs.realpathSync on argv[1] vs fileURLToPath(import.meta.url)).
   Test by spawning the built bin through a symlink and, on Windows, through an npm .cmd shim; assert
   non-empty output and a non-zero exit on an invalid project.
3. N3: give create-plico real arg parsing (--help, --version, reject unknown flags and targets starting with "-").
4. N6: exclude *.test.ts and src/testing from tsconfig.build.json in every package; add a clean step before build;
   add license, repository, description, homepage, keywords and publishConfig.access "public" to each publishable
   manifest; add READMEs for runtime and server; bump ajv to ^8.20.0.
5. CI smoke: add a job that runs `pnpm pack` for every publishable package, installs the tarballs into an empty
   npm project, then runs `npx plico --version`, `npx create-plico demo`, and `npx plico validate demo`, asserting output.
   It must fail today on @plico/studio being private (B2); fix B2 in the same epic before enabling it as required.
6. N9 (#75 slice 2, @plico/runtime + @plico/core): first make `plico validate` fail on an unknown model.provider
   (test through validateProject diagnostics). Then add native `openai`, `anthropic`, `google` via @ai-sdk/* behind
   the existing ModelProvider port (retries off), with per-provider key env vars, error classification and usage;
   add `baseURL` and `apiKeyEnv` to the openai-compatible config; then a project provider module escape hatch.
   Update modelProviderRecoveryKey/AccountKey, readiness, create-plico provider choice and the docs recipes.
Do not publish to npm or create tags; the maintainer does that.
```
