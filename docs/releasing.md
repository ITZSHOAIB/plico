# Releasing

All seven published packages share one version: `@plico-ai/contracts`, `@plico-ai/sdk`, `@plico-ai/core`, `@plico-ai/runtime`, `@plico-ai/server`, `@plico-ai/cli` and `create-plico`. `@plico-ai/studio` and `@plico-ai/docs` are private and never published.

## How a release works

1. **Every user-visible change adds a changeset.** Run `pnpm changeset`, pick the packages and the bump, and write one or two sentences for the people who install Plico. While Plico is `0.x`, use `minor` for a breaking change and `patch` for everything else. Tests, CI, docs and other files nobody installs need none.
2. **After main CI passes, Release keeps a "Version Packages" pull request open.** Changesets bumps all seven packages together, writes each package's `CHANGELOG.md`, and deletes the consumed changesets. Release explicitly starts CI on this branch using the built-in GitHub token; no personal access token or extra workflow approval is needed. Ordinary merges update this PR and do not publish packages.
3. **Merging Version Packages approves the release.** After reviewing the versions and changelog and waiting for PR CI to pass, merge it. Once CI passes on the main merge commit, Release publishes that exact commit. It identifies the merged PR by the repository's `changeset-release/main` branch, so merge, squash and rebase do not depend on a commit title. The `publish` job builds, smoke-checks the packed tarballs, publishes missing package versions, and creates one `vX.Y.Z` GitHub release. There is no second environment approval.
4. **Retry a failed release without bumping versions.** Use "Re-run failed jobs" on the failed Release run. For manual recovery, run Release from `main` and enter the full merge commit SHA of the Version Packages PR in `release_sha`. Recovery requires successful main CI for that SHA and refuses a release superseded by a newer version on main. The publish script skips versions already on npm, so partial releases can be completed safely.

CI runs the publish script with `PLICO_PUBLISH_DRY_RUN=1` on every pull request. It packs and validates every public package, even when the version is already published, without querying which versions exist. Real publishing checks that every public package has the same version and completes all registry checks before sending the first package. Only a registry 404 means a version is missing; network and permission errors stop the release. npm errors appear in the job log.

Release runs are queued, never canceled by a later merge. Superseded PR CI runs are canceled to save contributor time; main CI runs are preserved. The Release run summary explains whether it is preparing a Version Packages PR or publishing a release, and links to the GitHub release when publishing succeeds. A green CI run alone does not mean a version was published; the GitHub release is the completion record.

npm publishes with trusted publishing: the job asks npm for a short-lived token with its GitHub identity, so no npm token is stored in the repository, and npm attaches a provenance statement linking each package to the commit and workflow that built it.

## One-time setup

These steps need the npm and GitHub account owners. Do them once, before the first Version Packages pull request is merged.

1. **Reserve the six scoped names.** npm only lets you configure trusted publishing for a package that already exists. Publish a placeholder `0.0.0-reserved.0` for each of `@plico-ai/contracts`, `sdk`, `core`, `runtime`, `server` and `cli` with `npm publish --access public --tag reserved`. `create-plico` already has one.
2. **Add a trusted publisher to each of the seven packages** on npmjs.com (package, Settings, Trusted Publisher, GitHub Actions): organization or user `ITZSHOAIB`, repository `plico`, workflow filename `release.yml`, environment `npm-publish`.
3. **Create the `npm-publish` environment** (repository Settings, Environments) and limit it to the `main` branch. Leave required reviewers disabled: merging the Version Packages pull request is the release approval. If the environment already has required reviewers configured, remove them to enable automatic publishing after merge.
4. **Allow Actions to open pull requests** (repository Settings, Actions, General, Workflow permissions): tick "Allow GitHub Actions to create and approve pull requests". Without it the Version Packages pull request fails with "GitHub Actions is not permitted to create or approve pull requests".
5. **Protect main with required CI.** Require the validation and tarball smoke matrix checks and dependency review, keep the PR review rule, require resolved review conversations, and prevent deletion and force pushes. Maintainer bypasses should apply only through pull requests. Auto-merge can queue a reviewed PR until its required checks pass. Protect `v*` release tags against deletion and updates; creating a new version tag remains allowed.
6. **Restrict token publishing on npm.** For each package, select "Require two-factor authentication and disallow tokens" in its publishing access settings after verifying trusted publishing works. OIDC publishing remains available. This account setting requires the npm package owner; it cannot be verified from public registry metadata. Do not add an npm token or `RELEASE_TOKEN` secret for this workflow.

## Workflow maintenance

Actions are pinned to full commit SHAs, with weekly grouped Dependabot PRs for Actions and npm dependencies. Dependabot security alerts and grouped security update PRs are enabled. Dependency review rejects newly introduced vulnerabilities of moderate severity or higher, and `CI required` includes that result alongside the matrix. Run `pnpm audit` to inspect the full current dependency tree, including existing advisories.

PR jobs have read-only tokens and do not persist checkout credentials. They run on GitHub-hosted runners, including fork PRs; no `pull_request_target` workflow executes contributor code. Publishing uses the `npm-publish` environment, OIDC and a clean dependency install without restoring a dependency cache.

The release queue uses GitHub's documented [`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) feature, which retains up to 100 waiting runs. Older versions of actionlint do not recognize this field; validate the rest of the workflow with that single unsupported-field diagnostic excluded and verify acceptance through GitHub before merging.
