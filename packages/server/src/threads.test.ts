import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderAccountKey,
  modelProviderRecoveryKey,
} from "@plico/runtime";
import { expect, it, vi } from "vitest";
import { createPlicoServer, servePlico } from "./index.js";

it("closes its owned thread connection when servePlico stops", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-serve-close-"));
  const close = vi.spyOn(DatabaseSync.prototype, "close");
  try {
    const server = await servePlico({
      projectRoot: root,
      databasePath: join(root, "state.sqlite"),
      host: "127.0.0.1",
      port: 0,
    });
    const before = close.mock.calls.length;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(close.mock.calls.length).toBe(before + 1);
  } finally {
    close.mockRestore();
  }
});

it("creates and reads a durable thread and its messages through HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-api-"));
  const databasePath = join(root, "state.sqlite");
  const start = async () => {
    const api = await createPlicoServer({
      projectRoot: root,
      eventStore: createSqliteEventStore({ databasePath }),
      threadStore: createSqliteThreadStore({ databasePath }),
    });
    const server = createServer(api.requestListener);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };
  const first = await start();
  try {
    const created = await fetch(`${first.url}/v1/threads`, { method: "POST" });
    expect(created.status).toBe(201);
    const thread = (await created.json()) as { id: string };
    const unavailable = await fetch(`${first.url}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello" }),
    });
    expect(unavailable.status).toBe(503);
    const sent = await fetch(`${first.url}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello", startRun: false }),
    });
    expect(sent.status).toBe(201);
    const message = await sent.json();
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    const second = await start();
    try {
      expect(await (await fetch(`${second.url}/v1/threads`)).json()).toEqual([thread]);
      expect(await (await fetch(`${second.url}/v1/threads/${thread.id}`)).json()).toEqual(thread);
      expect(await (await fetch(`${second.url}/v1/threads/${thread.id}/messages`)).json()).toEqual([
        message,
      ]);
      expect((await fetch(`${second.url}/v1/threads/missing`)).status).toBe(404);
      expect(
        (
          await fetch(`${second.url}/v1/threads/${thread.id}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: "" }),
          })
        ).status,
      ).toBe(400);
    } finally {
      await new Promise<void>((resolve) => second.server.close(() => resolve()));
    }
  } finally {
    if (first.server.listening)
      await new Promise<void>((resolve) => first.server.close(() => resolve()));
  }
});

it("does not touch the thread store after servePlico closes", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-close-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  const model = { provider: "openai-compatible", name: "test" } as const;
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const gateway = createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(500);
      response.end("provider failed");
    }, 500);
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("OPENAI_API_KEY", "test-secret");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`);
  const databasePath = join(root, "state.sqlite");
  const threadStore = createSqliteThreadStore({ databasePath });
  const thread = await threadStore.createThread();
  await threadStore.addMessage(thread.id, "interrupted", "interrupted-run", {
    providerKey: modelProviderAccountKey(model),
    projectRoot: root,
  });
  threadStore.close();
  const token = randomUUID();
  const database = new DatabaseSync(databasePath);
  database
    .prepare(
      "INSERT INTO engine_runs (run_id, state, input_json, worker_id, lease_until, owner_token, owner_path) VALUES (?, 'running', ?, ?, 0, ?, ?)",
    )
    .run(
      "interrupted-run",
      JSON.stringify({
        root: resolve(root),
        displayRoot: root,
        startedAt: new Date().toISOString(),
        message: "interrupted",
        threadId: thread.id,
        history: [],
        providerRecoveryKey: modelProviderRecoveryKey(model),
      }),
      "dead-worker",
      token,
      join(tmpdir(), `plico-run-owner-${token}.sqlite`),
    );
  database.close();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const server = await servePlico({
      projectRoot: root,
      databasePath,
      host: "127.0.0.1",
      port: 0,
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(unhandled).toEqual([]);
  } finally {
    spy.mockRestore();
    process.off("unhandledRejection", onUnhandled);
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  }
});
