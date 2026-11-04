# Studio chat playground: shadcn/ui plan

Status: proposed, 2026-11-04. Scope: the final slice of #71. The companion
[source review](../audits/0008-shadcn-chat-research.md) is not a hands-on
integration or accessibility audit.

## Goal and boundaries

Create or select a persisted thread, send a text message, follow the live reply
and run progress, and inspect its events, tool calls, and errors beside the
conversation. Keep Plico's native API, events, cursor, theme, and run inspector.
No provider or framework types enter public contracts. Memory, attachments,
branching, editing, cancellation, approvals, and model selection are outside
this slice. Access Studio through the existing `plico serve --studio`; verify
whether additional CLI access is needed against #71 before adding commands.

## Interface and component mapping

- Thread rail: Studio navigation and buttons; create/select a thread, with
  loading, empty and error states. Derive a sensible label from available data
  only; threads have IDs and timestamps, not persisted titles.
- Conversation: evaluate shadcn's `MessageScroller` for follow-output,
  scroll-away and jump-to-latest; use `Message` and `Bubble` selectively if
  their copied source fits Studio's tokens. Show user and assistant messages,
  with a clear state for streaming, reconnecting, failure, and completion.
- Composer: a labelled text area and send button using existing Studio controls
  or a minimal shadcn prompt pattern. Enter sends; Shift+Enter adds a line.
  Respect IME composition. Preserve unsent text on errors; prevent duplicate
  sends and show busy state.
- Inspector: show the existing run view alongside the conversation on larger
  screens and offer a reachable inspector view on narrow screens. Each run
  linked from a message can be selected. Reuse its timeline, raw events and
  replay controls. Consider `Trace` only when it improves existing behavior.
- States: actionable notices for unavailable provider or stores, thread busy,
  failed fetches, stream disconnects, and failed runs. Avoid suggesting a run
  succeeded when only the message was stored.

## Native data flow

1. Load threads via `GET /v1/threads`; create via `POST /v1/threads`; fetch
   selected history via `GET /v1/threads/:id/messages`.
2. Submit with `POST /v1/threads/:id/messages`, retaining the returned run ID.
   Associate run selection and progress with the appropriate user message.
3. Fetch run event history, then subscribe after the last sequence using the
   existing cursor-aware stream behavior. Reconnect without duplicating events;
   discard stale results when the selected thread or run changes.
4. Build live output from native `model.attempt` and `model.delta` events by
   turn and attempt; a replacement attempt must not append to abandoned text.
   Handle terminal events and refresh persisted thread messages so final output
   is rendered once. On reload, recover active run state from available run
   information and reconcile history with any in-flight run.
5. Keep API response and error details within the existing versioned contract;
   do not assume unimplemented thread titles, deletion, or provider selection.

## Implementation sequence (one PR)

1. Test shadcn's unstyled or selectively copied Message Scroller in an isolated
   spike with Studio's theme. Record exact dependencies, copied files, license
   obligations and bundle impact; compare with a small native implementation.
   Test scrolling and keyboard operation before choosing. Do not install a
   complete design system automatically; retain Studio's existing UI if the
   integration cost or behavior is worse.
2. Add thread API functions and a focused thread state module. Test creation,
   selection, message history, sending, and busy/error behavior through Studio.
3. Add transcript and composer in small modules. Test live deltas, attempt
   replacement, cursor reconnect, persisted final message reconciliation, and
   switching threads while requests are in flight.
4. Connect the existing run inspector to message-associated runs. Test live
   progress, event/tool/error inspection, replay and responsive navigation.
5. Verify `plico serve --studio` exposes the playground and add only the CLI
   access the epic actually requires. Document the user journey and error states.
6. Run focused tests first, affected builds, then `pnpm check`; exercise a
   local end-to-end conversation with restart/reconnect and inspector review.

Use one failing public-behavior test at a time, implement the smallest slice,
then refactor while green. No production dependency is selected until the spike
confirms compatibility.

## Acceptance checks

- Create/select a thread, send a message, view a live reply and reopen it
  after server and page restart.
- Reconnect after a dropped stream without missing or duplicating output; show
  only the current attempt after provider retry/recovery.
- Inspect the correct run and its timeline, tool activity, errors and replay
  without losing the conversation; layout remains usable on narrow screens.
- Follow streaming while at the bottom, do not pull a reader away from older
  content, and provide an accessible way back to the latest message.
- Verify keyboard, focus, screen-reader announcements and reduced motion in
  both themes; cover loading, empty, busy, provider failure and disconnect states.
- Confirm added dependencies, copied-code attribution and bundle cost, and keep
  contracts unchanged unless a separately justified wire change is required.
