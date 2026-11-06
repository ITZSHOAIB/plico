# Plico

Plico is a TypeScript-first agent app kit built around local Markdown instructions, skills, tools, evals, memory, and artifacts.

Today this repo can:

- scaffold valid Plico projects
- validate projects with `@plico/core`
- expose validation and dry runs through `@plico/cli`
- expose persisted runs, replay, and the native HTTP API through `@plico/server`
- persist artifact content by SHA-256 hash and expose ordered write receipts in run workspaces
- compare artifact versions with `GET /v1/runs/<run-id>/workspace/diffs?path=<path>&fromVersion=1&toVersion=2`
- diff text, JSON, and XML artifacts up to 1 MiB per version; binary and larger versions return errors
- export a run artifact with `GET /v1/runs/<run-id>/workspace/exports?path=<path>` as a file download
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

Run the dry runtime with the checked-in example tool:

```sh
pnpm --filter @plico/cli exec plico run --dry --script examples/internal-ops-agent/evals/smoke.script.json examples/internal-ops-agent
```

Project tools are loaded from their `.tool.ts` files, so they can import sibling
TypeScript modules and npm packages installed in the project. `create-plico`
includes a `package.json` with `type: "module"` for ESM tool imports.

Persist the smoke run, list stored runs, replay events, and start the native API server with Studio:

```sh
pnpm --filter @plico/cli exec plico run --dry --persist --script examples/internal-ops-agent/evals/smoke.script.json examples/internal-ops-agent
pnpm --filter @plico/cli exec plico runs examples/internal-ops-agent
pnpm --filter @plico/cli exec plico events <run-id> examples/internal-ops-agent
pnpm --filter @plico/cli exec plico serve --studio --db examples/internal-ops-agent/.plico/plico.sqlite examples/internal-ops-agent
```

## Scaffold

Generate a new internal-ops starter:

```sh
pnpm --filter create-plico exec create-plico my-plico
```
