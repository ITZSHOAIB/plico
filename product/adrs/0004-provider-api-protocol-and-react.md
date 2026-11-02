# Keep Plico native internally and expose AG-UI by default

Status: accepted

Plico will expose a small Plico-owned model port, with Vercel AI SDK as the default provider adapter implementation rather than the public model contract. AG-UI will be the default public frontend protocol, while Plico's native event log remains the full-fidelity internal contract for Studio, storage, replay, artifacts, audit, and diagnostics.

## Considered Options

- Plico model port with AI SDK-backed default providers.
- AI SDK types as Plico's public model contract.
- OpenAI-compatible endpoints only.
- Native Plico frontend protocol first.
- Pure AG-UI contract.

## Consequences

Plico can use AI SDK's provider ecosystem without leaking third-party message shapes into its core APIs. The model port is a single `stream()` call with Plico's own error kinds (rate limit, overloaded, auth, bad request, aborted, network) and opaque provider metadata that round-trips unchanged, because some providers need it on the next turn. The adapter turns provider retries off, and the engine retries the step (ADR 0008). Native events map to AG-UI and to AI SDK UI chunks through two adapters, each a pure function of the event log, so a stream can start from any cursor. React stays focused on headless hooks and Plico-specific UI for chat, run state, approvals, artifacts, and timelines instead of becoming a broad CopilotKit replacement.
