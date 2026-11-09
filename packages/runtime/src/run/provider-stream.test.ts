import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createSqliteEventStore, runProject } from "../index.js";

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

it("persists text chunks while the model is still streaming", async () => {
  const root = await scaffold(
    "plico-stream-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const run = runProject(root, {
    runId: "streaming",
    eventStore,
    message: "hello",
    provider: {
      async *stream() {
        yield { type: "text", text: "Hello " };
        entered();
        await blocked;
        yield { type: "text", text: "world" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    },
  });
  const first = await Promise.race([started.then(() => "started"), run.then(() => "ended")]);
  expect(first).toBe("started");
  try {
    expect(
      (await eventStore.getEvents("streaming")).filter((event) => event.type === "model.delta"),
    ).toMatchObject([{ payload: { text: "Hello " } }]);
  } finally {
    release();
  }
  expect((await run).output).toBe("Hello world");
});

it("records configured model identity with the provider request", async () => {
  const root = await scaffold(
    "plico-model-identity-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test-model" } };',
  );
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream() {
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    },
  });
  expect(result.events.find((event) => event.type === "model.request")?.payload).toMatchObject({
    model: { provider: "openai-compatible", name: "test-model" },
  });
});

it("aborts the provider when the run is cancelled", async () => {
  const root = await scaffold("plico-abort-", 'export default { schemaVersion: 1, name: "Demo" };');
  const { createEngine, createMemoryJournal } = await import("../index.js");
  const engine = createEngine({ journal: createMemoryJournal() });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const run = runProject(root, {
    runId: "cancel-stream",
    engine,
    message: "hello",
    provider: {
      async *stream(_request, { signal }) {
        entered();
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
        );
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  await started;
  await engine.cancel("cancel-stream");
  expect((await run).status).toBe("cancelled");
});

it("fails at the configured model step limit", async () => {
  const root = await scaffold(
    "plico-limit-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test", maxSteps: 1 } };',
  );
  await writeFile(
    join(root, "tools", "noop.tool.ts"),
    'export default { name: "noop", description: "No-op", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => "ok" };',
  );
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream(request) {
        expect(request.maxSteps).toBe(1);
        yield { type: "tool.call", call: { name: "noop", arguments: {} } };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  expect(result.status).toBe("failed");
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    message: expect.stringContaining("Maximum steps"),
  });
});

it("rejects invalid model configuration before calling the provider", async () => {
  const root = await scaffold(
    "plico-invalid-model-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test", maxSteps: 0 } };',
  );
  let called = false;
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream() {
        called = true;
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  expect(result.status).toBe("failed");
  expect(called).toBe(false);
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("model.maxSteps") }),
    ]),
  );
});

it("carries provider metadata and tool call identifiers into the next turn", async () => {
  const root = await scaffold(
    "plico-metadata-",
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(
    join(root, "tools", "noop.tool.ts"),
    'export default { name: "noop", description: "No-op", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => "ok" };',
  );
  let calls = 0;
  let messages: unknown;
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream(request) {
        calls++;
        if (calls === 1) {
          yield {
            type: "tool.call",
            call: {
              id: "call-1",
              name: "noop",
              arguments: {},
              providerMetadata: { opaque: [1, "two"] },
            },
          };
          yield {
            type: "finish",
            usage: { inputTokens: 1, outputTokens: 1 },
            providerMetadata: { cursor: "xyz" },
          };
        } else {
          messages = request.messages;
          yield { type: "text", text: "done" };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        }
      },
    },
  });
  expect(result.status).toBe("completed");
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        providerMetadata: { cursor: "xyz" },
        toolCalls: [
          expect.objectContaining({ id: "call-1", providerMetadata: { opaque: [1, "two"] } }),
        ],
      }),
      expect.objectContaining({ role: "tool", toolCallId: "call-1" }),
    ]),
  );
});

it("separates streamed chunks across a retried model step", async () => {
  const root = await scaffold("plico-retry-", 'export default { schemaVersion: 1, name: "Demo" };');
  const { ModelProviderError } = await import("../index.js");
  let attempts = 0;
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream() {
        attempts++;
        yield { type: "text", text: "same" };
        if (attempts === 1) throw new ModelProviderError("overloaded", "temporary failure");
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  expect(result.status).toBe("completed");
  expect(result.output).toBe("same");
  const starts = result.events.filter((event) => event.type === "model.attempt");
  expect(starts).toHaveLength(2);
  const deltas = result.events.filter((event) => event.type === "model.delta");
  expect(deltas.map((event) => event.payload.text)).toEqual(["same", "same"]);
  expect(deltas[0]?.payload.attemptId).not.toBe(deltas[1]?.payload.attemptId);
  expect(result.events.find((event) => event.type === "model.response")?.payload).toMatchObject({
    attemptId: deltas[1]?.payload.attemptId,
  });
});

it("does not retry non-retryable provider errors", async () => {
  const root = await scaffold("plico-auth-");
  const { ModelProviderError } = await import("../index.js");
  let attempts = 0;
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream() {
        attempts++;
        if (attempts > 0) throw new ModelProviderError("auth", "invalid credentials");
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  expect(result.status).toBe("failed");
  expect(attempts).toBe(1);
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    message: "invalid credentials",
  });
});

it("respects the configured model retry budget", async () => {
  const root = await scaffold(
    "plico-retry-budget-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test", retries: 0 } };',
  );
  const { ModelProviderError } = await import("../index.js");
  let attempts = 0;
  const result = await runProject(root, {
    message: "hello",
    provider: {
      async *stream() {
        attempts++;
        if (attempts > 0) throw new ModelProviderError("overloaded", "try later");
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  expect(result.status).toBe("failed");
  expect(attempts).toBe(1);
});
