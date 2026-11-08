# Plico

Plico is a TypeScript-first agent app kit built around local Markdown instructions, skills, tools, evals, memory, and artifacts.

Today this repo can:

- scaffold valid Plico projects
- validate projects with `@plico/core`
- expose validation and dry runs through `@plico/cli`
- expose persisted runs, replay, and the native HTTP API through `@plico/server`
- persist artifact content by SHA-256 hash and expose ordered write receipts in run workspaces
- offer provider runs `list_files`, `read_file`, `write_file`, and `edit_file` over their artifact workspace
- report the configured model-facing artifact access in readiness diagnostics
- let provider-invoked TypeScript tools read, write text or bytes, and list staged artifacts with `ctx.artifacts`
- compare artifact versions with `GET /v1/runs/<run-id>/workspace/diffs?path=<path>&fromVersion=1&toVersion=2`
- diff text, JSON, and XML artifacts up to 1 MiB per version; binary and larger versions return errors
- export text and binary run artifacts with `GET /v1/runs/<run-id>/workspace/exports?path=<path>` as file downloads
- review artifact previews, compare versions, and download files in Studio
- run provider-backed conversations, review approvals, and cancel active runs in Studio
- check approval policy references and conflicts through readiness diagnostics
- generate the internal-ops starter with `create-plico`

See the milestones in GitHub Issues for the remaining planned capabilities.

## Repo Layout

- `packages/core` contains the project loader and validator
- `packages/cli` contains `plico validate [path]`, `plico run --dry`, `plico cancel <runId>`, `plico runs`, `plico events`, and `plico serve`
- `packages/create-plico` contains the scaffold generator
- `examples/internal-ops-agent` is the canonical internal-ops starter project

## Local Development

Install dependencies:

```sh
pnpm install
```

Run the repo checks:

```sh
pnpm lint
pnpm test
pnpm build
```

Or run the full local check in one shot:

```sh
pnpm check
```

## Website Deployment

The Astro website lives in `packages/website` and is configured for Cloudflare Pages at `plico.sohab.dev`.

See [docs/cloudflare-pages.md](docs/cloudflare-pages.md) for the Pages project settings, custom domain setup, and manual Wrangler deployment commands.

## Formatting And Linting

The repo uses Biome for formatting and linting.

- `pnpm format` writes formatting fixes
- `pnpm lint` checks formatting and lint rules

## Hooks

Husky runs `lint-staged` on commit so staged JS, TS, and JSON files are checked before they land.

## Validation

Validate the example project from the repo root:

```sh
pnpm --filter @plico/cli exec plico validate examples/internal-ops-agent
```

Use `plico validate --help` to show the validate usage. Unknown flags such as
`--jsn` are rejected instead of being treated as a project path. `plico runs`
prints `No saved runs found.` when the project has not persisted a run yet.
Validation rejects duplicate names declared across `.tool.ts` files; readiness
reports the same duplicate under tool discovery and shows the configured
`artifacts.access` mode (`read-write`, `read-only`, or `off`).

Run the dry runtime with the checked-in example tool:

```sh
pnpm --filter @plico/cli exec plico run --dry --script examples/internal-ops-agent/evals/smoke.script.json examples/internal-ops-agent
```

Project tools are loaded from their `.tool.ts` files, so they can import sibling
TypeScript modules and npm packages installed in the project. `create-plico`
includes a `package.json` with `type: "module"` for ESM tool imports. Declare
`inputSchema` with Zod 3, Zod 4, or JSON Schema; Plico validates tool calls with
that schema and sends JSON Schema to the model. Parsed Zod values, including
defaults and transforms, reach the handler. Add `zod` to the project dependencies
before importing it from a tool.

Wrap a tool in `defineTool` and the config in `defineConfig`, both from `plico`,
to get editor types. `defineTool` infers the handler `input` from `inputSchema`,
so `input.title` is a `string` for a JSON Schema with a required string `title`.
Both helpers return their argument unchanged, and Plico finds them without a
`node_modules` in the project, so a global `plico` install works with them.

Each tool handler receives `artifacts` alongside its abort signal and
idempotency key. Use `artifacts.write(path, content, { mimeType })` to stage
text or `Uint8Array` content, `artifacts.read(path)` to read the current file,
and `artifacts.list()` to get current file metadata. Reads return text as a
string and binary content as a `Uint8Array`; list results include byte size,
MIME type, version, and content hash. Writes are recorded after the durable tool
step completes, so recovery reuses the recorded write. Paths must be relative,
must not contain `..`, and are limited to 1,024 characters; each write is limited
to 1 MiB. A `Uint8Array` returned as the tool result is encoded as tagged base64
in the event log. Runs in a thread share its artifact workspace across turns;
standalone runs use their own workspace.

`GET /v1/threads/<thread-id>/workspace` returns the current thread workspace.
Each artifact version includes the run that wrote it. A run workspace includes
files inherited from earlier turns and its state as of that run; diffs and
exports work across inherited versions. In Studio, the Artifacts view labels
thread workspaces and shows the writing run for each version.

Provider-backed runs also offer Plico's four built-in artifact tools:
`list_files`, `read_file`, `write_file`, and `edit_file`. Configure their access
in `plico.config.ts` with `artifacts: { access: "read-write" | "read-only" | "off" }`;
the default is `read-write`. `read-only` exposes only listing and reading, while
`off` hides all four built-ins. This setting does not disable `ctx.artifacts`
inside project TypeScript tools. The four names are reserved for Plico.

`list_files` accepts an optional glob using `*`, `**`, `?`, and comma-separated
brace alternatives such as `reports/*.{md,txt}`. Results are sorted by path and
paged with `offset` and `limit` (100 by default). `read_file` uses a 1-indexed
line offset, defaults to 200 lines, and caps text content at 32 KiB per result;
binary artifacts return metadata without their bytes. `write_file` accepts text,
infers MIME type from the extension (or accepts `mimeType`), and returns the new
path and version. `edit_file` replaces exact text; it requires one match unless
`replaceAll` is true, and it edits text artifacts only. Model-facing writes are
limited to 1 MiB and use the same staged write path as project tools.

Persist the smoke run, list stored runs, replay events, and start the native API server with Studio:

```sh
pnpm --filter @plico/cli exec plico run --dry --persist --script examples/internal-ops-agent/evals/smoke.script.json examples/internal-ops-agent
pnpm --filter @plico/cli exec plico runs examples/internal-ops-agent
pnpm --filter @plico/cli exec plico events <run-id> examples/internal-ops-agent
pnpm --filter @plico/cli exec plico serve --studio --db examples/internal-ops-agent/.plico/plico.sqlite examples/internal-ops-agent
```

The server has no authentication, so it listens on loopback only and refuses requests a web page could send: a foreign `Host` header (DNS rebinding) gets 421, a cross-origin `Origin` gets 403, and a JSON body sent with another content type gets 415. Send `Content-Type: application/json` on requests with a body. `--allow-remote` exposes the server on another host and skips the `Host` check; `Origin` is still checked. `Origin` must match in scheme, host and port. Hosts that mount `createPlicoServer` under their own name pass `allowRemote: true` and own authentication; behind a TLS proxy they also pass `publicOrigin: "https://their.host"`, since the server sees plain HTTP.

## Scaffold

Generate a new internal-ops starter:

```sh
pnpm --filter create-plico exec create-plico my-plico
```
