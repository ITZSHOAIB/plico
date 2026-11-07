# File tools and artifact access patterns

**Date:** 2026-11-07  
**Purpose:** Research implementation patterns relevant to the next #142 slice: `list_files`, `read_file`, `write_file`, `edit_file`, and access gating. This supplements [0009](0009-virtual-filesystem-agent-tools.md)'s broader VFS survey and [0012](0012-artifact-tools-need-and-direction.md)'s product decision; it does not reopen their approved scope.

## Plico boundary

Audit 0012 has already selected four text tools over the artifact workspace, writes via the staged artifact pathway, and project access values `read-write`, `read-only`, or `off`, narrowed per agent. Therefore the reusable patterns are API ergonomics and enforcement placement. Host-filesystem adapters, shell execution, delete/move/search, extra dependencies, and approval-policy changes are outside this slice. Plico's `ToolDefinition` already has `capabilities`, `approval`, and a handler `artifacts` context; tool gating must be applied before model exposure and checked again on invocation.

## Confirmed implementation choices

- `artifacts.access: "off"` gates the four built-in model-facing artifact tools only. Trusted project TypeScript handlers keep access to `ctx.artifacts`.
- `list_files` uses common glob syntax, including `*`, `**`, `?`, and comma-separated brace alternatives such as `*.{md,txt}`. Numeric/alphabetic brace ranges are outside this slice.
- `list_files` returns at most 100 files by default and supports `glob`, `offset`, and `limit` pagination; entries include path, size, MIME type, and version.
- `read_file` reads one-indexed line ranges and caps each text response at 32 KiB. Binary artifacts return metadata only. `write_file` and `edit_file` cap resulting content at 1 MiB; MIME type is inferred from the extension or can be supplied explicitly.

The current lockfile includes `picomatch@4.0.4` transitively through Vite and lint-staged, but `@plico/runtime` does not declare it. Declare Picomatch directly in the runtime package and use its matcher API to filter the already-materialized artifact paths; do not use a filesystem traversal/globbing API for this virtual workspace. Its MIT implementation supports wildcards, globstars, and comma-separated brace alternatives without filesystem traversal. The selected VFS contract omits numeric/alphabetic brace ranges, which Picomatch does not expand. ([Picomatch README](https://github.com/micromatch/picomatch/blob/master/README.md))

## Useful primary-source patterns

### Cloudflare Computer: tool API separated from workspace storage

Cloudflare exposes `read`, `ls`, `find`, `grep`, `write`, `edit`, and `delete` over a persistent workspace, and adapters the same tool family to multiple harnesses. Its interface guidance recommends root-relative resolution with refusal outside root, read continuation offsets for bounded context, and edits evaluated against the original file contents. `readonly: true` allows read/search tools without mutation tools. ([tool interface](https://github.com/cloudflare/computer/blob/main/docs/09_tool_interface.md), [filesystem docs](https://developers.cloudflare.com/agents/tools/filesystem/))

**Applicable:** keep Plico schemas/handlers independent of storage and route every mutation to `ctx.artifacts`; bound file/list output; treat `edit_file` replacements as exact, unique matches and return the resulting diff or a clear mismatch. Plico's initial four-tool contract can omit Cloudflare's search/delete/exec capabilities.

### OpenCode: permissions combine tool family and path rules

OpenCode's documented `permission` config takes `allow`, `ask`, or `deny`; its `edit` permission groups `write`, `edit`, and `apply_patch`, while `read` is separately controlled. Read/edit and related permissions can also use path patterns. The model-facing `edit` tool is exact-string replacement. ([tool docs](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/tools.mdx), [agent permissions](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/agents.mdx), [repository license](https://github.com/anomalyco/opencode))

**Applicable:** group mutations under one access decision (`read-write` vs `read-only`), and keep any later path-level rules distinct from tool visibility. Plico's current 0012 policy is only project/agent scope, so path-pattern configuration is not a requirement for this slice.

### Deep Agents: visibility is not enforcement

Deep Agents constructs its visible tool set from middleware and profiles, but documents filesystem permissions as runtime path policy: a tool can remain visible and still be denied when called. Its `FilesystemPermission` supports `read`/`write` operations, path patterns, and `allow`, `deny`, or `interrupt`; rules are first-match, and path checks include symlink-resolved targets. It also explicitly says these permissions live in tool middleware, so direct backend calls do not inherit them. ([architecture](https://github.com/langchain-ai/deepagents/blob/main/libs/ARCHITECTURE.md), [permission definition](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/middleware/filesystem.py), [construction docs/source](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/graph.py), [license](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/pyproject.toml))

**Applicable:** implement access at the Plico tool boundary, not only by removing tools from the model request. Filter disabled built-ins from the provider tool list and reject a direct/forged invocation using the same resolved policy. Since Plico's artifact interface is already confined to its own workspace, host path/symlink defenses are not the same concern; path validation still belongs in that artifact boundary.

### MCP filesystem server: read-only means omission plus rejection

The MCP filesystem server's `--read-only` mode registers only tools annotated `readOnlyHint: true`; write/edit are absent from discovery and direct calls fail as unknown tools. Its API uses `write_file(path, content)` for full replacement and `edit_file(path, edits)` for text replacements. Its README also warns that path allow-lists do not stop writes through hard links, and describes non-atomic in-place overwrite behavior. ([README/API and security notes](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md))

**Applicable:** omission from model-visible tools improves affordance, but server-side/runtime refusal is the enforcement check. Plico's event-backed staged writes avoid this server's in-place host mutation issue. The repository currently documents a license transition: existing contributions remain MIT, new code contributions Apache-2.0; check exact package/version and shipped notices before copying code. ([license statement](https://github.com/modelcontextprotocol/servers/blob/main/README.md), [transition explanation](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3197))

## Slice implications

1. Resolve one effective artifact access mode from project config and agent frontmatter, with agent settings allowed only to narrow, as decided in 0012.
2. For `off`, expose none of the artifact tools; for `read-only`, expose only `list_files` and `read_file`; for `read-write`, expose all four. Refuse disallowed invocations at runtime too, including calls submitted outside the normal model discovery path.
3. Keep mutations behind `ctx.artifacts` so `write_file` and `edit_file` receive staged, replay-safe event commits. Do not directly mutate project files or append artifact events from the handler.
4. Bound text reads and listings to protect model context. `edit_file` should be deterministic: exact-match replacement, with ambiguity/missing-match failure and an inspectable result.
5. Keep access separate from approval. The accepted direction allows artifact writes without approval by default because versions can be restored; existing tool approval policy remains independently enforceable.

These are implementation implications of already-accepted 0012 decisions and the confirmed choices above. A direct glob-matching dependency is the likely smallest reuse; do not rely on Vite's transitive dependency.

## License notes

| Source | License observed in primary source | Reuse note |
| --- | --- | --- |
| Cloudflare Computer | MIT, per repository `LICENSE` | Patterns/API are useful; verify package version and notices before code reuse. |
| OpenCode | MIT, per repository `LICENSE` | Verify current file/package before copying implementation. |
| Deep Agents | MIT, per package `pyproject.toml` | Python implementation; API pattern only is relevant to TS. |
| MCP servers | Existing code MIT; new contributions Apache-2.0 per current notice | Mixed provenance; inspect exact files and distribution notices before copying. |

License observations are orientation, not legal advice; check the exact package release and files before adopting code.
