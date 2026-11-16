import { afterEach, expect, it, vi } from "vitest";
import { createConfiguredModelProvider } from "../index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("sends the output schema to a native provider through its response format", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const chunks = [
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [{ index: 0, delta: { content: '{"ticket":"T-1"}' }, finish_reason: null }],
      },
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];
    return new Response(
      `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const schema = {
    type: "object",
    properties: { ticket: { type: "string" } },
    required: ["ticket"],
    additionalProperties: false,
  };
  const provider = createConfiguredModelProvider({ provider: "openai", name: "test" });
  const chunks = [];
  for await (const chunk of provider?.stream(
    { messages: [{ role: "user", content: "Triage" }], maxSteps: 1, outputSchema: schema },
    { signal: new AbortController().signal },
  ) ?? [])
    chunks.push(chunk);

  expect(requests[0]).toMatchObject({
    response_format: { type: "json_schema", json_schema: { schema } },
  });
  expect(provider?.supportsStructuredOutput).toBe(true);
  expect(chunks).toContainEqual({ type: "text", text: '{"ticket":"T-1"}' });
});
