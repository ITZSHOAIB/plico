# Model streaming

Projects can set `model: { provider: "...", name: "...", maxSteps: 10 }` in
`plico.config.ts`. Both names must be nonempty; `maxSteps` must be a positive
integer and defaults to 10. Set `model.provider` to `openai` or
`openai-compatible`, export `OPENAI_API_KEY`, and run `plico run --message "Hello"`.
Input can also be piped through standard input. Real runs are persisted to
`.plico/plico.sqlite` by default and are available to Studio. Text streams to the
terminal as it arrives; `--json` emits a single result after the run. Interrupting
the command requests durable cancellation. Recovery only resumes model runs for
the same project and provider identity. Older runs without a recorded identity are
left untouched because their provider cannot be determined safely. Set `OPENAI_BASE_URL`
to use a compatible gateway.

The OpenAI-compatible adapter is also available through the runtime API.

```ts
import { createOpenAICompatibleProvider, runProject } from "@plico-ai/runtime";

const provider = createOpenAICompatibleProvider({ model: "your-model" });
const result = await runProject(".", { provider, message: "Hello" });
```

The adapter reads `OPENAI_API_KEY` from the environment. To use an OpenAI-compatible
gateway, pass `baseURL` and, if needed, the name of its credential environment
variable as `apiKeyEnv`. Credentials are not stored in project configuration.
To opt into the live smoke test, set `PLICO_LIVE_PROVIDER_TEST=1`,
`PLICO_LIVE_MODEL`, and `OPENAI_API_KEY`, then run
`pnpm exec vitest run packages/runtime/src/run/real-provider.test.ts`.

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

## Tracing

The runtime emits OpenTelemetry API spans when the host registers a tracer
provider; it does not install an SDK or exporter. Runs, durable steps, model
attempts and tool attempts are traced. A resumed execution links to its original
run span using context stored in the engine journal. Spans include identifiers,
model and tool names, and status, but do not include prompts, instructions,
output, tool arguments, tool results or credentials.

Studio's timeline displays token usage on model responses and the final assistant
output. Replay shows only details available at the selected event.
