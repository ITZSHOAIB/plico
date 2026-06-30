# Plico

Plico is a TypeScript-first agent app kit built around local Markdown instructions, skills, tools, evals, memory, and artifacts.

This repo is intentionally narrow in phase one:

- scaffold valid Plico projects
- validate projects with `@plico/core`
- expose validation through `@plico/cli`
- generate the internal-ops starter with `create-plico`

## Repo Layout

- `packages/core` contains the project loader and validator
- `packages/cli` contains the `plico validate [path]` command
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

## Scaffold

Generate a new internal-ops starter:

```sh
pnpm --filter create-plico exec create-plico my-plico
```
