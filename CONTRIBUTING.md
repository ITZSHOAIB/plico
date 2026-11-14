# Contributing to Plico

Plico is a pnpm monorepo of ESM TypeScript packages. `AGENTS.md` holds the working rules (small vertical slices, tests through public surfaces, docs updated in the same change). Work is tracked as epics in [GitHub Issues](https://github.com/ITZSHOAIB/plico/issues).

## Set up

Plico needs Node 22.18 or later (CI tests 22.18 and 24) and `pnpm`. Runs are stored with Node's built-in `node:sqlite`, which Node still marks experimental; the `plico` command hides that warning, and a host that embeds Plico sees it once at startup.

```sh
pnpm install
pnpm build
```

## Check your change

```sh
pnpm exec vitest run <test files>   # focused behavior
pnpm check                          # lint, build, typecheck and test: the CI gate
```

Build before typecheck: packages resolve each other through `dist`.

CI also installs the packed tarballs into an empty project on Linux and Windows and runs `plico --version`, `create-plico`, `plico validate`, and `plico serve --studio` against them. To run the same check locally, build first, then:

```sh
pnpm smoke:tarballs
```

A change people who install the packages can see needs a changeset (`pnpm changeset`). See [docs/releasing.md](docs/releasing.md).

Pull requests run validation and packed-install smoke checks on Linux and Windows, on Node 22.18 and 24. `CI required` summarizes the matrix results. Pushing another commit cancels the previous PR checks; main checks and release jobs are preserved. Fork PRs use read-only workflow permissions and may need the maintainer to approve their first workflow run.

Merging a normal PR does not publish a package. After main CI passes, Changesets collects pending release notes in a Version Packages PR. Merging that PR is the release approval; successful main CI then starts publishing automatically.

## Try the example

```sh
pnpm --filter @plico-ai/cli exec plico validate examples/internal-ops-agent
pnpm --filter @plico-ai/cli exec plico run --dry --script examples/internal-ops-agent/evals/smoke.script.json examples/internal-ops-agent
pnpm --filter @plico-ai/cli exec plico serve --studio examples/internal-ops-agent
```

Add `--persist` to a dry run, then `plico runs` and `plico events <run-id>` replay it from the event log.

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/contracts` | Wire types only |
| `packages/sdk` | `defineConfig` and `defineTool` |
| `packages/core` | `loadProject` and `validateProject` |
| `packages/runtime` | The run loop, event store and persistence |
| `packages/server` | The HTTP API and `createPlico` |
| `packages/cli` | The `plico` command |
| `packages/studio` | The bundled web UI (private) |
| `packages/create-plico` | The project scaffold |
| `packages/docs` | The website: homepage and docs (private) |
| `examples/` | The internal-ops agent and an Express host |

Dependencies point one way: contracts, sdk, core, runtime, server, cli. Studio depends on contracts only.

## Docs and website

The website is a Fumadocs Next.js static export on Cloudflare Pages at `plico.sohab.dev`. Write docs pages as MDX in `packages/docs/content/docs` and list them in its `meta.json`; the homepage is `packages/docs/app/(home)`. Run `pnpm --filter @plico-ai/docs dev` to preview both.

The docs are agent-readable: `/llms.txt` indexes every page, `/llms-full.txt` holds them all, each page has a plain Markdown version at `/llms.mdx/docs/<page>/content.md`, and `Accept: text/markdown` on a docs URL returns that Markdown. See [docs/cloudflare-pages.md](docs/cloudflare-pages.md) for the Pages settings and manual deployment.

## Formatting and hooks

Biome formats and lints (`pnpm format`, `pnpm lint`). Husky runs `lint-staged` on commit, so staged JS, TS and JSON files are checked before they land.
