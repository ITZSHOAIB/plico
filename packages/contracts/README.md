# @plico/contracts

Types-only contracts shared by every Plico package and surface: project/validation results, native events, run results, artifacts, eval results, readiness reports and composed instructions.

Rules:

- No runtime code and no dependencies. Everything is `export type`.
- Packages import these types instead of redefining them (Studio, the server, the CLI and the future React kit all consume the same shapes).
- Changing a shape here is a public contract change; add versions explicitly.
