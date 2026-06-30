# @plico/cli

CLI entrypoints for validating Plico projects and running the deterministic dry runtime.

## Commands

- `plico validate [path]`
- `plico validate --json [path]`
- `plico run --dry [path]`
- `plico run --dry --json [path]`
- `plico run --dry --script <file> [path]`

`plico validate` keeps its current behavior. `plico run` is dry-run only in this release and uses the local runtime package for deterministic instruction composition, tool discovery, scripted tool execution, and approval blocking.
