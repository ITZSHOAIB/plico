# shadcn/ui for Studio chat: source research

Reviewed 2026-11-04. This is an assessment of upstream documentation and Plico's
current source, not a prototype or independent accessibility audit. It expands
the shortlist in [0007](./0007-chat-ui-research.md).

## Integration boundary

Studio currently uses React 19, Vite, Tailwind 4, Lucide, and its own semantic
theme tokens and UI components; it does not currently configure shadcn/ui. Its
existing `useRunStream` validates ordered Plico events, reconnects using a
cursor, deduplicates events, and closes on terminal events. The contract has
thread and message identities, `model.attempt` and `model.delta`, tool and run
events, and errors. Any UI layer still needs Plico-owned message/thread state,
attempt resets, replay and persisted-message reconciliation, and inspector
selection. A chat primitive does not supply these behaviors.

## Component map

| Area | Upstream option | Fit and qualification |
| --- | --- | --- |
| Conversation | [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller) | Strong candidate: rows, turn anchors, follow-output, scroll-away, jump-to-latest and history position. It owns scroll state, not transport, messages or persistence. It uses `@shadcn/react` for behavior; use stable Plico message IDs and verify a stable ID for the provisional streaming assistant row. |
| Message rendering | [Message](https://ui.shadcn.com/docs/components/base/message), [Bubble](https://ui.shadcn.com/docs/components/base/bubble) | Optional source-owned row and surface primitives; map user/assistant roles without using AI SDK message types. Compare setup and theme effort with Studio markup. |
| Composer | [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input) / Input Group | Pattern includes text input, send button, Enter and Shift+Enter. Use a labelled native form and Plico's existing button where sufficient; file attachments and model selector are outside this slice. Handle IME composition before interpreting Enter. |
| Tool activity | [Trace](https://ui.shadcn.com/docs/components/base/trace) and [Tool pattern](https://ui.shadcn.com/docs/ai-elements/base/tool) | Optional compact activity summary for actual tool events. Existing run inspector should remain the full source of events and errors. Trace styling does not infer status or accessibility names: Plico must provide them. |
| Thread list | [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) | Has collapsible navigation and mobile state; Studio already has a navigation rail. Prefer a simple thread list unless a sidebar solves a demonstrated need. Do not imply rename, delete or search APIs exist. |
| Empty/loading state | [Empty](https://ui.shadcn.com/docs/components/base/empty), [Spinner](https://ui.shadcn.com/docs/components/base/spinner) | Optional presentation references. Existing Studio patterns may be cheaper. Distinguish loading, no threads, no messages, and failure. |
| Inspector layout | [Resizable](https://ui.shadcn.com/docs/components/base/resizable) | Keyboard-capable panels, but brings `react-resizable-panels`; fixed responsive columns and existing inspector may suffice. On mobile ensure chat and run detail remain usable without side-by-side panes. |

The [chat pattern](https://ui.shadcn.com/docs/ai-elements/base/chat) composes
Message Scroller, Message, Bubble and Input Group. Its examples use AI SDK
state; those examples need adaptation and do not require Plico to adopt that
transport. [AI Elements patterns](https://ui.shadcn.com/docs/ai-elements) cover
other future features, including attachments, approvals, branching, model
selection and subagents. Do not surface unsupported controls for this epic.

## Setup, maintenance and accessibility

The [Vite existing-project instructions](https://ui.shadcn.com/docs/installation/vite)
describe optional CLI setup, aliases, and Tailwind integration. Studio already
has Tailwind; the guide's instruction to replace the stylesheet is not suitable
for Studio's existing theme. Inspect selected registry sources and dependency
trees before installing or copying them. The unstyled scroller may be a smaller
fit than importing the styled wrapper and its supporting primitives. Copying a
registry component creates owned source, not automatic upstream updates; retain
required license notices and record version/source and bundle change.

Upstream documents a focusable labelled scroll region, log semantics and a
non-focusable inactive jump button for [Message Scroller](https://ui.shadcn.com/docs/components/aria/message-scroller).
It recommends `aria-busy` where announcements should wait for streaming to
finish. [Trace accessibility](https://ui.shadcn.com/docs/components/base/trace)
depends on the selected trigger, descriptive status text, and reduced-motion
handling. These are upstream claims and guidance; test actual integration with
keyboard and screen readers. Upstream issues concerning [scrollbar dragging](https://github.com/shadcn-ui/ui/issues/12278)
and [keyboard navigation](https://github.com/shadcn-ui/ui/issues/12021) are
unverified reports and should inform testing, not be assumed to affect Plico.

## Proposed evaluation before adoption

Implementation update: the playground uses the unstyled `@shadcn/react`
Message Scroller (0.3.1, MIT) and adapted shadcn message, bubble, input-group,
and empty components with Studio's theme. The production JavaScript bundle
increased from approximately 229.43 kB to 268.05 kB before gzip (71.97 kB to
83.33 kB gzip); this includes the entire chat UI, not just the scroller.
Studio tests cover event replay and reconnection, but they do not independently
verify browser scrolling or screen-reader behavior.

Try the smallest scroller integration with the existing Studio theme and a fake
Plico event stream. Compare its installed and transitive packages, copied files,
CSS/token changes and production bundle against a small native implementation.
Exercise streamed text, attempt changes, duplicate/replayed events, switching
threads, loading persisted history, preserving scroll-away, jump-to-latest,
keyboard navigation, screen-reader announcements and mobile inspector access.
Keep the reusable primitive only if it meaningfully reduces complexity while
passing these checks. This source review has not established the winner.
