# Studio chat UI: additional source research

Reviewed 2026-11-04. This supplements the earlier Studio chat options audit. It
is a source review, not a prototype, integration benchmark, accessibility
audit, or verification of the reported upstream issues.

## Plico's integration boundary

Studio is a Vite/React 19 app with Tailwind 4, its own theme and components,
and an existing native run inspector and event-stream hooks. It does not use
shadcn/ui or an AI SDK. Any candidate still needs Plico to own thread state,
native event replay and attempt resets, reconnect cursors, and inspector
selection. Framework-specific state must remain inside Studio, not the public
project or wire contracts.

## Candidates

### shadcn/ui chat primitives and AI Elements patterns

This is the leading candidate to test before deciding how much UI to build.
The [official AI Elements patterns](https://ui.shadcn.com/docs/ai-elements)
are copied compositions. The [chat guidance](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/chat.md)
describes `MessageScroller`, `Message`, and `Bubble`; the
[October 2026 release notes](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements)
add `Trace` for agent steps and `Code Block` for their output. The documented
scroller follows streaming content, anchors turns, and offers jump-to-latest.
That could save Plico substantial scrolling and presentation work while leaving
native SSE ownership with Plico. The scroller guidance identifies an
`@shadcn/react` dependency, so copied source does not mean zero dependencies.
Studio would need selective registry setup, theme-token mapping and maintenance
of copied source; the exact cost and accessibility remain untested.

Upstream reports include [scrollbar dragging during an anchored stream](https://github.com/shadcn-ui/ui/issues/12278)
and [keyboard PageUp/Home follow behavior](https://github.com/shadcn-ui/ui/issues/12021).
These are issue reports, not independently verified Plico defects. A trial
should test scroll-away, return-to-latest and keyboard/screen-reader behavior.

### Vercel AI Elements

Vercel's [AI Elements](https://github.com/vercel/ai-elements) is
[Apache-2.0](https://github.com/vercel/ai-elements/blob/main/LICENSE), with
selectively installed source components. Its
[documentation](https://elements.ai-sdk.dev/components/conversation) states
the project is moving to shadcn/ui and will be deprecated at the end of November
2026; its [releases](https://github.com/vercel/ai-elements/releases) say the
CLI will be deprecated then. This makes the shadcn successor the more durable
starting point. The [message source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx)
uses AI SDK `UIMessage` types and Streamdown plugins, while the
[prompt input](https://elements.ai-sdk.dev/components/prompt-input) provides
form behavior and keyboard shortcuts. Components differ in coupling and
dependencies: selecting one does not inherently require adopting the complete
AI SDK transport, but each candidate needs inspection. Accessibility and
Plico-specific replay have not been verified.

### LangChain Agent Chat UI

The [MIT-licensed repository](https://github.com/langchain-ai/agent-chat-ui/blob/main/LICENSE)
is a complete LangGraph chat app rather than a small UI library. Its
[package manifest](https://github.com/langchain-ai/agent-chat-ui/blob/main/package.json)
includes Next.js tooling, LangGraph and LangGraph SDK dependencies; replacing
its conversation and agent integration would be significant work for Plico.
The [GitHub repository](https://github.com/langchain-ai/agent-chat-ui) was
archived at the time of this review (GitHub API, 2026-11-04). Use it as design
reference, not as the default dependency. Accessibility remains unverified.

### Chat Components

[Chat Components](https://github.com/miskibin/chat-components) describes an
MIT-licensed, source-owned shadcn registry with props and callbacks and no
required AI SDK or wire protocol. Its
[registry manifest](https://github.com/miskibin/chat-components/blob/main/registry.json)
offers individual components and identifies their dependencies. Its README
claims streaming, keyboard support and scroll handling, but those claims have
not been independently tested here. GitHub's license endpoint reported no
license file despite the README's MIT statement; resolve the license terms
before copying code. The repository is a much smaller project (19 stars on
2026-11-04, via GitHub API), which is a maintenance consideration, not a
measure of quality.

## Recommendation and next evidence

Prototype **shadcn/ui's current MessageScroller and selected message/Trace
primitives** against the existing Studio theme and native event stream before
committing to them. Compare against a small existing-Studio implementation and
assistant-ui's external-store approach. Exercise streaming, scroll-away and
return-to-latest, reconnect/cursor replay, attempt reset, selection of a run,
keyboard operation and screen-reader announcements. Record added packages,
copied files, license notices, CSS changes and bundle cost. Keep existing Studio
run inspection unless the prototype shows a concrete benefit from Trace. No
candidate has been demonstrated to meet these requirements yet.
