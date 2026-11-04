import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSqliteEventStore, createSqliteThreadStore } from "@plico/runtime";
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
