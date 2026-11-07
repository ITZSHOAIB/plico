# Virtual filesystem and agent file tools: OSS research

**Date:** 2026-11-07  
**Purpose:** Gather first-party open-source examples to inform a Plico discussion about agent-callable file/workspace capabilities. This is landscape research, not an epic specification or a recommendation to adopt a dependency.

## Plico starting point

Plico already models artifacts as a versioned virtual filesystem: writes are represented in the canonical event stream, snapshots preserve workspace state, and runtime projections can reconstruct prior versions. See [ADR 0002](../adrs/0002-events-persistence-and-artifacts.md) and the current [artifact contracts](../../packages/contracts/src/artifacts.ts) and [artifact events](../../packages/contracts/src/events.ts). So the design question is not simply “how to add file storage”; it is which agent operations and boundaries should sit over the existing artifact workspace.

## Relevant OSS patterns

### AgentFS — durable, auditable agent filesystem

[AgentFS](https://github.com/tursodatabase/agentfs) is the closest conceptual match: a SQLite-backed agent filesystem with TypeScript, Python, and Rust SDKs. Its spec combines an insert-only tool-call audit trail, a Unix-like virtual filesystem, and a key-value store; its README emphasizes recording file operations/tool calls, snapshotting by copying the database, and portability. The repo labels the project beta and its license MIT. ([README](https://github.com/tursodatabase/agentfs), [spec](https://github.com/tursodatabase/agentfs/blob/main/SPEC.md))

**Useful inspiration:** filesystem operations as inspectable state transitions; snapshot/restore as a simple reproducibility primitive; a clear API around `readFile`, `writeFile`, and `readdir`. **Caution:** Plico already has an event log and artifact projections, so importing AgentFS’s storage/audit model wholesale risks duplicating those responsibilities. AgentFS itself describes the filesystem as complementary to execution sandboxes: it captures state/history, while a sandbox answers execution isolation questions. ([README](https://github.com/tursodatabase/agentfs))

### Vercel `just-bash` and `bash-tool` — in-memory and overlay workspace choices

[`just-bash`](https://github.com/vercel-labs/just-bash) is a TypeScript bash interpreter backed by pluggable filesystems. The documented choices include an in-memory filesystem, an overlay that reads a real directory but keeps writes in memory, direct read/write access to a selected directory, and mountable combinations. State in the filesystem persists across `exec()` calls while shell state resets. Its README marks it beta; the package license is Apache-2.0. ([README](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md), [package metadata](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/package.json))

The [`bash-tool`](https://github.com/vercel-labs/bash-tool) package exposes a just-bash sandbox through an AI SDK tool and can seed initial files. This is useful if Plico later wants a shell-like bulk editing capability rather than many narrow operations. Its repo states MIT. ([README](https://github.com/vercel-labs/bash-tool))

**Useful inspiration:** separate the guest-visible workspace from host storage; use copy-on-write overlays for safe experiments; make network and additional runtimes opt-in; mount read-only knowledge alongside a writable workspace. **Caution:** `just-bash` explicitly says it has no VM isolation and recommends a real VM for arbitrary binary execution. Its threat model assumes the embedding host and injected commands are trusted. A virtual filesystem is a file-access boundary, not automatically a process sandbox. ([Security model](https://github.com/vercel-labs/just-bash/blob/main/THREAT_MODEL.md), [README](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md))

### MCP reference filesystem server — conventional operation vocabulary and confinement lessons

The [MCP filesystem server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) provides tools for reading text/media, reading multiple files, writing/appending/editing files, listing/searching directories, creating directories, moving files, and inspecting metadata. Its tools include annotations that communicate read-only, idempotent, and destructive properties. It supports a read-only mode and restricts paths to configured allowed directories. The server is MIT-licensed. ([README](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md))

**Useful inspiration:** users understand a small set of explicit operations; classify operations by effect; make read-only capability selection enforceable at the tool-registration layer; return file content as a resource when appropriate rather than always embedding it in a tool result. **Caution:** this server manipulates the real host filesystem, unlike Plico’s artifact workspace. Its own README documents path-based confinement limitations, including hard links: writing a path inside the allowed tree may mutate content visible through another hard-link name outside it. A recent security advisory also documents a case-variant path bypass on case-insensitive filesystems; version and threat model therefore matter. ([README](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md), [advisory](https://github.com/modelcontextprotocol/servers/security/advisories/GHSA-4gxg-m5jx-9j57))

### LangChain FileManagementToolkit — choose a least-privilege tool subset

LangChain’s [FileManagementToolkit](https://github.com/langchain-ai/langchain-community/blob/main/libs/community/langchain_community/agent_toolkits/file_management/toolkit.py) wraps local read/write/list/search/move/copy/delete operations and accepts a root directory and selected tool list. Its source security notice recommends restricting the root, limiting available operations, and using OS permissions or a container for stronger isolation. ([toolkit source](https://github.com/langchain-ai/langchain-community/blob/main/libs/community/langchain_community/agent_toolkits/file_management/toolkit.py))

**Useful inspiration:** a filesystem capability need not expose every operation; the app should grant only the subset intended for the agent. **Caution:** it is Python/framework-specific, and its local filesystem tools are not a Plico event-backed artifact store. Repository license is MIT. ([repository](https://github.com/langchain-ai/langchain-community))

### E2B — remote execution workspace API

E2B’s [JavaScript SDK](https://github.com/e2b-dev/E2B) provides filesystem operations inside an isolated sandbox, including file reads/writes, directory listing, rename/remove, and watching for changes. This models a remote execution environment, not a local-first artifact abstraction. The repository is Apache-2.0 licensed. ([SDK filesystem source](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/filesystem/index.ts), [repository license](https://github.com/e2b-dev/E2B))

**Useful inspiration:** streaming, multi-file operations, cancellation/timeouts, and file-change watching matter when tools interact with running processes. **Caution:** this adds a remote sandbox/runtime boundary and service dependency; it appears better suited to a future execution-sandbox integration than a first local artifact-tool slice.

### Vercel AI SDK — tool contract mechanics

The [AI SDK tool-calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) describe tools as typed input schemas with descriptions and optional execution functions; execution errors are returned as tool errors, and tools can carry examples and approval settings. This is not a filesystem implementation, but it is a relevant first-party TypeScript pattern for exposing a cohesive tool surface.

## Cross-cutting observations

1. **“Filesystem” names at least three different capabilities:** (a) a virtual artifact workspace with evented/versioned content, (b) host project-file access, and (c) a process/container sandbox filesystem. The cited projects cover different choices; their APIs are not interchangeable.
2. **For Plico’s file-first/local-first contract, the artifact workspace is the natural default candidate.** A host-project adapter or remote sandbox can remain a distinct integration with explicit permissions rather than silently becoming the meaning of artifact tools.
3. **Small, structured tools are a practical starting point:** read/list/search plus write/edit, with explicit paths and effect semantics. A shell tool is more expressive and useful for bulk work, but opens a larger execution/security surface.
4. **Versioning and eventing should build on Plico’s existing source of truth.** AgentFS reinforces the value of operation history/snapshots, but Plico already has evented artifact writes; the useful question is whether tools need previews, diffs, conditional writes, or richer event metadata.
5. **Virtual does not mean safe by itself.** Define the root/path model, symlink policy, path normalization, file size limits, binary handling, and whether concurrent host mutations are in scope. If executing arbitrary code, use a process/VM/container boundary instead of relying on path filtering.
6. **Effect metadata can improve both safety and UX.** MCP’s read-only/idempotent/destructive annotations provide a vocabulary for tool discovery and gating; they do not replace runtime enforcement.

## Questions to resolve in brainstorming

- Are proposed tools for the Plico artifact workspace, the developer’s checked-out project, or an execution sandbox? Which should be in the first epic?
- Should agents edit text only, or also create binary assets? How should content be returned: inline, bounded excerpts, or artifact references?
- Is write modeled as whole-file replacement, patch/edit operations, or both? Should writes support expected-version/hash checks to avoid lost updates?
- Which observation operations matter first: list, glob, search by name, search in content, metadata, diff, preview?
- Should multiple tools/runs share a workspace, and if so, what is the run/session boundary and snapshot policy?
- What read/write/delete capabilities can project authors grant per tool? Are destructive actions represented in tool metadata, enforced by policy, or both?
- Is shell-like code execution explicitly out of scope for the file-tools epic, or is it the main desired workflow?

## Sources and license notes

| Project | Primary source | License checked | Scope note |
|---|---|---|---|
| AgentFS | [Repository](https://github.com/tursodatabase/agentfs), [spec](https://github.com/tursodatabase/agentfs/blob/main/SPEC.md) | MIT | Beta; persistent SQLite agent FS/audit trail |
| just-bash | [README](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md), [package metadata](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/package.json), [threat model](https://github.com/vercel-labs/just-bash/blob/main/THREAT_MODEL.md) | Apache-2.0 | Beta; in-process virtual bash/filesystem |
| bash-tool | [Repository and README](https://github.com/vercel-labs/bash-tool) | MIT | AI SDK tool wrapper for a sandbox |
| MCP filesystem server | [README](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md), [security advisory](https://github.com/modelcontextprotocol/servers/security/advisories/GHSA-4gxg-m5jx-9j57) | MIT | Host filesystem operations with allow-listing |
| LangChain community | [Toolkit source](https://github.com/langchain-ai/langchain-community/blob/main/libs/community/langchain_community/agent_toolkits/file_management/toolkit.py), [repository](https://github.com/langchain-ai/langchain-community) | MIT (repository) | Python local filesystem toolkit |
| E2B | [SDK filesystem source](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/filesystem/index.ts), [repository](https://github.com/e2b-dev/E2B) | Apache-2.0 | Remote sandbox filesystem |
| Vercel AI SDK | [Tool calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) | Apache-2.0 (repository) | Generic typed tool contract, not a filesystem |

License notes are repository/package-level orientation, not legal advice; verify the exact package and version before copying or depending on code.

## Follow-up: harness tool sets for a virtual workspace

### OpenCode — useful agent-tool ergonomics, host filesystem backend

OpenCode's first-party file tools are `read`, `glob`, `grep`, `edit`, and `write`; the docs describe `read` as file reading or a non-recursive directory listing, `glob` as path discovery, `grep` as content search, `edit` as unique exact-text replacement, and `write` as full-file create/replace (creating parent directories). For supported GPT models, `patch` can add, update, move, or delete multiple files. Reads are paginated and bounded (up to 2,000 lines / 50 KiB per page), and results can include image/PDF attachments. Permissions attach to normalized path/pattern resources. ([Tool docs](https://github.com/anomalyco/opencode/blob/dev/services/www/src/docs/content/tools.mdx), [read tool source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/read.ts), [edit source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/edit.ts))

**Plico inspiration:** the model-facing set can favor task-oriented operations over exposing every low-level syscall; bounded reads and search result caps protect context; `edit` returning a diff makes mutations inspectable. OpenCode's backend is the local filesystem, so its path permissions are not the same as Plico's run-scoped VFS.

### Cloudflare `@cloudflare/computer` — virtual workspace with harness adapters

Cloudflare's Computer package provides a persistent Workspace backed by SQLite storage and a `workspace.fs` API. Its model-facing tools are `read`, `ls`, `find`, `grep`, `write`, `edit`, and `delete`; directory listing is paginated, read/write support limits and binary/stream forms, and edits return diffs. The same workspace tools have adapters for AI SDK, Pi, and OpenCode. The docs also describe read-only mode that offers only read/search operations. ([Workspace tool docs](https://developers.cloudflare.com/agents/tools/filesystem/), [tool interface design](https://github.com/cloudflare/computer/blob/main/docs/09_tool_interface.md), [workspace README](https://github.com/cloudflare/computer/blob/main/packages/computer/README.md))

**Plico inspiration:** keep the virtual workspace backend and tool definitions conceptually separate; adapt the same schemas to Plico's runtime, while ensuring all mutations call the existing artifact/event pathway. The docs' optional `exec` capability is explicitly outside this exploration's scope.

### Implications for Plico's current artifact model

Current Plico artifacts are file entries keyed by path with content, MIME type, version, and hash; writes and snapshots are events. There are no explicit directory, move, copy, or delete artifact events in the current model. ([Artifact contract](../../packages/contracts/src/artifacts.ts), [artifact event contract](../../packages/contracts/src/events.ts))

This means a familiar high-level tool set like `read`, `ls`, `find`, `grep`, `write`, `edit`, `delete` can build over existing files, but faithful `mkdir`, `rename/move`, `copy`, recursive delete, and empty-directory semantics require agreeing what the VFS models and adding corresponding event/projection behavior. A path tree could also infer parent directories from file paths, avoiding explicit empty-directory state in a first slice.
