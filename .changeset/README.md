# Changesets

Every change a user can see needs a changeset: a small Markdown file that becomes a line in the release notes. Run `pnpm changeset`, pick the packages, pick the bump, and write one or two sentences for the people who install Plico.

All seven published packages share one version (`fixed` in `config.json`), so any bump moves them together. While Plico is `0.x`, use `minor` for a breaking change and `patch` for everything else. Changes to tests, CI, docs and other files nobody installs need no changeset.

See `docs/releasing.md` for how a release reaches npm.
