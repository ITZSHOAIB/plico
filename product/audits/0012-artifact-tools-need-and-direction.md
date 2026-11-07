# Artifact workspace tools: need and direction

**Date:** 2026-11-07
**Question:** Does Plico need epic [#140](https://github.com/ITZSHOAIB/plico/issues/140)'s agent file tools? If yes, how should they be designed for Plico?
**Builds on:** [0009](0009-virtual-filesystem-agent-tools.md) surveys open-source virtual filesystems (AgentFS, just-bash and others). [0011](0011-multi-agent-need-and-workflow-shape.md) covers multi-agent workflows (#141).
**Status:** Accepted 2026-11-07. The M1 split, the thread-scoped workspace, the default tool set and `ctx.artifacts` are approved. The M1 work is [#142](https://github.com/ITZSHOAIB/plico/issues/142); [#140](https://github.com/ITZSHOAIB/plico/issues/140) keeps the M2 remainder. "Needs a decision" labels below record the original proposal.

## Answers in short

1. **Do we need them?** Yes, and some sooner than planned.
   - Today **a real agent cannot create an artifact**. Only the scripted eval strategy writes `artifact.file.written` (`packages/runtime/src/run/strategies/scripted.ts:30`). The provider loop never does, and a tool handler receives only `{ signal, idempotencyKey }` (`packages/runtime/src/types/tools.ts:37`).
   - The workspace is built: versions, diffs, export and Studio review all work (README). The PRD calls it "a first-class product surface". Yet no live run can reach it.
   - The M1 demo depends on it. #75's slice "show provider runs, threads, approvals, artifacts, and Studio" needs a live run that writes a file.
2. **Which tools?** A small default set of four text tools whose shapes models already know: `list_files`, `read_file`, `write_file`, `edit_file`. Searching, deleting and moving are opt-in. Copy and stat are not model tools.
3. **Who else writes?** User TypeScript tools, through `ctx.artifacts`. This is where binary files such as CSV, PDF and images should come from. The model should not emit base64.
4. **Direction.** Plico's advantage is not having file tools; every framework has them. It is that every file an agent or tool touches is versioned and diffable, replayable, and visible in Studio. Because a write can always be undone, Plico can leave writes enabled and unapproved by default, a safe default other frameworks cannot offer.

## Evidence

| Source | Model-facing file operations | Takeaway |
|---|---|---|
| [LangChain deepagents](https://docs.langchain.com/oss/javascript/deepagents/backends) | `ls`, `read_file`, `write_file`, `edit_file` (exact match), `glob`, `grep` | Same shape as Claude Code. Pluggable backends: state, filesystem, store, and a composite that routes paths such as `/memories/*`. |
| Claude Code tools | Read, Write, Edit (exact unique replace), Glob, Grep | Widely used tool shape that models are trained on |
| Anthropic memory tool ([SDK impl.](https://repos.supermodeltools.com/anthropic-sdk-python/fn-beta-builtin-memory-tool-py-execute.html), secondary) | view, create, str_replace, insert, delete, rename | Same family over a `/memories` mount; adds delete and rename |
| [Manus context engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) | Sandbox filesystem | "The file system as the ultimate context". Reversible compression: drop content, keep the path. A `todo.md` keeps the goal in attention. |
| [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) | Subagents write to a filesystem | Avoids the "game of telephone" between agents |

No source includes copy or stat as model tools, so those are the sourced cuts; stat folds into the output of `list_files`. Delete and rename appear only in the memory tool. Shapes copy well-known tools but keep Plico-owned names, because AGENTS.md keeps provider-native tool shapes (Anthropic text editor, OpenAI `apply_patch`) out of the contract.

## Why each use needs it

| Use | Needs | When |
|---|---|---|
| An agent produces a report, page or JSON file | `write_file` | M1 (#75 demo) |
| "Revise the report" in a later turn | `read_file`, `edit_file`, plus a workspace that survives between turns | M1/M2 |
| A supervisor passes large work to a specialist by path (#141) | `read_file`, `list_files`, and a shared workspace | #141 |
| An agent keeps notes or a plan outside its context window (Manus) | `write_file`, `edit_file` | Comes free |
| A deterministic tool exports a CSV or renders a PDF | `ctx.artifacts.write` | M1/M2 |
| Searching many inputs or files from other agents | `search_files` | #141, or once input files exist |

## Design

### Tools offered to the model

| Tool | Behaviour |
|---|---|
| `list_files` | Optional glob pattern. Returns path, size, MIME type and version, so it replaces `stat` and `find`. Directories are inferred from paths. |
| `read_file` | Line `offset`/`limit` and a byte cap. A binary file returns its metadata plus a short note, never base64. |
| `write_file` | Creates or overwrites a text file and returns `{ path, version }`. The MIME type is inferred from the extension and can be overridden. |
| `edit_file` | Exact `old` → `new` replacement. Errors on zero or several matches unless `replaceAll` is set. Text files only. |
| `search_files` | Opt-in. Regex over text files, with bounded output. |
| `delete_file`, `move_file` | Opt-in. Both are evented, and earlier versions stay readable. |

The names are reserved. A project tool with the same name fails validation through the existing duplicate-name check.

### Access settings

The settings resolve in three layers:

1. **Project.** `plico.config.ts` sets `artifacts: { access: "read-write" | "read-only" | "off", tools?: [...] }`. The default is `read-write` with the four core tools.
2. **Agent.** Frontmatter `artifacts: read-only | off` can narrow the project setting but never widen it. A read-only researcher is the multi-agent pattern that works (0011).
3. **Approval.** Approval policy stays separate, as #140 already decides. Workspace writes need no approval by default, because every write is versioned and can be restored.

Tools outside the active setting are not offered to the model, and calls to them are refused.

### Writes from TypeScript tools (`ctx.artifacts`)

```ts
handler: async (input, { artifacts }) => {
  const csv = toCsv(await loadTickets(input));
  const { path, version } = await artifacts.write("reports/tickets.csv", csv, { mimeType: "text/csv" });
  return { path, version };
}
```

The API is `read`, `write` (string or `Uint8Array`) and `list`. It is **staged** rather than written straight to the event log.

Why staging is needed: when a step runs again during replay, the run log compares each append against the recorded event and fails if the payload differs (`packages/runtime/src/events.ts:73`). A tool that wrote events directly would make the run fail when recovered whenever its output changes, for example because of a timestamp.

How staging works:

- Writes stay in memory while the handler runs and return the version they will receive.
- They are committed together after the step records its result, appended next to `tool.result`.
- Built-in `write_file` uses the same path, so there is one write mechanism.

Adding `artifacts` to the tool context changes the public tool contract, so it follows ADR 0006.

### Content

Storage is byte-safe: BLOBs addressed by content hash, MIME type as metadata, and any file type allowed. This is #140's first slice and it stays as planned. Model-facing tools handle text only, and binary content arrives through `ctx.artifacts` and later uploads. This settles #140's open question about binary transfer format: there is none in this epic. Sending images to multimodal models as provider-native attachments is a later addition.

### Workspace scope

- **Approved:** a run's workspace belongs to the **root run**, so the children of a supervisor or workflow share it (#141).
- **Proposed, needs a decision:** when a run belongs to a thread, the workspace belongs to the **thread**, so the next turn can read and edit the previous turn's files.
  - Threads allow one active run at a time (`thread.busy`, `packages/server/src/routes/threads.ts:86`), so versions across runs cannot race.
  - Write events stay in run streams, as ADR 0007 requires. The thread workspace is computed from the thread's runs in order.
  - Versions must then come from that combined history instead of the per-run counter in `scripted.ts`.
  - This changes the wire contract (ADR 0006). It needs a `GET /v1/threads/:id/workspace` endpoint, or run workspaces that show files inherited from earlier runs. Each version still records the run and agent that wrote it.

### Later: one file-tool family over several mounts

The same tools can later address more than the workspace, as deepagents' composite backend does:

- `memory/` for the Memory epic #78. Anthropic's memory tool shows models already handle a memory filesystem.
- A read-only `inputs/` for uploaded files.

Paths stay relative to the workspace in this epic; nothing here should prevent adding mounts.

## Proposed changes

**To #140:**

1. *Needs a decision:* **Split the milestone.** Move a minimum write path to M1, or make it a slice of #75: byte-safe storage, the four core tools, and access settings at project level. Copy, move, delete and search stay in M2.
2. **Default tool set.** Offer the four core tools by default and make `search_files`, `delete_file` and `move_file` opt-in. Remove `copy`, `stat` and `find` as model tools: `stat` and `find` fold into `list_files`, and copy has no demonstrated need. All operations still exist in the storage contract, so the epic's scope stays.
3. **`ctx.artifacts` for tool code** with staged commits. This is a public tool-contract addition.
4. **Default access** is `read-write` with no approval; approval policy can still require it.
5. **Workspace scope**, *approved:* the root run. *Proposed:* the thread when one exists.
6. **Per-agent narrowing** from frontmatter (#141).
7. **Agent attribution.** Artifact events record the writing run and agent, so Studio can show who wrote each version.
8. **The open binary-transfer question is resolved:** text-only model tools, bytes through code.

**To #141:** the artifact open detail points to this audit's scope and narrowing rules, and the frontmatter gains the `artifacts` field.

## Implementor prompt

```text
You are implementing the first slice of epic #142 (Live agents write artifacts, M1) in D:\projects\plico.
Read AGENTS.md, product/audits/0009-virtual-filesystem-agent-tools.md,
product/audits/0012-artifact-tools-need-and-direction.md, ADRs 0002, 0006, 0007, 0008, and the current code in
packages/contracts/src/artifacts.ts, packages/runtime/src/artifacts.ts, packages/runtime/src/events.ts,
packages/runtime/src/run/strategies/{provider,scripted}.ts, packages/runtime/src/types/tools.ts.

All decisions in audit 0012 are accepted. Test-first through public surfaces:
0. Write an ADR for workspace scope (thread workspace when the run has a thread, else root run's), staged
   writes, and the artifact/tool-context contract changes.
1. Binary-safe artifact content: content as bytes with MIME + hash, SQLite BLOB storage, existing text artifacts
   and replay still work. Update the contract snapshot deliberately (ADR 0006).
2. One staged write path used by both the provider loop and tools: writes are buffered during a step and
   appended as artifact.file.written events after the step result is recorded, so replay never re-appends.
3. Do not add model-facing tools in this slice; they come next (list_files, read_file, write_file, edit_file,
   gated by artifacts.access in plico.config.ts, names reserved via the duplicate-name check).
Update README and packages/website docs for any behaviour change. Run pnpm check. One PR, "Part of #142".
```

## Sources

- LangChain, [Deep Agents backends](https://docs.langchain.com/oss/javascript/deepagents/backends)
- Manus, [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Anthropic memory tool command set, from a secondary SDK listing ([source](https://repos.supermodeltools.com/anthropic-sdk-python/fn-beta-builtin-memory-tool-py-execute.html)); verify against Anthropic's docs before copying parameter names
- Claude Code tool documentation (Read, Write, Edit, Glob, Grep)
