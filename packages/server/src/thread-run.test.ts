import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEngine,
  createMemoryJournal,
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  type Journal,
  modelProviderAccountKey,
} from "@plico/runtime";
import { expect, it, vi } from "vitest";
import { servePlico } from "./index.js";
import { createTestServer } from "./testing/test-server.js";

it("starts a provider run from a thread message and persists its answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-run-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "fake", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const seen: Array<Array<{ role: string; content: string }>> = [];
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    provider: {
      async *stream(request) {
        seen.push(request.messages.map(({ role, content }) => ({ role, content })));
        yield { type: "text", text: "Hello back" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const thread = (await (await fetch(`${base}/v1/threads`, { method: "POST" })).json()) as {
      id: string;
    };
    const response = await fetch(`${base}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello" }),
    });
    expect(response.status).toBe(201);
    const message = (await response.json()) as { runId: string };
    expect(message.runId).toBeTruthy();
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(message.runId))?.status).toBe("completed"),
    );
    expect((await eventStore.getEvents(message.runId)).map((event) => event.type)).toContain(
      "model.delta",
    );
    expect(await threadStore.getMessages(thread.id)).toMatchObject([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello back", runId: message.runId },
    ]);
    const next = await fetch(`${base}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Next" }),
    });
    const nextMessage = (await next.json()) as { runId: string };
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(nextMessage.runId))?.status).toBe("completed"),
    );
    expect(seen[1]?.filter((item) => item.role !== "system")).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello back" },
      { role: "user", content: "Next" },
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    threadStore.close();
  }
});

it("releases a thread when its run fails before it starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-start-failure-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const backing = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  let fail = true;
  const eventStore = {
    ...backing,
    async appendEvent(event: Parameters<typeof backing.appendEvent>[0]) {
      if (fail) {
        fail = false;
        throw new Error("write failed");
      }
      return backing.appendEvent(event);
    },
  };
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    engine: createSqliteEngine({ databasePath }),
    provider: {
      async *stream() {
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const thread = (await (await fetch(`${base}/v1/threads`, { method: "POST" })).json()) as {
      id: string;
    };
    const post = () =>
      fetch(`${base}/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });
    expect((await post()).status).toBe(500);
    const [failedMessage] = await threadStore.getMessages(thread.id);
    expect(failedMessage?.runId).toBeDefined();
    const failedRun = await (await fetch(`${base}/v1/runs/${failedMessage?.runId}`)).json();
    expect(failedRun).toMatchObject({ status: "failed" });
    expect((await post()).status).toBe(201);
  } finally {
    spy.mockRestore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    threadStore.close();
  }
});

it("rejects starting runs when thread and run stores use different databases", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-stores-"));
  const eventStore = createSqliteEventStore({ databasePath: join(root, "runs.sqlite") });
  const threadStore = createSqliteThreadStore({ databasePath: join(root, "threads.sqlite") });
  const thread = await threadStore.createThread();
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    provider: {
      async *stream() {
        yield { type: "finish", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello" }),
    });
    expect(response.status).toBe(503);
    expect(await threadStore.getMessages(thread.id)).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    threadStore.close();
  }
});

it("starts a queued thread run after restart with the same provider identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-queued-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const gateway = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { content: "Recovered" }, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("OPENAI_API_KEY", "test-secret");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`);
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteThreadStore({ databasePath });
  const thread = await store.createThread();
  await store.addMessage(thread.id, "resume me", "queued-run", {
    providerKey: modelProviderAccountKey({ provider: "openai-compatible", name: "test" }),
    projectRoot: root,
  });
  store.close();
  try {
    vi.stubEnv("OPENAI_API_KEY", "different-secret");
    const mismatched = await servePlico({
      projectRoot: root,
      databasePath,
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const base = `http://127.0.0.1:${(mismatched.address() as AddressInfo).port}`;
      expect(await (await fetch(`${base}/v1/threads/${thread.id}/messages`)).json()).toMatchObject([
        { role: "user", content: "resume me" },
      ]);
      expect((await fetch(`${base}/v1/runs/queued-run`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => mismatched.close(() => resolve()));
    }
    vi.stubEnv("OPENAI_API_KEY", "test-secret");
    const server = await servePlico({
      projectRoot: root,
      databasePath,
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await vi.waitFor(
        async () =>
          expect(
            await (await fetch(`${base}/v1/threads/${thread.id}/messages`)).json(),
          ).toMatchObject([
            { role: "user", content: "resume me" },
            { role: "assistant", content: "Recovered", runId: "queued-run" },
          ]),
        { timeout: 5000 },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  }
});

it("resumes a queued thread run after only the configured model changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-model-change-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  const configPath = join(root, "plico.config.ts");
  await writeFile(
    configPath,
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "model-a" } };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const gateway = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "model-b", choices: [{ index: 0, delta: { content: "Recovered" }, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "model-b", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("OPENAI_API_KEY", "test-secret");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`);
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteThreadStore({ databasePath });
  const thread = await store.createThread();
  await store.addMessage(thread.id, "resume me", "queued-model-change", {
    providerKey: modelProviderAccountKey({ provider: "openai-compatible", name: "model-a" }),
    projectRoot: root,
  });
  store.close();
  try {
    await writeFile(
      configPath,
      'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "model-b" } };',
    );
    const server = await servePlico({
      projectRoot: root,
      databasePath,
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await vi.waitFor(
        async () =>
          expect(
            await (await fetch(`${base}/v1/threads/${thread.id}/messages`)).json(),
          ).toMatchObject([
            { role: "user", content: "resume me" },
            { role: "assistant", content: "Recovered", runId: "queued-model-change" },
          ]),
        { timeout: 5000 },
      );
      const next = await fetch(`${base}/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Next" }),
      });
      expect(next.status).toBe(201);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  }
});

it("releases a thread when the engine cannot begin the run", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-engine-begin-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const memory = createMemoryJournal();
  let fail = true;
  const journal: Journal = {
    ...memory,
    async begin(...args) {
      if (fail) {
        fail = false;
        throw new Error("journal begin failed");
      }
      return memory.begin(...args);
    },
  };
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    engine: createEngine({ journal }),
    provider: {
      async *stream() {
        yield { type: "text", text: "Recovered" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const thread = (await (await fetch(`${base}/v1/threads`, { method: "POST" })).json()) as {
      id: string;
    };
    const post = () =>
      fetch(`${base}/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });
    expect((await post()).status).toBe(500);
    const [failedMessage] = await threadStore.getMessages(thread.id);
    const runId = failedMessage?.runId;
    expect(runId).toBeDefined();
    expect((await eventStore.getRun(runId as string))?.status).toBe("failed");
    const events = await eventStore.getEvents(runId as string);
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.error", "run.failed"]);
    expect(events.find((event) => event.type === "run.error")?.payload).toMatchObject({
      message: expect.stringContaining("journal begin failed"),
    });
    const second = await post();
    expect(second.status).toBe(201);
    const secondRun = (await second.json()) as { runId: string };
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(secondRun.runId))?.status).toBe("completed"),
    );
  } finally {
    spy.mockRestore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    threadStore.close();
  }
});

it("exposes recovery to hosts that create their own server", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-host-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const thread = await threadStore.createThread();
  const accountKey = modelProviderAccountKey({ provider: "openai-compatible", name: "test" });
  await threadStore.addMessage(thread.id, "resume me", "queued-host", {
    providerKey: accountKey,
    projectRoot: root,
  });
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    engine: createSqliteEngine({ databasePath }),
    provider: {
      async *stream() {
        yield { type: "text", text: "Recovered" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
    providerRecoveryKey: "recovery-key",
    providerAccountKey: accountKey,
  });
  try {
    await api.recover();
    await vi.waitFor(
      async () =>
        expect(await threadStore.getMessages(thread.id)).toMatchObject([
          { role: "user", content: "resume me" },
          { role: "assistant", content: "Recovered", runId: "queued-host" },
        ]),
      { timeout: 5000 },
    );
  } finally {
    threadStore.close();
  }
});

it("reports mismatched stores without starting or changing a queued run", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-recovery-mismatch-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "runs.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath: join(root, "threads.sqlite") });
  const engine = createSqliteEngine({ databasePath });
  const thread = await threadStore.createThread();
  await threadStore.addMessage(thread.id, "resume me", "queued-mismatch", {
    providerKey: "account-key",
    projectRoot: root,
  });
  const stream = vi.fn(async function* () {
    yield { type: "text" as const, text: "Recovered" };
  });
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    engine,
    provider: { stream },
    providerAccountKey: "account-key",
  });
  try {
    await expect(api.recover()).rejects.toThrow("Thread and run stores must use the same database");
    expect(stream).not.toHaveBeenCalled();
    expect(await engine.status("queued-mismatch")).toBeUndefined();
    expect(await eventStore.getRun("queued-mismatch")).toBeUndefined();
    expect(await threadStore.listQueuedRuns()).toEqual([
      expect.objectContaining({ runId: "queued-mismatch", content: "resume me" }),
    ]);
  } finally {
    threadStore.close();
  }
});

it("does not accept another message while the thread's run is active", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-busy-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    provider: {
      async *stream() {
        yield { type: "text", text: "partial" };
        await blocked;
        yield { type: "text", text: "done" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const thread = (await (await fetch(`${base}/v1/threads`, { method: "POST" })).json()) as {
      id: string;
    };
    const post = () =>
      fetch(`${base}/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });
    const first = await post();
    expect(first.status).toBe(201);
    const { runId } = (await first.json()) as { runId: string };
    await vi.waitFor(async () =>
      expect(
        (await eventStore.getEvents(runId)).some((event) => event.type === "model.delta"),
      ).toBe(true),
    );
    const streaming = await fetch(`${base}/v1/runs/${runId}/events/stream`, {
      headers: { "Last-Event-ID": "1" },
    });
    const reader = streaming.body?.getReader();
    expect(reader).toBeDefined();
    let chunkText = "";
    while (!chunkText.includes("model.delta")) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) throw new Error("Stream ended before the model delta");
      chunkText += new TextDecoder().decode(chunk.value);
    }
    expect(chunkText).toContain("model.delta");
    expect(chunkText).not.toContain("id: 1\n");
    expect((await post()).status).toBe(409);
    release();
    while (!(await reader?.read())?.done) {
      /* read through the terminal event */
    }
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(runId))?.status).toBe("completed"),
    );
    expect(
      (await threadStore.getMessages(thread.id)).filter((message) => message.role === "user"),
    ).toHaveLength(1);
  } finally {
    release();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    threadStore.close();
  }
});
