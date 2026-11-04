import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

import { createOpenAICompatibleProvider, runProject } from "../index.js";

async function scaffold(
  prefix: string,
  config = 'export default { schemaVersion: 1, name: "Demo" };',
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(join(root, "plico.config.ts"), config);
  await writeFile(join(root, "agent.md"), "# Demo");
  return root;
}

it("streams a provider response through a Plico run without live network access", async () => {
  const root = await scaffold(
    "plico-provider-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  const chunks = [
    {
      id: "x",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }],
    },
    {
      id: "x",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }],
    },
    {
      id: "x",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
    },
  ];
  vi.stubEnv("PLICO_TEST_MODEL_KEY", "test-secret");
  const provider = createOpenAICompatibleProvider({
    model: "test-model",
    apiKeyEnv: "PLICO_TEST_MODEL_KEY",
    baseURL: "https://example.invalid/v1",
    fetch: async () =>
      new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      ),
  });
  const result = await runProject(root, { provider, message: "hello" });
  expect(result.status).toBe("completed");
  expect(result.output).toBe("Hello world");
  expect(
    result.events
      .filter((event) => event.type === "model.delta")
      .map((event) => event.payload.text),
  ).toEqual(["Hello", " world"]);
  expect(result.events.find((event) => event.type === "model.response")?.payload).toMatchObject({
    usage: { inputTokens: 2, outputTokens: 2 },
  });
  expect(JSON.stringify(result.events)).not.toContain("test-secret");
});

it("round trips tool calls and results through the provider protocol", async () => {
  const root = await scaffold(
    "plico-provider-tool-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    'export default { name: "lookup", description: "Find", inputSchema: { type: "object", properties: { query: { type: "string" } } }, capabilities: [], approval: { required: false }, handler: () => "found" };',
  );
  const requests: unknown[] = [];
  const mockFetch: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    const delta =
      requests.length === 1
        ? {
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                type: "function",
                function: { name: "lookup", arguments: '{"query":"item"}' },
              },
            ],
          }
        : { content: "Done" };
    const chunks = [
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [{ index: 0, delta, finish_reason: null }],
      },
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [
          { index: 0, delta: {}, finish_reason: requests.length === 1 ? "tool_calls" : "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];
    return new Response(
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  vi.stubEnv("PLICO_TEST_MODEL_KEY", "secret-key-123");
  const provider = createOpenAICompatibleProvider({
    model: "test",
    apiKeyEnv: "PLICO_TEST_MODEL_KEY",
    baseURL: "https://example.invalid/v1",
    fetch: mockFetch,
  });
  const result = await runProject(root, { provider, message: "find item" });
  expect(result.status).toBe("completed");
  expect(result.output).toBe("Done");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    messages: expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        tool_calls: [expect.objectContaining({ id: "call-1" })],
      }),
      expect.objectContaining({ role: "tool", tool_call_id: "call-1", content: '"found"' }),
    ]),
  });
});

it("maps authentication errors without leaking credentials or retrying", async () => {
  const root = await scaffold(
    "plico-provider-auth-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  let calls = 0;
  vi.stubEnv("PLICO_TEST_MODEL_KEY", "secret-key-123");
  const provider = createOpenAICompatibleProvider({
    model: "test",
    apiKeyEnv: "PLICO_TEST_MODEL_KEY",
    baseURL: "https://example.invalid/v1",
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "secret-key-123" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await runProject(root, { provider, message: "hello" });
  expect(result.status).toBe("failed");
  expect(calls).toBe(1);
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    message: expect.stringContaining("authentication"),
  });
  expect(JSON.stringify(result.events)).not.toContain("secret-key-123");
});

it("reports missing provider credentials without making a request", async () => {
  const root = await scaffold(
    "plico-provider-missing-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  let calls = 0;
  const provider = createOpenAICompatibleProvider({
    model: "test",
    apiKeyEnv: "PLICO_TEST_ABSENT_MODEL_KEY",
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  const result = await runProject(root, { provider, message: "hello" });
  expect(result.status).toBe("failed");
  expect(calls).toBe(0);
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    message: expect.stringContaining("PLICO_TEST_ABSENT_MODEL_KEY"),
  });
});

it("reports missing credentials for a configured model", async () => {
  const root = await scaffold(
    "plico-provider-readiness-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { checkReadiness } = await import("../index.js");
    const report = await checkReadiness(root);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subsystem: "provider.credentials",
          severity: "warning",
          message: expect.stringContaining("OPENAI_API_KEY"),
        }),
      ]),
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

it("retries rate limits once at the engine, without provider retries", async () => {
  const root = await scaffold(
    "plico-provider-retry-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test", retries: 1, retryDelayMs: 0 } };',
  );
  let calls = 0;
  vi.stubEnv("PLICO_TEST_MODEL_KEY", "secret-key-123");
  const provider = createOpenAICompatibleProvider({
    model: "test",
    apiKeyEnv: "PLICO_TEST_MODEL_KEY",
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await runProject(root, { provider, message: "hello" });
  expect(result.status).toBe("failed");
  expect(calls).toBe(2);
  expect(result.events.filter((event) => event.type === "model.attempt")).toHaveLength(2);
});

it("aborts an in-flight provider request when the run is cancelled", async () => {
  const root = await scaffold(
    "plico-provider-abort-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  const { createEngine, createMemoryJournal } = await import("../index.js");
  const engine = createEngine({ journal: createMemoryJournal() });
  vi.stubEnv("PLICO_TEST_MODEL_KEY", "secret");
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let aborted = false;
  const provider = createOpenAICompatibleProvider({
    model: "test",
    apiKeyEnv: "PLICO_TEST_MODEL_KEY",
    fetch: async (_input, init) => {
      entered();
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        ),
      );
    },
  });
  const run = runProject(root, { runId: "cancel-provider", engine, provider, message: "hello" });
  await started;
  await engine.cancel("cancel-provider");
  expect((await run).status).toBe("cancelled");
  expect(aborted).toBe(true);
});

it.skipIf(
  process.env.PLICO_LIVE_PROVIDER_TEST !== "1" ||
    !process.env.OPENAI_API_KEY ||
    !process.env.PLICO_LIVE_MODEL,
)("runs an opt-in live model smoke test", { timeout: 60_000 }, async () => {
  const root = await scaffold("plico-provider-live-");
  const provider = createOpenAICompatibleProvider({ model: process.env.PLICO_LIVE_MODEL ?? "" });
  const result = await runProject(root, { provider, message: "Reply with a short greeting." });
  expect(result.status).toBe("completed");
  expect(result.output?.length).toBeGreaterThan(0);
});
