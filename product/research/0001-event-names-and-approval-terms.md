# Research: event names and approval terms

Ticket #87, child of map #86, for epic #69. This records facts for a later decision. It decides nothing.

- Code and document citations are `path:line` at `d89d6c5` (`origin/main`).
- GitHub issues have no line numbers, so they are cited by issue and section, and quoted.
- Sections 1 to 6 are facts. Section 7 lists options for the owner, without picks.

Short path forms used below:

| Short form | Path |
| --- | --- |
| `contracts/` | `packages/contracts/src/` |
| `runtime/` | `packages/runtime/src/` |
| `server/` | `packages/server/src/` |
| `cli/` | `packages/cli/src/` |
| `studio/` | `packages/studio/src/` |
| `plan-0006` | `product/plans/0006-provider-app-api-agui-react-deployment.md` |
| `plan-0003`, `plan-0004`, `plan-0005` | the matching files in `product/plans/` |
| `prd` | `product/prds/plico-agent-app-kit-prd.md` |
| `adr-000N` | the matching files in `product/adrs/` |
| `audit-0001`, `audit-0003` | the matching files in `product/audits/` |

## 1. Key facts

1. Only two sources name approval events: the code (`approval.required`) and Plan 0006 (`approval.requested`, `approval.approved`, `approval.rejected`). The approvals epic #72 names no events. The PRD and ADRs name no approval events.
2. The rename is the smallest disagreement. The larger ones are the waiting status name, whether `blocked` survives beside it, and what event marks entering or leaving a pause. No source names that event.
3. "Resume" has two meanings. In the PRD and ADRs it always means stream resume, a client reconnecting to a stream. Only Plan 0006, #72, closed #41 and audit 0003 use it for resuming a run.
4. The sources say blocked is terminal for Plans 0003 to 0005 and the code. Plan 0006 and #72 want a resumable pause. Plan 0006 also keeps dry-run blocking, so two approval outcomes may coexist. The PRD does not address it.
5. No stated rule decides naming conflicts. `plan-0006:5` says "where order differs, the epics win", which covers order, not names. #69 itself defers to the Plan on `approval.requested` but uses a different status name from the Plan.

## 2. Event names by source

"No name" means the source does not use the name. "Prose" means it describes the category in words only. #71 and #78 name no event types either; they are covered in the rows they affect.

### 2.1 Run lifecycle

| Event | Code on `main` | Plans | Epics and audits | Disagreement |
| --- | --- | --- | --- | --- |
| `run.started` | `contracts/events.ts:2`, emitted `runtime/run/run-project.ts:47` | Prose "run start" `plan-0003:42` | ADR 0007 adds `threadId` for thread runs `adr-0007:16` | No. Payload grows with #71 |
| `run.completed` | `contracts/events.ts:15`, `run-project.ts:84` | Prose "terminal state" `plan-0003:42` | No name | No |
| `run.failed` | `contracts/events.ts:17`, `run-project.ts:24,93` | Prose "terminal failed events" `plan-0003:76` | No name | No |
| `run.error` | `contracts/events.ts:18`, `run-project.ts:23,92`. Always followed by `run.failed`. Listed as terminal `server/stream.ts:10` | Prose "error and terminal failed events" `plan-0003:76` | #86: with incremental persistence SSE "would close before `run.failed`" | **Yes.** The code treats it as terminal, Plan 0003 does not, and it has no matching status (`contracts/runs.ts:4`) |
| `run.blocked` | `contracts/events.ts:16`, `runtime/run/strategies/provider.ts:98`, `scripted.ts:73`. Terminal `stream.ts:9` | Prose "blocked terminal event" `plan-0003:75`. Keeps dry-run blocking `plan-0006:162` | #88 asks whether it stays, is renamed or goes | **Yes**, see section 4 |
| `run.cancel_requested` | Absent | `plan-0006:153` | #72 "cancelled through API, CLI, and Studio", no name | Code lacks it |
| `run.cancelled` | Absent | `plan-0006:154` | #69 slice 1 adds a cancelled status. `adr-0007:20` says "cancelled run". | Code lacks it. Spelling agrees |
| Entering a pause | `run.blocked` only | Prose "active state changes" `plan-0006:103` | No name | **Gap.** No source names it |
| Leaving a pause | Absent | No name. The decision endpoint is listed at `plan-0006:175`, with no event for the run restarting | No name | **Gap.** No source names it |

### 2.2 Approval and policy

| Event | Code on `main` | Plans | Epics and audits | Disagreement |
| --- | --- | --- | --- | --- |
| `approval.required` | `contracts/events.ts:11`, `provider.ts:93`, `scripted.ts:68` | Prose "approval required" `plan-0003:42` | #69 slice: "Align `approval.required` with the Plan's `approval.requested`". `audit-0003:103` records the mismatch | **Yes** |
| `approval.requested` | Absent | `plan-0006:150` | #69 slice, `audit-0003:103` | **Yes**, as above |
| `approval.approved` | Absent | `plan-0006:151` | #72 "Every decision is an audit event", no name | Code lacks it |
| `approval.rejected` | Absent | `plan-0006:152` | #72, no name. PRD requires "rejected approvals prevent side effects" `prd:198`, no name | Code lacks it |
| Policy decision | Absent | Prose: decisions "visible in events" `plan-0006:221` | Closed #43: allow decisions "emit native events explaining why approval was not required", no name | **Gap.** Only the stale branch names it, see section 6 |

### 2.3 Conversation, memory and artifacts

| Event | Code on `main` | Plans | Epics and ADRs | Disagreement |
| --- | --- | --- | --- | --- |
| `thread.created` | Absent. `run` is the only stream type `contracts/events.ts:20` | `plan-0006:147` | `adr-0007:5,26` (arrives with #71) | No. Not built yet |
| `message.created` | Absent | `plan-0006:148` | `adr-0007:5,20` | No. Not built yet |
| `message.updated` | Absent | `plan-0006:149`, conditional: "if streaming or projection needs it" | Not in ADR 0007, which says live streaming stays on the run stream `adr-0007:20` | Open |
| Memory events | Absent | Prose: "explicit create/update/delete operations" `plan-0006:235` | #78: "Memory reads and writes appear in events". `adr-0007:22`: stay in run streams | **Yes.** #78 includes reads, Plan 0006 and closed #45 do not. No names exist |
| `artifact.workspace.created` | `contracts/events.ts:12`, `scripted.ts:27` | `plan-0005:37` | #73 slice "Define artifact events and link writes to runs" | Agree today. #73 may reopen them |
| `artifact.file.written` | `contracts/events.ts:13`, `scripted.ts:32` | `plan-0005:38` | As above | As above |
| `artifact.snapshot.created` | `contracts/events.ts:14`, `scripted.ts:40` | `plan-0005:39` | As above | As above |

### 2.4 Execution events in code, prose only in documents

| Event | Code on `main` | Documents | Disagreement |
| --- | --- | --- | --- |
| `instructions.composed` | `contracts/events.ts:3`, `run-project.ts:54` | Prose `plan-0003:42` | No |
| `tools.discovered` | `contracts/events.ts:4`, `run-project.ts:61` | Prose `plan-0003:42` | No |
| `input.received` | `contracts/events.ts:5`, `provider.ts:21` | Prose "user input" `plan-0006:103` | No |
| `model.request` | `contracts/events.ts:6`, `provider.ts:45` | Prose `plan-0006:103` | No |
| `model.response` | `contracts/events.ts:7`, `provider.ts:53` | Prose `plan-0006:103` | No |
| `assistant.output` | `contracts/events.ts:8`, `provider.ts:62`, `scripted.ts:20`, `default-dry.ts:9` | Prose `plan-0003:42`. "assistant deltas or messages" `plan-0006:103` | Open: no delta event exists, and #70 wants output "as events" |
| `tool.call` | `contracts/events.ts:9`, `provider.ts:78`, `scripted.ts:54` | Prose `plan-0003:42` | No |
| `tool.result` | `contracts/events.ts:10`, `provider.ts:116`, `scripted.ts:81` | Prose `plan-0003:42` | No |
| Usage | No event. Carried in the `model.response` payload `provider.ts:55` | Prose "usage" `plan-0006:103` | Open: no separate event, and no name |

### 2.5 The PRD and ADRs

The PRD and ADRs 0002, 0003 and 0006 name no individual event types. They set rules:

- `prd:134` and `adr-0002:5`: the native event model is a versioned public contract.
- `prd:136` and `prd:190`: Plico has "terminal events", not enumerated.
- `prd:180`: minor changes should be additive.
- `adr-0002:16`: approval records are projections of the log, not separate histories.
- `adr-0003:5` and `prd:175`: a runtime policy engine decides approvals.
- `adr-0006:16`: "Removing or renaming a field, or changing its type or meaning, is breaking".
- `adr-0006:5`: until first publish `/v1` "may still change freely", and saved records carry their own `schemaVersion`.
- ADR 0007 is the only ADR that names event types.

ADR 0006 speaks of fields. It does not literally cover event type values. Separately, `plan-0006:104` asks that event changes stay additive "unless a schema version bump is unavoidable", which a rename is not. Map #86 notes nothing is published.

### 2.6 Non-event terms

| Concept | Terms in use | Sources |
| --- | --- | --- |
| Paused status | `waiting_for_approval` | `plan-0006:102`, introduced with "such as" |
| | `waiting` | #69 slice 1 and outcome, `audit-0003:98`, #88 |
| | "durable waiting-for-approval state" | Closed #41 |
| | `blocked` | `contracts/runs.ts:4` |
| The gate on a tool | `approval.required` as a declaration field | `runtime/types/tools.ts:9`, `runtime/tools/normalize.ts:29,43` |
| Decision words | approve / reject as verbs | `plan-0006:134` |
| | `approved` / `rejected` in event names | `plan-0006:151-152` |
| Decision endpoint | `POST /v1/runs/:runId/approvals` | `plan-0006:175`, closed #41 ("or an equivalent native endpoint") |

The tool declaration field and the event share the text `approval.required` but are different things. The field is at `normalize.ts:29,43`, `provider.ts:92`, `scripted.ts:67` and `examples/internal-ops-agent/tools/create-ticket.tool.ts:13`. A rename of the event does not require renaming the field, and a text replace would hit both. The `create-plico` scaffold contains no approval metadata.

Naming shapes in use: `model.request`/`model.response` and `tool.call`/`tool.result` are nouns, `run.completed` and `approval.approved` are past tense, `run.cancel_requested` uses a snake_case segment, and `approval.required` is an adjective. No document states a naming rule.

## 3. What must change

### 3.1 `approval.required` to `approval.requested`

Change these event sites:

| File | Lines |
| --- | --- |
| `contracts/events.ts` | 11 |
| `runtime/run/strategies/provider.ts` | 93 |
| `runtime/run/strategies/scripted.ts` | 68 |
| `cli/format/run.ts` | 49, 50 |
| `studio/components/EventList.tsx` | 67 |
| `runtime/index.test.ts` | 375, 609, 621, 958 |
| `cli/cli.test.ts` | 486 |
| `studio/App.test.tsx` | 44 |

These stay unless the owner wants the wording changed:

- The field reads at `provider.ts:92` and `scripted.ts:67`, and everything else in section 2.6.
- The Studio summary text `EventList.tsx:67` and its assertion `App.test.tsx:190`.
- `server/stream.ts`, which never mentions this event.
- `audit-0003:103`, which is a dated record.

`server/v1-contract.snap` does not change. It stores `"type": "string"` (`v1-contract.snap:28`), and the fixture has no approval run (`server/contract.test.ts:93-98`). The snapshot gives no protection for event names or status values.

### 3.2 If `run.blocked` is renamed or removed

| File | Lines | Note |
| --- | --- | --- |
| `contracts/events.ts` | 16 | Type |
| `runtime/run/strategies/provider.ts` | 98-99 | Includes payload `status: "blocked"` |
| `runtime/run/strategies/scripted.ts` | 73-74 | Includes payload `status: "blocked"` |
| `server/stream.ts` | 9 | Terminal list |
| `cli/format/run.ts` | 54-55 | Prints "run.blocked: approval required" |
| `runtime/index.test.ts` | 376, 610, 625, 959 | Tests |
| `cli/cli.test.ts` | 487 | Test |
| `server/index.test.ts` | 554 | Regex of terminal events |

### 3.3 If status `blocked` is renamed or removed

| File | Lines | Note |
| --- | --- | --- |
| `contracts/runs.ts` | 4 | Type |
| `server/stream.ts` | 13 | Terminal statuses |
| `runtime/run/run-project.ts` | 88-89 | Catch sets status |
| `runtime/errors.ts` | 7 | `RunBlockedError`, imported at `run-project.ts:3`, `provider.ts:1`, `scripted.ts:2`, thrown at `provider.ts:102`, `scripted.ts:77` |
| `cli/format/run.ts` | 74-75 | Prints "Dry run blocked." |
| `runtime/index.test.ts` | 369, 603, 616, 949 | Tests |
| `cli/cli.test.ts` | 445, 463, 488 | Tests |
| `studio/App.test.tsx` | 21 | Fixture |

`RunStatus` also reaches these through the type, without naming `blocked`:

- `contracts/evals.ts:8` stores `runStatus` in eval reports.
- `runtime/types/evals.ts:6` is the eval `expect.status` field. No eval fixture in the repo uses `blocked`.
- `runtime/storage/sqlite/queries.ts:153` casts the stored status unchecked.
- Display only: `studio/components/Sidebar.tsx:111`, `studio/views/RunView.tsx:29`, `studio/views/OverviewView.tsx:13`, `cli/format/runs.ts:16`.

### 3.4 Beyond renames: what a paused run needs

| Issue | Evidence |
| --- | --- |
| A paused run has no end time, but the store requires one | `ended_at TEXT NOT NULL` `runtime/storage/sqlite/schema.ts:33`, `RunSummary.endedAt: string` `contracts/runs.ts:12`, always stamped `runtime/run/finalize.ts:33`, flagged `audit-0001:31`. Studio prints it `Sidebar.tsx:111`, `RunView.tsx:29`, `OverviewView.tsx:13` |
| A request cannot be linked to its decision | The payload is only `toolName`, `arguments`, `approval` (`provider.ts:93-97`). No request id, and `tool.call` has no call id (`provider.ts:78-81`) |
| Audit fields are missing | `plan-0006:159` wants actor, tool, arguments, policy reason and final decision. Closed #41 adds a run ID and request timestamp. Code has the tool, arguments and the optional reason inside `approval` |
| Stopping means unwinding | `RunBlockedError` exits the loop (`provider.ts:102`, caught `run-project.ts:88`). `messages` and the step counter are local (`provider.ts:31,38`). Remaining calls in the same model response are dropped (loop at `provider.ts:68`). Events do record `messages` and `toolCalls` (`provider.ts:45-57`) |
| CLI treats blocked as failure | Exit 1 `cli/commands/run.ts:64`, lines sent to stderr `commands/run.ts:53-57`, test name "reports approval-blocked dry runs as failures" `cli/cli.test.ts:445`. Line 64 maps every non-completed status to 1, so a new status inherits this |
| SSE has no waiting behaviour | Only listed statuses end the stream (`stream.ts:13,72`). An unlisted `waiting` status keeps it open and polling |
| `run.error` closes SSE early | `stream.ts:10`, test `server/index.test.ts:554`, noted in #86 |
| `RunStatus` values are read from storage unchecked | `queries.ts:153`. Event types too `queries.ts:169` |
| Stored rows keep the old name | Nothing rewrites rows. `rowToEvent` casts the type (`queries.ts:169`). SQLite schema is `"2"` and a mismatch throws "Delete it or choose another path" (`schema.ts:3,9-12`). Events carry `schemaVersion: 1` (`contracts/events.ts:23`). #69 excludes old-database migration, and #86 prefers the migrator first |
| Rejected outcome has no status | `plan-0006:160` asks for "a clear terminal result". No source says which status or terminal event |
| Max steps has no outcome | `plan-0006:101` stops on max steps, but `provider.ts:133` returns "Maximum steps reached" and the run ends `run.completed` |

`packages/cli/README.md:13` says "approval blocking", and `plan-0006:22` uses the same words for the past. Neither names an event.

## 4. What each source says about a paused run

| Source | Word used | Terminal or resumable | Citation |
| --- | --- | --- | --- |
| PRD | Neither. "approval gates" | Silent. Has "terminal run states", not enumerated | `prd:74,127,136,176,190,198` |
| ADR 0002 | Neither | Silent. "resume" means stream resume | `adr-0002:5` |
| ADR 0003 | Neither | Silent | `adr-0003:5,17` |
| ADR 0004, 0005 | Neither | Silent | `adr-0004:17` mentions approvals only. No matches in ADR 0005 |
| ADR 0006 | Neither | Silent | Whole file |
| ADR 0007 | Neither | Silent on pausing. A failed or cancelled run writes no assistant message; blocked and waiting are not mentioned | `adr-0007:20` |
| Plan 0003 | blocked | Terminal. "approval-required blocked terminal event". "metadata plus blocked event only". Full resume excluded | `plan-0003:75,91,93` |
| Plan 0004 | blocked | Persisted as a finished run. "approval resume" excluded | `plan-0004:37,106,149` |
| Plan 0005 | blocked | Terminal. Listed with completed and failed | `plan-0005:55` |
| Plan 0006 | Both | Resumable when "an approval channel is available", otherwise blocking. See below | `plan-0006:61,100,102,158,160,162,193,199,372` |
| Audit 0001 | Neither | Says the store blocks an in-progress state | `audit-0001:31` |
| Audit 0003 | waiting | Says approvals and cancel need it. "Pause, resume, cancel" | `audit-0003:98,151` |
| #69 | waiting | "approvals need a waiting state". Adds running, waiting and cancelled. Approvals UI out of scope | #69 Outcome, Slices, Out of scope |
| #72 | pause | Resumable and durable: "A gated tool call pauses the run, survives a restart, and resumes on a decision" | #72 Done when |
| Closed #41 | waiting | "durable waiting-for-approval state"; waiting runs "can be listed, read, streamed, and resumed after process restart when the event store supports the required state" | #41 Acceptance criteria |
| Closed #42 | waiting | Cancel must work "while waiting for approval" | #42 Acceptance criteria |
| #86 | blocked | "`run.blocked` is final today, and nothing can resume a run". Contract "must leave room for cancel and resume, without building them" | #86 Notes |
| #88 | Both | Open question, unanswered | #88 |
| Code | blocked | Terminal: `stream.ts:6-13`. No route or function resumes a run; a blocked run gets `endedAt` (`finalize.ts:33`) | Also `run-project.ts:88-89` |

Plan 0006 is the source to read closely, because it holds three positions that interact:

- `plan-0006:100`: "block or pause when approval is required".
- `plan-0006:102`: add active statuses "while preserving existing terminal statuses". So `blocked` stays.
- `plan-0006:158`: convert terminal blocking "into resumable waiting state when an approval channel is available".
- `plan-0006:162`: "Keep dry-run approval blocking available for deterministic eval fixtures."

Read together, Plan 0006 describes `blocked` and a waiting state existing side by side, chosen by whether an approval channel exists. It does not define "approval channel". #72 does not mention dry runs or the condition, and states the pause without it. #88 asks the question directly and is not answered by any document.

Durability differs too. #72 and closed #41 require surviving a restart. Plan 0006 says "Persist approval requests and decisions" (`plan-0006:159`) and does not mention restarts.

## 5. Disagreements, summarized

| # | Topic | Position A | Position B |
| --- | --- | --- | --- |
| 1 | Approval event name | `approval.required`: code | `approval.requested`: `plan-0006:150`, #69 |
| 2 | Paused status name | `waiting_for_approval`: `plan-0006:102` ("such as") | `waiting`: #69, `audit-0003:98`, #88 |
| 3 | Blocked after approvals ship | Kept, conditional on channel and dry runs: `plan-0006:102,158,162` | Pause unconditionally: #72 |
| 4 | Is blocked terminal | Yes: Plans 0003 to 0005, code, #86 "today" | Becomes resumable: `plan-0006:158`, #72 |
| 5 | Is `run.error` terminal | Yes: `stream.ts:10` | Error then terminal failed: `plan-0003:76` |
| 6 | Terminal set size | Four events: `stream.ts:6-11` | Three statuses: `contracts/runs.ts:4`, `plan-0005:55` |
| 7 | Memory reads as events | Writes only: `plan-0006:235`, closed #45 | Reads and writes: #78 |
| 8 | Rename vs additive rule | Additive unless unavoidable: `plan-0006:104`, `prd:180` | Rename requested: #69. Free before publish: `adr-0006:5`, #86 |
| 9 | Approval records | Projections of the log: `adr-0002:16` | Separate `approvals` table: stale branch, section 6 |

## 6. Design-reference branches (not on `main`)

Plan 0006 does not cite these. #72 lists PRs #64-#66 as design reference and #77 lists #67. `audit-0003:140` says `issue-44-mcp-tools` is the top of that stack. All citations in this section are on those branches.

Branch `origin/issue-41-approval-workflow`:

- Keeps `approval.required` and `run.blocked` (`packages/runtime/src/types.ts:15,20`).
- Has status `completed | failed | blocked` (`types.ts:3`), so no waiting state.

Branch `origin/issue-44-mcp-tools`:

- Keeps `approval.required` and `run.blocked` (`packages/runtime/src/types.ts:48,53`).
- Adds `thread.created`, `message.created`, `run.cancelled`, `policy.decision` (`types.ts:56-59`).
- Has status `completed | failed | blocked | cancelled` (`types.ts:5`), again no waiting state.
- Has no `run.cancel_requested`, `approval.approved` or `approval.rejected`.
- `approve`/`reject` calls only update an `approvals` table (`packages/server/src/routes.ts:345`, `packages/runtime/src/sqlite-store.ts:130`), so decisions emit no events.
- A search of `run.ts` and `routes.ts` finds no resume logic.
- `stream.ts:9` treats `run.blocked` as terminal, yet the cancel route allows it, since `routes.ts:253` rejects only completed, failed and cancelled.
- Uses `POST /v1/runs/:runId/approvals/:requestId` (`routes.ts:299`), which adds a request id that `plan-0006:175` does not have.
- Policy decisions are `allow | require_approval | reject` (`types.ts:7`).

## 7. Options for the owner (no recommendation)

These are the decisions the facts leave open. #88 owns the second and third.

1. **Approval names.** Adopt the Plan's three `approval.*` names, or pick others. The code is a small change either way (section 3.1).
2. **Status name.** `waiting`, `waiting_for_approval`, or a general status with the reason in the payload.
3. **Blocked.** Replace it with waiting, keep both as Plan 0006 reads, or keep it for dry runs only. This decides whether sections 3.2 and 3.3 apply at all.
4. **Pause events.** Whether entering and leaving a pause each get an event, and their names. `approval.requested` alone could mark entry; `approval.approved` alone could mark exit. Whether `run.*` events are also wanted is open.
5. **`run.error`.** Remove it from the SSE terminal list, or redefine it. Touches `stream.ts:10` and `server/index.test.ts:554`.
6. **Payload contents.** Whether to reserve a request id and call id now, since #69 also adds the discriminated union (F-22).
7. **Ordering with the migrator.** Whether renames land before or after the schema version slice, since #86 prefers the migrator first.
8. **A naming rule.** Whether to write one down before the new events arrive.
9. **Memory reads.** Whether they are events. This belongs to #78.

## 8. Sources not found or not consulted

- The approvals epic #72, #71 and #78 were all found. None names an event type.
- `POST /v1/runs` does not exist on `main`, though #86 cites it. The only POST run route is `POST /v1/runs/dry` (`server/routes/runs.ts:20-21`), which does await the run (`runs.ts:25`). `plan-0006:171` lists `POST /v1/runs` as future work.
- The AG-UI specification was not consulted. #79 maps events later, and no Plico source says how approval events should map.
- No GLOSSARY or written naming rule exists.
- No research folder existed in `product/`. This file creates `product/research/`.
