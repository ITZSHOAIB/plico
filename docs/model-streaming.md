# Model streaming

Projects can set `model: { provider: "...", name: "...", maxSteps: 10 }` in
`plico.config.ts`. Both names must be nonempty; `maxSteps` must be a positive
integer and defaults to 10. These settings are recorded now; selecting a real
provider and reading credentials are part of a later slice.

A `ModelProvider` streams text, complete tool calls, and one finish with usage.
It receives the engine's abort signal. Adapters classify failures with
`ModelProviderError`; rate limits, overload, and network errors are retryable,
while authentication, bad requests, and aborts are not. The engine currently
defaults to two additional attempts for a retryable model error, with exponential backoff starting at 100 ms. Configure `model.retries` (0 to 10) and `model.retryDelayMs` (0 to 60000) to change these defaults. Provider metadata is JSON data that the
runtime retains with the assistant message and tool calls on the next turn.

A `model.attempt` event starts each attempt, including retries that produce no text. Each live `model.delta` is persisted immediately with its model turn and a
unique attempt ID. A `model.response` identifies the successful attempt. If a
process dies or an attempt fails, its already observed deltas remain in the
log; consumers must switch to the new attempt ID rather than append its text to the previous attempt. Engine replay
skips recorded deltas rather than appending them again. The response and
`assistant.output` contain the assembled successful text, and should not be
concatenated with the deltas.
