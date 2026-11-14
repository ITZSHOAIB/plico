# Releasing

All seven published packages share one version: `@plico-ai/contracts`, `@plico-ai/sdk`, `@plico-ai/core`, `@plico-ai/runtime`, `@plico-ai/server`, `@plico-ai/cli` and `create-plico`. `@plico-ai/studio` and `@plico-ai/docs` are private and never published.

## How a release works

1. **Every user-visible change adds a changeset.** Run `pnpm changeset`, pick the packages and the bump, and write one or two sentences for the people who install Plico. While Plico is `0.x`, use `minor` for a breaking change and `patch` for everything else. Tests, CI, docs and other files nobody installs need none.
2. **The Release workflow keeps a "Version Packages" pull request open.** On every push to `main` it runs `changeset version`, which bumps all seven packages together, writes each package's `CHANGELOG.md` from the changesets, and deletes the changeset files. The pull request shows exactly what will ship.
3. **Merging that pull request approves the release and starts publishing automatically.** After reviewing the versions and changelog and waiting for CI to pass, merge the pull request. The `publish` job builds, installs the packed tarballs into an empty project (`pnpm smoke:tarballs`), publishes every package whose version is not on npm yet, and creates one `vX.Y.Z` GitHub release with the changelog as its notes.
4. **A failed publish can be run again.** Start the Release workflow by hand from `main` (Actions, Release, Run workflow). `scripts/publish-packages.mjs` skips versions already on npm, so it only sends what is missing.

CI runs the publish script with `PLICO_PUBLISH_DRY_RUN=1` on every pull request, so a broken pack or manifest shows up before a release.

npm publishes with trusted publishing: the job asks npm for a short-lived token with its GitHub identity, so no npm token is stored in the repository, and npm attaches a provenance statement linking each package to the commit and workflow that built it.

## One-time setup

These steps need the npm and GitHub account owners. Do them once, before the first Version Packages pull request is merged.

1. **Reserve the six scoped names.** npm only lets you configure trusted publishing for a package that already exists. Publish a placeholder `0.0.0-reserved.0` for each of `@plico-ai/contracts`, `sdk`, `core`, `runtime`, `server` and `cli` with `npm publish --access public --tag reserved`. `create-plico` already has one.
2. **Add a trusted publisher to each of the seven packages** on npmjs.com (package, Settings, Trusted Publisher, GitHub Actions): organization or user `ITZSHOAIB`, repository `plico`, workflow filename `release.yml`, environment `npm-publish`.
3. **Create the `npm-publish` environment** (repository Settings, Environments) and limit it to the `main` branch. Leave required reviewers disabled: merging the Version Packages pull request is the release approval. If the environment already has required reviewers configured, remove them to enable automatic publishing after merge.
4. **Allow Actions to open pull requests** (repository Settings, Actions, General, Workflow permissions): tick "Allow GitHub Actions to create and approve pull requests". Without it the Version Packages pull request fails with "GitHub Actions is not permitted to create or approve pull requests".
5. **Optional: add a `RELEASE_TOKEN` secret**, a fine-grained personal access token with contents and pull requests write on this repository. Without it the Version Packages pull request is opened with the default token, and GitHub does not run CI on pull requests opened that way. You can still merge it, but its checks never run.
