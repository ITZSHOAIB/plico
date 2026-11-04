import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderRecoveryKey,
} from "@plico/runtime";
import { expect, it, vi } from "vitest";
import { createPlicoServer, servePlico } from "./index.js";

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
  const api = await createPlicoServer({
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
    providerKey: modelProviderRecoveryKey({ provider: "openai-compatible", name: "test" }),
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
  const api = await createPlicoServer({
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
